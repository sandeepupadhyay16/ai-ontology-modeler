import { NextResponse } from 'next/server';
import { demoteCandidate } from '@/lib/directPromotion';

/**
 * V3 Stage V2 — un-check. Removes a candidate's live element and re-stages it.
 * Body `{ force?: boolean }`: without force, a destructive removal (edited element or one with
 * dependents) returns a `warning` instead of deleting; resend with `force: true` to confirm.
 * See src/lib/directPromotion.ts (decision Q2).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let force = false;
    try {
      const body = await request.json();
      force = !!body?.force;
    } catch {
      // empty body is fine — defaults to non-forced
    }
    const result = await demoteCandidate(id, { force });
    if (!result.ok) {
      const status = result.error === 'Candidate not found' ? 404 : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to demote candidate' }, { status: 500 });
  }
}
