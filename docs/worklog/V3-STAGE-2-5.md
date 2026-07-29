# V3 Stage V2–V5 — Direct promote/demote + the full main UI

Implemented by the assistant (owner asked me to take the whole remaining pipeline, not just V0/V1).
Branch `ontology_v3`. Spec: `docs/V3_FLOW.md`.

## Stage V2 — Direct promote / demote (backend, the load-bearing stage)

- **`src/lib/directPromotion.ts`**
  - `promoteCandidateDirect(candidateId)` — check-in. Writes ONE candidate straight to a live
    `Concept`/`Relationship` with **NO ChangeSet**. REUSES `promotion.ts`'s `resolveTagRoot`
    ("never a disconnected tree") and `moduleAllowsReference`, plus the same post-commit embed-on-
    write pass — it does **not** duplicate that logic. Deliberately does NOT reuse
    `resolveModuleOntology`: that router assumes `session.ontology` is the core and spawns child
    extensions by scope; in V3 the wizard (V1) already fixed the module, so we promote directly into
    `session.ontologyId`. Idempotent (already-promoted → returns existing id). Relationship promote
    requires BOTH endpoints already live in the ontology (decision Q4). Embedding is non-fatal
    (`embedWarning`).
  - `demoteCandidate(candidateId, {force?})` — un-check. Relationship: delete + re-stage. Concept:
    if the live concept was **edited after check-in** (label/description/attributes diverged from the
    candidate payload) or has **dependents** (relationships referencing it, or child concepts), the
    unforced call returns a `warning` instead of deleting (decision Q2); `force:true` performs the
    destructive delete. Cascade sweeps dependent relationships and **re-stages their candidates** so
    Staging stays truthful; child concepts re-parent to null (schema `onDelete: SetNull`).
  - Exported `resolveTagRoot` / `moduleAllowsReference` / `Tx` from `promotion.ts` for reuse.
- **Routes:** `POST /api/candidates/[id]/promote`, `POST /api/candidates/[id]/demote` (body `{force?}`).

**Checkpoint (isolated fixture, offline — no GEMINI key so embed degrades to the non-fatal path):**
24/24 PASS — rel-before-endpoints blocked; concept promoted under the correct `Entity` tag-root with
attributes; candidate ACCEPTED + `promotedConceptId`, **`changeSetId` null, zero ChangeSets created**;
idempotent re-promote; relationship promoted with correct endpoints; demote warns on dependents (not
deleted); force-demote deletes + cascade-sweeps the relationship + re-stages both candidates; demote of
a never-promoted candidate is a no-op. **Isolation: ontologies 5→5, concepts 43→43, changesets 1→1.**

## Stage V3 — Create wizard (UI)

- **`src/components/v3/CreateWizard.tsx`** — Industry × Domain inputs (with suggestions from the new
  `GET /api/domain-profiles`), optional "link an existing ontology" selector (from `GET /api/ontologies`),
  → `POST /api/ontologies/bootstrap` → hands the result to the workspace.
- **`src/app/api/domain-profiles/route.ts`** — lists known profiles for suggestions (free-text industry/
  domain is still accepted by bootstrap; this is hints, not a whitelist).

## Stage V4 — Sidebar shell + Staging tab + canvas (UI)

- **`src/app/v3/page.tsx`** — the workspace: wizard when nothing is open, else the sidebar+canvas layout.
  Left sidebar = chat (top half) + tabs (bottom half: Staging | Edit); center = the live graph.
  - Chat posts to `POST /api/sessions/[id]/turns` and refreshes candidates (extraction requires the LLM;
    failures surface as an inline assistant bubble, non-blocking).
  - `onToggle` drives the checkbox: check → promote route; un-check → demote route, and on a `warning`
    it `confirm()`s then re-sends with `force:true` (the decision-Q2 flow, wired end to end).
- **`src/components/v3/StagingTab.tsx`** — every candidate (seed + chat) with a green checkbox; checked =
  live. Relationship checkboxes are disabled until both endpoints are live, with an inline "Check in X
  first" hint (decision Q4). Grouped Classes / Relationships.
- **`src/components/v3/GraphCanvas.tsx`** — deterministic circular-layout SVG of the live graph (tag-roots
  excluded upstream). Click a node or relationship label to select it → opens the Edit tab. No physics/deps.

