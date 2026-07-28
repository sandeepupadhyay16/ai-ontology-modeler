# Stage 4 — Deterministic duplicate/conflict detection (embeddings)

**Status: IMPLEMENTED (2026-07-27).** Both open questions were decided by the owner
(embedding source: Gemini; vector storage: `Float[]` + in-app cosine, no pgvector) and
the stage is built, live-verified, and ready for review. Sections below preserve the
original decision-request research (for audit trail) followed by the implementation
record: files changed, pinned model/dim, threshold + rationale, and verification.

Per `docs/IMPLEMENTATION_PLAN.md`'s Stage 4 spec, this is the first stage with an
`idea.md`-listed open question that's the owner's to resolve, not mine to default:

> **Embedding source:** local model via LM Studio / an API embedding endpoint / a JS
> embedding lib. No infra exists yet.
> **Vector storage:** `pgvector` extension on the existing Postgres (cleanest, needs
> the extension enabled) vs. storing embeddings as `Float[]` and computing cosine
> in-app (simpler, fine at small scale). Recommend pgvector if the DB allows
> extensions; otherwise in-app cosine.

No code was written for this stage. What follows is research into what's actually
available in this environment, plus a recommendation, so you have real facts to
decide against rather than abstract tradeoffs.

---

## Question 1 — Embedding source

