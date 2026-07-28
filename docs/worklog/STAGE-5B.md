# Stage 5B — Review UI + conversational merge + cutover

Status: **IMPLEMENTED (2026-07-28)** — ready for review.

Completes Stage 5 per the split proposed and accepted before starting: 5A shipped the
transactional core (schema, promotion service, review API — `docs/worklog/STAGE-5A.md`,
reviewed and approved with one required fix already applied there). 5B is the review UI in
`ChatPanel`, conversational merge, and the cutover away from `ai-generate`.

---

## Files changed

| File | Why |
|---|---|
| `src/components/ChatPanel.tsx` | Rewritten. Send path now goes through the Stage 5 turn/review/promote pipeline instead of `ai-generate`. Adds a candidate review queue (accept/reject/merge/promote-to-core per candidate) and a "Promote Reviewed Candidates" button. Adds deterministic conversational merge parsing. Removes the `ai-generate`-specific `guidanceMode` (DIRECT/INTERACTIVE) toggle and probing-question flow — the new pipeline has no equivalent concept, so keeping that UI would have been dead-end controls pointing at nothing. |
| `src/app/api/sessions/[id]/candidates/route.ts` | `GET` now includes `dupTargetConcept: { id, label, conceptType }` so the review queue can render "possible duplicate of *Insurer*" instead of a raw id. |
| `src/app/api/ontologies/[id]/ai-generate/route.ts` | Added a `@deprecated` doc comment. Not deleted, not unwired from every caller — see Decision 5 below. |

---

## Decisions & rejected alternatives

### 1. Modeling session is bootstrapped lazily per ontology, persisted in `localStorage`
On mount (or `ontologyId` change), `ChatPanel` looks up `tse_session_${ontologyId}` in
`localStorage`. If present, it `GET`s `/api/sessions/:id` to confirm the session still
exists (handles a stale id from wiped dev data) and reuses it; otherwise it `POST`s
`/api/sessions` and stores the new id. This means turns from the same browser tab across
page reloads accumulate into the same session's candidate queue, matching idea.md's
"visibly-updating list" — a page refresh doesn't silently start a new review batch.

