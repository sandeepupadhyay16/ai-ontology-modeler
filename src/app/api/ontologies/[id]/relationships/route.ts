import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * V3 manual authoring — create a relationship directly between two existing concepts. Both
 * endpoints must belong to this ontology (manual creation stays intra-ontology; cross-module
 * imports go through the linked-ontology flow).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: ontologyId } = await params;
    const body = await request.json();
    const { name, sourceId, targetId, cardinality, description, businessJustification } = body ?? {};
    if (!name || !name.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!sourceId || !targetId) return NextResponse.json({ error: 'source and target are required' }, { status: 400 });
    if (sourceId === targetId) return NextResponse.json({ error: 'source and target must differ' }, { status: 400 });

    const [source, target] = await Promise.all([
      db.concept.findFirst({ where: { id: sourceId, ontologyId }, select: { id: true } }),
      db.concept.findFirst({ where: { id: targetId, ontologyId }, select: { id: true } }),
    ]);
    if (!source || !target) {
      return NextResponse.json({ error: 'source/target concept not found in this ontology' }, { status: 400 });
    }

    const relationship = await db.relationship.create({
      data: {
        name: name.trim(),
        description: description || null,
        businessJustification: businessJustification || null,
        cardinality: cardinality || 'one-to-many',
        sourceId,
        targetId,
        ontologyId,
      },
    });
    return NextResponse.json(relationship, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create relationship' }, { status: 500 });
  }
}
