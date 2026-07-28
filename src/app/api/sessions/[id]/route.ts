import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDomainProfileByKey, buildDomainPromptFragment } from '@/lib/domainProfiles';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await db.modelingSession.findUnique({
      where: { id },
      include: {
        ontology: true,
        turns: { orderBy: { ordinal: 'asc' } },
        _count: { select: { turns: true, candidates: true, changeSets: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Modeling session not found' }, { status: 404 });
    }

    const profile = getDomainProfileByKey(session.domainProfile || '');

    return NextResponse.json({
      session,
      domainProfile: profile,
      extractionPromptFragment: buildDomainPromptFragment(profile),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch modeling session' }, { status: 500 });
  }
}
