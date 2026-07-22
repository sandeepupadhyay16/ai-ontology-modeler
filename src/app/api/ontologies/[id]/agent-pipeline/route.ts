import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  runIntentParser,
  runDomainTaxonomist,
  runProcessModeler,
  evaluateOntologyQuality,
  cleanAndParseJSON,
} from '@/lib/agentPipeline';

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
    const modeledJSON = await runProcessModeler(intentOutput, taxonomyOutput, ontologyContext, currentState);
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
        if (!concept.label) continue;
        const cleanLabel = concept.label.trim();
        const conceptType = concept.conceptType || 'Entity';

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
                create: (concept.attributes || []).map((attr: any) => ({
                  name: attr.name.trim(),
                  datatype: attr.datatype || 'string',
                  description: attr.description || '',
                  required: !!attr.required,
                })),
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
        if (concept.attributes && concept.attributes.length > 0) {
          await tx.attribute.createMany({
            data: concept.attributes.map((attr: any) => ({
              name: attr.name.trim(),
              datatype: attr.datatype || 'string',
              description: attr.description || '',
              required: !!attr.required,
              conceptId: dbConcept.id,
            })),
          });
        }

        labelToConcept[cleanLabel] = dbConcept;
        newConceptIds.push(dbConcept.id);
      }

      // Delete concepts omitted in full sync
      await tx.concept.deleteMany({
        where: { ontologyId, id: { notIn: newConceptIds } },
      });

      // 2. Sync Relationships
      await tx.relationship.deleteMany({ where: { ontologyId } });
      let relCount = 0;
      for (const rel of relationships) {
        if (!rel.name || !rel.source || !rel.target) continue;
        const src = labelToConcept[rel.source.trim()];
        const tgt = labelToConcept[rel.target.trim()];
        if (src && tgt) {
          await tx.relationship.create({
            data: {
              name: rel.name.trim(),
              description: rel.description || '',
              cardinality: rel.cardinality || 'one-to-many',
              sourceId: src.id,
              targetId: tgt.id,
              ontologyId,
            },
          });
          relCount++;
        }
      }

      // 3. Sync Competency Questions
      await tx.competencyQuestion.deleteMany({ where: { ontologyId } });
      for (const cq of competencyQuestions) {
        if (!cq.question) continue;
        await tx.competencyQuestion.create({
          data: {
            question: cq.question.trim(),
            status: cq.status || 'Ratified',
            remediation: cq.remediation || '',
            ontologyId,
          },
        });
      }

      // 4. Sync Driver Trees & Edges
      await tx.driverTree.deleteMany({ where: { ontologyId } });
      for (const tree of driverTrees) {
        if (!tree.name) continue;
        const dbTree = await tx.driverTree.create({
          data: { name: tree.name.trim(), ontologyId },
        });
        for (const edge of (tree.edges || [])) {
          if (!edge.source || !edge.target) continue;
          const src = labelToConcept[edge.source.trim()];
          const tgt = labelToConcept[edge.target.trim()];
          if (src && tgt) {
            await tx.driverEdge.create({
              data: {
                name: edge.name || 'Positively Drives (1.0)',
                sourceId: src.id,
                targetId: tgt.id,
                treeId: dbTree.id,
              },
            });
          }
        }
      }

      return {
        conceptCount: newConceptIds.length,
        relationshipCount: relCount,
        cqCount: competencyQuestions.length,
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
    return NextResponse.json({ error: error.message || 'Agent pipeline execution failed' }, { status: 500 });
  }
}
