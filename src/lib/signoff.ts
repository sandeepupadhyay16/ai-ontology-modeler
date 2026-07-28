/**
 * Stage 11 — sign-off workflow (idea.md §9: "routes to the relevant domain SME/steward for
 * final approval before merge. Output: approved, or sent back with comments"). Second hard gate.
 *
 * A change set must be VALIDATED (Stage 9 passed) before sign-off. An APPROVED decision advances
 * it to SIGNED_OFF; a REJECTED decision records the reviewer's comments and leaves it VALIDATED
 * ("sent back"). Publish (Stage 12) requires SIGNED_OFF, so nothing publishes without an
 * explicit approval on record.
 */
import { db } from './db';

export interface SignoffInput {
  approverRole: string;
  approver: string;
  decision: 'APPROVED' | 'REJECTED';
  comments?: string;
}

export interface SignoffResult {
  changeSetId: string;
  signoffId: string;
  status: string;
}

export async function recordSignoff(changeSetId: string, input: SignoffInput): Promise<SignoffResult> {
  const changeSet = await db.changeSet.findUnique({ where: { id: changeSetId } });
  if (!changeSet) throw new Error('ChangeSet not found');
  if (!input.approver?.trim() || !input.approverRole?.trim()) {
    throw new Error('approver and approverRole are required');
  }
  if (!['APPROVED', 'REJECTED'].includes(input.decision)) {
    throw new Error('decision must be APPROVED or REJECTED');
  }
  if (changeSet.status !== 'VALIDATED') {
    throw new Error(`ChangeSet must be VALIDATED before sign-off (is ${changeSet.status})`);
  }

  const signoff = await db.signoff.create({
    data: {
      changeSetId,
      approverRole: input.approverRole.trim(),
      approver: input.approver.trim(),
      decision: input.decision,
      comments: input.comments?.trim() || null,
      decidedAt: new Date(),
    },
  });

  let status = changeSet.status;
  if (input.decision === 'APPROVED') {
    const updated = await db.changeSet.update({ where: { id: changeSetId }, data: { status: 'SIGNED_OFF' } });
    status = updated.status;
  }
  // REJECTED: stays VALIDATED (sent back with comments); the record captures the rejection.

  return { changeSetId, signoffId: signoff.id, status };
}
