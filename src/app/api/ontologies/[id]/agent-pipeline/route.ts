import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  runIntentParser,
  runDomainTaxonomist,
  runProcessModeler,
  evaluateOntologyQuality,
} from '@/lib/agentPipeline';
import { normalizeOntologyJSON, inferDatatypeFromName } from '@/lib/schemaNormalizer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  try {
    const { id: ontologyId } = await params;
    const body = await request.json();
    const { prompt, answers = null, autoFix = false, currentState = null } = body;

    // Load existing ontology with organization details
    const ontology = await db.ontology.findUnique({
      where: { id: ontologyId },
      include: {
        organization: true,
        businessFunctionRel: true,
        businessProcess: true,
      },
    });

    if (!ontology) {
      return NextResponse.json({ error: 'Ontology not found' }, { status: 404 });
    }

    const ontologyContext = {
      id: ontology.id,
      name: ontology.name,
      orgName: ontology.organization?.name || '',
      industry: ontology.industry || ontology.organization?.industry || 'General',
      businessFunction: ontology.businessFunction || ontology.businessFunctionRel?.name || 'General',
      businessProcess: ontology.businessProcess?.name || 'General Operations',
      aiMissions: ontology.aiMissions || [],
      tags: ontology.tags || [],
    };

    let userIntent = prompt || 'Optimize and enrich enterprise ontology concepts and relationships.';
    if (answers && Object.keys(answers).length > 0) {
      userIntent += '\n\nUser Clarifications:\n' + Object.entries(answers).map(([q, a]) => `- ${q}: ${a}`).join('\n');
    }

    if (autoFix) {
      userIntent += '\n\nAUTO-REMEDIATION REQUEST: Find all orphan unconnected concepts and create logical relationships to connect them into the main knowledge graph. Ensure all competency questions are answerable.';
    }

    // Stage 1: Intent Parser & Data Collector
    const t1 = Date.now();
    const intentOutput = await runIntentParser(userIntent, ontologyContext);
    const d1 = Date.now() - t1;

    if (intentOutput.isVague && intentOutput.probingQuestions?.length > 0) {
      return NextResponse.json({
        stage: 1,
        status: 'NEEDS_CLARIFICATION',
        probingQuestions: intentOutput.probingQuestions,
      });
    }

    // Stage 2: Domain SME & Industry Taxonomist
    const t2 = Date.now();
    const taxonomyOutput = await runDomainTaxonomist(intentOutput, ontologyContext);
    const d2 = Date.now() - t2;

    // Stage 3: Semantic & Process Modeler
    const t3 = Date.now();
    const rawModeled = await runProcessModeler(intentOutput, taxonomyOutput, ontologyContext, currentState);
    const modeledJSON = normalizeOntologyJSON(rawModeled);
    const d3 = Date.now() - t3;

    // Stage 4: Quality & Logic Validator
    const t4 = Date.now();
    const qualityReport = evaluateOntologyQuality(modeledJSON);
    const d4 = Date.now() - t4;

    // Stage 5: Schema Guardrail & UI Renderer (Database Sync)
    const t5 = Date.now();
    const {
      concepts = [],
      relationships = [],
      competencyQuestions = [],
      driverTrees = [],
      perspectives = [],
      causalCycles = [],
    } = modeledJSON;

    const summary = await db.$transaction(async (tx: any) => {
      // 1. Sync Concepts
      const labelToConcept: Record<string, any> = {};
      const newConceptIds: string[] = [];

      for (const concept of concepts) {
        if (!concept || !concept.label) continue;
        const cleanLabel = String(concept.label).trim();
        if (!cleanLabel) continue;
        const conceptType = concept.conceptType || 'Entity';

        const normalizedAttrs = Array.isArray(concept.attributes)
          ? concept.attributes.map((attr: any) => {
              const name = typeof attr === 'string' ? attr.trim() : String(attr?.name || attr?.attributeName || '').trim();
              const datatype = typeof attr === 'object' && attr?.datatype ? attr.datatype : inferDatatypeFromName(name);
              const description = typeof attr === 'object' && attr?.description ? attr.description : '';
              const required = typeof attr === 'object' ? !!attr.required : false;
              return { name, datatype, description, required };
            }).filter(a => Boolean(a.name))
          : [];

        let dbConcept = await tx.concept.findFirst({
          where: { label: cleanLabel, ontologyId },
        });

        if (!dbConcept) {
          dbConcept = await tx.concept.create({
            data: {
              label: cleanLabel,
              conceptType,
              typeFields: concept.typeFields || {},
              ontologyId,
              attributes: {
                create: normalizedAttrs,
              },
            },
          });
        } else {
          dbConcept = await tx.concept.update({
            where: { id: dbConcept.id },
            data: { conceptType, typeFields: concept.typeFields || {} },
          });
        }

        // Replace attributes
        await tx.attribute.deleteMany({ where: { conceptId: dbConcept.id } });
        if (normalizedAttrs.length > 0) {
          await tx.attribute.createMany({
            data: normalizedAttrs.map(attr => ({
              ...attr,
              conceptId: dbConcept.id,
            })),
          });
        }

        labelToConcept[cleanLabel] = dbConcept;
        newConceptIds.push(dbConcept.id);
      }

      // Delete concepts omitted in full sync (only if new concepts were created)
      if (newConceptIds.length > 0) {
        await tx.concept.deleteMany({
          where: { ontologyId, id: { notIn: newConceptIds } },
        });
      }

      // 2. Sync Relationships
      await tx.relationship.deleteMany({ where: { ontologyId } });
      let relCount = 0;
      const connectedConceptIds = new Set<string>();

      for (const rel of relationships) {
        if (!rel || !rel.name || !rel.source || !rel.target) continue;
        const src = findConceptByLabel(rel.source, labelToConcept);
        const tgt = findConceptByLabel(rel.target, labelToConcept);
        if (src && tgt) {
          const relData: any = {
            name: String(rel.name).trim(),
            description: rel.description || '',
            cardinality: rel.cardinality || 'one-to-many',
            sourceId: src.id,
            targetId: tgt.id,
            ontologyId,
          };
          if (rel.propertyType && rel.propertyType !== 'ObjectProperty') {
            relData.propertyType = rel.propertyType;
          }

          await tx.relationship.create({ data: relData });
          connectedConceptIds.add(src.id);
          connectedConceptIds.add(tgt.id);
          relCount++;
        }
      }

      // 2b. Post-Sync Hard Stop for Orphans: Stitch any remaining orphan concepts
      const primaryConceptId = newConceptIds[0];
      if (primaryConceptId) {
        for (const conceptId of newConceptIds) {
          if (!connectedConceptIds.has(conceptId) && conceptId !== primaryConceptId) {
            await tx.relationship.create({
              data: {
                name: 'isAssociatedWith',
                description: 'Auto-stitched relationship to eliminate orphan node',
                cardinality: 'one-to-many',
                sourceId: conceptId,
                targetId: primaryConceptId,
                ontologyId,
              },
            });
            connectedConceptIds.add(conceptId);
            relCount++;
          }
        }
      }

      // 3. Sync Competency Questions (Defensive string & object handling)
      await tx.competencyQuestion.deleteMany({ where: { ontologyId } });
      let cqCount = 0;
      for (const cq of competencyQuestions) {
        if (!cq) continue;
        const qText = String((cq as any)?.question || (cq as any)?.text || cq || '').trim();
        if (!qText) continue;
        await tx.competencyQuestion.create({
          data: {
            question: qText,
            status: (cq as any)?.status || 'Ratified',
            remediation: (cq as any)?.remediation || '',
            ontologyId,
          },
        });
        cqCount++;
      }

      // 4. Sync Driver Trees & Edges
      await tx.driverTree.deleteMany({ where: { ontologyId } });
      for (const tree of driverTrees) {
        if (!tree || !tree.name) continue;
        const dbTree = await tx.driverTree.create({
          data: { name: String(tree.name).trim(), ontologyId },
        });
        for (const edge of (tree.edges || [])) {
          if (!edge || !edge.source || !edge.target) continue;
          const src = labelToConcept[String(edge.source).trim()];
          const tgt = labelToConcept[String(edge.target).trim()];
          if (src && tgt) {
            await tx.driverEdge.create({
              data: {
                name: edge.name || 'Positively Drives (1.0)',
                sourceId: src.id,
                targetId: tgt.id,
                treeId: dbTree.id,
                polarity: edge.polarity || '+',
                weight: typeof edge.weight === 'number' ? edge.weight : 1.0,
              },
            });
          }
        }
      }

      return {
        conceptCount: newConceptIds.length,
        relationshipCount: relCount,
        cqCount,
      };
    });
    const d5 = Date.now() - t5;

    return NextResponse.json({
      success: true,
      totalDurationMs: Date.now() - startTime,
      stages: [
        { stage: 1, name: 'Intent Parser & Data Collector', status: 'COMPLETED', durationMs: d1, output: intentOutput },
        { stage: 2, name: 'Domain SME & Industry Taxonomist', status: 'COMPLETED', durationMs: d2, output: taxonomyOutput },
        { stage: 3, name: 'Semantic & Process Modeler', status: 'COMPLETED', durationMs: d3, output: { conceptCount: concepts.length, relationshipCount: relationships.length } },
        { stage: 4, name: 'Quality & Logic Validator', status: 'COMPLETED', durationMs: d4, output: qualityReport },
        { stage: 5, name: 'Schema Guardrail & UI Renderer', status: 'COMPLETED', durationMs: d5, output: summary },
      ],
      qualityReport,
      summary,
    });
  } catch (error: any) {
    console.error("agent-pipeline error:", error);
    return NextResponse.json({ error: error.message || 'Agent pipeline execution failed' }, { status: 500 });
  }
}

