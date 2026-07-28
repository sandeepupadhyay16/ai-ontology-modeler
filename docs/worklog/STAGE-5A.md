# Stage 5A — Schema + promotion service + review API (no UI yet)

Status: **IMPLEMENTED, REVIEWED, FIX APPLIED (2026-07-28)** — approved on correctness with one
required fix (below); ready to proceed to Stage 5B.

Per the split proposed and accepted before starting Stage 5: 5A is the transactional core
(schema, promotion service, review API), verified via direct API calls against the real dev
server and real seeded data — no UI, no cutover. 5B (candidate list UI in `ChatPanel`, the
send-path cutover away from `ai-generate`) is separate follow-up work.

---

## Post-review fix: `embedText()` moved out of the transaction

Review caught a transactional-shape defect: `embedText()` (a Gemini network call) was being made
*inside* `db.$transaction(...)` in the accept path — the exact lock/timeout anti-pattern this
project otherwise avoids. A slow or rate-limited embed call would hold the transaction (and its
row locks) open, and any failure/timeout there could roll back an otherwise-valid promotion.

**Fix:** split into two phases. Phase 1 (unchanged transaction) does all DB writes only — no
network calls — and instead of embedding inline, queues each newly-created concept's
`{candidateId, conceptId, label, conceptType, description}` into an in-memory `pendingEmbeds`
list. Phase 2 runs *after* the transaction commits, outside any transaction: iterates
`pendingEmbeds` and calls `embedText` + a plain (non-transactional) `concept.update` per concept.
A failed embed in phase 2 is still non-fatal — same tolerance as before (concept stays promoted,
just without a fresh embedding until a future backfill), reported the same way in the response's
`errors` array. `PromotionResult`'s shape is unchanged; `pendingEmbeds` never leaves
`promotion.ts`.

