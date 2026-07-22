import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessFunctionId = searchParams.get('businessFunctionId');
    const where: any = {};
    if (businessFunctionId) {
      where.businessFunctionId = businessFunctionId;
    }

    const projects = await db.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { ontologies: true },
        },
      },
    });
    return NextResponse.json({ projects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list projects' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, businessFunctionId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const project = await db.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || '',
        businessFunctionId: businessFunctionId || null,
      },
      include: {
        businessFunction: {
          include: { organization: true }
        }
      }
    });

    // Auto-provision dedicated solution ontology so no solution ever sits empty
    const sanitizedUriName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const org = project.businessFunction?.organization;

    const newOntology = await db.ontology.create({
      data: {
        name: `${name.trim()} Ontology`,
        namespaceUri: `http://enterprise.com/ontologies/${sanitizedUriName}-${Date.now()}`,
        layer: 'PROJECT',
        version: '1.0.0',
        description: `Dedicated domain ontology for business solution: ${name.trim()}.`,
        industry: org?.industry || 'Enterprise',
        businessFunction: project.businessFunction?.name || 'General',
        objective: `Optimize operational performance for ${name.trim()}.`,
        organizationId: org?.id || null,
        businessFunctionId: businessFunctionId || null,
        projectId: project.id,
        aiMissions: [name.trim(), 'Process Optimization'],
        tags: [name.trim(), 'Solution Ontology'],
      },
    });

    // Add initial anchor concepts
    const eConcept = await db.concept.create({
      data: {
        label: `${name.replace(/[^a-zA-Z0-9]/g, '')}Entity`,
        conceptType: 'Entity',
        ontologyId: newOntology.id,
        attributes: {
          create: [
            { name: 'solutionId', datatype: 'string', required: true, description: 'Solution identifier' },
            { name: 'status', datatype: 'string', required: true, description: 'Execution status' }
          ]
        }
      }
    });

    const mConcept = await db.concept.create({
      data: {
        label: `${name.replace(/[^a-zA-Z0-9]/g, '')}CycleTime`,
        conceptType: 'Metric',
        ontologyId: newOntology.id,
        typeFields: { unit: 'hours', formula: 'EndTimestamp - StartTimestamp' }
      }
    });

    await db.relationship.create({
      data: {
        name: 'measuredByMetric',
        sourceId: eConcept.id,
        targetId: mConcept.id,
        ontologyId: newOntology.id
      }
    });

    await db.competencyQuestion.create({
      data: {
        question: `What is the operational efficiency and cycle time metric for ${name.trim()}?`,
        status: 'Ratified',
        ontologyId: newOntology.id
      }
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'A project with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to create project' }, { status: 500 });
  }
}