## Stage V5 — Edit tab (UI)

- **`src/components/v3/EditTab.tsx`** — edits the selected LIVE element. Concept: label, type,
  description, attributes (add/remove). Relationship: name, cardinality, description. Writes are
  **live-only** (decision Q3) via `PATCH /api/concepts/[id]` / `PATCH /api/relationships/[id]`; Delete
  removes the live element directly (distinct from un-check).
- **`src/app/api/concepts/[id]/route.ts`** — extended PATCH to accept `description` and `uri` (it only
  handled label/conceptType/typeFields/attributes before; the Edit tab needs description).

## Other
- **`src/app/globals.css`** — added the missing `@keyframes spin` + `.spin` utility. The existing
  ChatPanel already referenced an inline `animation: spin ...` that was never defined, so no spinner in
  the app actually rotated; this fixes the new components and that pre-existing gap.

## How verified
- `tsc --noEmit` clean; `npm run build` succeeds (`/v3` compiles, all new routes registered).
- **V3 end-to-end route-contract test** (isolated, offline, invoking the REAL route handlers the UI
  calls): 9/9 PASS — domain-profiles populated; promote concept+concept+rel; `GET /api/ontologies/[id]`
  returns tag-roots (2) + exactly the 2 live concepts + the relationship with source/target ids + Brand's
  2 attributes for the Edit tab; concept PATCH persists description. **Isolation restored.**

## Not verified here (environment constraint)
- **No browser click-through.** The UI is validated at the build + API-contract level, not by driving the
  page in a browser. Recommend an owner smoke-test: create via the wizard → seed appears unchecked in
  Staging → check a class → node appears on canvas → chat proposes more → check a relationship (blocked
  until endpoints live) → click a node → edit/save → un-check with a dependent (warning dialog).
- Chat extraction needs a live LLM (Gemini quota); not exercised here to preserve quota.

## Post-review fixes (owner asked to fix the three gaps I flagged)

**#1 — Duplicate-label guard on check-in.** `promoteCandidateDirect` now blocks a concept whose label
(case-insensitive) already matches a live non-tag-root concept in the family, returning `ok:false` +
`duplicateOfConceptId` instead of creating an ambiguous second node. The UI already surfaces `error`.

**#2 — Workspace survives refresh + reopen.** The page writes `?ontology=…&session=…` to the URL on
create/open and restores from it on load (browser refresh no longer dumps you at the wizard). New
`GET /api/sessions` returns the latest session per ontology; the wizard shows an **Open recent** list.
"New" clears the URL and returns to the wizard.

**#3 — Linking is now a TRUE import, not a copy.** Bootstrap's linked path no longer copies the base
ontology's classes into the new one: it sets `extendsOntologyId`/`extension:*` and leaves Staging empty
(`importedConceptCount` reported for the UI). `promoteCandidateDirect` resolves concept-dedup and
relationship endpoints across the module **family** (ontology + the one it imports), enforcing
`moduleAllowsReference` — so an extension concept can point at an imported base concept (real cross-module
edge, edge stored in the extension), a core concept still can't point at an extension, and you can't
re-declare an imported class. The canvas renders imported concepts read-only (dashed/dimmed, not
selectable); the workspace loads and displays the base graph as context.
- `src/lib/seed/index.ts`'s `fromLinkedOntology`/`resolveSeed` remain as the "copy" loader for a possible
  future duplicate-ontology feature; the wizard no longer uses them.

**Verified:** `tsc` clean, `npm run build` green. Isolated offline test — 16/16: dup blocked
(same-ontology + case-insensitive + imported-base, with `duplicateOfConceptId`); linked import creates no
copies (empty seed, `importedConceptCount=1`, extends base); extension→imported-base relationship created
with the edge stored in the extension; `GET /api/sessions` returns latest-per-ontology. Isolation restored
(my fixtures cleaned up; owner's live smoke-test data untouched).

## Status
All V3 stages (V0–V5) implemented and verified at the API/build level, plus the three post-review fixes.
The legacy 12-stage governance pipeline is untouched and remains unwired from this flow, as specified.
Nothing committed — awaiting owner review.