**Re-verified end-to-end** with the same scripted flow used for the original 5A verification
(baseline `3/35/33/0/0/0/0` before and after): all the same assertions passed — no-op promote,
extension-path promotion, the merge path (`PatientEnrollmentDatabase` vs. real `PatientRegistry`,
`0.9184` `POSSIBLE_DUP`), core-scope override + reject, 409 immutability, and the one-way
dependency violation being skipped-and-reported without aborting the rest of the batch. Also
directly queried three of the newly-promoted concepts afterward and confirmed phase 2 actually
wrote real `768`-dim `gemini-embedding-2` vectors (not just that the transaction didn't throw).
`npx tsc --noEmit` clean. All test artifacts cleaned up; final counts confirmed back to exact
baseline, including checking the real `PatientRegistry` merge target picked up zero stray
attributes.

---

## Files changed

| File | Why |
|---|---|
| `prisma/schema.prisma` | Three additive migrations (below): module handling, promotion traceability, candidate parent override. |
| `prisma/migrations/20260728010647_stage5_modules_and_description/` | `Concept.description`; `CandidateConcept.scope`; `Ontology.moduleScope` + `Ontology.extendsOntologyId`. |
| `prisma/migrations/20260728011232_stage5_promotion_traceability/` | `CandidateConcept.changeSetId` / `promotedConceptId` / `promotedRelationshipId` — closes the loop so a promoted `Concept`/`Relationship` can be traced back to the candidate and turn it came from, not just forward from candidate to turn. |
| `prisma/migrations/20260728011651_stage5_candidate_parent_override/` | `CandidateConcept.parentConceptId` — ontologist override for which existing class a promoted concept attaches under. |
| `src/lib/embeddings.ts` | `buildConceptEmbeddingText` now takes an optional `description`, folded in symmetrically; doc comment rewritten to explain the per-pair symmetry requirement this creates. |
| `src/lib/duplicateDetection.ts` | Dropped `CONFLICT_THRESHOLD`; `classifyBySimilarity` now takes `candidateType`/`matchedConceptType` and derives `CONFLICT` from type disagreement, not a second magnitude tier. |
| `src/app/api/sessions/[id]/turns/route.ts` | Sets `scope` (extension-by-default) on every new candidate; dual-embeds each candidate (with/without description) and picks per-target based on whether that target `Concept` has its own description, to keep every comparison shape-symmetric; passes candidate/matched type through to the new classifier. |
| `scripts/backfillConceptEmbeddings.ts` | Now embeds with `description` too (currently a no-op in practice — see Known gaps — but keeps the script correct for a future description backfill). |
| `src/lib/promotion.ts` (new) | The promotion service — the only code path that writes a `CandidateConcept` into the live graph. |
| `src/app/api/sessions/[id]/candidates/route.ts` (new) | `GET` — list candidates for a session, optional `?decision=` filter. |
| `src/app/api/sessions/[id]/candidates/[candidateId]/route.ts` (new) | `PATCH` — the review mutation endpoint: `decision`, `mergeTargetConceptId`, `parentConceptId`, `scope`. Blocks edits once a candidate is already promoted (409). |
| `src/app/api/sessions/[id]/promote/route.ts` (new) | `POST` — runs the promotion service for a session. |

---

## Decisions & rejected alternatives

### 1. Filled the Stage 4 gap: `CandidateConcept.scope` should have shipped with Stage 4's migration
`IMPLEMENTATION_PLAN.md`'s cross-cutting section says `scope` should "coordinate with the Stage 4
embedding-column migration so it's one change, not two" — that coordination didn't happen; Stage 4's
migration only touched `Concept`. Flagging as a deviation rather than silently folding it in. No
harm done since both are additive, but Stage 5 now needed two schema changes where the plan expected
one.

### 2. Extension modules are modeled as separate `Ontology` rows, linked by a new `extendsOntologyId` self-relation
The plan says "Model core and each extension as separate `Ontology` rows... `owl:imports` links an
extension to core" but the schema had no field to express that link. Added
`Ontology.moduleScope` (`"core"` | `"extension:<domainProfileKey>"`) and
`Ontology.extendsOntologyId` (nullable self-FK, set only on extension rows, pointing at the core
ontology they import). This is what makes "core never imports an extension" a structural,
checkable fact instead of a convention, and it's what Stage 6 will read to emit `owl:imports`.

**Rejected:** reusing the existing `Ontology.layer` field (`ENTERPRISE`/`PROJECT` in current seed
data) for this — it already carries an unrelated meaning (org-chart scoping level) and repurposing
it would silently break whatever reads it today.

### 3. Extension-by-default is set deterministically at extraction time, not chosen by the LLM
`turns/route.ts` sets every new candidate's `scope` to `extension:<domainProfileKey>` from the
session's already-resolved domain profile — the LLM has no say in it. Promotion to `core` only
happens because an ontologist explicitly PATCHes `scope: "core"` at review time. This matches the
plan's "never the business analyst's cold call, never automatic" instruction more literally than
asking the model to weigh in would.

### 4. "Never a disconnected new tree" is satisfied by a per-module, per-tag anchor concept, not an LLM-suggested parent
The plan requires promoted concepts to attach under an existing class but doesn't say how to pick
one. Considered asking the LLM to suggest a parent at extraction time — rejected, because parent
selection determines the graph shape and idea.md's whole thesis is that graph-shaping decisions
are the ontologist's, not the model's, and doing it via LLM would also not be deterministic/auditable.

Landed on: each module `Ontology` gets, lazily and idempotently, one auto-created root `Concept`
per Layer 1 tag actually used in it (e.g. one "Entity" concept, one "Agent" concept — created only
when first needed, found-and-reused after that). A promoted concept with no ontologist-chosen
`parentConceptId` attaches under the root matching its own `upperOntologyTag`. This is
deterministic (same tag + same module → same root, always) and the ontologist can always override
via `PATCH .../candidates/:id { parentConceptId }` for a more specific parent. Verified live: two
separate promotion calls into the same module never created a duplicate root.

A candidate with no valid `upperOntologyTag` and no `parentConceptId` override is **not**
auto-parented under an arbitrary default — promotion skips it and reports why, so a bad tag can't
silently produce a nonsensical parent.

### 5. Redefined `CONFLICT` (carried forward from the Stage 4 review, now implemented)
Dropped the magnitude-based `CONFLICT_THRESHOLD` (0.95). `POSSIBLE_DUP` = similarity ≥
`POSSIBLE_DUP_THRESHOLD`; `CONFLICT` = a match at/above that threshold whose type disagrees
(`CandidateConcept.candidateType` vs. the matched `Concept.conceptType` — the same vocabulary
already used to compare the two in practice: `Entity|Metric|Process|Persona|Event|System`; the
plan's "`upperOntologyTag`" phrasing doesn't apply directly since `Concept` has no
`upperOntologyTag` column, only `CandidateConcept` does). Verified live below.

### 6. `description` is folded into the dup-check embedding, but only with strict per-pair symmetry
This is the other carried-forward Stage 4 refinement (idea.md §2.3's Payer≈Insurer case — same
concept, different label, only distinguishable via description). The obvious implementation —
always embed `label+type+description` on both sides — was checked empirically and found to
**reintroduce the exact Stage 4 shape-mismatch bug**: most existing `Concept` rows still have no
description (Stage 5 only populates it going forward, at promotion), so a candidate embedded with
its real description and compared against a description-less `Concept` embedding scored **0.8943**
for what should have been a same-label/same-type match — below the 0.90 threshold, a false
negative caused purely by comparing mismatched text shapes (see calibration data below).

Fix: `checkDuplicate` in `turns/route.ts` embeds each candidate **twice** — once with its
description, once without — and picks whichever vector matches the shape of each target
`Concept`'s own embedding (full text if that `Concept` has a description, degraded text if it
doesn't). One extra Gemini call per turn at this scale; negligible.

### 7. Kept `Concept.uri` null at promotion time, matching existing convention
Checked how `uri` is used elsewhere first: every existing seeded `Concept` already has `uri: null`,
and `scripts/export_rdf.py` already derives a URI from `namespaceUri + label` when `uri` is absent.
So "minting the concept's uri under the module's namespace" (plan wording) is satisfied by which
`Ontology` row (and therefore `namespaceUri`) the `Concept.ontologyId` points at — no need to
compute and store a URI string at promotion time; that's Stage 6's job, unchanged.

### 8. Merges are additive-only, never touch the existing concept's own fields
A `MERGED` candidate never overwrites the target `Concept`'s label/description/conceptType. It only
adds attributes the candidate proposed that the target doesn't already have (matched case-insensitively
by name) — mirrors the "additive, no delete/overwrite" rule applied everywhere else in this project.

