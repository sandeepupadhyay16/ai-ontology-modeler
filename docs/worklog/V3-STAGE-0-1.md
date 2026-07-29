# V3 Stage V0 + V1 — Seed seam + seed materialization

Implemented by the assistant (owner took the first two stages; the coding agent picks up V2+).
Branch `ontology_v3`. Spec: `docs/V3_FLOW.md` §3 (seam), §4 (staging), §7 (build plan).

## Stage V0 — Seed seam + curated templates (no UI)

New `src/lib/seed/`:
- **`types.ts`** — the one `SeedSource` shape (`SeedClass` / `SeedRelationship`), field-compatible
  with what the extraction pipeline already emits per candidate. `validateSeedSource()` is a pure,
  offline structural check (valid Layer-1 tags, valid conceptType, unique labels, relationship
  endpoints resolve to classes in the same seed).
- **`templates/pharmaMarketing.ts`**, **`templates/financialServicesRisk.ts`** — two curated
  starter maps. Class names + IRIs are BORROWED from standard vocabularies (schema.org for
  pharma/marketing; FIBO for financial-services/risk) as alignment hints, not parsed/fetched.
- **`templates/index.ts`** — registry + `findTemplate(industry, domain)`. Substring matching in the
  `domainProfiles.ts` style; **industry match is mandatory** (a domain-only hit never lets an
  unrelated industry inherit another's classes), domain match only breaks ties.
- **`index.ts`** — the three loaders behind one interface:
  - `curatedTemplate(industry, domain)` → `ResolvedSeed` (unknown combo → `origin:'empty'`).
  - `fromLinkedOntology(id)` → copies a linked ontology's live graph; **excludes Layer-1 tag-root
    anchors**, maps relationship endpoints back to labels, drops edges whose endpoint was filtered.
    Derives each class's Layer-1 tag from its parent tag-root when present, else a
    conceptType→tag fallback.
  - `fromStandardVocab()` → **throws "deferred"** (live FIBO/schema.org ingestion is post-v3; same
    output shape when built, so no flow change).
  - `resolveSeed({industry, domain, linkedOntologyId})` → dispatch (linked wins, else template).

**Checkpoint (isolated, no DB):** `curatedTemplate('Pharma','Marketing')` → template, 9 classes,
`validateSeedSource` clean; fs/risk clean; industry-only still matches; unknown combo → empty;
domain-only with wrong industry → empty. All PASS. `tsc --noEmit` clean.

## Stage V1 — Seed materialization at create (backend)

**`POST /api/ontologies/bootstrap`** (`src/app/api/ontologies/bootstrap/route.ts`). Given
`{ name, industry, domain, linkedOntologyId?, participant? }`, atomically (`db.$transaction`):
1. `Ontology` — `industry`, `businessFunction=domain`; when linked, `moduleScope=extension:<profileKey>`
   + `extendsOntologyId` (it becomes an extension), else `core`.
2. `ModelingSession` — `domainProfile` resolved from industry+domain.
3. **One synthetic seed `ConversationTurn`** — ordinal 0, role `system` (resolved decision Q1). Keeps
   `CandidateConcept.sourceTurnId`'s non-null FK intact; the turns route's `nextOrdinal = max+1` makes
   the first real user turn ordinal 1 (no collision).
4. One **PENDING** `CandidateConcept` per seed class/relationship, `payload` shaped exactly like the
   extraction pipeline's (so Staging + promotion consume seed rows with no special-casing); `scope` =
   the module scope; seed rows tagged `payload.seed = true`.

No live `Concept`/`Relationship` is written here — check-in (Stage V2) does that. No embedding/LLM call
at seed time (a new ontology has nothing to dedup against → `dupStatus` stays `UNCHECKED`); the route is
deterministic and offline.

### Notes / fix
- Prisma `InputJsonValue` rejects `SeedAttribute`'s optional `description?` (JSON has no `undefined`) —
  cast the two payloads `as any`, the same pattern the repo uses for `ChangeSet.ttlFiles`. Runtime
  values are plain JSON. (tsx doesn't typecheck, so this only surfaced under `tsc`, not the test run.)

**Checkpoint (isolated fixture, `POST` invoked directly, cascade-cleanup):** 20/20 PASS —
unlinked template path (16 candidates = 9 classes + 7 rels, all PENDING, all → seed turn, scope=core,
**zero live concepts**); linked path (origin=linked, `moduleScope=extension:*`, `extendsOntologyId` set,
source labels carried); duplicate-name → 409; missing industry → 400. **Isolation: ontologies 5→5,
concepts 43→43 (owner data untouched).** `tsc --noEmit` clean.

## Handoff to the coding agent (Stage V2+)
- **V2 is the load-bearing stage.** `promoteCandidateDirect(candidateId)` must write straight to
  `Concept`/`Relationship` with **NO ChangeSet row**, while REUSING the existing tag-root parenting +
  attribute + embedding logic in `src/lib/promotion.ts` (don't duplicate it, don't drag the ChangeSet
  envelope back in). Relationship promote requires both endpoints already live (decision Q4).
- Seed candidates are ordinary `CandidateConcept` rows (with `payload.seed = true` if you want to treat
  them specially in the UI) — promotion should not care whether a candidate came from seed or chat.
- `demoteCandidate` deletes the promoted live element via `promotedConceptId`/`promotedRelationshipId`
  and resets the candidate to PENDING, warning if edited or has dependents (decision Q2).

## Not done (by design — later stages / deferred)
`fromStandardVocab` live parsing; the wizard UI (V3); sidebar/Staging/Edit UI (V4/V5); the
direct promote/demote path itself (V2). Governance pipeline stays unwired.
