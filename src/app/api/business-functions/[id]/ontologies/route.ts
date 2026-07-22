import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: businessFunctionId } = await params;

    const businessFunction = await db.businessFunction.findUnique({
      where: { id: businessFunctionId },
    });

    if (!businessFunction) {
      return NextResponse.json({ error: 'Business Function not found' }, { status: 404 });
    }

    const ontologies = await db.ontology.findMany({
      where: {
        OR: [
          { businessFunctionId },
          {
            organizationId: businessFunction.organizationId,
            businessFunctionId: null
          }
        ]
      },
      orderBy: { createdAt: 'desc' },
      include: {
        businessProcess: {
          include: {
            parent: true,
          },
        },
        project: true,
        _count: {
          select: {
            concepts: true,
            relationships: true,
            competencyQuestions: true,
          },
        },
      },
    });

    return NextResponse.json({ ontologies });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list ontologies' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: businessFunctionId } = await params;
    const body = await request.json();
    const { 
      name, 
      namespaceUri, 
      description, 
      version, 
      layer, 
      businessProcessId, 
      objective, 
      projectId,
      isCrossFunctional
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Ontology name is required' }, { status: 400 });
    }

    const businessFunction = await db.businessFunction.findUnique({
      where: { id: businessFunctionId },
    });

    if (!businessFunction) {
      return NextResponse.json({ error: 'Business Function not found' }, { status: 404 });
    }

    // Check if an ontology with the same name already exists for this function/project to prevent duplicates
    const existing = await db.ontology.findFirst({
      where: {
        name: name.trim(),
        businessFunctionId: isCrossFunctional ? null : businessFunctionId,
        projectId: projectId || null,
      }
    });

    if (existing) {
      return NextResponse.json({ error: 'An ontology with this name already exists for this function/project' }, { status: 409 });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const finalNamespaceUri = namespaceUri?.trim() || `urn:tse:${businessFunctionId}:${slug}`;

    const ontology = await db.ontology.create({
      data: {
        name: name.trim(),
        namespaceUri: finalNamespaceUri,
        description: description?.trim() || '',
        version: version?.trim() || '1.0.0',
        layer: layer?.trim() || 'PROJECT',
        projectId: projectId || null,
        businessFunctionId: isCrossFunctional ? null : businessFunctionId,
        organizationId: businessFunction.organizationId,
        businessProcessId: businessProcessId || null,
        objective: objective?.trim() || null,
        industry: body.industry?.trim() || null,
        businessFunction: isCrossFunctional ? 'Cross-Functional' : (body.businessFunction?.trim() || businessFunction.name),
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
