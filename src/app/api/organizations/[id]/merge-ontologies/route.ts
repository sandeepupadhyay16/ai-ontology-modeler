import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mergeOntologiesGraph } from '@/lib/ontologyMerger';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
    const body = await request.json();
    const { ontologyIds, mergedName } = body;

    if (!ontologyIds || !Array.isArray(ontologyIds) || ontologyIds.length < 2) {
      return NextResponse.json({ error: 'At least two ontology IDs are required to merge.' }, { status: 400 });
    }

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Fetch all source ontologies with their complete graphs under this organization
    const sourceOntologies = await db.ontology.findMany({
      where: {
        id: { in: ontologyIds },
        OR: [
          { organizationId },
          { businessFunctionRel: { organizationId } },
          { project: { businessFunction: { organizationId } } }
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
      return NextResponse.json({ error: 'Failed to retrieve at least two matching ontologies under this organization.' }, { status: 400 });
    }

    // Determine metadata for the merged ontology
    const defaultName = `Merged Org: ${sourceOntologies.map(o => o.name).join(' + ')}`;
    const finalName = mergedName?.trim() || defaultName;
    const finalSlug = finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const finalNamespaceUri = `urn:tse:org:${organizationId}:merged-${finalSlug}-${Date.now()}`;

    // 1. Create the base merged Ontology at the ORGANIZATION level
    const mergedOntology = await db.ontology.create({
      data: {
        name: finalName,
        namespaceUri: finalNamespaceUri,
        description: `Merged organization-level ontology from sources: ${sourceOntologies.map(o => o.name).join(', ')}.`,
        version: '1.0.0',
        layer: 'ORGANIZATION',
        organizationId,
        industry: organization.industry || sourceOntologies[0].industry || null,
        businessFunction: 'Cross-Functional',
      },
    });

    // 2. Perform the merge operations using the shared ontologyMerger library
    await mergeOntologiesGraph(sourceOntologies, mergedOntology);

    return NextResponse.json(mergedOntology, { status: 201 });
  } catch (error: any) {
    console.error('Organization-level ontology merge error:', error);
    return NextResponse.json({ error: error.message || 'Failed to merge ontologies' }, { status: 500 });
  }
}
