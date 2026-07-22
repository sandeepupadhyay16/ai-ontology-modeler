import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const ontologies = await db.ontology.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        organization: true,
        businessFunctionRel: true,
        businessProcess: true,
        concepts: true,
        relationships: true,
        competencyQuestions: true,
        causalCycles: true,
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, namespaceUri, version, industry, businessFunction, objective } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Ontology name is required' }, { status: 400 });
    }

    // Check if an ontology with the same name already exists as a standalone ontology to prevent duplicates
    const existing = await db.ontology.findFirst({
      where: {
        name: name.trim(),
        businessFunctionId: null,
        projectId: null,
      }
    });

    if (existing) {
      return NextResponse.json({ error: 'An ontology with this name already exists' }, { status: 409 });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const finalNamespaceUri = namespaceUri?.trim() || `urn:tse:quickstart:${slug}:${Date.now()}`;

    const ontology = await db.ontology.create({
      data: {
        name: name.trim(),
        namespaceUri: finalNamespaceUri,
        description: description?.trim() || 'Quick Start Ontology',
        version: version?.trim() || '1.0.0',
        layer: 'PROJECT',
        industry: industry?.trim() || 'General',
        businessFunction: businessFunction?.trim() || 'General Operations',
        objective: objective?.trim() || 'Direct Modeling',
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