function findConceptByLabel(rawLabel: string, labelToConcept: Record<string, any>): any | undefined {
  if (!rawLabel) return undefined;
  const clean = rawLabel.trim().toLowerCase();

  if (labelToConcept[rawLabel.trim()]) {
    return labelToConcept[rawLabel.trim()];
  }

  for (const key of Object.keys(labelToConcept)) {
    if (key.trim().toLowerCase() === clean) {
      return labelToConcept[key];
    }
  }

  const removePrefix = (s: string) => {
    return s.replace(/^\[(job|outcome|metric|process|entity|persona|system|event)\]\s*/i, '').trim();
  };

  const cleanNoPrefix = removePrefix(clean);
  for (const key of Object.keys(labelToConcept)) {
    const keyCleanNoPrefix = removePrefix(key.toLowerCase());
    if (keyCleanNoPrefix === cleanNoPrefix) {
      return labelToConcept[key];
    }
  }

  const alphaNum = (s: string) => s.replace(/[^a-z0-9]/g, '');
  const cleanAlphaNum = alphaNum(cleanNoPrefix);
  for (const key of Object.keys(labelToConcept)) {
    const keyAlphaNum = alphaNum(removePrefix(key.toLowerCase()));
    if (keyAlphaNum === cleanAlphaNum) {
      return labelToConcept[key];
    }
  }

  return undefined;
}
