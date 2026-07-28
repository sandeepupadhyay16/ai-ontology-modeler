# Stages 9–12 — Validation, Versioning & Git, Sign-off, Publish

Implemented by the assistant in one pass (owner asked to do 9→12 together). Implementer == reviewer,
so verification is an isolated-fixture integration test with explicit pass/fail on every gate.

## Result
The governance/publish tail of the pipeline. A promoted `ChangeSet` (status `APPROVED`) now advances
through `VALIDATED → SIGNED_OFF → PUBLISHED`, each transition gated on the prior, with two hard gates
(validation must pass before sign-off; sign-off required before publish). Driven from a
`GovernancePanel` strip in ChatPanel (Validate → Version → Sign-off → Publish) over new
`/api/changesets/[id]/*` routes.

## Stage 9 — Validation (idea.md §7)
- `src/lib/validation.ts` `validateChangeSet(id)`: two deterministic checks — (1) **one-way module
  dependency** (a `core` concept may not reference an `extension:<domain>` concept — the Extension-
  handling invariant, enforced in TS), and (2) **SHACL/RDFS consistency** via `scripts/validate_shacl.py`
  (pyshacl) over the affected modules' combined graph. Failures are returned as plain-language
  `issues[]`, never a raw validator dump; on success status → `VALIDATED`. Gated to APPROVED/VALIDATED.
- `POST /api/changesets/[id]/validate`.
- **Declared `pyshacl>=0.40.0` in `requirements.txt`** (it was imported by validate_shacl.py but never
  installed/declared — the exact "undeclared Python dep" wall Stage 6 flagged). Installed + verified.
- Fixed the SHACL payload shape: `export_rdf.py` requires an `id` on every concept (KeyError otherwise);
  the payload now includes id/uri/parentConceptId to match.

## Stage 10 — Versioning & git (idea.md §8)
- `src/lib/versioning.ts` `versionChangeSet(id)`: writes the change set's per-module `.ttl` (regenerating
  via `generateChangeSetTtl` if not yet persisted) + a PR-style changelog into a SEPARATE git repo
  (default `<cwd>/ontology-store`, override `ONTOLOGY_STORE_DIR`) — never the app's own repo —
  `git init` on first use, non-interactive commit via `-c user.*`, records the sha + changelog on an
  `OntologyVersion` (schema enforces one per change set). Gated to `VALIDATED`.
- `POST /api/changesets/[id]/version`.

## Stage 11 — Sign-off (idea.md §9)
- `src/lib/signoff.ts` `recordSignoff(id, {approverRole, approver, decision, comments})`: creates a
  `Signoff` row; APPROVED → `SIGNED_OFF`, REJECTED stays `VALIDATED` ("sent back with comments"). Gated
  to `VALIDATED`. Second hard gate.
- `POST /api/changesets/[id]/signoff` (+ GET to list).

## Stage 12 — Publish (idea.md §10)
- `src/lib/publish.ts` `publishChangeSet(id, target?)`: a thin **`PublishTarget` interface** with a
  file-based default (`FilePublishTarget`, `<cwd>/published`, override `PUBLISH_DIR`) — the OPEN QUESTION
  (real triplestore choice) is deferred, and a real store is now just another PublishTarget impl. Publishes
  the TTL + **only CONFIRMED** glossary/rule drafts, appends a changelog line, status → `PUBLISHED`. Gated
  to `SIGNED_OFF`.
- `POST /api/changesets/[id]/publish`.

## UI
- `src/components/GovernancePanel.tsx` — status badge + Validate/Version/Sign-off/Publish buttons, each
  enabled only when status permits (mirrors backend gating), shows validation issues and the commit sha.
- ChatPanel mounts it below the rule queue and bumps a `governanceRefresh` signal after each promotion.
- Enriched `GET /api/changesets/[id]` and added `GET /api/sessions/[id]/changesets` for the panel.

## Other
- `.gitignore`: added `/ontology-store` and `/published` so generated stores never pollute the app repo.

## How verified
`tsc --noEmit` clean, `npm run build` succeeds. Isolated-fixture integration test (temp
ONTOLOGY_STORE_DIR/PUBLISH_DIR, fixtures cascade-deleted, owner data untouched):
| Check | Result |
|---|---|
| 9 Validate happy path | conforms=true → VALIDATED, 0 issues (SHACL ran) |
| 10 Version | real git commit (sha), 2 files in the store |
| 11 Sign-off | → SIGNED_OFF |
| 12 Publish | → PUBLISHED, file target, TTL + glossary.json + rules.json + CHANGELOG.md |
| Gate: publish before sign-off | blocked (PASS) |
| Gate: sign-off before validate | blocked (PASS) |
| One-way dependency (core→extension) | caught, conforms=false (PASS) |
| Isolation | live concept count 43 → 43, RESTORED |

## Known gaps / TODOs
- **Validation shapes**: SHACL runs with no explicit shapes graph (pyshacl RDFS consistency) — it's a
  consistency check, not domain SHACL shape enforcement. Real domain shapes (and compiling confirmed
  RuleDrafts → SHACL/SPARQL) are a later pass.
- **Publish target is file-based** (deferred open question). Swap in a real triplestore by adding a
  PublishTarget; the pipeline doesn't change.
- **"Notify downstream" is a stub** (returns who would be notified) — no messaging infra in v1.
- **Browser verification**: the GovernancePanel was verified at the API/service level, not clicked through
  in a browser (same environment constraint as prior UI stages). Recommend an owner smoke-test of the
  Validate→Publish strip.
- Carried from Stage 8: `CandidateConcept.scope` still defaults to the literal `extension:generic` rather
  than the session's resolved domain key (Stage 2/extension-handling refinement).

## Status
All 12 stages implemented. Both cross-cutting concerns (extension handling, tag-root canonicalization)
landed. Deferred, out of v1: Import handling; the optional onboarding-cutover stage.
