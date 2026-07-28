import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/** Lists this session's change sets (newest first) with sign-offs + counts, for the governance UI. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    const changeSets = await db.changeSet.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      include: {
        signoffs: { orderBy: { createdAt: 'asc' } },
        _count: { select: { glossaryDrafts: true, ruleDrafts: true } },
      },
    });
    const versions = await db.ontologyVersion.findMany({ where: { changeSetId: { in: changeSets.map((c) => c.id) } } });
    const versionByChangeSet = Object.fromEntries(versions.map((v) => [v.changeSetId, v]));
    return NextResponse.json({ changeSets: changeSets.map((cs) => ({ ...cs, version: versionByChangeSet[cs.id] || null })) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch change sets' }, { status: 500 });
  }
}
