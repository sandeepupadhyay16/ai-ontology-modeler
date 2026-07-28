# Stage 7 — Glossary drafting (conversational)

Status: **IMPLEMENTED (2026-07-28)** — ready for review.

For each newly-promoted class (`Concept`) and property (`Relationship`) in a `ChangeSet`,
drafts a plain-English definition via a grounded, structured LLM call, and stages it as a
`GlossaryDraft` for a conversational confirm step (idea.md §5) — never a silent queue, never
written straight to the live graph.

---

## Files changed

| File | Why |
|---|---|
| `prisma/schema.prisma` | **No migration.** `GlossaryDraft` already existed in the baseline schema (`changeSetId`, `linkedConceptId`/`linkedRelationshipId`, `term`, `definition`, `sourceTurnId`, `confirmationStatus`) — Stage 7 only needed to populate it, not extend it. |
| `src/lib/glossary.ts` (new) | The Stage 7 service: `generateGlossaryDrafts(changeSetId)` — one batched, grounded LLM call per changeset, idempotent per term. |
| `src/app/api/changesets/[id]/glossary/route.ts` (new) | `POST` drafts (idempotent), `GET` lists a changeset's drafts. |
| `src/app/api/sessions/[id]/glossary-drafts/route.ts` (new) | `GET` — every `GlossaryDraft` across all of a session's changesets, mirroring `GET /api/sessions/[id]/candidates`. Lets the UI reload the confirm queue on mount, not just right after a promotion in the same browser tab. |
| `src/app/api/glossary/[id]/route.ts` (new) | `PATCH` — the conversational confirm step itself: `confirmationStatus` (`CONFIRMED`/`REJECTED`) and/or an edited `definition`. Only ever touches the `GlossaryDraft` row. |
| `src/components/ChatPanel.tsx` | New `GlossaryDraftCard` + a "Glossary Confirmations" section below the Review Queue. `promoteAll()` now calls `POST .../glossary` right after a successful promotion and reports the result in chat; drafts reload on session bootstrap. |

---

## Decisions & rejected alternatives

### 1. Scope: Concept + Relationship only, never Attribute
idea.md says "for each new class/property." In this schema, `GlossaryDraft` only has
`linkedConceptId`/`linkedRelationshipId` — no `linkedAttributeId` — so "property" here means
an object property (`Relationship`), not a datatype attribute. A merge candidate's new
attributes are traceable (`Attribute.addedInChangeSetId`, Stage 6) but deliberately excluded
from glossary drafting: there's no FK slot to hang a term on, and inventing one would be
scope creep beyond what the plan or the existing schema asked for.

**Rejected:** drafting a definition per new attribute too. Would require a schema change
(`linkedAttributeId`) not requested by the Stage 7 spec, and attributes are typically
self-explanatory field names (`licenseNumber`, `retentionPeriodDays`) rather than glossary
terms in the idea.md sense ("Payer", "formulary tier").

### 2. Merge targets excluded — only genuinely NEW classes/properties get drafted
A `MERGED` candidate's target `Concept` already existed before this changeset; it is not a
"new" class, so `generateGlossaryDrafts` only looks at `ACCEPTED` candidates with a
`promotedConceptId`/`promotedRelationshipId` — never `MERGED` ones. If that pre-existing
concept already has (or lacks) a glossary entry from whenever it was first promoted, this
changeset doesn't touch that status either way.

### 3. `GlossaryDraft.definition` vs `Concept.description` — separate fields, deliberately never synced
This was the one open design question the user flagged explicitly. Decision: **separate,
not reused-in-place.**

- `Concept.description` (Stage 5) is a structural field set at promotion time. It also feeds
  the dedup embedding text (`src/lib/embeddings.ts`) and the TTL `rdfs:comment`
  (`src/lib/ttlDiff.ts`) — two other subsystems already depend on its exact contents and
  lifecycle (set once at promotion, not owned by any later confirm/reject flow).
- `GlossaryDraft.definition` is the human-facing artifact idea.md's confirm step explicitly
  expects to be revisable ("Does this capture what you meant by X?") before being confirmed
  — it has its own `confirmationStatus` lifecycle that `description` does not and should not
  share.
