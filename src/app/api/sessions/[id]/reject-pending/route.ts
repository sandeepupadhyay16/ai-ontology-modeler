import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * V3 "Dismiss all" — sweep every still-PENDING candidate in a session (sets decision REJECTED so it
 * leaves the draft overlay / Staging inbox without touching the live graph). History is preserved.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    const res = await db.candidateConcept.updateMany({
      where: { sessionId, decision: 'PENDING' },
      data: { decision: 'REJECTED' },
    });
    return NextResponse.json({ rejected: res.count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to dismiss drafts' }, { status: 500 });
  }
}
