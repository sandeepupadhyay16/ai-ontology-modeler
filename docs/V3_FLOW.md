# V3 Flow — Simplified conversational ontology modeling

**Branch:** `ontology_v3`
**Status:** spec / not built yet
**Supersedes (for the primary UX):** the 12-stage governance pipeline in `docs/IMPLEMENTATION_PLAN.md`.
The governance code (ChangeSet lifecycle, SHACL validate, git versioning, sign-off, publish) stays
in the repo but is **not wired into this flow**. See "What we're cutting" below.

## Why

The v1/v2 pipeline is correct but heavy: a candidate has to travel candidate → ChangeSet →
validate → version → sign-off → publish before it's real. For the day-to-day modeling loop that's
too much ceremony. V3 keeps the two things that matter — **talk to an agent to grow the model**, and
**a human decides what's in** — and collapses everything between them into a single checkbox.

---

## 1. Create flow (the wizard)

A new ontology is created through a short wizard, not auto-generated and not empty.

1. **Pick Industry × Domain.** Two axes (e.g. Pharma × Marketing). Industry maps to the existing
   `domainProfiles.ts` matching (`Ontology.industry`); domain is the business function
   (`Ontology.businessFunction`). Together they pick the domain profile used for extraction prompts
   AND the seed template.
2. **Optionally link an existing ontology.** If the user links one, the new ontology becomes an
   **extension** of it: `moduleScope = "extension:<domain>"`, `extendsOntologyId = <linked>` (the
   `owl:imports` plumbing already in the schema). If not linked, it's a fresh `core` map.
3. **Seed the map.** The wizard produces a starter set of classes + relationships (a "map"):
   - **Linked** → seed = the linked ontology's classes/relationships (imported, see §3).
   - **Not linked** → seed = the curated, standards-aligned template for that Industry × Domain (§3).
4. Land in the modeler with the seed sitting in **Staging, unchecked** (§4). Nothing is live yet —
   the user checks in what they want.

### Wizard output
- One `Ontology` row (`industry`, `businessFunction`, `moduleScope`, `extendsOntologyId` set).
- One `ModelingSession` bound to it (`domainProfile` = resolved profile key).
- The seed materialized as **staging rows** (see §4 for the model choice), not live `Concept`s.

---

## 2. Main UI

Deliberately simple, because the concept is not.

```
┌─────────────────────────┬───────────────────────────────────┐
│  LEFT SIDEBAR           │                                   │
│ ┌─────────────────────┐ │                                   │
│ │ TOP: AI Modeler     │ │        CENTER CANVAS              │
│ │ (chat with agent)   │ │     the live ontology graph       │
│ │                     │ │   (only checked-in nodes/edges)   │
│ ├─────────────────────┤ │                                   │
│ │ BOTTOM: tabs        │ │                                   │
│ │  [Staging] [Edit]   │ │                                   │
│ └─────────────────────┘ │                                   │
└─────────────────────────┴───────────────────────────────────┘
```

- **Top-left — AI Modeler:** the existing `ChatPanel` conversation. The user talks; extraction
  proposes new staging items (§4). Rule-drafts / glossary / GovernancePanel UI is **removed from
  this panel** in v3.
- **Bottom-left — tabs:**
  - **Staging:** the list of proposed elements (seed + chat-extracted), each with a **green
    checkbox**. Check = promote into the live graph. Uncheck = remove from the graph. This is the
    only gate.
  - **Edit:** select a node/edge on the canvas and edit its fields (label, description, type,
    attributes, cardinality). Operates on **live** elements.
- **Center — canvas:** renders only what's checked in. This is the product; the sidebar acts on it.

---

## 3. The seed seam (pluggable source)

All three seed sources produce the **same shape**, so the flow never changes when we add a source:

```ts
type SeedClass = {
  label: string;
  conceptType: string;            // Entity | Metric | Process | Persona ...
  upperOntologyTag: string;       // one of the six Layer-1 tags
  description?: string;
  uri?: string;                   // standards IRI when we have one
  attributes?: { name: string; datatype: string; description?: string }[];
};
type SeedRel = {
  name: string; source: string; target: string;  // source/target = SeedClass.label
  cardinality?: string; description?: string; uri?: string;
};
type SeedSource = { classes: SeedClass[]; relationships: SeedRel[] };
```

