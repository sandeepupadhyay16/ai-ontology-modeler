import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Lists every GlossaryDraft under any ChangeSet belonging to this session — mirrors
 * GET /api/sessions/[id]/candidates so the ChatPanel can reload the confirmation queue on
 * mount, not just right after a promotion in the same browser session.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const drafts = await db.glossaryDraft.findMany({
      where: { changeSet: { sessionId } },
      orderBy: { createdAt: 'asc' },
      include: {
        linkedConcept: { select: { id: true, label: true } },
        linkedRelationship: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ drafts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch glossary drafts' }, { status: 500 });
  }
}
