# Implementation Plan — Conversational Ontology Modeling Assistant

> **Audience:** the coding agent implementing `docs/idea.md`.
> **Reviewer:** a separate agent (and the human) will review your work **at the end of each stage** before you proceed. Do not start stage N+1 until stage N is reviewed and accepted.
> **Source of truth for requirements:** `docs/idea.md`. This document is the *how and in what order*; `idea.md` is the *what and why*. If they conflict, flag it — don't silently pick one.

---

## 0. Read this before writing any code

### The core insight driving this plan
The existing repo is a **good chassis with the wrong engine** for `idea.md`.

- **Keep (reuse as-is):** Next.js + Prisma setup, the LLM provider abstraction (`callLLMProvider` in `src/lib/agentPipeline.ts` and duplicated in `src/app/api/ontologies/[id]/ai-generate/route.ts`), the RDF/TTL export + SHACL scripts under `scripts/`, and the `ChatPanel` UI shell.
- **Replace (do not extend):** the generation flow in `ai-generate/route.ts`. Its central move is **full-state sync** — every turn it deletes all relationships (`route.ts:621`), deletes any concept not in the latest LLM output (`route.ts:613`), and fabricates fake `isAssociatedWith` edges to force connectivity (`route.ts:652-671`, plus `weaveOrphanConcepts` in `src/lib/graphWeaver.ts`). `idea.md` requires the **opposite**: a durable candidate queue that accumulates across turns and only enters the live graph through a human gate, with orphans treated as legal.
- **Delete (cruft in the way):** the ~1,000 lines of hardcoded domain logic (`isCart`, pharma accuracy rules, `generateFallbackOntology`) once the domain-profile loader replaces them.

**Do not try to bolt candidate-staging onto the existing `ai-generate` turn loop.** Build the new conversational pipeline alongside it, prove it, then retire the old route. Fighting the full-state-sync assumption in place will be slower than replacing it.

### Repo facts you need
- **Stack:** Next.js 16.2.10 (App Router), React 19, Prisma 7 with the `@prisma/adapter-pg` driver adapter (see `prisma/seed.ts` for the connection pattern — Postgres via `pg.Pool`). `tsx` is available for scripts.
- **`AGENTS.md` warning:** it claims this is a modified Next.js and tells you to read `node_modules/next/dist/docs/`. **That directory does not currently exist in this checkout** — treat the warning as advisory, verify before assuming any non-standard API, and if the docs dir appears, read it first.
- **No embedding/vector infra exists.** No `pgvector`, no embedding library. Stage 4 introduces this — see the decision note there.
- **LLM config is DB-driven:** `LlmConfiguration` table, `isActive` row selects provider/model/key/baseURL. Reuse it; do not hardcode providers.
- Existing generic models you will reuse: `Ontology`, `Concept`, `Relationship`, `Attribute`, `CompetencyQuestion`, `Rule`, `Constraint`, `ContextPack`. Existing domain-specific models (`DriverTree`, `CausalCycle`, `Perspective`, `BusinessSolution`, `SystemLink`, `DataMapping`) are **out of scope** — leave them alone, don't delete, don't build on them.