### 9. Editing a promoted candidate is blocked (409), not silently ignored
Once a `CandidateConcept.changeSetId` is set, `PATCH .../candidates/:id` returns 409. A promoted
candidate is now audit trail, not an editable draft — allowing a silent post-hoc edit would break
the ChangeSet's meaning as a record of what was actually decided and promoted.

---

## Threshold: unchanged at 0.90, re-verified empirically with description-enriched text

Re-ran Stage 4's calibration methodology with `description` now part of the embedded text (see
`src/lib/duplicateDetection.ts`'s doc comment for the full table). Key findings:

| Comparison | Score |
|---|---|
| Identical label+type+description | 1.0000 |
| Paraphrase, same description meaning | 0.9389 |
| **Payer vs Insurer, label+type+description** (idea.md §2.3 case) | **0.9112** |
| Payer vs Insurer, label+type ONLY (no description — the Stage 4 baseline) | 0.8641 (below threshold — would have been missed) |
| Same label+description, type token only differs (exercises the new CONFLICT path) | 0.9347 |
| Related-but-distinct concept, same domain | 0.8593 |
| Same domain, clearly different type/purpose | 0.8211–0.8157 |
| Unrelated concept, different domain | 0.6972 |

`POSSIBLE_DUP_THRESHOLD = 0.90` still cleanly separates true matches (≥0.9062 across every case
tested, Stage 4 + Stage 5 combined) from legitimately distinct concepts (≤0.8641) — **and** now
catches the Payer/Insurer synonym case that Stage 4 explicitly could not. No change to the
constant; the value carries forward with stronger evidence behind it.

---

## How verified

All verification is against the real dev server (port 3006) and the real seeded RWE Biopharma
data (`Ontology` id `c6dd5422-...`, industry `Biopharmaceuticals` → domain profile
`BIOPHARMA_LIFE_SCIENCES`) — no mocks, no fixtures.

**Baseline (before and after every test run):** `ontology=3, concept=35, relationship=33,
session=0, turn=0, candidate=0, changeSet=0`. Confirmed identical before and after the full test
run below — nothing test-related survives.

Ran an end-to-end scripted flow (`POST /api/sessions` → `POST .../turns` → `PATCH .../candidates/:id`
→ `POST .../promote`, real Gemini extraction + embedding calls throughout):

