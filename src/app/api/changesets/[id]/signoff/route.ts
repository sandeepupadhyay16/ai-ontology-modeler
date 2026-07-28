import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recordSignoff } from '@/lib/signoff';

/** Stage 11: record an SME/steward sign-off (APPROVED advances to SIGNED_OFF; REJECTED sends back). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = await recordSignoff(id, {
      approverRole: body.approverRole,
      approver: body.approver,
      decision: body.decision,
      comments: body.comments,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Sign-off failed' }, { status: 400 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const signoffs = await db.signoff.findMany({ where: { changeSetId: id }, orderBy: { createdAt: 'asc' } });
    return NextResponse.json({ signoffs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch sign-offs' }, { status: 500 });
  }
}
