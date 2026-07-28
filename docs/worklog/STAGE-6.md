# Stage 6 — TTL generation & diff

Status: **IMPLEMENTED (2026-07-28)** — ready for review.

Serializes an approved `ChangeSet` into a Turtle patch (idea.md §4) plus a deterministic
plain-English diff (idea.md §8), including both required carry-forwards from the Stage 5
review: extension handling (`owl:imports`, per-module files, one-way dependency) and tag-root
canonicalization.

---

## Files changed

| File | Why |
|---|---|
| `prisma/schema.prisma` | Additive migration `stage6_ttl_diff_traceability`: `ChangeSet.ttlFiles` (Json), `ChangeSet.diffSummary` (String), `Attribute.addedInChangeSetId` (traceability for merge-added attributes — Attribute has no `createdAt` to approximate this from). |
| `src/lib/upperOntology.ts` | Added `TAG_ROOT_MARKER` (moved here from `promotion.ts`, now shared), `isTagRootConcept()`, `LAYER1_NAMESPACE`, `canonicalLayer1Iri()` — the single source of truth for recognizing and canonicalizing Stage 5's auto-created Layer 1 anchor concepts. |
| `src/lib/promotion.ts` | Imports `TAG_ROOT_MARKER` from `upperOntology.ts` instead of a local duplicate; both `attribute.create` calls (accept path, merge path) now set `addedInChangeSetId`. |
| `src/lib/ttlDiff.ts` (new) | The Stage 6 service: `generateChangeSetTtl(changeSetId)` — builds the per-module patch payload and the diff summary. |
| `scripts/export_rdf.py` | Two small, backward-compatible additions: an `external: true` per-concept flag (register the concept's URI for resolution, but don't re-assert `owl:Class`/label/comment — used for reference-only stubs), and a top-level `owlImports: string[]` (emits `owl:imports` on the ontology header). Whole-ontology export (the existing `/api/ontologies/[id]/export` route) never sets either, so its output is unchanged. |
| `src/app/api/changesets/[id]/route.ts` (new) | `GET` — fetch a ChangeSet's stored status/ttlDiff/ttlFiles/diffSummary. |
| `src/app/api/changesets/[id]/generate-ttl/route.ts` (new) | `POST` — runs `generateChangeSetTtl` and persists the result onto the `ChangeSet` row. |
| `src/lib/qualityEvaluator.ts` | Filters out `isTagRootConcept()` rows before computing `conceptCount`/orphan detection — see "Tag-root pollution" below. |
| `src/app/page.tsx` | `loadOntologyData` now filters tag-roots out of the `concepts` state fed to the graph viz (`ThreeCanvas`/`ModelerPanel`), same reasoning. |
| `requirements.txt` (new) | `rdflib>=7.6.0` — was completely undeclared anywhere in the repo; the environment's `python3` didn't have it installed, so the **pre-existing** `/api/ontologies/[id]/export` route was already broken before this stage (see "How verified"). |

---

## Decisions & rejected alternatives

### 1. The TTL output is a true patch (only this ChangeSet's delta), not a full-ontology snapshot
`generateChangeSetTtl` derives everything it serializes from the `CandidateConcept` audit
trail — `promotedConceptId`/`promotedRelationshipId` for new concepts/relationships,
`Attribute.addedInChangeSetId` for attributes a merge added onto an existing concept — never
"every `Concept` row that happens to exist in the ontology." This matches idea.md §4's own
wording ("Output: a `.ttl` diff/patch file") and §8 ("human-readable diff... what changed"),
and keeps a patch reviewable in isolation rather than re-dumping the whole graph on every
promotion.

**Rejected:** reusing `export_rdf.py`'s existing whole-ontology export path unmodified and
just pointing it at the current DB state. That would produce a correct-looking TTL file but
not a *diff* — every promotion would re-emit the entire ontology, and a reviewer couldn't
tell what was actually new without a separate diffing step. It also wouldn't need any of the
tag-root canonicalization work, because at whole-ontology scope the per-module tag-roots
would just get serialized as their own classes — the exact bug the review flagged.

### 2. `Attribute.addedInChangeSetId` — a new traceability field, not a timestamp guess
A merge's newly-added attributes land on an **existing** `Concept` (the merge target) —
that concept's own `promotedConceptId` traceability only identifies *newly created* concepts,
not attributes added onto one that already existed. `Attribute` also has no `createdAt` to
approximate "added around the same time as this changeset" from. Rather than guess, added
one field, set in both places `promotion.ts` creates an `Attribute` row (the fresh-concept
path and the merge-additive path), mirroring the traceability pattern the project already
uses everywhere else (`CandidateConcept.changeSetId`/`promotedConceptId`).

