import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/** Lists candidates for a session — the running, visibly-updating list idea.md §2 describes. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const decision = searchParams.get('decision');

    const session = await db.modelingSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ error: 'Modeling session not found' }, { status: 404 });
    }

    const candidates = await db.candidateConcept.findMany({
      where: { sessionId, ...(decision ? { decision } : {}) },
      orderBy: { createdAt: 'asc' },
      include: {
        dupTargetConcept: { select: { id: true, label: true, conceptType: true } },
      },
    });

    return NextResponse.json({ candidates });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list candidates' }, { status: 500 });
  }
}
