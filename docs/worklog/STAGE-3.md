# Stage 3 — Upper-ontology (Layer 1) mapping

## Result

Every `CandidateConcept` (concept or relationship) produced by the Stage 2 extraction
endpoint now carries a Layer 1 `upperOntologyTag`, chosen by the LLM from a fixed,
closed set defined in one constant module. Anything outside that set is flagged, not
silently dropped or silently defaulted.

## Files changed

- `src/lib/upperOntology.ts` (new) — the single source of truth for the Layer 1
  vocabulary: `UPPER_ONTOLOGY_TAGS` (`Entity`, `Event`, `Agent`, `Relation`, `Process`,
  `Quality`), per-tag descriptions, `isValidUpperOntologyTag()`, and
  `buildUpperOntologyPromptFragment()` for injection into the extraction prompt.
- `src/app/api/sessions/[id]/turns/route.ts` (modified) — injects the Layer 1 prompt
  fragment, extends the extraction JSON schema with a required `upperOntologyTag` field
  on both `concepts[]` and `relationships[]` items, and validates/writes the tag on
  every `CandidateConcept` row via a new `resolveTag()` helper.

No migration needed — `CandidateConcept.upperOntologyTag String?` already existed
(added in Stage 1's `add_candidate_staging_layer` migration, filled in here per its own
comment: `// filled in Stage 3`).

## Layer 1 vocabulary and why (idea.md §2, bullet 2)

`idea.md` line 94-99 ("2. Conversational concept elicitation" → "Process" → bullet 2,
"Upper-ontology mapping"):

> proposes a Layer 1 parent (Entity, Event, Agent, Relation, Process, Quality) for each
> candidate

That six-value list is the entire spec — `idea.md` doesn't define per-tag semantics, so
`upperOntologyTag.ts` adds one-line descriptions for each (used both in the prompt and
as inline documentation) grounded in standard upper-ontology categories (entity/object,
occurrent/event, agentive participant, relation-as-object, process/activity, and
quality/attribute-as-concept) — chosen to be recognizable to an LLM without importing an
actual foundational ontology (BFO/DOLCE/etc.), consistent with `idea.md` line 10's
framing that Layer 1 is *adopted*, not authored, by this tool. Layer 1 itself is treated
as fixed and immutable in code: the constant array is the only place the six values are
declared, `isValidUpperOntologyTag()` is the only gate, and nothing in this stage writes
to or extends that set — this is Layer 2/3 (candidate) modeling only, per the plan's
explicit "This is Layer 2/3 modeling only; Layer 1 is adopted, never modified."

## Decisions & rejected alternatives

1. **Extended the existing extraction pass rather than adding a second structured
   call.** The plan offered both options ("Extend the extraction step (or a second
   structured pass)"). A second pass would double LLM latency/cost per turn for a
   single extra field the model can reliably emit alongside the concept/relationship
   it's already describing in the same JSON object. Kept as one call.
2. **Relationships get tagged too, not just concepts.** `idea.md`'s phrasing is
   "for each candidate," and `CandidateConcept` is the single table for both concepts
   and relationships (`candidateType: 'Relationship'`), so relationships are candidates
   too. Most relationships land on `Relation`; the prompt tells the model to prefer
   `Process` for workflow steps and `Event` for timed occurrences when applicable —
   observed live: `trackedBy`/`performedBy`/`evaluates`-style edges tagged `Relation`
   consistently across both verification turns (9 of 9).
3. **Flag invalid tags rather than reject the whole candidate.** The acceptance
   criterion says "reject/flag anything outside it" — both are permitted. Rejecting
   would mean dropping an otherwise-valid, human-relevant extracted concept just
   because one field was malformed, which cuts against the staging model's whole
   point (nothing is discarded before a human sees it — see Stage 2's non-destructive
   design). Chose: `upperOntologyTag` is left `null` and the raw offending value is
   recorded in `payload.upperOntologyTagFlag` (e.g.
   `"Invalid upperOntologyTag from model: \"Object\""`) so a reviewer can see and fix it
   at the batch-review stage (Stage 5) instead of it vanishing silently.
4. **Validation lives in the route, not in `upperOntology.ts`.** `resolveTag()` (the
   closure that maps a raw LLM value to `{ tag, flag }`) is local to
   `turns/route.ts` because it's about *what to do* with an invalid tag (a staging
   policy decision), whereas `isValidUpperOntologyTag()` in the shared module is just
   *is this value in the set* (a pure, reusable predicate) — kept the reusable part
   generic and the policy part local to the one call site that has it today.

## Deviations from the plan

None.

## LLM provider note

No local LLM backend was reachable in this dev environment for Stage 2 either
(`localhost:1234` refuses connections, no LM Studio/ollama process). Per the user's
instruction this stage, `src/lib/llm.ts`'s `callLLMProvider` now falls back to
provider `GOOGLE` / model `gemini-flash-latest`, reading `GEMINI_API_KEY` from
`process.env` (sourced from `.env`, which is git-ignored via `.env*` in
`.gitignore` — confirmed with `git check-ignore -v .env`), whenever no active
`LlmConfiguration` DB row exists. This replaces the old default of `LM_STUDIO`. The
key itself lives only in `.env` and is never written to the database or logged; no
`LlmConfiguration` row was created or needed for this stage's verification.

## Example: turn → tagged candidates (live run)

Session scoped to the seeded "Cell Therapy Vein-to-Vein Logistics & Cold-Chain
Ontology" (`CELL_GENE_THERAPY` domain profile).

**Turn 1** — user:
> "When a patient batch arrives via cryogenic shipment, a QA reviewer performs QC
> release testing to confirm potency and sterility before the ReinfusionEvent can be
> scheduled."