- They're not unrelated, though: `description` (plus attributes, or relationship
  source/target/cardinality) **is** passed to the LLM as grounding context for the glossary
  draft, so the drafted definition doesn't contradict or ignore what's already been said. The
  two fields can start similar and diverge after a human edits the glossary definition during
  confirmation — that divergence is intentional, not a bug.

**Rejected:** writing the LLM's drafted definition back onto `Concept.description`/
`Relationship.description` (or vice versa, seeding `GlossaryDraft.definition` by copying
`description` verbatim with no LLM call). Both would conflate two fields with different
owners, different lifecycles, and different downstream consumers.

### 4. One batched LLM call per changeset, not one call per term
All new terms in a changeset are sent as one prompt (`{ definitions: [...] }` structured
output), matching the extraction/duplicate-check pattern already used elsewhere in this
codebase (batch where possible) and minimizing calls against the same daily Gemini quota
that has repeatedly bottlenecked this project's live verification (Stage 5B, Stage 6).

### 5. Idempotent by design — safe to call `POST .../glossary` more than once
Before drafting, the service reads the changeset's existing `GlossaryDraft` rows and skips
any concept/relationship that already has one. A UI retry (e.g. after a network blip) or a
duplicate button click never produces duplicate glossary entries for the same term under the
same changeset. Verified live (see below).

### 6. Drafting failure is non-fatal, same tolerance as promotion's embed-on-write
If the LLM call throws (rate limit, network, bad JSON), every target for that call is
recorded in `skipped` with the reason, and nothing is written — no partial/garbage
`GlossaryDraft` rows. The changeset itself is already live (promotion happened first,
separately) so a drafting failure never rolls back or blocks anything already promoted; the
ontologist can retry glossary generation later. This mirrors `promotion.ts`'s phase-2 embed
failure handling exactly.

### 7. Conversational confirm surfaced inline in the existing panel, not a separate page/tab
idea.md is explicit that confirmation should happen "conversationally... rather than routing
to a silent review queue." Implemented as a new "Glossary Confirmations" section directly
below the existing candidate Review Queue in `ChatPanel` (same visual idiom: a card per item,
inline action buttons), plus a chat message summarizing what was drafted right after
promotion — so a new draft is never something the ontologist has to go hunting for in a
separate screen. Each card literally asks "Does this capture what you meant by X?" per
idea.md's own example wording, with the definition shown in an editable textarea so it can be
revised before confirming.

---

## Acceptance checkpoint (from `IMPLEMENTATION_PLAN.md` Stage 7)

- **Every accepted class/property gets a draft linked to its term** — verified live, both via
  a real end-to-end run through the actual running app (see below) and an isolated fixture
  test covering both a `Concept` and a `Relationship`.
- **Confirmation state persists** — `confirmationStatus` is a real column, updated via
  `PATCH /api/glossary/[id]`, read back correctly afterward; verified both fields (status
  and an edited `definition`) persist across a fresh `GET`.

---

## How verified — an unusual, unplanned, but genuinely stronger proof than scripted testing

