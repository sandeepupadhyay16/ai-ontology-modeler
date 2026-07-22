import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mergeOntologiesGraph } from '@/lib/ontologyMerger';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: businessFunctionId } = await params;
    const body = await request.json();
    const { ontologyIds, mergedName } = body;

    if (!ontologyIds || !Array.isArray(ontologyIds) || ontologyIds.length < 2) {
      return NextResponse.json({ error: 'At least two ontology IDs are required to merge.' }, { status: 400 });
    }

    const businessFunction = await db.businessFunction.findUnique({
      where: { id: businessFunctionId },
    });

    if (!businessFunction) {
      return NextResponse.json({ error: 'Business Function not found' }, { status: 404 });
    }

    // Fetch all source ontologies with their complete graphs under this function (or function's projects)
    const sourceOntologies = await db.ontology.findMany({
      where: {
        id: { in: ontologyIds },
        OR: [
          { businessFunctionId },
          { project: { businessFunctionId } }
        ]
      },
      include: {
        concepts: {
          include: {
            attributes: true,
          },
        },
        relationships: true,
        competencyQuestions: true,
        driverTrees: {
          include: {
            edges: true,
          },
        },
        causalCycles: {
          include: {
            edges: true,
          },
        },
        rules: true,
        constraints: true,
        perspectives: {
          include: {
            concepts: true,
          },
        },
      },
    });

    if (sourceOntologies.length < 2) {
      return NextResponse.json({ error: 'Failed to retrieve at least two matching ontologies under this function.' }, { status: 400 });
    }

    // Determine metadata for the merged ontology
    const defaultName = `Merged Function: ${sourceOntologies.map(o => o.name).join(' + ')}`;
    const finalName = mergedName?.trim() || defaultName;
    const finalSlug = finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const finalNamespaceUri = `urn:tse:function:${businessFunctionId}:merged-${finalSlug}-${Date.now()}`;

    // 1. Create the base merged Ontology at the FUNCTION level
    const mergedOntology = await db.ontology.create({
      data: {
        name: finalName,
        namespaceUri: finalNamespaceUri,
        description: `Merged function-level ontology from sources: ${sourceOntologies.map(o => o.name).join(', ')}.`,
        version: '1.0.0',
        layer: 'FUNCTION',
        businessFunctionId,
        industry: sourceOntologies[0].industry || null,
        businessFunction: businessFunction.name,
      },
    });

    // 2. Perform the merge operations using the shared ontologyMerger library
    await mergeOntologiesGraph(sourceOntologies, mergedOntology);

    return NextResponse.json(mergedOntology, { status: 201 });
  } catch (error: any) {
    console.error('Function-level ontology merge error:', error);
    return NextResponse.json({ error: error.message || 'Failed to merge ontologies' }, { status: 500 });
  }
}
