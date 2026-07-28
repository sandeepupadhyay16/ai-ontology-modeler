import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Fetch a ChangeSet's stored review artifacts — status, the Stage 6 ttlDiff/ttlFiles/diffSummary,
 * and (Stages 10/11) its OntologyVersion + sign-offs + draft counts for the governance UI.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const changeSet = await db.changeSet.findUnique({
      where: { id },
      include: {
        signoffs: { orderBy: { createdAt: 'asc' } },
        _count: { select: { glossaryDrafts: true, ruleDrafts: true } },
      },
    });
    if (!changeSet) {
      return NextResponse.json({ error: 'ChangeSet not found' }, { status: 404 });
    }
    const version = await db.ontologyVersion.findUnique({ where: { changeSetId: id } });
    return NextResponse.json({ changeSet, version });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch change set' }, { status: 500 });
  }
}