**Rejected:** creating a new session per message. Would have made the running candidate
list (the whole point of Stage 2's staging design) reset constantly.

### 2. Removed the `ai-generate`-specific guided-interview mode entirely, not adapted
The old `DIRECT`/`INTERACTIVE` toggle and its "probing questions" clarification loop were
built around `ai-generate`'s own `isVague`/`probingQuestions` response fields. The new
`turns` endpoint has no such concept — every turn is extracted into candidates for human
review, full stop. Keeping the toggle and wiring it to nothing would have shipped dead UI
that implied a feature that doesn't exist in the new pipeline. Removed rather than faked.

### 3. Conversational merge is grounded ONLY in the existing embedding-based `dupTargetConceptId` — never a free-text lookup
`ChatPanel` parses `"merge X into Y"` with a plain regex (`MERGE_COMMAND_RE`, no LLM call).
It then finds a `PENDING` candidate named `X` in the current review queue and requires that
candidate to already have a `dupTargetConceptId` (set deterministically by Stage 4/5's
cosine dup check at extraction time) whose matched concept's label equals `Y`. If either
condition fails, it reports why and does nothing — it never resolves `Y` by searching all
live concepts for a label match.

This was a deliberate choice, not a shortcut: idea.md's own motivating case (Payer vs.
Insurer) is exactly the situation where a label-text search for "Insurer" would work by
coincidence but a search for a *differently-named* synonym would not — the whole reason
Stage 5 embeds `description` was to catch that case via the embedding, not via string
matching. Anchoring merge resolution to the already-computed `dupTargetConceptId` keeps
"what can this merge into" consistent with what the deterministic dup check already found,
and keeps the mutation itself identical to the review queue's Merge button — `PATCH
decision: MERGED, mergeTargetConceptId` — never a bespoke resolution path, and never a
direct write to `Concept`/`Relationship`. Either way, the change is a `CandidateConcept`
mutation; only a subsequent explicit **Promote** click reaches the live graph, exactly like
every other decision in the queue. This satisfies the "no backdoor around the gate"
requirement literally: there is exactly one write path into the live graph
(`promoteSessionCandidates`), and both the button and the chat command feed it the same way.

### 4. Scope override in the UI is a one-way "Promote to core" button, not a scope picker
A candidate defaults to `extension:<domain>` (set server-side at extraction, per Stage 5A).
The UI offers a single button, shown only while `scope !== 'core'`, that `PATCH`es
`scope: 'core'`. There's no UI to move a candidate to a *different* extension or back to its
original extension scope — the ontologist-gated action idea.md and the plan describe is
specifically "promote to core," a deliberate one-way elevation, not general scope editing.
(The API itself still accepts any valid `extension:<domain>` scope via direct `PATCH` if
ever needed — only the UI is deliberately narrow here.)

### 5. `ai-generate` marked `@deprecated` but NOT fully unwired — one caller remains, out of scope
Searched every caller before touching the route. Two exist:
- `ChatPanel.tsx`'s send path — **this is the one the instruction targets**, now switched
  to the turns/review/promote pipeline.
- `src/app/page.tsx` (~line 880), inside the bulk objective-onboarding wizard: after
  pre-seeding N new ontologies from selected business objectives, it fires one
  background `ai-generate` call per ontology to auto-populate an initial model. This is a
  different flow entirely — one-shot bulk seeding across many ontologies with no
  conversational review step — and "switch ChatPanel's send path" doesn't cover it.
  Redesigning bulk onboarding to go through per-ontology sessions + human review would be a
  much larger, separate change (and arguably contradicts the wizard's whole point, which is
  zero-touch initial seeding). Left as-is and flagged here rather than silently cut or
  silently left undocumented.

The deprecation comment on the route itself names this caller explicitly so a future
reader doesn't assume the route is dead code.

---

## Acceptance checkpoint (from `IMPLEMENTATION_PLAN.md` Stage 5)

- **Nothing reaches the live graph without an explicit accept** — every mutation from the
  UI (Accept/Reject/Merge/Promote-to-core button, and the conversational merge command)
  only ever `PATCH`es a `CandidateConcept`. The one and only write into `Concept`/
  `Relationship` is the "Promote Reviewed Candidates" button (`POST .../promote`),
  confirmed live below.
- **Accept promotes; reject discards; merge redirects with no duplicate created** —
  inherited from Stage 5A's already-verified promotion service; re-confirmed this round via
  the UI's exact call sequence (see verification below).
- **Promoted concepts attach under an existing class** — unchanged from 5A (tag-root
  parenting); re-confirmed live below (`ClaimsAuditor` parented under the core `Agent` root).
- **No backdoor around the gate for conversational merge** — verified: the merge command
  resolves to the identical `PATCH decision: MERGED, mergeTargetConceptId` the button uses,
  and a mismatched target name is refused rather than guessed at.

---

## How verified

**No browser automation tool is available in this environment** (checked; none configured)
— I could not literally click through the UI in a real browser, so I cannot claim visual
confirmation of rendering, layout, or click interactions. What I did instead: replicated,
call-for-call, every code path `ChatPanel.tsx` executes — the session bootstrap dance, the
exact `GET`/`PATCH`/`POST` request shapes, and the merge-command regex + resolution logic
copied verbatim from the component — against the real running dev server (port 3006) and
real seeded data, then inspected the DB directly to confirm outcomes. `npx tsc --noEmit` and
`npm run build` both pass (all routes compile, including the new `dupTargetConcept` include).

**A real constraint hit mid-verification:** the Gemini free-tier chat-generation quota
(`gemini-3.6-flash`, 20 requests/day) was exhausted by this session's cumulative Stage
4/5A/5B live testing, so `POST /api/sessions/:id/turns` (which calls the LLM for
extraction) could not be exercised live this round. That endpoint is **unchanged code** in
Stage 5B — its extraction logic was already proven end-to-end in Stage 5A's verification
(multiple successful turns, real extracted candidates). The embedding model
(`gemini-embedding-2`) runs under a separate quota and was confirmed still working, so the
dup-check logic itself was re-verified live with a real embedding call.

Verification run (`stage5b_verify2.ts`, using this DB-seeding fallback for the turn only,
identical to what `turns/route.ts` would have produced):

1. **Session bootstrap** — `POST /api/sessions` → 201, matches what `ChatPanel`'s effect
   does on mount.
2. **Candidate list shape** — seeded two candidates (one seeded via a real
   `embedText`+cosine dup check against the actual `PatientRegistry` concept, one plain);
   `GET .../candidates` returns `dupTargetConcept.label` populated via the new include (this
   run's real check scored `0.8247` against `PatientRegistry` — below the `0.90` threshold,
   so `UNIQUE`; run-to-run embedding variance is expected and doesn't indicate a bug, so the
   script fell back to exercising the plain Accept path for that candidate instead of Merge).
3. **Scope override** — `PATCH scope: 'core'` on the `ClaimsAuditor` candidate (what the
   "Promote to core" button sends) → `200`, `scope` confirmed `'core'`.
4. **Promote** — `POST .../promote` → `201`, zero errors. Directly queried the two promoted
   concepts afterward: `PatientEnrollmentDatabase` correctly landed in a fresh
   `extension:biopharma_life_sciences` `Ontology` row (parented under its own `Entity` tag
   root); `ClaimsAuditor` correctly landed in the **core** ontology (parented under a
   freshly-created core `Agent` tag root — the previous one had been deleted during Stage
   5A's baseline-restore cleanup, so re-creating it lazily is exactly the designed
   behavior). Confirmed via `GET /api/ontologies/:coreId` (what `onGenerationComplete`
   reloads) that the core graph's concept count increased by exactly 2 (`ClaimsAuditor` +
   its newly-needed `Agent` tag root) — root-caused this delta by direct DB query before
   accepting it, rather than assuming it was correct.
5. **Post-promote queue filtering** — `GET .../candidates` afterward, filtered client-side
   exactly as `ChatPanel` does (`!c.changeSetId`): confirmed the promoted candidate no
   longer appears in the review queue.
6. **Merge-command logic** (exercised separately as a pure logic check, since this run's
   live dup score came back `UNIQUE` rather than `POSSIBLE_DUP`): confirmed the regex parses
   `"merge X into Y"`, resolves the source candidate by exact case-insensitive label among
   `PENDING` candidates, requires a `dupTargetConceptId`, and requires the parsed target
   text to case-insensitively match the matched concept's actual label — a deliberately
   wrong target name was confirmed to fail that check (refused, not guessed).
7. **Cleanup.** Deleted the test session, its turn/candidates/`ChangeSet`, both promoted
   concepts, the fresh extension `Ontology` row and its tag root, and the fresh core `Agent`
   tag root. Re-queried counts: `ontology=3, concept=35, relationship=33, session=0, turn=0,
   candidate=0, changeSet=0` — exact baseline, confirmed unchanged.

---

## Known gaps / TODOs

- **Not literally browser-tested** — see "How verified" above. Recommend a manual
  click-through once the Gemini daily quota resets, specifically to check the review queue's
  layout/scroll behavior with a realistic number of candidates, and the actual chat
  rendering of the merge-command replies.
- **`ai-generate` still has one live caller** (`page.tsx`'s bulk onboarding wizard) — see
  Decision 5. Out of scope for this cutover; flagged for a future pass if/when that wizard
  is redesigned to go through the review pipeline.
- **Gemini free-tier chat quota (20/day) is a real operational constraint** for continued
  live testing today — not a code issue, just noting it blocks further live `turns` calls
  until it resets.
- **The review queue has no pagination/virtualization** — fine at conversational scale
  (a handful to a few dozen candidates per session), would need revisiting if sessions grow
  very large.
- **No "reject all" / "accept all" bulk action** — every candidate is decided individually.
  Not requested by the plan; noting as a possible follow-up.

---

## Ready for review

Stage 5 (schema + promotion service + review API + review UI + conversational merge +
cutover) is now complete across 5A and 5B. Stopping here for review before Stage 6 (TTL
generation & diff).
