import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateChangeSetTtl } from '@/lib/ttlDiff';

/**
 * Stage 6 (idea.md §4/§8): serialize an already-APPROVED ChangeSet into a Turtle patch plus
 * a human-readable diff, and persist both on the ChangeSet row. Deliberately a separate,
 * on-demand step from promotion (idea.md's process flow treats "batch review" and "OWL/TTL
 * generation" as distinct steps; keeps POST .../promote fast and free of a python subprocess).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const changeSet = await db.changeSet.findUnique({ where: { id } });
    if (!changeSet) {
      return NextResponse.json({ error: 'ChangeSet not found' }, { status: 404 });
    }

    const { ttlDiff, ttlFiles, diffSummary } = await generateChangeSetTtl(id);

    const updated = await db.changeSet.update({
      where: { id },
      data: { ttlDiff, ttlFiles: ttlFiles as any, diffSummary },
    });

    return NextResponse.json({ changeSet: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate TTL for change set' }, { status: 500 });
  }
}
