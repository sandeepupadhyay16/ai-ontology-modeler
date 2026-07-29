import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promoteCandidateDirect } from '@/lib/directPromotion';

/**
 * V3 "Confirm all" — promote every still-PENDING candidate in a session into the live graph.
 * Concepts first, then relationships (so a relationship's endpoints are live before it's created).
 * Reuses the single-candidate direct-promote path; reports any that couldn't be promoted.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    const pending = await db.candidateConcept.findMany({
      where: { sessionId, decision: 'PENDING', promotedConceptId: null, promotedRelationshipId: null },
      orderBy: { createdAt: 'asc' },
    });
    const concepts = pending.filter((c) => (c.payload as any)?.kind !== 'relationship');
    const rels = pending.filter((c) => (c.payload as any)?.kind === 'relationship');

    let promoted = 0;
    const errors: { label: string; error?: string }[] = [];
    for (const c of [...concepts, ...rels]) {
      const r = await promoteCandidateDirect(c.id);
      if (r.ok) promoted++;
      else errors.push({ label: c.label, error: r.error });
    }
    return NextResponse.json({ promoted, errors });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to confirm drafts' }, { status: 500 });
  }
}
