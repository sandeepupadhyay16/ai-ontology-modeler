import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveTagRoot } from '@/lib/promotion';
import { isTagRootConcept, type UpperOntologyTag } from '@/lib/upperOntology';

// 5-type concept model → Layer-1 tag (for tag-root parenting), mirroring the seed/promotion mapping.
const TYPE_TO_TAG: Record<string, UpperOntologyTag> = {
  Entity: 'Entity', Agent: 'Agent', Process: 'Process', Event: 'Event', Metric: 'Quality',
};

/**
 * V3 manual authoring — create a concept directly (not via chat/seed). Attaches it under its
 * Layer-1 tag-root (reusing promotion.ts's resolveTagRoot), guards against duplicate labels, and
 * writes it live. No embedding at manual-create time (offline/deterministic, same as the seed path).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: ontologyId } = await params;
    const body = await request.json();
    const { label, conceptType, description, businessJustification, attributes } = body ?? {};
    if (!label || !label.trim()) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }
    const ontology = await db.ontology.findUnique({ where: { id: ontologyId }, select: { id: true } });
    if (!ontology) return NextResponse.json({ error: 'Ontology not found' }, { status: 404 });

    const ct = TYPE_TO_TAG[conceptType] ? conceptType : 'Entity';
    const tag = TYPE_TO_TAG[ct];

    // Duplicate-label guard (case-insensitive, ignoring tag-root anchors).
    const clashes = await db.concept.findMany({
      where: { ontologyId, label: { equals: label.trim(), mode: 'insensitive' } },
      select: { id: true, typeFields: true },
    });
    if (clashes.some((c) => !isTagRootConcept(c))) {
      return NextResponse.json({ error: `A concept named "${label.trim()}" already exists in this ontology.` }, { status: 409 });
    }

    const concept = await db.$transaction(async (tx) => {
      const parentConceptId = await resolveTagRoot(tx, ontologyId, tag);
      const c = await tx.concept.create({
        data: { label: label.trim(), conceptType: ct, description: description || null, businessJustification: businessJustification || null, parentConceptId, ontologyId },
      });
      for (const a of Array.isArray(attributes) ? attributes : []) {
        if (!a?.name?.trim()) continue;
        await tx.attribute.create({ data: { name: a.name.trim(), datatype: a.datatype || 'string', description: a.description || null, conceptId: c.id } });
      }
      return c;
    });

    return NextResponse.json(concept, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create concept' }, { status: 500 });
  }
}
