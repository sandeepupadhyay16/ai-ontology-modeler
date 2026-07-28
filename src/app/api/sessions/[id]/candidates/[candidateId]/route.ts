import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const VALID_DECISIONS = ['PENDING', 'ACCEPTED', 'REJECTED', 'MERGED'];

function isValidScope(scope: unknown): scope is string {
  return typeof scope === 'string' && (scope === 'core' || /^extension:.+$/.test(scope));
}

/**
 * Ontologist review mutations (idea.md "Batch review" — accept/reject/merge,
 * plus the module-scope override and parent-concept override that Stage 5's
 * promotion service reads). Never touches the live graph itself — see
 * src/lib/promotion.ts / POST /api/sessions/[id]/promote for that.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
  try {
    const { id: sessionId, candidateId } = await params;
    const body = await request.json();

    const candidate = await db.candidateConcept.findUnique({ where: { id: candidateId } });
    if (!candidate || candidate.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Candidate not found in this session' }, { status: 404 });
    }
    if (candidate.changeSetId) {
      return NextResponse.json({ error: 'Candidate has already been promoted and can no longer be edited' }, { status: 409 });
    }

    const data: Record<string, any> = {};

    if (body.decision !== undefined) {
      if (!VALID_DECISIONS.includes(body.decision)) {
        return NextResponse.json({ error: `decision must be one of ${VALID_DECISIONS.join('|')}` }, { status: 400 });
      }
      data.decision = body.decision;
    }

    const resultingDecision = data.decision ?? candidate.decision;

    if (body.mergeTargetConceptId !== undefined) {
      if (body.mergeTargetConceptId !== null) {
        const target = await db.concept.findUnique({ where: { id: body.mergeTargetConceptId } });
        if (!target) {
          return NextResponse.json({ error: `mergeTargetConceptId ${body.mergeTargetConceptId} does not exist` }, { status: 400 });
        }
      }
      data.mergeTargetConceptId = body.mergeTargetConceptId;
    }

    if (resultingDecision === 'MERGED') {
      const resultingMergeTarget = body.mergeTargetConceptId !== undefined ? body.mergeTargetConceptId : candidate.mergeTargetConceptId;
      if (!resultingMergeTarget) {
        return NextResponse.json({ error: 'decision=MERGED requires mergeTargetConceptId' }, { status: 400 });
      }
    }

    if (body.parentConceptId !== undefined) {
      if (body.parentConceptId !== null) {
        const parent = await db.concept.findUnique({ where: { id: body.parentConceptId } });
        if (!parent) {
          return NextResponse.json({ error: `parentConceptId ${body.parentConceptId} does not exist` }, { status: 400 });
        }
      }
      data.parentConceptId = body.parentConceptId;
    }

    if (body.scope !== undefined) {
      if (!isValidScope(body.scope)) {
        return NextResponse.json({ error: 'scope must be "core" or "extension:<domain>"' }, { status: 400 });
      }
      data.scope = body.scope;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No recognized fields to update (decision, mergeTargetConceptId, parentConceptId, scope)' }, { status: 400 });
    }

    const updated = await db.candidateConcept.update({ where: { id: candidateId }, data });
    return NextResponse.json({ candidate: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update candidate' }, { status: 500 });
  }
}