13 candidates produced, every one carrying a valid tag:

| label | candidateType | upperOntologyTag |
|---|---|---|
| PatientBatch | Entity | Entity |
| CryogenicShipment | Process | Event |
| QAReviewer | Persona | Agent |
| QCRelease | Process | Process |
| Potency | Metric | Quality |
| Sterility | Metric | Quality |
| ReinfusionEvent | Process | Event |
| transports (CryogenicShipment→PatientBatch) | Relationship | Relation |
| performedBy (QCRelease→QAReviewer) | Relationship | Relation |
| evaluates (QCRelease→PatientBatch) | Relationship | Relation |
| verifiesPotency (QCRelease→Potency) | Relationship | Relation |
| verifiesSterility (QCRelease→Sterility) | Relationship | Relation |
| prerequisiteFor (QCRelease→ReinfusionEvent) | Relationship | Relation |

**Turn 2** — user:
> "The cryogenic shipment itself has to be tracked by a courier company responsible
> for maintaining chain of custody the whole way."

6 more candidates (accumulated on top of turn 1's 13, total 19):

| label | candidateType | upperOntologyTag |
|---|---|---|
| CryogenicShipment (re-mentioned) | Entity | Entity |
| CourierCompany | Persona | Agent |
| ChainOfCustody | Process | Process |
| trackedBy | Relationship | Relation |
| maintainsChainOfCustody | Relationship | Relation |
| governsShipment | Relationship | Relation |

Tag distribution across the 19 candidates: `Entity` 2, `Event` 2, `Agent` 2, `Process` 2,
`Quality` 2, `Relation` 9 — all six tags used, zero missing/invalid.

## How verified

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean |
| `npm run build` | Succeeds, `/api/sessions/[id]/turns` still compiles in |
| `isValidUpperOntologyTag()` direct test (valid: `Entity`, `Quality`; invalid: `Object`, lowercase `entity`, `null`, `undefined`) | Accepts only the exact 6 strings, rejects everything else |
| Live 2-turn conversation against seeded Cell Therapy ontology via real HTTP calls | 13 → 19 candidates (accumulates, matches Stage 2 behavior), every candidate has a non-null tag from the allowed set |
| `select count(*) from "CandidateConcept" where "upperOntologyTag" is null or not in (...)` | `0` |
| Live-table counts before/after (Ontology/Concept/Relationship/CompetencyQuestion) | `3/35/33/11` unchanged |
| Test-data cleanup (`delete ModelingSession` cascades turns+candidates) | Confirmed 0 sessions/turns/candidates after, live tables still `3/35/33/11` |
| No `LlmConfiguration` row created/left behind | Confirmed `count(*) = 0` throughout (env-var fallback used instead) |

## Known gaps / TODOs (carried or new)

- The "reject" half of "reject/flag anything outside it" was not exercised live —
  forcing the LLM to violate an explicit closed-set instruction isn't reliably
  reproducible, so only the flag path is live-verified (via the pure validator, since
  both live turns produced 100% valid tags on the first try). The `resolveTag()`
  logic is simple enough (single `isValidUpperOntologyTag` check) that this is a
  reasonable coverage gap to accept, but noting it explicitly rather than silently
  passing over it.
- Carried from Stage 2: `suggest-objectives/route.ts` and `ai-dashboard/route.ts`
  still have their own independent `callLLMProvider`/`cleanAndParseJSON` duplicates;
  no assistant-role `ConversationTurn` rows yet; `quickstart_for_mac.md` is still the
  user's own open item.
- New: the Gemini env-var fallback in `src/lib/llm.ts` means this repo now has an
  implicit standing dependency on `GEMINI_API_KEY` being present in `.env` for any
  environment where live LLM verification is needed and no `LlmConfiguration` row
  exists. Not a problem for this stage, but worth knowing if `.env` is ever
  regenerated from `.env.example` without it.

## Ready for review

Stopping here per the plan. Stage 4 is the first stage with an **OPEN QUESTION** for
the user (embedding/vector approach for duplicate/conflict detection) — will surface it
with a recommendation and pause rather than picking a default, once Stage 3 is approved.

## Addendum (post-approval, during Stage 4 pause) — gate the Gemini fallback to dev-only

After Stage 3 was approved, the owner requested one follow-up change to
`src/lib/llm.ts` before Stage 4 work: the `GEMINI_API_KEY` env fallback described
above is a **local-dev convenience only** and must never let an unconfigured
production deployment silently route prompts to Gemini. Production must configure
`LlmConfiguration` explicitly.

**Change:** `envFallbackProvider` now also requires `process.env.NODE_ENV !== 'production'`
before selecting `GOOGLE`:

```ts
// Dev-only convenience: with no configured provider, use GEMINI_API_KEY so local
// runs work without LM Studio. Production must configure LlmConfiguration explicitly —
// we do NOT want unconfigured prod silently routing prompts to an external provider.
const envFallbackProvider =
  process.env.NODE_ENV !== 'production' && process.env.GEMINI_API_KEY ? 'GOOGLE' : 'LM_STUDIO';
```

In production with no active `LlmConfiguration` row, the fallback is now `LM_STUDIO`
(which will fail loudly with a clear connection error) rather than a silent external
call — a deliberate fail-closed choice over fail-open.

Verified: `npx tsc --noEmit` clean, `npm run build` succeeds (all routes including
`/api/sessions/[id]/turns` still compile in). No other files touched; no Stage 4
implementation started — still paused pending the vector-storage decision (see
`STAGE-4.md`, which now records the embedding-source half of that decision as
answered: Gemini).
