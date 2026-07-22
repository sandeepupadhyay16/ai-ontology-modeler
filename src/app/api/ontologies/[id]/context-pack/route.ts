import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ontologyId } = await params;

    // Fetch the complete ontology graph
    const ontology = await db.ontology.findUnique({
      where: { id: ontologyId },
      include: {
        project: {
          include: {
            businessFunction: {
              include: {
                organization: true,
              },
            },
          },
        },
        concepts: {
          include: {
            attributes: true,
            mappings: {
              include: {
                dataSource: {
                  include: {
                    system: true,
                  },
                },
              },
            },
          },
        },
        relationships: {
          include: {
            source: true,
            target: true,
          },
        },
        competencyQuestions: true,
        driverTrees: {
          include: {
            edges: true,
          },
        },
      },
    });

    if (!ontology) {
      return NextResponse.json({ error: 'Ontology not found' }, { status: 404 });
    }

    // CQ Coverage Analysis
    const cqs = ontology.competencyQuestions || [];
    const concepts = ontology.concepts || [];
    
    let fullyCoveredCount = 0;
    let partiallyCoveredCount = 0;
    const cqCoverageList = cqs.map((cq) => {
      const qText = cq.question.toLowerCase();
      // Find which concepts are mentioned in this question
      const mentionedConcepts = concepts.filter(c => 
        qText.includes(c.label.toLowerCase()) || 
        c.attributes.some(a => qText.includes(a.name.toLowerCase()))
      );

      if (mentionedConcepts.length === 0) {
        return {
          id: cq.id,
          question: cq.question,
          coverage: 'UNKNOWN',
          mentioned: [],
          groundedCount: 0,
        };
      }

      const groundedCount = mentionedConcepts.filter(c => c.mappings && c.mappings.length > 0).length;
      let coverage = 'NONE';
      if (groundedCount === mentionedConcepts.length) {
        coverage = 'FULL';
        fullyCoveredCount++;
      } else if (groundedCount > 0) {
        coverage = 'PARTIAL';
        partiallyCoveredCount++;
      }

      return {
        id: cq.id,
        question: cq.question,
        coverage,
        mentioned: mentionedConcepts.map(c => ({
          id: c.id,
          label: c.label,
          conceptType: c.conceptType,
          isGrounded: c.mappings && c.mappings.length > 0,
        })),
        groundedCount,
      };
    });

    const totalCqs = cqs.length;
    const coverageScore = totalCqs > 0 
      ? Math.round(((fullyCoveredCount + 0.5 * partiallyCoveredCount) / totalCqs) * 100) 
      : 100;

    // Build the Grounded Context Pack payload
    const contextPack = {
      contextPackVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      ontology: {
        id: ontology.id,
        name: ontology.name,
        objective: ontology.objective,
        organization: ontology.project?.businessFunction?.organization?.name || 'Unknown',
        businessFunction: ontology.project?.businessFunction?.name || 'Unknown',
      },
      coverageReport: {
        score: coverageScore,
        fullyCovered: fullyCoveredCount,
        partiallyCovered: partiallyCoveredCount,
        uncovered: totalCqs - (fullyCoveredCount + partiallyCoveredCount),
        totalCompetencyQuestions: totalCqs,
        questions: cqCoverageList,
      },
      concepts: concepts.map(c => ({
        id: c.id,
        label: c.label,
        conceptType: c.conceptType,
        attributes: c.attributes.map(a => ({ name: a.name, datatype: a.datatype })),
        dataGrounding: (c.mappings || []).map(m => ({
          platform: m.dataSource?.platform,
          dataSourceName: m.dataSource?.name,
          system: m.dataSource?.system?.name || 'Unknown',
          fieldOrColumn: m.columnOrField,
          transformation: m.transformation,
          confidence: m.confidence,
        })),
      })),
      relationships: (ontology.relationships || []).map(r => ({
        id: r.id,
        name: r.name,
        source: r.source?.label,
        target: r.target?.label,
        cardinality: r.cardinality,
      })),
      driverTrees: (ontology.driverTrees || []).map(t => ({
        name: t.name,
        edges: (t.edges || []).map(e => {
          const srcLabel = concepts.find(c => c.id === e.sourceId)?.label || e.sourceId;
          const tgtLabel = concepts.find(c => c.id === e.targetId)?.label || e.targetId;
          return {
            source: srcLabel,
            target: tgtLabel,
            polarity: e.polarity,
            weight: e.weight,
          };
        }),
      })),
    };

    // Save this context pack in the DB to keep a history / state
    await db.contextPack.create({
      data: {
        name: `${ontology.name} Context Pack`,
        version: '1.0.0',
        ontologyId: ontologyId,
        scope: {
          cqIds: cqs.map(q => q.id),
          processIds: concepts.filter(c => c.conceptType === 'Process').map(c => c.id),
          metricIds: concepts.filter(c => c.conceptType === 'Metric').map(c => c.id),
        },
        contents: contextPack as any,
        status: 'Published',
      },
    });

    return NextResponse.json(contextPack);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate context pack' }, { status: 500 });
  }
}
