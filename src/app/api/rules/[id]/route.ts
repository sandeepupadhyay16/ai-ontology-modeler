import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED'];

/**
 * The conversational confirm step for business rules (idea.md §6). The ontologist edits the
 * condition/derivedValue to pin any vague thresholds the clarifyingQuestion surfaced, then
 * confirms. Only ever touches the RuleDraft row — never the linked Attribute/Relationship or
 * any live-graph row, so confirming/editing a rule can never mutate the ontology.
 * Confirming clears clarifyingQuestion (the thresholds are now considered specified).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const draft = await db.ruleDraft.findUnique({ where: { id } });
    if (!draft) {
      return NextResponse.json({ error: 'Rule draft not found' }, { status: 404 });
    }

    const data: Record<string, any> = {};

    if (body.condition !== undefined) {
      if (typeof body.condition !== 'object' || body.condition === null) {
        return NextResponse.json({ error: 'condition must be an object' }, { status: 400 });
      }
      data.condition = body.condition;
    }

    if (body.derivedValue !== undefined) {
      if (typeof body.derivedValue !== 'object' || body.derivedValue === null) {
        return NextResponse.json({ error: 'derivedValue must be an object' }, { status: 400 });
      }
      data.derivedValue = body.derivedValue;
    }

    if (body.clarifyingQuestion !== undefined) {
      data.clarifyingQuestion =
        typeof body.clarifyingQuestion === 'string' && body.clarifyingQuestion.trim()
          ? body.clarifyingQuestion.trim()
          : null;
    }

    if (body.confirmationStatus !== undefined) {
      if (!VALID_STATUSES.includes(body.confirmationStatus)) {
        return NextResponse.json({ error: `confirmationStatus must be one of ${VALID_STATUSES.join('|')}` }, { status: 400 });
      }
      data.confirmationStatus = body.confirmationStatus;
      // A confirmed rule is considered fully specified — clear any outstanding question.
      if (body.confirmationStatus === 'CONFIRMED' && body.clarifyingQuestion === undefined) {
        data.clarifyingQuestion = null;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No recognized fields to update (condition, derivedValue, clarifyingQuestion, confirmationStatus)' }, { status: 400 });
    }

    const updated = await db.ruleDraft.update({ where: { id }, data });
    return NextResponse.json({ draft: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update rule draft' }, { status: 500 });
  }
}
