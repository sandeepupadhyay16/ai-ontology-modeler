import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mergeOntologiesGraph } from '@/lib/ontologyMerger';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const { ontologyIds, mergedName } = body;

    if (!ontologyIds || !Array.isArray(ontologyIds) || ontologyIds.length < 2) {
      return NextResponse.json({ error: 'At least two ontology IDs are required to merge.' }, { status: 400 });
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch all source ontologies with their complete graphs
    const sourceOntologies = await db.ontology.findMany({
      where: {
        id: { in: ontologyIds },
        projectId,
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
      return NextResponse.json({ error: 'Failed to retrieve at least two matching ontologies.' }, { status: 400 });
    }

    // Determine metadata for the merged ontology
    const defaultName = `Merged: ${sourceOntologies.map(o => o.name).join(' + ')}`;
    const finalName = mergedName?.trim() || defaultName;
    const finalSlug = finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const finalNamespaceUri = `urn:tse:${projectId}:merged-${finalSlug}-${Date.now()}`;

    // 1. Create the base merged Ontology
    const mergedOntology = await db.ontology.create({
      data: {
        name: finalName,
        namespaceUri: finalNamespaceUri,
        description: `Merged from source ontologies: ${sourceOntologies.map(o => o.name).join(', ')}.`,
        version: '1.0.0',
        layer: 'PROJECT',
        projectId,
        industry: sourceOntologies[0].industry || null,
        businessFunction: sourceOntologies[0].businessFunction || null,
      },
    });

    // 2. Perform the merge operations using the shared ontologyMerger library
    await mergeOntologiesGraph(sourceOntologies, mergedOntology);

    return NextResponse.json(mergedOntology, { status: 201 });
  } catch (error: any) {
    console.error('Ontology merge error:', error);
    return NextResponse.json({ error: error.message || 'Failed to merge ontologies' }, { status: 500 });
  }
}
