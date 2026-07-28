import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promoteSessionCandidates } from '@/lib/promotion';

/**
 * The hard gate (idea.md "Batch review (ontologist gate)"). Promotes every
 * ACCEPTED/MERGED, not-yet-promoted candidate in this session into the live
 * graph as one ChangeSet. See src/lib/promotion.ts for the full contract —
 * transactional, additive-only, module-aware.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const session = await db.modelingSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ error: 'Modeling session not found' }, { status: 404 });
    }

    const result = await promoteSessionCandidates(sessionId);

    if (result.changeSetId === null) {
      return NextResponse.json({ ...result, message: 'No ACCEPTED/MERGED candidates were ready to promote' }, { status: 200 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to promote candidates' }, { status: 500 });
  }
}