| Option | Pros | Cons |
|---|---|---|
| **Gemini embedding API** (already-standardized provider — see Stage 3's `GEMINI_API_KEY` env fallback) | No new provider/key to manage — reuses the exact credential and `.env` plumbing already in `src/lib/llm.ts`. Confirmed live just now: `models/gemini-embedding-001` supports `embedContent` and is GA (not preview). Google-hosted, no local process to keep running. | Same free-tier quota risk observed in Stage 2/3 (`gemini-2.0-flash` etc. hit per-day limits) — embedding calls fire on *every* candidate, so volume is higher than the extraction calls that already got quota-exhausted once. Network dependency — no embeddings if Gemini is down or the key is revoked. |
| **LM Studio (local)** | Free, no external network call, no quota. | Demonstrably unreliable in this dev environment — `localhost:1234` has refused connections every single time it's been checked across Stage 2, 3, and now (no LM Studio/ollama process has been running this whole project). Would require you to keep a local server up specifically for this app. |
| **Dedicated embedding API** (OpenAI `text-embedding-3-small`, Cohere, Voyage) | Purpose-built embedding models, often better quality/price than a general LLM provider's embedding endpoint. | A *third* provider/key to acquire and manage, on top of Gemini (chat+extraction) and whatever `LlmConfiguration` already models — directly cuts against your own "use GEMINI_API_KEY for all LLM connects for now" direction from Stage 3. |

**Recommendation: Gemini embeddings (`models/gemini-embedding-001`), same key already in `.env`.**
It's the only option that doesn't add a new moving part right now, and it's consistent
with the standardization you just asked for. If quota becomes a real problem at higher
candidate volume, or you want an offline/local-only story later, swapping the embedding
call is a one-function change (same shape as `callLLMProvider` — a single call site to
redirect), not a schema or architecture change.

**DECIDED (2026-07-27): Gemini embedding API.** Confirmed by the owner. Note: the
`GEMINI_API_KEY` env fallback that this depends on is dev-only as of the same day's
follow-up (see `STAGE-3.md` addendum) — `callLLMProvider`'s env fallback now requires
`NODE_ENV !== 'production'`. Whatever embedding call site Stage 4 eventually adds
should follow the same dev-only-fallback pattern (or require an explicit
`LlmConfiguration`/embedding config in production) rather than depending on the raw
env var unconditionally — noted here so it isn't missed when Stage 4 is actually built.

## Question 2 — Vector storage

| Option | Pros | Cons |
|---|---|---|
| **pgvector extension** | Purpose-built: `vector` type, `<=>` cosine-distance operator, ANN indexes (`ivfflat`/`hnsw`) for fast search at scale. Industry-standard choice for this exact problem. | **Not available in this environment** — checked directly: `select * from pg_available_extensions where name ilike '%vector%'` returns **0 rows** on the running `postgres-ontology` container (image `postgres:16-alpine`, the stock Alpine build, no `pgvector` compiled in). Enabling it means switching to a different Postgres image (e.g. `pgvector/pgvector:pg16`) and recreating the DB container — real infra work and a container swap on a container that already holds real seeded data (3 ontologies / 35 concepts), not a same-container `CREATE EXTENSION`. Prisma also has no native `vector` column type — would need a raw-SQL migration plus `$queryRaw`/`$executeRaw` for every similarity query, bypassing the typed client for this one feature. |
| **`Float[]` + in-app cosine** | Zero infra change — Prisma already supports `Float[]` natively (typed, migratable normally). No new Docker image, no container recreation, no raw-SQL escape hatch needed. At current scale (~35 `Concept` rows), a full linear scan computing cosine similarity in TypeScript against every existing concept, per new candidate, is microseconds of work — there's no meaningful performance question at this size. | Doesn't scale past roughly low-thousands of concepts before a linear scan becomes noticeable; no index-assisted approximate search. Not a concern at ~35 concepts, but is the thing that would eventually force a migration to pgvector. |

**Recommendation: `Float[]` + in-app cosine, for now.**
This isn't just "simpler in the abstract" — pgvector genuinely isn't installed on the
Postgres instance backing real seeded data, so choosing it today means a container
migration before any duplicate-detection code could even run. That's disproportionate
to ~35 concepts. `Float[]` requires zero infra change and can ship immediately once
you decide.

**Forward path, so this isn't a dead end:** if concept volume grows into the
low-thousands or query latency becomes noticeable, migrating to pgvector later is
additive (new column, backfill existing `Float[]` embeddings into it, swap the
comparison call) — it does not require re-deciding the embedding *source*, only the
storage/comparison layer. Worth a line in a future stage's worklog when/if that
threshold is reached, not a decision to force now.

## Related, lower-stakes item bundled in the same plan section: similarity threshold

The plan's third open-question bullet — `POSSIBLE_DUP` vs. auto-`UNIQUE` vs.
`CONFLICT` threshold — comes with its own steer already ("Start conservative, make it
a config constant"), so I'm treating it as build guidance rather than a third blocking
decision. Flagging the concrete default I'd use so you can veto it alongside the two
questions above rather than being surprised by it later: a single named constant (e.g.
`DUP_SIMILARITY_THRESHOLD = 0.85`, `CONFLICT_SIMILARITY_THRESHOLD = 0.95` — cosine
similarity, tunable without redeploying logic) in whatever module ends up owning
duplicate detection. Not asking for a decision here unless you want one — just not
hiding it.

## What I did *not* do (at the time of the original decision request — superseded below)

- No `pgvector`/`Float[]` schema change, no migration.
- No embedding-generation code, no backfill script, no call sites added.
- No change to `CandidateConcept.dupStatus`/`dupTargetConceptId`/`similarityScore`
  handling — those columns already exist from Stage 1's migration, untouched.
- No new `LlmConfiguration`/provider wiring beyond confirming (read-only, via the live
  Gemini API's own `models` list endpoint) that `gemini-embedding-001` is real and GA.

## Decisions (both made, 2026-07-27)

1. **Embedding source: Gemini embedding API.** Confirmed by the owner.
2. **Vector storage: `Float[]` + in-app cosine. No pgvector.** Confirmed by the owner,
   with the rationale already above (pgvector isn't installed on the running Postgres
   image; brute-force cosine is sub-ms at dozens-to-low-hundreds of concepts; revisit
   only if concept counts reach the thousands).

---

# Implementation

## Model/dimension pinning — confirmed live, not from memory

Per the owner's explicit instruction not to hardcode a model name from memory, the
model ID and dimension options were checked against Google's live docs
(`https://ai.google.dev/gemini-api/docs/embeddings`, `https://ai.google.dev/api/embeddings`)
and cross-checked against this project's own `GET /v1beta/models` listing:

- **Pinned model: `gemini-embedding-2`** — current stable/GA model (supersedes
  `gemini-embedding-001`, which required manual re-normalization after truncation;
  `gemini-embedding-2` auto-normalizes). Confirmed present and GA (not `-preview`) in
  the live `models` list for this project's API key.
- **Pinned output dimension: 768** (Matryoshka Representation Learning truncation, via
  the `embedContentConfig.outputDimensionality` request field — the modern, non-deprecated
  field name; the root-level `outputDimensionality` field still exists but is documented
  as deprecated). The model supports 128-3072; Google recommends 768/1536/3072. 768 was
  requested explicitly by the owner ("a REDUCED 768-dim output... not the full-size
  default").
- **Task type: `SEMANTIC_SIMILARITY`** — the documented `TaskType` value for exactly this
  use case (comparing text for similarity), as opposed to `RETRIEVAL_QUERY`/`RETRIEVAL_DOCUMENT`
  (asymmetric search) or `CLASSIFICATION`/`CLUSTERING`.
- Both constants (`EMBEDDING_MODEL`, `EMBEDDING_DIM`) live in exactly one place —
  `src/lib/embeddings.ts` — so a future re-pin is a one-file change, and every stored
  vector records the model+dim it was made with (see Model/dim discipline below).

## Files changed

- **`prisma/schema.prisma` + migration `20260728001052_add_concept_embeddings`** (new,
  additive) — added `Concept.embedding Float[] @default([])`, `Concept.embeddingModel String?`,
  `Concept.embeddingDim Int?`. Nothing else on `Concept` touched; no destructive change;
  `npx prisma migrate dev` applied cleanly against the live DB with real seeded data.
- **`src/lib/embeddings.ts`** (new) — the only place that talks to Gemini's embedding
  endpoints. Deliberately NOT routed through `callLLMProvider` (`src/lib/llm.ts`) — the
  owner was explicit that this is a separate API surface (`embedContent`/`batchEmbedContents`
  vs. chat's `generateContent`) and should be its own call site. Exports:
  - `embedText(text)` — single `embedContent` call, used for per-candidate checks in the
    turn pipeline.
  - `embedTextBatch(texts)` — single `batchEmbedContents` call, used for the existing-Concept
    backfill.
  - `buildConceptEmbeddingText(label, typeLabel)` — the canonical, symmetric text builder
    used on *both* sides of every comparison (see "Model/dim discipline" and the live
    calibration finding below for why symmetry matters).
  - `cosineSimilarity(a, b)` — pure arithmetic, deterministic.
  - `isComparable(model, dim)` — the single gate that must pass before any two vectors
    are compared; guards against a future re-pin silently corrupting comparisons.
  - Applies the **same dev-only fallback/governance pattern** as `callLLMProvider`: in
    production (`NODE_ENV === 'production'`) with no explicit configuration, embedding
    calls throw immediately rather than silently egressing domain text to Gemini via a
    bare env var. In dev, reads `GEMINI_API_KEY` from `.env` (same key already
    standardized in Stage 3).
- **`src/lib/duplicateDetection.ts`** (new) — `POSSIBLE_DUP_THRESHOLD`, `CONFLICT_THRESHOLD`
  as named constants, and `classifyBySimilarity()`, a pure function mapping a best-match
  cosine score to a `dupStatus`. No I/O, no LLM call — this is the auditable half of the
  requirement ("Deterministic and auditable — not LLM judgment," `idea.md` §2.3).
- **`src/app/api/sessions/[id]/turns/route.ts`** (modified) — for every extracted
  *concept* candidate (not relationships — see scope note below), embeds it and compares
  against every embedded `Concept` in the session's ontology, writing `dupStatus`,
  `dupTargetConceptId`, `similarityScore` onto the `CandidateConcept` row. A failed
  embedding call (network/quota/etc.) is caught and does not block candidate creation —
  `dupStatus` stays at its `UNCHECKED` default and the failure reason is recorded in
  `payload.dupCheckFlag`, same non-destructive philosophy as Stage 3's tag-flagging.
- **`scripts/backfillConceptEmbeddings.ts`** (new) — one-time backfill:
  `npx tsx --env-file=.env scripts/backfillConceptEmbeddings.ts`. Finds every `Concept`
  whose `embeddingModel`/`embeddingDim` don't match the currently-pinned values (so it's
  safe to re-run after a re-pin — it only re-embeds what's stale), embeds them all in one
  `batchEmbedContents` call, writes back `embedding`/`embeddingModel`/`embeddingDim`.
  Touches no other `Concept` field.

## Deviation from the plan: `Concept` has no `description` column

The plan's Stage 4 goal text says "embedding-search against existing ontology concepts"
and the Build bullet says "existing `Concept` labels+descriptions" — but `Concept` in
this schema (`prisma/schema.prisma:58-79`) has no `description` field at all (only
`label`, `conceptType`, `typeFields Json?`). Checked the seeded data directly —
`typeFields` is empty (`{}`) on every seeded concept, so there's no hidden description
in there either. `buildConceptEmbeddingText()` therefore embeds `"{conceptType}: {label}"`
— the only descriptive fields that actually exist on `Concept`.

This mattered more than expected: the first live end-to-end test embedded a candidate
using its full LLM-written description (`"PatientRegistrationDatabase: The authoritative
record store where every enrolled patient is registered..."`) against a bare
`"Entity: PatientRegistry"` concept string and scored only **0.80** — well under the
threshold — even though an isolated calibration test using symmetric `"Entity: Label"`
text on both sides scored the same near-duplicate at **0.92**. The asymmetry (rich
prose vs. a bare label) was diluting the similarity signal, not sharpening it. Fixed by
making candidate-side embedding text also use `buildConceptEmbeddingText(label,
candidateType)` — label + type only, no description, symmetric with the concept side.
Re-verified live after the fix (see below): the same near-duplicate correctly scored
0.9246 and was flagged `POSSIBLE_DUP`.

## Threshold + rationale (empirically calibrated, not guessed)

Rather than pick round numbers, thresholds were calibrated against real
`gemini-embedding-2` (768-dim, `SEMANTIC_SIMILARITY`) vectors from this project's own
seeded data, comparing test-candidate text against the live "PatientRegistry" (Entity)
concept (full table in `src/lib/duplicateDetection.ts`'s doc comment):

| Comparison | Cosine similarity |
|---|---|
| Identical text | 1.0000 |
| Cosmetic variant ("Patient Registry") | 0.9765 |
| Suffix variant ("PatientRegistrySystem") | 0.9394 |
| Paraphrase ("PatientRegistrationDatabase") | 0.9246 |
| Paraphrase ("RegisteredPatientDirectory") | 0.9229 |
| Abbreviation ("PtRegistry") | 0.9062 |
| Different-but-related concept ("PatientConsentRecord") | 0.8761 |
| Same domain, different type ("PatientOnboardingProcess") | 0.7795 |
| Unrelated concepts | 0.63 – 0.74 |

This shows a clean gap: every genuine near-duplicate/rewording scored **≥0.906**, while
the highest-scoring legitimately-distinct concept scored **0.876** — a real margin, not
a coin flip. A second gap separates near-verbatim/cosmetic matches (**≥0.9765**) from
worded-differently-but-same matches (0.90–0.94).

**Chosen constants** (`src/lib/duplicateDetection.ts`):
- `POSSIBLE_DUP_THRESHOLD = 0.90` — probably the same concept, worded differently;
  surface for human confirmation. Set just below the lowest observed true-duplicate
  score (0.906) and comfortably above the highest observed true-negative (0.876).
- `CONFLICT_THRESHOLD = 0.95` — near-verbatim/cosmetic match, very likely an exact
  duplicate. Set between the cosmetic-variant score (0.9765) and the highest
  worded-differently score (0.9394), so genuine rewordings land in `POSSIBLE_DUP` and
  only near-identical labels escalate to `CONFLICT`.

Per the plan's own framing: false positives here mean the agent nags the ontologist
about two concepts that are actually different; false negatives mean a real duplicate
slips into the candidate queue unflagged (still human-reviewable at Stage 5, just
without the assist). These thresholds are intentionally conservative in the sense
requested — leaning toward not flagging (0.90 floor) rather than nagging on ordinary
domain-vocabulary overlap (which the "unrelated"/"different type" rows show can still
score 0.63–0.88 just from shared professional vocabulary).

## Scope note: relationships are not dup-checked

Only *concept* candidates (`candidateType` ≠ `Relationship`) go through
`checkDuplicate()`. `CandidateConcept.dupTargetConceptId` is a foreign key into
`Concept` only — there's no live `Relationship`-embedding infrastructure and no
schema-valid target for a relationship candidate to point at. Relationship candidates
keep `dupStatus`'s `UNCHECKED` default, same as before this stage.

## Deferred: "embed on concept write going forward"

The plan's Build bullet says "backfill script + on-write hook." The backfill script is
built and run. The on-write hook is **deliberately not wired into the existing
full-sync routes** (`ai-generate`, `agent-pipeline`, `rollback`, `import`,
`ontologyMerger.ts`, the direct `/api/concepts` paths) this stage:

- Several of those routes create/update many concepts inside a single `$transaction`
  (e.g. `agent-pipeline/route.ts`'s `db.$transaction(async (tx) => {...})`). Adding a
  network call to Gemini per concept inside that transaction would hold a Postgres
  transaction open for the duration of several sequential external HTTP calls —
  a real lock-contention/timeout risk, not a hypothetical one.
- None of those routes are in this stage's acceptance criteria, and `ai-generate` in
  particular is explicitly slated for deprecation at Stage 5's cutover ("Keep the old
  route in the codebase but no longer wired to the primary flow").
- The actual forward-looking write path — Stage 5's promotion service, which doesn't
  exist yet — is the right place to add this hook, since it's the new canonical
  concept-write path this project is converging on, and (unlike the legacy full-sync
  routes) promotes one `ChangeSet` at a time rather than bulk-recreating dozens of
  concepts per call.

Flagging this explicitly rather than silently skipping it — happy to wire it into a
specific route now if you'd rather not wait for Stage 5.

## How verified

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean |
| `npm run build` | Succeeds, all routes including `/api/sessions/[id]/turns` compile in |
| `npx prisma migrate dev --name add_concept_embeddings` | Applied cleanly, additive only (`ALTER TABLE "Concept" ADD COLUMN...`), no data loss |
| Backfill script (`scripts/backfillConceptEmbeddings.ts`) | All 35 seeded concepts embedded in one `batchEmbedContents` call; `select embeddingModel, embeddingDim, count(*) from "Concept" group by 1,2` → `gemini-embedding-2 / 768 / 35` |
| Live near-duplicate test — turn mentioning "PatientRegistrationDatabase" against the seeded RWE ontology (which has a `PatientRegistry` concept) | Candidate flagged `POSSIBLE_DUP`, `similarityScore = 0.9246`, `dupTargetConceptId` = the real `PatientRegistry` concept's id (verified by direct lookup) |
| Live near-verbatim test — turn mentioning "the Patient Registry" | Candidate flagged `CONFLICT`, `similarityScore = 1.0` (LLM extracted the exact existing label), correct target id |
| Live true-negative checks in the same run — "Patient" (persona), "FinanceTeam", "QuarterlyBudgetForecast" | All correctly `UNIQUE` (scores 0.64–0.80, well under threshold) |
| No LLM "are these the same?" call | Confirmed by code inspection: `checkDuplicate()` calls only `embedText()` (`embedContent` endpoint); the only `callLLMProvider` call in the route is the pre-existing extraction call, unchanged from Stage 2/3 |
| Live-table counts before/after (Ontology/Concept/Relationship/CompetencyQuestion) | `3/35/33/11` unchanged throughout all test turns |
| Test-data cleanup (`delete ModelingSession` cascades turns+candidates) | Confirmed 0 sessions/turns/candidates after; live tables still `3/35/33/11` |
| `Concept.embedding`/`embeddingModel`/`embeddingDim` from the backfill | Intentionally retained (not test pollution) — this *is* the Stage 4 backfill deliverable, additive-only per the migration |

## Known gaps / TODOs (carried or new)

- **On-write hook deferred to Stage 5's promotion service** (see above) — the biggest
  intentional gap versus the plan's literal Build bullet, with rationale recorded.
- Threshold values (0.90/0.95) are calibrated against one seeded ontology's vocabulary
  (biopharma/RWE) and one model/dim/task-type combination. If a very different domain
  profile (e.g. cell & gene therapy's denser jargon) turns out to shift the natural
  similarity distribution, the constants may need revisiting — they're named constants
  specifically so that's a one-line change, not a redesign.
- No UI surfaces the dup info yet ("similar to existing X — same or different?") —
  that's explicitly Stage 5/UI work per the plan; this stage only guarantees the data
  (`dupStatus`/`dupTargetConceptId`/`similarityScore`) is correctly populated on the
  candidate for a future UI to read.
- Carried from Stage 2/3: `suggest-objectives/route.ts` and `ai-dashboard/route.ts`
  still duplicate `callLLMProvider`/`cleanAndParseJSON`; no assistant-role
  `ConversationTurn` rows yet; `quickstart_for_mac.md` remains the user's own item.

## Ready for review

Stopping here per the plan. Stage 5 (ontologist review gate → promotion, the CUTOVER
stage) is next once this is approved.
