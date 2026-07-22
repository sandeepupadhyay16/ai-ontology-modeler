import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const { 
      name, 
      namespaceUri, 
      description, 
      version, 
      layer, 
      businessProcessId, 
      objective,
      industry,
      businessFunction 
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Ontology name is required' }, { status: 400 });
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        businessFunction: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Generate namespaceUri if not provided
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const finalNamespaceUri = namespaceUri?.trim() || `urn:tse:${projectId}:${slug}`;

    const finalIndustry = industry?.trim() || project.businessFunction?.organization?.industry || null;
    const finalBusinessFunction = businessFunction?.trim() || project.businessFunction?.name || null;

    const ontology = await db.ontology.create({
      data: {
        name: name.trim(),
        namespaceUri: finalNamespaceUri,
        description: description?.trim() || '',
        version: version?.trim() || '1.0.0',
        layer: layer?.trim() || 'PROJECT',
        projectId,
        businessFunctionId: project.businessFunctionId,
        organizationId: project.businessFunction?.organizationId || null,
        businessProcessId: businessProcessId || null,
        objective: objective?.trim() || null,
        industry: finalIndustry,
        businessFunction: finalBusinessFunction,
      },
    });

    return NextResponse.json(ontology, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'An ontology with this namespace URI already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to create ontology' }, { status: 500 });
  }
}