1. **No-op promote.** Turn extracted candidates; promoting with nothing `ACCEPTED`/`MERGED` returned
   `changeSetId: null` and created no `ChangeSet`. Confirms nothing reaches the live graph without
   explicit accept.
2. **Extension-path promotion.** Accepted two concept candidates (`PayerContractRegistry`,
   `ReimbursingPayer`) and their `manages` relationship, all at default `scope`. Promotion: created
   a new `Ontology` row (`moduleScope: "extension:biopharma_life_sciences"`,
   `extendsOntologyId` → the real core ontology, `namespaceUri` derived from core's), an auto
   "Entity" and "Agent" tag-root concept inside it, both concepts parented under the correct root,
   the relationship correctly pointing `sourceId`/`targetId` at the two newly-created concepts, and
   `Concept.embeddingModel/embeddingDim` populated (`gemini-embedding-2`/768) on write — zero errors.
3. **Merge path.** A follow-up turn describing `PatientEnrollmentDatabase` scored `0.9184`
   (`POSSIBLE_DUP`) against the real seeded `PatientRegistry` concept. Set `decision: MERGED,
   mergeTargetConceptId: <PatientRegistry id>`; promotion created **zero** new concepts and
   returned `mergedConceptIds: [<PatientRegistry id>]`. Confirmed `PatientRegistry`'s own
   label/description were untouched afterward.
4. **Core-scope override + reject.** A turn produced `ClinicalTrialSiteAuditor` and
   `ThrowawayTestConcept`. `PATCH scope: "core"` + `ACCEPTED` on the first, `REJECTED` on the
   second. Promotion created exactly one concept, directly in the real core ontology, parented
   under a newly-created core "Agent" tag-root — the rejected candidate produced zero writes.
5. **Promoted-candidate immutability.** `PATCH`ing the already-promoted `ClinicalTrialSiteAuditor`
   candidate returned `409`.
6. **One-way dependency enforcement.** Accepted a `core`-scope `CoreAnchorEntity`, a default
   (extension-scope) `ExtensionOnlyWidget`, and a relationship between them. Promotion created
   *both* concepts (independent, valid actions) but skipped the relationship with error `"one-way
   dependency violation: a 'core' concept may not have a relationship pointing at a
   'extension:biopharma_life_sciences' concept"` — the batch didn't abort, only the one invalid
   write was withheld and reported.
7. **Cleanup.** Deleted the test `ModelingSession` (cascaded its turns/candidates), the three test
   `ChangeSet`s, the two ad hoc core-ontology test concepts + their tag-roots, and the test
   extension `Ontology` row (cascaded its concepts/relationship). Re-queried counts: back to the
   exact baseline above.

Also: `npx tsc --noEmit` clean, `npm run build` succeeds (all new routes —
`/api/sessions/[id]/candidates`, `/api/sessions/[id]/candidates/[candidateId]`,
`/api/sessions/[id]/promote` — compile).

---

## Known gaps / TODOs

- **No real `Concept.description` data exists yet.** All 35 seeded concepts still have
  `description: null` (the column is new). The Payer/Insurer improvement only pays off once
  concepts accumulate real descriptions — either through Stage 5 promotions going forward, or an
  optional one-time backfill (plan explicitly calls this optional; not done here, since backfilling
  synthetic descriptions onto real customer ontology data isn't something to do without asking).
- **Attribute datatype/required validation is not enforced at promotion** — attributes are created
  from candidate payload as-is (defaulting `datatype` to `"string"` if missing), same permissiveness
  as the rest of the app's attribute-creation paths. Not a Stage 5 regression, just noting it's
  still open.
- **Relationship candidates are not dup-checked** (unchanged scope decision from Stage 4) — still
  true after Stage 5; only concept candidates get `dupStatus`.
- **No UI yet** — this is Stage 5A by design (see split note at top). The review flow above was
  driven entirely by direct API calls.
- **`ChangeSet.status` is set to `APPROVED` at promotion** (idea.md: "Output: an approved change
  set" for the review step) — Stages 9/11 will move it through `VALIDATED`/`SIGNED_OFF`/`PUBLISHED`;
  not exercised yet since those stages don't exist.

---

## Ready for review

5A (schema, promotion service, review API) is implemented and live-verified end-to-end via direct
API calls, per the split proposed before starting. Stopping here for review before Stage 5B
(candidate list UI in `ChatPanel`, conversational merge, and the cutover away from `ai-generate`).