### Working agreement (applies to every stage)
1. **Worklog is mandatory.** Maintain `docs/worklog/STAGE-<n>.md`. For each stage record: what changed (files + one-line why each), decisions made and alternatives rejected, anything that deviated from this plan, migrations added, and how you verified it. This is what the reviewer reads first.
2. **Small, reviewable commits per stage.** One branch or commit range per stage. Never mix two stages in one changeset.
3. **Migrations are additive and named.** Never edit a shipped migration. `npx prisma migrate dev --name <descriptive_name>`. Never run `migrate reset` against a DB with real data without calling it out.
4. **Don't break the running app between stages.** The old `ai-generate` path stays functional until Stage 5 explicitly cuts over. If a stage would break it, gate the new behavior behind a flag.
5. **Structured output everywhere.** Every LLM extraction/mapping/drafting call returns JSON validated against a schema (reuse/extend `cleanAndParseJSON`). No loose free-text parsing.
6. **Determinism for safety checks.** Duplicate detection and SHACL validation must be rule/embedding-based and auditable — never "ask the LLM if these are the same." (The current auditor-pass approach is what we're moving away from.)
7. **Traceability is not optional.** Every candidate concept, glossary draft, TTL snippet, and rule must carry a `sourceTurnId` back to the conversation turn that produced it (`idea.md` "Suggested approach").
8. **The OPEN QUESTIONs are the human's to answer — not yours.** The project owner will resolve each one when its stage is reached (embedding/vector approach → Stage 4, rules-as-data-vs-SHACL → Stage 8, triplestore choice → Stage 12). Your job is to **surface the question with a concrete recommendation and pause** — do not guess, do not pick a default and proceed. Reaching one of these is a checkpoint, not a blocker to route around.

### Stage 0 — Baseline (do this first, before Stage 1)
Before changing anything, confirm the app runs on your machine so later failures are unambiguous:
- `npm install`, then confirm `npx prisma generate` + `npx prisma migrate dev` apply the two existing migrations against your Postgres (`.env` → `DATABASE_URL`; connection pattern is in `prisma/seed.ts`).
- `npm run dev` (serves on port 3006) and load the app; run `prisma/seed.ts` if you need data.
- Record in `docs/worklog/STAGE-0.md`: it builds, migrates, and runs — plus anything you had to fix to get there. **Do not proceed until the baseline is green.**

---

## Stage map (dependency order)

```
0. Baseline: confirm build / migrate / run (above)
1. Data model: candidate staging + governance tables
1b. Domain-profile scoping (light, data-driven)
2. Conversational extraction (per-turn, non-destructive → writes candidates)
3. Upper-ontology (Layer 1) mapping per candidate
4. Deterministic duplicate/conflict detection (embeddings)
5. Ontologist review gate → promote candidates into the live graph (CUTOVER)
6. TTL generation & human-readable diff per change set
7. Glossary drafting (conversational)
8. Business-rule elicitation (conversational)
9. Validation (SHACL) wired into the change-set flow
10. Versioning & git integration
11. Sign-off workflow
12. Publish / triplestore load
   +  Cleanup track: remove orphan-weaving, hardcoded domain logic, retire old route
```

Stages 6–9 can be partially parallelized after Stage 5, but review them independently.

**Two cross-cutting concerns span several stages — read these before building Stage 4 onward:**
- **Extension & module handling (Layer 2/3)** — below. Foundational for v1; touches Stages 4, 5, 6, 9.
- **Import handling** — below, under "Deferred." Explicitly a later fast-follow, not v1.

---

## Cross-cutting: Extension & module handling (Layer 2/3)

`idea.md` names the Layer 2 (core) / Layer 3 (domain extension) split but never operationalizes it. This section does. It is **foundational for v1** and changes how Stages 4, 5, 6, and 9 behave. It does not get its own stage — it is woven into those stages as noted.

**Reuse existing schema, don't reinvent.** The repo already has `Ontology.layer`, a unique `Ontology.namespaceUri`, `Concept.uri`, and merge machinery (`src/lib/ontologyMerger.ts`, the `merge-ontologies` routes). Model **core and each extension as separate `Ontology` rows** with distinct `layer` + namespace; `owl:imports` links an extension to core. Reconcile with that existing code rather than building a parallel module system.

**The model:**
- Every candidate carries a **`scope`** field: `core` or `extension:<domain>` (new field on `CandidateConcept`; additive migration — coordinate with the Stage 4 embedding-column migration so it's one change, not two).
- When a candidate doesn't fit cleanly under an existing core class, **do not force it into core or silently reject it.** Surface the choice.
- **Default bias (decided): extension-by-default.** New concepts land in the domain extension unless explicitly promoted. Surface it inline ("I'm putting this in the `<domain>` extension"). **Promotion into core is a deliberate, ontologist-gated action at the review step (Stage 5)** — never the business analyst's cold call, never automatic. Core grows by explicit decision.
- **One-way dependency is an enforced invariant, not a doc note:** extension `owl:imports` core; **core never imports an extension.** Concretely, a **core concept may not have a relationship pointing at an extension concept** (extension→core is fine). Enforce this structurally at promotion and in **Stage 9 (SHACL/consistency)** — if it isn't enforced, the boundary erodes silently.

**Per-stage impact:**
- **Stage 4 (dedup):** similarity search scope MUST span the **whole module family — core + every extension — not a single ontology.** Otherwise a Market Access extension and a future Sales extension independently invent two classes for the same real concept and neither search catches it. The similarity result should also record **which module** each match came from (needed for the deferred promotion-flag below). *This is the time-sensitive coupling — decide it before Stage 4 is finalized, or Stage 4 gets retrofitted.*
- **Stage 5 (review gate):** the accept path writes the promoted concept into the correct module (`core` vs `extension:<domain>`), minting its `uri` under that module's namespace; the core-vs-extension / promote-to-core decision happens here, ontologist-gated.
- **Stage 6 (TTL):** serializer emits `owl:imports`, writes extension concepts into the **extension's** file (not core's), and honors the one-way dependency.
- **Stage 9 (validation):** enforce the "core never references extension" invariant as a check.

**Deferred to a fast-follow (NOT v1):** auto-flagging a concept requested by ≥2 domain extensions as a **candidate for promotion into core** (`idea.md`-style Layer 2 growth without every domain re-litigating the same modeling decision). This needs Stage 4's cross-module match to report the requesting modules plus a "≥2 domains → flag" rule. Valuable, but the manual ontologist promotion path (above) ships first; add the auto-flag once it earns its keep.

---

## Stage 1 — Data model: candidate staging + governance

**Goal:** add the persistence `idea.md` "Data model" section requires, so later stages have somewhere to write. No behavior change yet.

**Add these Prisma models** (names are suggestions; match existing style — `uuid` ids, `createdAt`, relations):
- `ModelingSession` — `ontologyId`, `industry`/`domainProfile`, `participant`, `startedAt`, `status`. (Reuse `Ontology.industry`/`businessFunction`/`objective` for scoping rather than duplicating.)
- `ConversationTurn` — `sessionId`, `role` (user/assistant), `content`, `createdAt`, ordinal. This is the anchor every artifact's `source` points to.
- `CandidateConcept` — `sessionId`, `sourceTurnId`, `label`, `candidateType` (Entity/Relationship/Attribute/Event/etc.), `upperOntologyTag` (nullable, filled in Stage 3), `dupStatus` enum (`UNCHECKED|UNIQUE|POSSIBLE_DUP|CONFLICT`), `dupTargetConceptId` (nullable), `similarityScore` (nullable), `decision` enum (`PENDING|ACCEPTED|REJECTED|MERGED`), `mergeTargetConceptId` (nullable), raw `payload` Json (attributes, proposed relationships).
- `ChangeSet` — `sessionId`, `status` (`DRAFT|APPROVED|VALIDATED|SIGNED_OFF|PUBLISHED`), `ttlDiff` (nullable), `summary`, timestamps. Groups accepted candidates.
- `GlossaryDraft` — `changeSetId`, `linkedConceptId`/`linkedRelationshipId` (nullable), `term`, `definition`, `sourceTurnId`, `confirmationStatus`.
- `RuleDraft` — `changeSetId`, `linkedPropertyId`, `condition` Json, `derivedValue` Json, `sourceTurnId`, `confirmationStatus`. (Relates to but is distinct from the existing `Rule` model, which is the *published* form.)
- `OntologyVersion` — `ontologyId`, `changeSetId`, `gitCommitSha` (nullable until Stage 10), `changelog`, `createdAt`.
- `Signoff` — `changeSetId`, `approverRole`, `approver`, `decision` (`APPROVED|REJECTED`), `comments`, `decidedAt`.

**Deliverables**
- Migration `add_candidate_staging_layer`.
- Short ER note in the worklog showing how these map to `idea.md`'s data-model bullets.

**Acceptance / review checkpoint**
- `npx prisma migrate dev` applies cleanly; `npx prisma generate` succeeds; existing app still builds and runs.
- No existing model or column changed destructively.
- Worklog maps each new table → the `idea.md` data-model bullet it satisfies.

---

## Stage 1b — Domain-profile scoping (light, data-driven)

**Goal:** deliver `idea.md` §1 (domain/industry selection → domain profile) as a *data-driven config*, not the hardcoded `if (isCart)` branches. A session is scoped to an industry/domain from the start so extraction is tuned to relevant vocabulary. Keep v1 deliberately light — a vocabulary hint per industry, **not** importing a full standard like FIBO/OMOP (that's an `idea.md` open question, deferred).

**Build**
- A `domainProfiles` config module: per industry → starter core-entity checklist, a few known reference-standard names (as hints, not imports), and domain-tuned extraction prompt fragments.
- Reuse existing `Ontology.industry`/`businessFunction`/`objective` and the `PromptTemplate` table for scoping rather than adding new session-scoping columns.
- Wire the selected profile into the `ModelingSession` so Stage 2's extraction prompt can inject it.

**Acceptance / review checkpoint**
- Selecting an industry loads its profile; the extraction prompt (Stage 2) receives the domain hint.
- No hardcoded `isCart`/pharma branches introduced — this is the data-driven replacement for them.
- Worklog notes which industries are seeded and that full-standard import is intentionally deferred (`idea.md` open question).

---

## Stage 2 — Conversational extraction (per-turn, non-destructive)

**Goal:** new endpoint(s) that take a user turn, run structured concept extraction, and **write `CandidateConcept` rows only** — the live `Concept`/`Relationship` tables are never touched here.

**Build**
- `POST /api/sessions/[id]/turns` (or similar): persists the `ConversationTurn`, runs the extraction LLM call, writes candidates tagged with `sourceTurnId`, returns the running candidate list.
- Extraction system prompt: pulls candidate entities/relationships/attributes from the latest turn **plus** short conversation context. Structured JSON only. Start from a trimmed version of the schema in `ai-generate/route.ts:357-416`, but strip: driver-trees, causal-cycles, perspectives (out of scope), the orphan-weaving mandate (rule 5), and all hardcoded pharma/CAR-T instructions.
- Reuse `callLLMProvider` + `cleanAndParseJSON` — **factor them into a shared module** (`src/lib/llm.ts`) instead of leaving the current duplication between `agentPipeline.ts` and `ai-generate/route.ts`.

**Explicitly do NOT**
- Delete or mutate existing concepts/relationships.
- Call `weaveOrphanConcepts` or auto-stitch anything.
- Run the auditor/corrector LLM passes (those are being retired).

**Acceptance / review checkpoint**
- Sending 3 sequential turns accumulates candidates (turn 3 does not wipe turn 1's candidates — the anti-full-state-sync behavior is the whole point of this stage).
- Every candidate row has a valid `sourceTurnId`.
- Live graph row counts are unchanged after a conversation.
- Worklog shows an example turn → candidates JSON.

---

## Stage 3 — Upper-ontology (Layer 1) mapping

**Goal:** each candidate gets a proposed Layer 1 parent (Entity, Event, Agent, Relation, Process, Quality — per `idea.md` §2). This is Layer 2/3 modeling only; Layer 1 is adopted, never modified.

**Build**
- Extend the extraction step (or a second structured pass) to populate `CandidateConcept.upperOntologyTag`.
- Define the fixed Layer 1 vocabulary in one constant module so it's auditable and not free-form LLM output. The LLM *chooses among* the fixed set; it does not invent tags.

**Acceptance / review checkpoint**
- Every candidate has an `upperOntologyTag` from the allowed set (reject/flag anything outside it).
- Worklog documents the Layer 1 vocabulary chosen and why (cite `idea.md` §2.2).

---

## Stage 4 — Deterministic duplicate/conflict detection (embeddings)

**Goal:** as each candidate is produced, embedding-search against existing ontology concepts and surface `POSSIBLE_DUP`/`CONFLICT` inline (`idea.md` §2.3). Deterministic and auditable — not LLM judgment.

> **Extension handling applies here** (see "Cross-cutting: Extension & module handling"): search scope MUST span the whole module family (core + every extension), not one ontology, and the match result must record which module each hit came from. This is the time-sensitive coupling — get it right now or retrofit later.

**OPEN QUESTION — resolve with the human before coding (`idea.md` open questions):**
- **Embedding source:** local model via LM Studio / an API embedding endpoint / a JS embedding lib. No infra exists yet.
- **Vector storage:** `pgvector` extension on the existing Postgres (cleanest, needs the extension enabled) vs. storing embeddings as `Float[]` and computing cosine in-app (simpler, fine at small scale). Recommend pgvector if the DB allows extensions; otherwise in-app cosine.
- **Threshold** for `POSSIBLE_DUP` vs auto-unique vs `CONFLICT`. Start conservative, make it a config constant, note that false positives = agent nags, false negatives = dupes slip through.

**Build**
- Embedding generation for existing `Concept` labels+descriptions (backfill script + on-write hook).
- Similarity check in the turn pipeline; write `dupStatus`, `dupTargetConceptId`, `similarityScore` onto each candidate.
- Return dup info so the UI can surface *"That sounds like a new Agent-type entity called Payer — similar to existing Insurer. Same thing, or different?"*

**Acceptance / review checkpoint**
- Introducing a near-duplicate of a seeded concept flags `POSSIBLE_DUP` with a score and the matched concept id.
- The check runs without any LLM "are these the same?" call.
- Threshold + storage choice recorded in worklog with the rationale.

---

## Stage 5 — Ontologist review gate → promotion (CUTOVER)

**Goal:** the hard gate. Ontologist reviews the candidate batch, edits/accepts/rejects/merges, and **only accepted candidates are promoted** into `Concept`/`Relationship` as a `ChangeSet`. This is where writes to the live graph finally happen — transactionally, additively, no deletes-by-omission.

> **Extension handling applies here** (see cross-cutting section): promotion writes each concept into the correct module (`core` vs `extension:<domain>`) with its `uri` minted under that module's namespace; concepts default to the domain extension, and promote-to-core is the deliberate ontologist decision made at this gate.

**Build**
- Review API: list candidates for a session, mutate `decision`/`mergeTargetConceptId`, support conversational merge (*"merge Payer into Insurer"*).
- Promotion service: accepted candidates → real `Concept`/`Relationship`/`Attribute`, grouped under a `ChangeSet`, correctly parented as an **extension of the relevant existing class** (never a disconnected new tree — `idea.md` §4). Merges point new relationships at the existing concept.
- **On-write embedding hook** (deferred here from Stage 4): the promotion service embeds each newly-written concept and stores its vector/model/dim — this is the forward-looking write path Stage 4 intentionally left for here.
- Review UI in `ChatPanel` (or an adjacent panel): the running candidate list with tags + dup flags, per `idea.md` §2 "visibly-updating list."
- **Cutover:** switch the UI's send path from the old `ai-generate` route to the new turn/extraction pipeline. Keep the old route in the codebase but no longer wired to the primary flow; mark it deprecated in a comment.

**Carried forward from Stage 4 review — two decided refinements to fold in here:**
1. **Add a `Concept.description` column and enrich dedup.** `Concept` currently has no description, which forced Stage 4 to embed *label+type only* — that catches `PatientRegistry`≈`Patient Registry` but misses `Payer`≈`Insurer` (different labels, same concept — the exact `idea.md` §2.3 case). Fix: add `description` (additive migration), **populate it at promotion from the candidate's payload description**, and change the embedding text to `label + type + description` applied **symmetrically to both sides** (candidate and stored concept). Legacy concepts with an empty description degrade gracefully to label+type — no regression. **Re-calibrate `POSSIBLE_DUP_THRESHOLD` empirically** (same method Stage 4 used) once real descriptions exist, since the current 0.90 was tuned on label+type-only vectors. Optionally backfill descriptions for the seeded concepts.
2. **Redefine `dupStatus` semantics so `CONFLICT` means something real.** Drop the pure-magnitude `CONFLICT_THRESHOLD` (0.95) tier — `similarityScore` already carries confidence. New definitions: `POSSIBLE_DUP` = similarity ≥ `POSSIBLE_DUP_THRESHOLD`; `CONFLICT` = a match at/above that threshold whose **type disagrees** (candidate's `conceptType`/`upperOntologyTag` ≠ the matched concept's) — "same concept, incompatible classification." Stays deterministic and auditable; no LLM judgment.

**Acceptance / review checkpoint**
- Nothing reaches the live graph without an explicit accept — verify by conversing without approving and confirming zero graph writes.
- Accept promotes; reject discards; merge redirects to the existing concept with no duplicate created.
- Promoted concepts attach under an existing class, not as an isolated island.
- No concept is ever deleted merely for being absent from the latest LLM output (the old `route.ts:613` behavior must not exist in the new path).
- Promoted concepts carry a populated `description` and a freshly-generated embedding; a differently-named synonym (e.g. `Insurer` vs a promoted `Payer` with matching descriptions) now surfaces as `POSSIBLE_DUP`, and a same-concept/type-mismatch case surfaces as `CONFLICT`.

---

## Stage 6 — TTL generation & diff

**Goal:** serialize an approved `ChangeSet` into valid Turtle scoped as an extension, and produce a plain-English diff (`idea.md` §4, §8).

> **Extension handling applies here** (see cross-cutting section): emit `owl:imports`, write extension concepts into the extension's TTL file (not core's), and honor the one-way dependency (core never imports/references an extension).

> **Carried forward from Stage 5 review — tag-root canonicalization (required):** Stage 5's promotion materializes Layer-1 tags (`Agent`, `Entity`, `Process`, `Relation`, `Event`, `Quality`) as `Concept` rows, **one set per module**, marked with `typeFields.marker = TAG_ROOT`. At serialization these MUST map to the **single canonical upper-ontology IRI** for each tag (e.g. all modules' `Agent` roots → the same shared Layer-1 `Agent` class, via `rdfs:subClassOf`/`owl:equivalentClass`), NOT be emitted as freshly-invented per-module classes — otherwise every module invents its own `Agent` and the shared Layer 1 is defeated (`idea.md`: Layer 1 is adopted, not built). Also: filter or specially-handle these marked roots anywhere they'd otherwise pollute output (quality/CQ-coverage metrics, graph viz, diffs).

**Build**
- Reuse `scripts/export_rdf.py` / the export route as the serializer base; generate a `.ttl` patch for the change set, store on `ChangeSet.ttlDiff`.
- Human-readable "what changed" summary (added classes/properties in plain terms).

**Acceptance / review checkpoint**
- Generated TTL parses (run through `scripts/parse_rdf.py` or equivalent) and references existing parent classes correctly.
- Diff is readable by a non-ontologist.

---

## Stage 7 — Glossary drafting (conversational)

**Goal:** for each newly accepted class/property, auto-draft a plain-English definition and confirm it *in conversation* (`idea.md` §5). Structured output, linked back to the term.

**Build**
- Drafting call grounded in the accepted change set → `GlossaryDraft` rows with `linkedConceptId`/`linkedRelationshipId` + `sourceTurnId`.
- Conversational confirm step (*"Does this capture what you meant by Payer?"*) that flips `confirmationStatus`.

**Acceptance / review checkpoint**
- Every accepted class/property gets a draft linked to its term; confirmation state persists.

---

## Stage 8 — Business-rule elicitation (conversational)

**Goal:** turn vague statements into explicit `condition → derivedValue` rules via targeted follow-ups (`idea.md` §6).

**OPEN QUESTION — resolve with human:** are rules stored as queryable data (JSON/YAML) or compiled to SHACL/SPARQL? (`idea.md` open questions.) Recommend storing as data first (`RuleDraft`), compiling later.

**Carried forward from Stage 1 review:** `RuleDraft` currently uses a *polymorphic* `linkedPropertyId` (plain string) + `linkedPropertyType` discriminator, because "property" spans both `Attribute` and `Relationship` with no single table to FK against. This gives up DB-enforced referential integrity. Revisit here: prefer **dual nullable real FKs** (`linkedAttributeId` + `linkedRelationshipId`) to match how `GlossaryDraft` links to concept/relationship, so the database enforces the target exists. Decide deliberately before building rule elicitation on top of it.

**Build**
- Elicitation flow: detect derived-logic statements, ask for thresholds (*"what tier levels map to which priority?"*), write structured `RuleDraft` tagged to the ontology property it reads from.

**Acceptance / review checkpoint**
- A vague "X determines Y" input yields a follow-up and then a structured rule linked to a real property.

---

## Stage 9 — Validation (SHACL) in the change-set flow

**Goal:** validate the full proposed change set (ontology + glossary + rules) and report failures in plain language before anything merges (`idea.md` §7).

**Build**
- Wire `scripts/validate_shacl.py` (and the existing `shacl-validate` route) to run against a change set; translate validator errors into plain-language issues; block merge on failure (no silent merge).
- **Declare the Python dep:** add `pyshacl` (and anything else `validate_shacl.py` imports) to `requirements.txt` — Stage 6 established that repo (the export route was silently broken because `rdflib` was never declared). Verify the script actually runs in this environment before building on it.
- **Extension handling** (see cross-cutting section): enforce the one-way dependency invariant here — a `core` concept referencing an `extension:<domain>` concept is a validation failure.

**Acceptance / review checkpoint**
- An intentionally invalid change set fails with a specific, readable issue and cannot advance to sign-off.
- A deliberately-planted core→extension reference is caught and blocked.

---

## Stage 10 — Versioning & git

**Goal:** every approved+validated change set becomes a git commit with a PR-style summary (`idea.md` §8).

**Build**
- Git integration (commit the `.ttl` diff + changelog to the ontology repo path), store `gitCommitSha` on `OntologyVersion`. Generate the PR-style change summary.

**Acceptance / review checkpoint**
- Approving a change set produces a real commit and a stored version row linking sha ↔ change set.

---

## Stage 11 — Sign-off workflow

**Goal:** route validated change sets to the relevant SME/steward for final approval before merge (`idea.md` §9). Second hard gate.

**Build**
- Sign-off routing + `Signoff` records; "approve" / "send back with comments" states; nothing publishes without an approval row.

**Acceptance / review checkpoint**
- A change set cannot reach Publish without a `Signoff.decision = APPROVED`.

---

## Stage 12 — Publish / triplestore load

**Goal:** merged ontology/glossary/rules load into the triplestore + rules store, changelog entry, notify downstream (`idea.md` §10).

**OPEN QUESTION — resolve with human:** which triplestore + SHACL library to standardize on (`idea.md` open questions). Until decided, define a thin `publishTarget` interface and implement a local/file target so the flow is end-to-end testable.

**Acceptance / review checkpoint**
- End-to-end: conversation → candidates → gate → change set → TTL → glossary → rules → validation → git → sign-off → publish, with traceability from any published artifact back to its `sourceTurnId`.

---

## Deferred (post-v1 fast-follow, not scheduled yet): Import handling

> **Not a v1 stage. Do not build during the numbered stages** — captured here so the design isn't lost and so earlier stages don't accidentally preclude it. Revisit after Stage 12.

Allow bringing an existing standard/third-party ontology into a session as a **referenced import**, without it swamping the review flow:

- **Accept OWL/TTL upload; parse and load under its own namespace as a referenced import, unmodified.** An imported ontology is read-only reference material, not editable core/extension content. (Reuse the existing `scripts/parse_rdf.py` and import route as a starting point.)
- **Do NOT eagerly duplicate-check the entire imported ontology on upload.** That doesn't scale for large standards (FIBO/OMOP are thousands of classes) and produces review fatigue before any of it is relevant.
- **Run the Stage 4 duplicate-check lazily** — only when a concept from the import is referenced by, or overlaps with, something being actively discussed in a session. Similarity search stays scoped to what's in play, not the whole imported graph.
- **Any accepted mapping** (`equivalentClass`, `subClassOf`) between an imported class and a core/extension class **goes through the same Stage 5 ontologist gate** as any other change. An import never bypasses the review gate.

Interaction with Extension handling: an import is a third module type alongside `core` and `extension:<domain>` — read-only, its own namespace — and the same one-way dependency thinking applies (core/extension may reference/map to an import; the import is never edited).

---

## Cleanup track (fold into the stages above, don't leave for last)

- **After Stage 5 cutover:** delete `weaveOrphanConcepts` (`src/lib/graphWeaver.ts`) usage from the live path and the auto-stitch loop; remove the auditor/corrector passes.
- **After Stage 2/3:** remove hardcoded domain logic — `isCart`, pharma accuracy rules, `generateFallbackOntology` (`ai-generate/route.ts:834-1038`) — now superseded by the Stage 1b `domainProfiles` config. Delete the `if (isCart)` branches; do not leave a mix of both.
- **Ongoing:** collapse the duplicated `callLLMProvider`/`cleanAndParseJSON` into `src/lib/llm.ts` (started in Stage 2).
- Do **not** touch `DriverTree`/`CausalCycle`/`Perspective`/`BusinessSolution`/`SystemLink`/`DataMapping` — out of scope, leave functional.

---

## What "reviewable" means (read before Stage 1)

At each checkpoint the reviewer expects, in `docs/worklog/STAGE-<n>.md`:
1. **Changed files list**, each with a one-line "why."
2. **Decisions & rejected alternatives** (especially the OPEN QUESTIONs).
3. **Deviations from this plan** and their justification.
4. **Migrations added** (names) and whether they're destructive.
5. **How you verified it** — the concrete commands/steps and their results, matching the stage's acceptance criteria.
6. **Known gaps / TODOs** carried forward.

Keep code comments focused on *why*, matching existing repo style. Flag anything in `idea.md` that turned out ambiguous or contradictory rather than resolving it silently.
