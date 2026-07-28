# Stage 8 — Business-rule elicitation

Implemented by the assistant (took over implementation from Stage 8 onward). Independent-review
note: from this stage on, the implementer and reviewer are the same, so verification was done
against an isolated throwaway fixture with explicit pass/fail checks rather than a separate review pass.

## Result
Conversational business-rule elicitation (idea.md §6). After a promotion, the changeset's implied
derived logic ("X determines Y") is turned into structured `condition -> derivedValue` `RuleDraft`
rows, each tagged to the ontology property it reads from, each with its own confirm/reject
lifecycle. Vague thresholds surface a `clarifyingQuestion` the ontologist answers by editing the
When/Then before confirming. Rules are stored as DATA (owner decision), never compiled to SHACL/SPARQL
this stage.

## Decisions carried in from the plan
- **Storage = data (`RuleDraft`)**, not compiled to SHACL/SPARQL. (Owner decision, Stage 8.)
- **RuleDraft property link = dual real FKs**, replacing the earlier polymorphic
  `linkedPropertyId` + `linkedPropertyType`. RuleDraft was empty (0 rows, verified), so the
  restructure is safe. Gives DB-enforced referential integrity, matching `GlossaryDraft`.

## Files changed
- `prisma/schema.prisma` — `RuleDraft`: dropped `linkedPropertyId`/`linkedPropertyType`, added
  `linkedAttributeId` + `linkedRelationshipId` (real FKs, `onDelete: SetNull`) and
  `clarifyingQuestion String?`. Added `ruleDrafts RuleDraft[]` back-relations to `Attribute` and
  `Relationship`.
- `prisma/migrations/20260728191315_stage8_ruledraft_dual_fk/` — the migration. Drops two EMPTY
  columns (data-loss warning is expected and safe — table had 0 rows) and adds the new columns + FKs.
- `src/lib/ruleElicitation.ts` (new) — `generateRuleDrafts(changeSetId)`, mirroring
  `src/lib/glossary.ts`: one grounded, batched LLM call over the changeset's promoted
  concepts/attributes/relationships + the session conversation; resolves each rule's property
  reference to a real Attribute/Relationship FK; idempotent (skips a property that already has a
  rule under this changeset); non-fatal on LLM failure (returns `skipped`, never throws, so a
  drafting failure can't undo the already-live promotion).
- `src/app/api/changesets/[id]/rules/route.ts` (new) — POST elicits, GET lists. Mirrors the
  glossary changeset route.
- `src/app/api/sessions/[id]/rule-drafts/route.ts` (new) — GET lists all rule drafts for a session
  (for ChatPanel reload-on-mount). Mirrors `glossary-drafts`.
- `src/app/api/rules/[id]/route.ts` (new) — PATCH confirm/edit (condition/derivedValue/
  clarifyingQuestion/confirmationStatus). Only ever touches the `RuleDraft` row — never the linked
  property or any live-graph row. Confirming clears `clarifyingQuestion`.
- `src/components/ChatPanel.tsx` — added `RuleDraftCard` (When/Then editable inputs + clarifying
  question banner), `ruleDrafts` state, `refreshRuleDrafts`, `decideRuleDraft`, `pendingRuleDrafts`;
  wired elicitation into `promoteAll` right after glossary drafting (same non-fatal contract) and a
  "Business Rule Confirmations" queue below the glossary queue.

## Decisions & rejected alternatives
1. **Post-promotion elicitation (mirror glossary), not a mid-conversation multi-turn state machine.**
   idea.md §6 wants the clarifying question asked rather than thresholds left implicit. Rather than
   track per-turn "awaiting rule answer" state interleaved with concept extraction (complex, fragile),
   elicitation runs once per promotion and, when thresholds are vague, stores the question on the
   RuleDraft; the ontologist pins it by editing When/Then in the card before confirming. Simpler,
   robust, and it still surfaces the exact question idea.md asks for.
2. **Property link is REQUIRED** — a rule whose referenced property isn't among the changeset's
   promoted attributes/relationships is skipped (reported), not created unlinked. Keeps every rule
   grounded in a real, DB-enforced property (idea.md: "tagged to the ontology property it reads from").
3. **`clarifyingQuestion` is a first-class column**, not buried in the condition JSON — it drives UI
   (the amber banner) and a clear "needs thresholds" signal, and clears on confirm.
4. **Idempotency is per-property**, not per-changeset: re-running elicits rules for
   not-yet-ruled properties but never double-links one already ruled.

## How verified
Isolated throwaway fixture (marked `__stage8_fixture_*`, fully cascade-deletable), never touching the
owner's live data. `tsc --noEmit` clean, `npm run build` succeeds. Fixture checks:
| Check | Result |
|---|---|
| `tsc --noEmit` / `npm run build` | clean / succeeds |
| FK integrity — RuleDraft with a bad `linkedAttributeId` | rejected by DB (PASS) |
| Dual-FK link — attribute resolves, relationship null | PASS |
| Live elicitation from "formulary tier determines access priority" | 1 rule created, linked to `formularyTier` attribute, `clarifyingQuestion` set (the tier→priority mapping wasn't stated) — the idea.md §6 behavior, live |
| Idempotency — re-run | created 0, total stayed 1 |
| Isolation/cleanup | live concept count 43 → 43, RESTORED (no leak) |

Note: the Gemini chat quota happened to be available, so the LLM path ran for real; the non-fatal
contract (returns `skipped`, never throws) is coded and was exercised by the try/catch either way.

## Known gaps / TODOs
- The elicitation prompt only sees properties CREATED by the current changeset. A rule that reads from
  a pre-existing property (promoted in an earlier changeset) won't be linkable in this pass — acceptable
  for v1 (rules follow their changeset), revisit if cross-changeset rules are needed.
- No SHACL/SPARQL compilation yet (deliberate — storage-as-data decision). A later pass can compile
  confirmed RuleDrafts.
- Unrelated pre-existing finding (not fixed here): `CandidateConcept.scope` defaults to the literal
  `"extension:generic"` rather than the session's resolved domain-profile key — the extension-by-default
  bias always lands in a generic module. Worth wiring the session's domain key into the scope at
  extraction time (Stage 2/extension-handling), out of Stage 8 scope.

## Ready for review
Stage 8 acceptance met: a vague "X determines Y" yields a follow-up question and a structured rule
linked to a real property, with confirm/reject lifecycle, non-destructive staging, idempotent
re-runs, and DB-enforced referential integrity. Stopping for review before Stage 9 (SHACL validation).
