# V3 Backlog

Living list of pending / deferred ideas for the V3 flow. Ordered within each tier by rough value-to-effort.
Not a commitment — a queue to pull from. `[building]` = in progress this session, `[done]` = shipped.

## Tier 1 — Missions & business rules (the "mission" discussion)
- **Missions** — new `Mission` model (elevates `Ontology.objective`): one per ontology (the org core carries
  the org mission; each function extension carries its own). `{statement, source: user|llm, status}`. Set at
  creation and/or agent-proposed/refined from chat; shown as an editable Mission banner.
- **Business rules** — new lean `BusinessRule` model (do NOT overload the governance-coupled `Rule`/`RuleDraft`):
  `{statement (NL, primary), ruleType (CONSTRAINT|DERIVATION|THRESHOLD|COMPLIANCE|PROCESS), source, status,
  references (concept/rel/attr ids it governs), formalization Json? (deferred SHACL/SPARQL)}`. Agent-extracted
  from chat → staged for review → confirmed; plus manual "Add rule". A Rules panel grouped by mission, with
  canvas highlighting of governed elements. (Manual "Add rule" builds on the manual node/rel authoring, done.)

## Tier 1 — high value, contained
- **Reject / dismiss a staged proposal** — a × on a Staging row sets the candidate REJECTED so the inbox
  clears without adding it to the canvas. (Today you can only accept.)
- **Surface duplicate/conflict status in Staging** — candidates already carry `dupStatus`; show a badge and,
  on an exact/near dup, offer **Merge into existing** instead of the hard block.

## Tier 1.5 — org sharing & content (from the "shared across an org" discussion)
- **TTL upload → new ontology** — wire the existing RDF parser (`scripts/parse_rdf.py`, already used by
  `POST /api/ontologies/[id]/import`) into the wizard: upload a `.ttl` (e.g. one you exported) to seed/link
  a new ontology. Low-tech federation between functions; also the delivery mechanism for shipped templates.
- **Pre-populated pharma-org templates as `.ttl`** — ship curated org `.ttl` files (a "Pfizer org core", etc.)
  that the wizard/template-picker can instantiate. Complements the template picker below.
- **Org + function views** — the schema already has `Ontology.organizationId` / `businessFunctionId` +
  `Organization`/`BusinessFunction` models, and the layered core→extension import already gives "shared core +
  function-specific extension". Still needed: surface org/function grouping in the UI, and a **graph filter**
  so a function sees only its slice (its extension + the imported core) of the shared ontology.

## Tier 1.5b — pharma content & wizard
- **More pharma example cases** — beyond Kite (cell therapy), Pfizer (vaccine supply, clinical trial),
  and pharma-marketing: candidates are **market access / payer**, **pharmacovigilance/safety**,
  **medical affairs**, **manufacturing (small molecule/biologic)**. Same curated-template pattern.
- **Tiered Kite demo set (core + extensions)** — a general "Kite Pharma core" (the vein-to-vein model) plus
  function extensions that IMPORT it: **Kite Manufacturing & QC**, **Kite Patient Safety / Pharmacovigilance**,
  **Kite Market Access**. Each carries its own mission + rules and references the core (one-way). Good demo of
  the layered approach; buildable today via create-core → link-as-base → extend.
- **Template picker in the wizard** — instead of matching industry×domain silently, show the available
  starter maps as choosable cards (with class counts / a preview) so the user can pick a case directly.

## Tier 2 — medium
- **Graph UI — remaining** — shipped: dependency-free force-directed layout, pan/zoom/drag, directional
  arrowheads, type legend. Still wanted: **node search/highlight**; an optional **group-by-type or
  hierarchical layout** toggle; edge-crossing minimization; collapse/expand a node's neighborhood;
  persist manual node positions across reloads.
- **Export — remaining** — shipped: PNG + SVG (client-side, fit-to-content) and Turtle/OWL/JSON-LD (via
  the export route) from an Export menu in the header. Still wanted: **CSV** of classes/attributes;
  export-current-view vs fit-all toggle; embed fonts in the PNG; per-module export when extensions exist.
- **Home screen polish** — a dedicated landing distinct from the create form: "New" vs "Open existing" as two
  clear paths, recent list with industry/updated-at, and a delete-ontology action.
- **Import real pharma ontologies** (`fromStandardVocab`, currently deferred/throws) — see the shortlist in
  the worklog / chat. Start with an OBO-Foundry, openly-licensed one (OAE for adverse events, Cell Ontology
  for T-cell types) since those are parseable OWL with clean licenses. Gate SNOMED/MedDRA/ATC on licensing.

## Tier 3 — later / optional
- **Edit tab: URI field** — PATCH already accepts `uri`; expose an input. Also allow re-pointing a
  relationship's endpoints.
- **Embedding backfill for seed concepts** — seed classes are created without embeddings (offline/deterministic
  at create). A backfill pass would let semantic dup-detection compare chat proposals against seed classes
  (exact-label dup guard already protects the common case).
- **Governance tail (optional publish)** — the validate → version → sign-off → publish pipeline still exists in
  the repo, unwired. Offer it as an optional "Publish a governed release" action if/when needed.
- **Canvas quality-of-life** — multi-select + bulk delete; undo; keyboard nav.
- **Live standard-vocab ingestion generally** — the full `fromStandardVocab` seam (any OWL/LinkML source →
  `SeedSource`), beyond the hand-curated templates.

## Done
- V0–V5 pipeline; three review fixes (dup guard, refresh/reopen, true import); 5-type concept model; Kite
  cell-therapy template; seed-to-canvas; concept-type Guide tab.
- Agent explains what & why + asks follow-ups (grounded `reply` from the extraction call).
- Back-to-home button in the workspace.
- Pharma-centric examples: Kite (cell therapy) + Pfizer (vaccine supply, clinical trial) templates, kept
  alongside pharma-marketing; Guide examples broadened from Kite-only to pharma-wide.
- Delete an existing ontology from the homepage (trash button on each recent row).
- Graph UI overhaul: force-directed layout, pan/zoom/drag, directional arrowheads, type legend.
- Download/export: PNG + SVG (client-side, fit-to-content) and Turtle/OWL/JSON-LD via an Export menu.
- Business justification per node & relationship: separate field, agent-filled, editable in the Edit tab,
  hover-tooltip on the canvas, Kite template seeded with curated justifications.
- Manual authoring: Add Node / Add Relationship forms (Edit tab empty state) → live via new
  POST /api/ontologies/[id]/concepts | /relationships (tag-root parenting, dup guard, endpoint validation).
- Homepage Learn tab: explainer of the tool, ontologies, concept types, missions, business rules, key terms
  (alongside the Get started create/open flow).
- Live draft overlay: chat proposals now appear on the canvas as amber "draft" nodes/edges (not stored
  live until confirmed). Canvas toolbar Confirm all / Dismiss all; click a draft node to confirm just it;
  Staging tab stays for per-item control. New routes POST /api/sessions/[id]/promote-pending | reject-pending.
- Existing-graph awareness: the extraction prompt now lists the current ontology (this ontology + imported
  base, tag-roots excluded) so the agent reuses existing classes/relationships instead of duplicating them.