### 3. Reference-only concepts (`external: true`) — a small, additive change to `export_rdf.py`, not a rewrite
A patch frequently needs to *reference* a concept it didn't create — an existing parent
class, an existing relationship endpoint, a merge target getting a new attribute. Re-declaring
that concept as `owl:Class` in every patch that touches it would be redundant and semantically
wrong (a patch shouldn't assert "here is a brand-new X" about something that already exists).
Added a per-concept `external` flag: `export_rdf.py` still registers its URI in the module's
`concept_uri_map` (so `subClassOf`/`domain`/`range` resolve correctly) but skips the
`owl:Class`/`rdfs:label`/`rdfs:comment` assertions for it. Its `attributes` array (if any is
supplied) is still processed normally — this is exactly how a merge's new attribute gets
emitted with the correct `rdfs:domain` pointing at the external concept, without redeclaring
the concept itself. The existing whole-ontology export path never sets this flag, so its
behavior is provably unchanged.

### 4. Tag-root canonicalization: a synthetic per-tag "sentinel" concept, resolved fresh per module — not a shared static ID
Every reference to a Stage 5 tag-root (a promoted concept's parent, or — in principle — a
relationship endpoint) resolves through `registerReference()`, which recognizes
`isTagRootConcept()` and substitutes a synthetic id (`__layer1__<Tag>`) whose `uri` is always
`canonicalLayer1Iri(tag)` — the **same fixed IRI** (`upperOntology.ts`'s
`LAYER1_NAMESPACE`) regardless of which module's own tag-root concept stood in for it, and
regardless of that tag-root's own real (module-specific) database id. Verified live: a core
module's `Agent` tag-root and an extension module's `Entity` tag-root both serialize their
children's parent references to `http://enterprise.org/ontologies/upper-layer1#Agent` /
`#Entity` — never a per-module invented class, and the tag-root's own `Concept` row is never
serialized at all.

**Why a fixed constant namespace, not the ontology's own `namespaceUri`:** Layer 1 is
"adopted, never modified" (idea.md) — conceptually an external upper ontology this system
doesn't own. Nothing in this codebase persists an actual RDF document for it yet (no
`owl:imports`-able external file exists), so each patch that references a Layer 1 class
self-declares it (idempotently — the same triple, same IRI, every time) so the patch stays
independently valid Turtle. This is a deliberate, documented compromise given there's no
persisted Layer 1 ontology file to point `owl:imports` at instead — flagged as a known gap
below, in case a future stage wires in a real external upper-ontology document.

### 5. Cross-module relationship reference resolution had to target the *referencing* module's payload, not the endpoint's home module — caught and fixed during verification
First implementation resolved a relationship endpoint's reference into `getModule(concept.ontology)`
— i.e., the endpoint's own home module. This is correct for same-module relationships but
silently broke the allowed extension→core case: the live test's `auditedBy` relationship
(source in the extension module, target `ClaimsAuditor` in core) needed `ClaimsAuditor`'s URI
resolvable *within the extension module's own `export_rdf.py` call*, since each module is
serialized independently with its own `concept_uri_map`. Registering the reference into
core's payload instead meant the extension file's relationship silently failed to resolve
(`src_uri`/`tgt_uri` both required, so the whole `auditedBy` triple was dropped — verified
live before the fix; caught by an explicit assertion, not by chance). Fixed by making
`registerReference(intoModule, concept)` take the destination module explicitly — callers
now always pass the module whose payload actually needs the reference resolvable (the
child's module for a parent reference, the relationship's own module for its endpoints),
never inferred from the referenced concept's own home ontology.

### 6. TTL generation is a separate, on-demand step from promotion — not bundled into `POST .../promote`
idea.md's process flow treats "Batch review" (step 3) and "OWL/TTL generation" (step 4) as
distinct steps with distinct inputs/outputs ("Input: approved change set" for step 4 —
i.e., generation happens *after* an approval already exists, not as part of producing it).
Keeping `POST .../promote` free of a `python3` subprocess call also keeps that endpoint fast
and its concerns narrow (write the graph, nothing else). `POST /api/changesets/:id/generate-ttl`
is the new, separate action; `GET /api/changesets/:id` retrieves what's stored.

