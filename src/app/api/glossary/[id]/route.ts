import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED'];

/**
 * The conversational confirm step itself (idea.md §5: "Does this capture what you meant by
 * Payer?"). Only ever touches the GlossaryDraft row — never the linked Concept/Relationship,
 * so confirming/rejecting/editing a definition can never mutate the live graph.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const draft = await db.glossaryDraft.findUnique({ where: { id } });
    if (!draft) {
      return NextResponse.json({ error: 'Glossary draft not found' }, { status: 404 });
    }

    const data: Record<string, any> = {};

    if (body.definition !== undefined) {
      if (typeof body.definition !== 'string' || !body.definition.trim()) {
        return NextResponse.json({ error: 'definition must be a non-empty string' }, { status: 400 });
      }
      data.definition = body.definition.trim();
    }

    if (body.confirmationStatus !== undefined) {
      if (!VALID_STATUSES.includes(body.confirmationStatus)) {
        return NextResponse.json({ error: `confirmationStatus must be one of ${VALID_STATUSES.join('|')}` }, { status: 400 });
      }
      data.confirmationStatus = body.confirmationStatus;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No recognized fields to update (definition, confirmationStatus)' }, { status: 400 });
    }

    const updated = await db.glossaryDraft.update({ where: { id }, data });
    return NextResponse.json({ draft: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update glossary draft' }, { status: 500 });
  }
}
