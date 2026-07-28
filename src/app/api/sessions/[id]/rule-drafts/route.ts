import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Lists every RuleDraft under any ChangeSet belonging to this session — mirrors
 * GET /api/sessions/[id]/glossary-drafts so ChatPanel can reload the rule-confirmation queue
 * on mount, not just right after a promotion in the same browser session.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const drafts = await db.ruleDraft.findMany({
      where: { changeSet: { sessionId } },
      orderBy: { createdAt: 'asc' },
      include: {
        linkedAttribute: { select: { id: true, name: true } },
        linkedRelationship: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ drafts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch rule drafts' }, { status: 500 });
  }
}
