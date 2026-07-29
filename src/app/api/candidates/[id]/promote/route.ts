import { NextResponse } from 'next/server';
import { promoteCandidateDirect } from '@/lib/directPromotion';

/**
 * V3 Stage V2 — check-in. Promotes ONE staged candidate directly into the live graph
 * (no ChangeSet). See src/lib/directPromotion.ts.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await promoteCandidateDirect(id);
    if (!result.ok) {
      const status = result.error === 'Candidate not found' ? 404 : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to promote candidate' }, { status: 500 });
  }
}