### 7. Tag-root pollution: fixed at the two consumers the review named, not by hiding the rows from the database
The review specifically called out that tag-root concepts would pollute "quality/CQ-coverage
metrics, graph viz, diffs" if nothing filtered them. The diff (Stage 6's own new code) was
never at risk — it's built from the `CandidateConcept` promotion trail, which structurally
never includes a tag-root (tag-roots are created directly in `promotion.ts`, not via any
candidate's `promotedConceptId`). The other two **were** a live, currently-real bug once
checked: `qualityEvaluator.ts` and `page.tsx`'s `loadOntologyData` both consume
`ontology.concepts` unfiltered, so a real ontologist promotion (not just this stage's tests)
would already have been inflating concept counts and flagging every anchor root as an
"unconnected concept" in the quality report. Fixed both at the point of consumption with
`isTagRootConcept()`, rather than, say, giving tag-roots a special `Concept` subtype or
excluding them from the DB query outright — they're still real rows other code (promotion's
own parent-resolution) legitimately needs to see; only display/metrics consumers should
filter them.

**Known gap, out of scope:** `src/lib/graphWeaver.ts` (`weaveOrphanConcepts`, wired to the
legacy `ai-generate` route and the "Auto-Fix Remediation" button via
`/api/ontologies/[id]/agent-pipeline`) was not audited or patched. It's a different legacy
pipeline than the one Stage 5 cut over, and touching it goes beyond "Stage 6 spec." Flagging
it here since it's the same category of risk (an orphan-connecting pass that might try to
"fix" a tag-root's deliberate lack of relationships) in case it's revisited later.

---

## Acceptance checkpoint (from `IMPLEMENTATION_PLAN.md` Stage 6)

- **Generated TTL parses** — verified live: both module files from a real promoted
  ChangeSet were written to disk and parsed independently via `scripts/parse_rdf.py`, with
  zero errors.
- **References existing parent classes correctly** — verified: a core concept's
  `rdfs:subClassOf` resolves to the canonical Layer 1 IRI; an extension concept's relationship
  correctly references a core concept via its **real, full core namespace URI**
  (`http://bms.com/ontologies/rwe-integration-registry#ClaimsAuditor`), not a dangling or
  module-relative reference — and that referenced concept is registered for resolution
  without being redundantly re-declared as its own class.
- **Diff is readable by a non-ontologist** — see the real generated example below; plain
  English, no raw ids, no tag-root marker noise.
- **Extension handling honored** — `owl:imports` present only on the extension file, pointing
  at the real core namespace; core file has no `owl:imports` at all (one-way dependency).

---

## How verified

All verification against the real dev server (port 3006) and real seeded data — no mocks.

**A real, pre-existing environment gap found first:** `scripts/export_rdf.py` (used by the
existing `/api/ontologies/[id]/export` route, unrelated to Stage 6) imports `rdflib`, which
was not installed anywhere in this environment and not declared in any requirements file —
so that pre-existing export feature was already broken before this stage touched anything.
Installed `rdflib>=7.6.0` (`python3 -m pip install --user rdflib`) and added `requirements.txt`
so this is at least documented going forward.

**Baseline (before and after the full test run):** `ontology=3, concept=35, relationship=33,
session=0, turn=0, candidate=0, changeSet=0, attribute=0`. `turns/route.ts` extraction itself
is unaffected by Stage 6 and still blocked by the same exhausted Gemini chat-generation daily
quota noted in Stage 5B, so candidates were seeded directly (same shape `turns/route.ts`
produces) rather than going through a live LLM extraction call — promotion, TTL generation,
and parsing are all real, only the "what did the LLM extract" step was bypassed.

End-to-end run: seeded 4 candidates covering every case in one changeset — a core-scope
concept (`ClaimsAuditor`, parented under a freshly-created core `Agent` tag-root, with one
attribute), an extension-scope concept (`PatientEnrollmentDatabase`, parented under a
freshly-created extension `Entity` tag-root), a cross-module relationship (`auditedBy`,
source in the extension, target in core — the allowed direction), and a merge (into the real
seeded `PatientRegistry`, adding one new attribute `retentionPeriodDays`).

1. **Promote** → 201, zero errors, 2 concepts / 1 relationship / 1 merge — as expected.
2. **`POST .../generate-ttl`** → 200. Produced exactly 2 module files (core, extension) —
   confirmed no third stray file, no missing one.
3. **Core TTL**: declares `ClaimsAuditor` as `owl:Class` with `rdfs:subClassOf
   <...upper-layer1#Agent>`; separately declares that canonical `Agent` class once; declares
   the merge's new `hasRetentionPeriodDays` property with `rdfs:domain ex:PatientRegistry`
   **without** re-declaring `PatientRegistry` itself as a class (confirmed via regex check —
   no `PatientRegistry ... a owl:Class` anywhere); no `owl:imports` anywhere in the file.
4. **Extension TTL**: `owl:imports <http://bms.com/ontologies/rwe-integration-registry>` (the
   real core namespace, not a placeholder) on the ontology header; declares
   `PatientEnrollmentDatabase` as `owl:Class` with `rdfs:subClassOf
   <...upper-layer1#Entity>`; declares `auditedBy` as an `owl:ObjectProperty` with `rdfs:domain
   ex:PatientEnrollmentDatabase` and `rdfs:range` pointing at `ClaimsAuditor`'s full **core**
   URI (cross-file reference, resolved correctly after fixing the module-targeting bug in
   Decision 5 above — confirmed broken before the fix, confirmed fixed after).
5. **Round-trip parse**: wrote both TTL strings to real `.ttl` files and ran
   `scripts/parse_rdf.py` on each independently — zero errors, correct concept/relationship
   counts back out (2 concepts/0 relationships for core; 2 concepts/1 relationship for the
   extension file, which is the referenced `ClaimsAuditor` stub + `PatientEnrollmentDatabase`
   + the `auditedBy` object property).
6. **`diffSummary`** (real generated output):
   ```
   Added 2 new concept(s):
     - ClaimsAuditor (Persona), extends Layer 1 Agent, 1 attribute(s) — in core
     - PatientEnrollmentDatabase (Entity), extends Layer 1 Entity — in extension:biopharma_life_sciences
   Added 1 new relationship(s):
     - PatientEnrollmentDatabase --[auditedBy]--> ClaimsAuditor
   Merged 1 candidate(s) into existing concepts:
     - merged into "PatientRegistry", added attribute(s): retentionPeriodDays
   ```
   No raw ids, no tag-root marker strings, no JSON — readable by a non-ontologist.
7. **`GET /api/changesets/:id`**: confirmed `diffSummary`/`ttlFiles`/`ttlDiff` all persisted
   correctly; `ttlDiff` (the concatenated view) contains both modules' content, separated by
   `### FILE:` headers naming the module and namespace.
8. **Tag-root pollution fix, checked directly (not just "a tag-root was created")**: called
   `evaluateOntologyQuality` on the real post-promotion ontology payload. Raw `concepts`
   array had 17 rows (1 of them the freshly-created core `Agent` tag-root); the report's
   `conceptCount` correctly came back 16, excluding it. Confirmed the orphan-detection issue
   message did not flag `Agent` as an unconnected concept (`ClaimsAuditor` legitimately shows
   as orphaned in the **core**-only view, since its only relationship (`auditedBy`) is stored
   under the **extension** module's `Ontology` row per the existing per-ontology query scope
   — an accurate, pre-existing architectural fact unrelated to this fix, not a bug).
9. **Cleanup.** Deleted every test artifact across all runs (including two earlier
   test-script-bug/missing-dependency runs whose partial promotions weren't cleaned up before
   the next attempt — each was found via direct DB query, root-caused, and removed): the
   session(s), `ChangeSet`(s), promoted concepts/relationship, the auto-created core `Agent`
   and extension `Entity` tag-roots, the extension `Ontology` row, and the merge-added
   `retentionPeriodDays` attribute on the real `PatientRegistry`. Final counts confirmed back
   to the exact baseline above.

`npx tsc --noEmit` clean; `npm run build` succeeds (both new `/api/changesets/...` routes
compile).

**Not literally browser-tested**, same limitation as Stage 5B (no browser automation tool
available in this environment) — there is no UI for Stage 6 yet regardless (it's two new API
routes plus library/schema changes; the plan doesn't call for a Stage 6 UI).

---

## Known gaps / TODOs

- **No persisted Layer 1 ontology document** — see Decision 4. Each patch self-declares the
  canonical Layer 1 classes it references rather than `owl:imports`-ing them from a real
  external file, because no such file exists in this system yet.
- **`graphWeaver.ts`/legacy agent-pipeline auto-fix not audited for tag-root awareness** —
  see Decision 7's known gap. Different pipeline than what Stage 5 cut over; out of scope
  here.
- **Gemini chat-generation daily quota (20/day free tier)** — still exhausted from cumulative
  Stage 4/5/6 testing this session; same operational note as Stage 5B, not a code issue.
- **No UI to trigger `generate-ttl` or view the result** — not called for by the Stage 6
  plan bullet (API + serializer only); would be a natural Stage 7+ or polish-pass addition.
- **`requirements.txt` has no accompanying venv/CI wiring** — just documents the dependency;
  didn't set up a virtualenv or touch any install scripts, since none existed before either.

---

## Ready for review

Stage 6 (TTL generation + diff, both required carry-forwards from the Stage 5 review) is
implemented and live-verified end-to-end, including a real bug (cross-module relationship
resolution) caught and fixed during verification rather than assumed correct. Stopping here
for review before Stage 7 (glossary drafting).