Loaders:
- **`curatedTemplate(industry, domain) → SeedSource`** — ship now. Hand-authored JSON per
  Industry × Domain, class names / IRIs / relationships **borrowed from real standard vocabularies**
  (schema.org, FIBO-style terms) but stored as static data. Deterministic, no network, no LLM.
  Missing combo → fall back to the GENERIC/empty seed.
- **`fromLinkedOntology(ontologyId) → SeedSource`** — ship now. Reuses the existing import/extension
  plumbing; reads the linked ontology's `Concept`/`Relationship` rows into the seed shape.
- **`fromStandardVocab(...) → SeedSource`** — **deferred.** Live FIBO/schema.org RDF parsing +
  subsetting. When built, it's just another loader behind this same interface — **not a flow change.**

> Decision (owner, 2026-07-28): start with curated standards-aligned templates; defer live vocab
> parsing. We lose nothing structural by waiting because of this seam.

---

## 4. Staging → live (the checkbox gate)

**This replaces the ChangeSet pipeline for the primary flow.**

- Everything proposed — seed classes AND chat-extracted candidates — lands as **`CandidateConcept`
  rows** (`decision = PENDING`). One staging model, two producers. The seed just pre-populates
  staging at create time; chat appends to it per turn (existing `turns` route, unchanged extraction).
- The **green checkbox** flips a candidate ACCEPTED and **promotes it directly into a live `Concept`
  / `Relationship`** — no ChangeSet wrapper. Unchecking removes the promoted element (and re-stages
  or deletes the candidate — see open questions).
- Promotion still does the useful deterministic work it does today: Layer-1 tag-root parenting,
  attribute creation, embedding for later dedup. It just skips the ChangeSet/validate/version/sign-off
  envelope.

### What changes in code
- **New `promoteCandidateDirect(candidateId)`** (or a `changeSetId?`-optional path through the
  existing `src/lib/promotion.ts`) that writes straight to `Concept`/`Relationship` with **no
  ChangeSet**. Today promotion is ChangeSet-scoped; v3 needs the un-wrapped path.
- **Un-check / demote** path: delete the live `Concept`/`Relationship` created from a candidate
  (traceable via `CandidateConcept.promotedConceptId` / `promotedRelationshipId`) and set the
  candidate back to `PENDING`.
- Seed materialization at create time: write the `SeedSource` as `CandidateConcept` rows bound to
  the new session (`sourceTurn` = a synthetic "seed" turn, or make `sourceTurnId` nullable for seed
  rows — see open questions).

---

## 5. What we're cutting (and keeping)

**Cut from the flow (code stays in repo, unwired):**
- ChangeSet status lifecycle (DRAFT→APPROVED→VALIDATED→SIGNED_OFF→PUBLISHED)
- SHACL validation, git versioning, sign-off, publish, GovernancePanel
- Rule elicitation / glossary confirmation UI in ChatPanel

**Keeping:**
- Conversational extraction (`turns` route, domain profiles, upper-ontology tagging)
- `CandidateConcept` staging + dedup/conflict embedding checks
- Promotion's deterministic parenting/attribute logic (via the new un-wrapped path)
- Extension/import plumbing (`moduleScope`, `extendsOntologyId`)

---

## 6. Resolved decisions (owner, 2026-07-28)

1. **Seed rows & `sourceTurnId`:** create **one synthetic "seed" `ConversationTurn`** per session at
   create time (role `system`, ordinal 0); all seed `CandidateConcept`s point at it. Keeps the
   non-null FK invariant; seed rows get a real provenance anchor. **No schema change.**
2. **Un-check semantics:** un-checking a live element **deletes** the `Concept`/`Relationship` and
   sets its candidate back to `PENDING`. **Warn first** if the node was edited in the Edit tab or has
   dependent edges. (Edited-detection: compare live element against the candidate payload; dependents:
   any `Relationship` referencing the concept.)
3. **Edit tab vs candidate:** edits are **live-only**. Once checked in, the `Concept`/`Relationship`
   is the source of truth; the candidate payload is frozen provenance and does not receive edits.
4. **Seed relationships with un-checked endpoints:** a relationship's checkbox is **disabled until
   both endpoint concepts are live**. Checking it then creates the `Relationship`.
5. **Two-axis resolution:** decouple the two uses. The **extraction profile** stays single-key,
   resolved from `industry` (existing `domainProfiles.ts` matching). The **seed template** is looked
   up on the `(industry, domain)` tuple separately. No two-axis rewrite of the profile resolver.

