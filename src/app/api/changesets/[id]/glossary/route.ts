import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateGlossaryDrafts } from '@/lib/glossary';

/**
 * Stage 7 (idea.md §5). POST drafts glossary entries for this ChangeSet's newly-promoted
 * concepts/relationships (idempotent — see generateGlossaryDrafts). GET lists what's been
 * drafted so far, for a UI to render/re-render without re-invoking the LLM.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const changeSet = await db.changeSet.findUnique({ where: { id } });
    if (!changeSet) {
      return NextResponse.json({ error: 'ChangeSet not found' }, { status: 404 });
    }
    const result = await generateGlossaryDrafts(id);
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate glossary drafts' }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const drafts = await db.glossaryDraft.findMany({
      where: { changeSetId: id },
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
