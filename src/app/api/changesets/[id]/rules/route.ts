import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateRuleDrafts } from '@/lib/ruleElicitation';

/**
 * POST elicits business-rule drafts (condition -> derived value) for the derived logic this
 * changeset's promotion implies (idempotent — see generateRuleDrafts). GET lists what's been
 * drafted. Mirrors /api/changesets/[id]/glossary. Non-destructive: RuleDrafts are staging,
 * never the live rules store.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await generateRuleDrafts(id);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to elicit rule drafts' }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const drafts = await db.ruleDraft.findMany({
      where: { changeSetId: id },
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
