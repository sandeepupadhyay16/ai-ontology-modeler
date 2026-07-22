import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ontology = await db.ontology.findUnique({
      where: { id },
      include: {
        concepts: {
          include: {
            attributes: true,
            mappings: {
              include: {
                dataSource: true,
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
        constraints: true,
        rules: true,
        competencyQuestions: true,
        driverTrees: {
          include: {
            edges: true,
          },
        },
        perspectives: {
          include: {
            concepts: true,
          },
        },
        causalCycles: {
          include: {
            edges: true,
          },
        },
        businessProcess: {
          include: {
            parent: true,
          },
        },
      },
    });

    if (!ontology) {
      return NextResponse.json({ error: 'Ontology not found' }, { status: 404 });
    }

    return NextResponse.json(ontology);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch ontology' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, namespaceUri, version, layer, industry, businessFunction, objective } = body;

    const data: any = {};
    if (name !== undefined) {
      if (!name.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      data.name = name.trim();
    }
    if (description !== undefined) data.description = description.trim();
    if (namespaceUri !== undefined) {
      if (!namespaceUri.trim()) return NextResponse.json({ error: 'Namespace URI cannot be empty' }, { status: 400 });
      data.namespaceUri = namespaceUri.trim();
    }
    if (version !== undefined) data.version = version.trim();
    if (layer !== undefined) data.layer = layer.trim();
    if (industry !== undefined) data.industry = industry?.trim() || null;
    if (businessFunction !== undefined) data.businessFunction = businessFunction?.trim() || null;
    if (objective !== undefined) data.objective = objective?.trim() || null;
    if (body.businessProcessId !== undefined) data.businessProcessId = body.businessProcessId || null;

    const ontology = await db.ontology.update({
      where: { id },
      data,
    });

    return NextResponse.json(ontology);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'An ontology with this namespace URI already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to update ontology' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.ontology.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete ontology' }, { status: 500 });
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ontologyId } = await params;
    const body = await request.json();
    const { type, data } = body; // type can be 'concept', 'relationship', 'cq', 'driver-tree', 'driver-edge'

    if (type === 'concept') {
      const { label, conceptType, typeFields, attributes } = data;
      const concept = await db.concept.create({
        data: {
          label: label.trim(),
          conceptType: conceptType || 'Entity',
          typeFields: typeFields || {},
          ontologyId,
          attributes: {
            create: (attributes || []).map((attr: any) => ({
              name: attr.name.trim(),
              datatype: attr.datatype || 'string',
              description: attr.description || '',
              required: !!attr.required,
            })),
          },
        },
        include: { attributes: true },
      });
      return NextResponse.json(concept, { status: 201 });
    }

    if (type === 'relationship') {
      const { name, description, cardinality, sourceId, targetId } = data;
      const relationship = await db.relationship.create({
        data: {
          name: name.trim(),
          description: description || '',
          cardinality: cardinality || 'one-to-many',
          sourceId,
          targetId,
          ontologyId,
        },
      });
      return NextResponse.json(relationship, { status: 201 });
    }

    if (type === 'cq') {
      const { question, status, remediation } = data;
      const cq = await db.competencyQuestion.create({
        data: {
          question: question.trim(),
          status: status || 'Draft',
          remediation: remediation || '',
          ontologyId,
        },
      });
      return NextResponse.json(cq, { status: 201 });
    }

    if (type === 'driver-tree') {
      const { name } = data;
      const tree = await db.driverTree.create({
        data: {
          name: name.trim(),
          ontologyId,
        },
      });
      return NextResponse.json(tree, { status: 201 });
    }

    if (type === 'driver-edge') {
      const { name, sourceId, targetId, treeId } = data;
      const edge = await db.driverEdge.create({
        data: {
          name: name.trim(),
          sourceId,
          targetId,
          treeId,
        },
      });
      return NextResponse.json(edge, { status: 201 });
    }

    if (type === 'perspective') {
      const { name, description, personaId, conceptIds } = data;
      const perspective = await db.perspective.create({
        data: {
          name: name.trim(),
          description: description || '',
          personaId: personaId || null,
          ontologyId,
          concepts: {
            connect: (conceptIds || []).map((cId: string) => ({ id: cId })),
          },
        },
        include: { concepts: true },
      });
      return NextResponse.json(perspective, { status: 201 });
    }

    if (type === 'causal-cycle') {
      const { name, cycleType, description, edgeIds } = data;
      const cycle = await db.causalCycle.create({
        data: {
          name: name.trim(),
          cycleType: cycleType || 'REINFORCING',
          description: description || '',
          ontologyId,
          edges: {
            connect: (edgeIds || []).map((eId: string) => ({ id: eId })),
          },
        },
        include: { edges: true },
      });
      return NextResponse.json(cycle, { status: 201 });
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to add item' }, { status: 500 });
  }
}