---

## 7. Staged build plan (hand-off)

Build in this order. Each stage is independently verifiable; **stop at each checkpoint and confirm
before moving on.** Add a short worklog note per stage under `docs/worklog/V3-STAGE-N.md` describing
what changed and how you verified it. Read `node_modules/next/dist/docs/` before writing any route or
component code (per `AGENTS.md` — this Next.js is modified; do not assume training-data APIs).

**Do not touch the owner's live data.** All verification uses isolated fixtures that are
cascade-deleted afterward; confirm a before/after live-row count is unchanged.

### Stage V0 — Seed seam + curated templates (no UI)
- Add `src/lib/seed/` with the `SeedSource` types (§3) and loaders `curatedTemplate(industry, domain)`
  and `fromLinkedOntology(ontologyId)`. Leave `fromStandardVocab` unimplemented (throw "deferred").
- Author **2 curated templates** to start: `pharma/marketing` and one more (e.g. `financial_services/*`),
  class names/IRIs borrowed from schema.org / FIBO-style terms. Missing combo → empty seed (fallback).
- **Checkpoint:** unit-call both loaders, assert shape; `curatedTemplate('pharma','marketing')`
  returns non-empty classes with valid Layer-1 tags. `tsc` clean.

### Stage V1 — Seed materialization at create (backend)
- New/extended create endpoint: given `{industry, domain, linkedOntologyId?}`, create `Ontology`
  (+ `moduleScope`/`extendsOntologyId` if linked) + `ModelingSession` + **one synthetic seed
  `ConversationTurn`** (Q1) + one `CandidateConcept` per seed class/rel (`decision=PENDING`,
  `sourceTurnId`=seed turn).
- **Checkpoint:** isolated fixture — create linked and unlinked; assert seed candidates exist, all
  point at the seed turn, no live `Concept` yet. Live-row count unchanged after cleanup.

### Stage V2 — Direct promote / demote (backend)
- `promoteCandidateDirect(candidateId)`: the un-wrapped promotion path — writes straight to
  `Concept`/`Relationship` with **no ChangeSet**, reusing existing tag-root parenting + attribute +
  embedding logic from `src/lib/promotion.ts`. Relationship promote requires both endpoints live (Q4).
- `demoteCandidate(candidateId)`: delete the promoted live element (via
  `promotedConceptId`/`promotedRelationshipId`), reset candidate to `PENDING`. Return a **warn flag**
  if edited or has dependents (Q2) — caller decides to proceed.
- Routes: `POST /api/candidates/[id]/promote`, `POST /api/candidates/[id]/demote`.
- **Checkpoint:** isolated fixture — promote a concept candidate → live Concept exists, no ChangeSet
  row created; demote → live Concept gone, candidate PENDING; relationship promote blocked until
  endpoints live. Live-row count unchanged after cleanup.

### Stage V3 — Create wizard (UI)
- Industry × Domain pickers + optional "link existing ontology" selector → calls V1 endpoint → opens
  the modeler on the new ontology.
- **Checkpoint:** owner browser smoke-test — wizard creates an ontology with seed sitting unchecked
  in Staging, canvas empty.

### Stage V4 — Sidebar shell + Staging tab (UI)
- Left sidebar: chat (top) + tabs (bottom). **Staging tab**: list of PENDING candidates with green
  checkboxes wired to V2 promote/demote; endpoint-gated relationship checkboxes; un-check warning
  dialog. Canvas renders only live (checked) elements.
- Strip rule-draft/glossary/GovernancePanel UI out of `ChatPanel` for v3.
- **Checkpoint:** owner browser smoke-test — check a seed class → appears on canvas; talk to agent →
  new candidate appears in Staging; check it in; un-check → warn + removal.

### Stage V5 — Edit tab (UI)
- Select a live node/edge on the canvas → edit its fields (label, description, type, attributes,
  cardinality); live-only writes (Q3). Delete action here also removes the element (distinct from
  un-check).
- **Checkpoint:** owner browser smoke-test — edit a live node, reload, edit persists.

### Out of scope for v3 (do not build)
- `fromStandardVocab` live RDF parsing; the governance pipeline UI/wiring; rule/glossary elicitation;
  import handling beyond the existing `fromLinkedOntology` copy.
```
