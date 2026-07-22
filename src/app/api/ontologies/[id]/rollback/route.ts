import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ontologyId } = await params;
    const body = await request.json();
    const { 
      concepts = [], 
      relationships = [], 
      competencyQuestions = [], 
      driverTrees = [],
      perspectives = [],
      causalCycles = []
    } = body;

    // Verify ontology exists
    const ontology = await db.ontology.findUnique({
      where: { id: ontologyId },
    });

    if (!ontology) {
      return NextResponse.json({ error: 'Ontology not found' }, { status: 404 });
    }

    await db.$transaction(async (tx: any) => {
      // 1. Sync Concepts
      const labelToConcept: Record<string, any> = {};
      const newConceptIds: string[] = [];

      for (const concept of concepts) {
        if (!concept.label) continue;
        const cleanLabel = concept.label.trim();
        
        let dbConcept = await tx.concept.findFirst({
          where: { label: cleanLabel, ontologyId },
        });

        if (!dbConcept) {
          dbConcept = await tx.concept.create({
            data: {
              label: cleanLabel,
              conceptType: concept.conceptType || 'Entity',
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
            data: {
              conceptType: concept.conceptType || 'Entity',
              typeFields: concept.typeFields || {},
            },
          });

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
        }

        labelToConcept[cleanLabel] = dbConcept;
        newConceptIds.push(dbConcept.id);
      }

      // Delete concepts that were omitted
      await tx.concept.deleteMany({
        where: {
          ontologyId,
          id: { notIn: newConceptIds },
        },
      });

      // 2. Sync Relationships
      await tx.relationship.deleteMany({ where: { ontologyId } });
      for (const rel of relationships) {
        if (!rel.name || !rel.source || !rel.target) continue;

        const sourceConcept = labelToConcept[rel.source.trim()];
        const targetConcept = labelToConcept[rel.target.trim()];

        if (sourceConcept && targetConcept) {
          await tx.relationship.create({
            data: {
              name: rel.name.trim(),
              description: rel.description || '',
              cardinality: rel.cardinality || 'one-to-many',
              sourceId: sourceConcept.id,
              targetId: targetConcept.id,
              ontologyId,
            },
          });
        }
      }

      // 3. Sync Competency Questions
      await tx.competencyQuestion.deleteMany({ where: { ontologyId } });
      for (const cq of competencyQuestions) {
        if (!cq.question) continue;
        await tx.competencyQuestion.create({
          data: {
            question: cq.question.trim(),
            status: cq.status || 'Draft',
            remediation: cq.remediation || '',
            ontologyId,
          },
        });
      }

      // 4. Sync Driver Trees & Edges
      await tx.driverTree.deleteMany({ where: { ontologyId } });
      const dbEdges: any[] = [];
      
      for (const tree of driverTrees) {
        if (!tree.name) continue;
        const dbTree = await tx.driverTree.create({
          data: {
            name: tree.name.trim(),
            ontologyId,
          },
        });

        if (tree.edges && tree.edges.length > 0) {
          for (const edge of tree.edges) {
            if (!edge.source || !edge.target) continue;

            const sourceConcept = labelToConcept[edge.source.trim()];
            const targetConcept = labelToConcept[edge.target.trim()];

            if (sourceConcept && targetConcept) {
              const dbEdge = await tx.driverEdge.create({
                data: {
                  name: edge.name || 'Positively Drives (1.0)',
                  sourceId: sourceConcept.id,
                  targetId: targetConcept.id,
                  treeId: dbTree.id,
                },
              });
              dbEdges.push({ source: edge.source.trim(), target: edge.target.trim(), dbId: dbEdge.id });
            }
          }
        }
      }

      // 5. Sync Perspectives
      await tx.perspective.deleteMany({ where: { ontologyId } });
      for (const pers of (perspectives || [])) {
        if (!pers.name) continue;

        let personaId = null;
        if (pers.persona) {
          const personaConcept = labelToConcept[pers.persona.trim()];
          if (personaConcept) personaId = personaConcept.id;
        }

        const conceptIdsToConnect = (pers.concepts || [])
          .map((label: string) => labelToConcept[label.trim()]?.id)
          .filter((id: string) => !!id);

        await tx.perspective.create({
          data: {
            name: pers.name.trim(),
            description: pers.description || '',
            personaId,
            ontologyId,
            concepts: {
              connect: conceptIdsToConnect.map((id: string) => ({ id })),
            },
          },
        });
      }

      // 6. Sync Causal Cycles
      await tx.causalCycle.deleteMany({ where: { ontologyId } });
      for (const cycle of (causalCycles || [])) {
        if (!cycle.name) continue;

        const edgeIdsToConnect = (cycle.edges || [])
          .map((edge: any) => {
            const match = dbEdges.find(
              (e) => e.source === edge.source.trim() && e.target === edge.target.trim()
            );
            return match?.dbId;
          })
          .filter((id: string) => !!id);

        await tx.causalCycle.create({
          data: {
            name: cycle.name.trim(),
            cycleType: cycle.cycleType || 'REINFORCING',
            description: cycle.description || '',
            ontologyId,
            edges: {
              connect: edgeIdsToConnect.map((id: string) => ({ id })),
            },
          },
        });
      }
    });

    return NextResponse.json({ success: true, message: 'Ontology state rolled back successfully' });
  } catch (error: any) {
    console.error('Rollback error:', error);
    return NextResponse.json({ error: error.message || 'Failed to rollback ontology' }, { status: 500 });
  }
}