While this stage was being implemented, **the owner's own concurrent manual browser
smoke-test (mentioned as in progress at the end of Stage 6's review) hit the new code live**,
within minutes of the new files landing on disk and the dev server hot-reloading them. This
was not orchestrated by this session — it was discovered by checking the real DB counts
before running my own verification, and finding `glossaryDraft` rows already present with
real, current timestamps (`2026-07-28T18:10–18:16Z`, i.e. minutes before the check, in the
owner's real `Cell Therapy Vein-to-Vein Logistics & Cold-Chain` ontology):

- 7 drafts under one changeset — `CryoCourier`, `LN2Shipper`, `ApheresisSite`,
  `ManufacturingFacility` (concepts) and `shippedTo`, `transports`, `shippedFrom`
  (relationships) — all with real, on-topic, LLM-generated definitions, **all already
  `CONFIRMED`** (the owner clicked Confirm in the browser).
- 1 more draft (`SalesRep`) under a second, later changeset, still `PENDING`.

This is real proof — a real Gemini call through the real UI, by the actual user, producing
correct term↔definition linking, correct concept-vs-relationship handling, and a real
confirm click round-tripping through `PATCH /api/glossary/[id]` — better than anything a
scripted test could claim, and it wasn't touched, mutated, or cleaned up by this session's
own verification (see below): **it's the owner's real data, left exactly as they left it.**

**My own verification** was scoped to *not* collide with that live activity: rather than
reusing shared real sessions/candidates or mutating the owner's pending `SalesRep` draft, a
fully isolated fixture (its own throwaway `Ontology`/`ModelingSession`/`ConversationTurn`/
`CandidateConcept`s/`Concept`s/`Relationship`/`ChangeSet`, all real DB rows, unrelated
namespace) was created, exercised through the real running API, and then deleted:

1. **`POST /api/changesets/[id]/glossary`** (first call, real LLM call) → `201`, created 2
   drafts — one for a new `Persona` concept (`ClaimsAdjuster`, with its attribute) and one for
   a new `Relationship` (`reviews`) — both linked correctly (`linkedConceptId` vs
   `linkedRelationshipId` set exactly one at a time), both `PENDING`.
2. **Same call again** → `201`, `created: []`, `skipped` both terms as
   "already has a glossary draft under this changeset" — idempotency confirmed, zero
   duplicate rows, zero extra LLM calls (verified via the early-return-before-LLM-call code
   path, not just by the output shape).
3. **`GET /api/changesets/[id]/glossary`** and **`GET /api/sessions/[id]/glossary-drafts`** —
   both correctly listed both drafts with their linked concept/relationship labels resolved.
4. **`PATCH /api/glossary/[id]`** confirm path — sent an edited `definition` + `CONFIRMED`
   together; response and a fresh read both reflected the edit. Reject path on the second
   draft → `REJECTED` persisted correctly.
5. **Confirmed `Concept.description`/`Relationship.description` were untouched** by any of the
   glossary drafting/confirm/edit calls above — read back directly from the DB, byte-identical
   to what was set at fixture creation. Proves Decision 3 (separate fields) actually holds in
   code, not just in the doc comment.
6. **Cleanup**: deleted the isolated test `Ontology` (cascades down through session, turn,
   candidates, concepts, relationship, changeset, and both glossary drafts). Re-checked global
   counts before and after — identical
   (`ontology=5, concept=43, relationship=36, session=8, turn=2, candidate=8, changeSet=2,
   attribute=5, glossaryDraft=8`), confirming the fixture left no trace and, just as
   importantly, that the owner's live data (the 8 real glossary drafts above) was never
   touched.

`npx tsc --noEmit` clean; `npm run build` succeeds — both new API routes compile alongside
everything else.

**Note on baseline drift:** these counts are no longer the `3/35/33/11` figures from earlier
stages — that's expected and correct. The owner's own concurrent, real, browser-driven
promotions (Stage 5/6/7 smoke-testing) have been legitimately growing the live ontology this
whole time; "baseline" for this stage's non-destructiveness check means "identical before and
after my own isolated fixture," not "identical to some earlier stage's snapshot."

---

## Known gaps / TODOs

- **No UI affordance to re-trigger glossary generation for an older changeset** that predates
  this stage (e.g. Stage 5/6 promotions made before this code existed) — only the
  just-promoted changeset auto-triggers drafting from `ChatPanel`. `POST
  /api/changesets/[id]/glossary` works for any changeset id if called directly, so this is a
  UI-completeness gap, not a data or backend one.
- **Glossary confirm queue is session-scoped, not ontology-scoped** — `GET
  /api/sessions/[id]/glossary-drafts` only sees drafts under changesets belonging to that one
  `ModelingSession`. If an ontology accumulates multiple sessions over time, an older
  session's still-`PENDING` drafts won't surface in a newer session's `ChatPanel` instance.
  Consistent with how the existing candidate Review Queue is already scoped (same
  session-based pattern), so not a new inconsistency introduced here — but worth knowing.
  Confirmed the owner's currently-`PENDING` `SalesRep` draft is scoped to its own session and
  will surface correctly next time that same session/browser tab is used.
- **Gemini chat-generation daily quota** — reset with the new day and is currently working
  (proven by both the owner's live activity and this session's own fixture call); still a
  recurring bottleneck worth keeping in mind for future stages' verification.

---

## Ready for review

Stage 7 (glossary drafting + conversational confirm) is implemented, and verified both by an
isolated scripted test and — unusually — by the owner's own real concurrent browser usage
hitting the exact same new code within minutes of it landing, producing real confirmed
glossary entries with no assistance or staging from this session. Stopping here for review
before Stage 8 (business-rule elicitation).
