# Post-plan refinements — Onboarding cutover + scope fix

Implemented by the assistant at the owner's request, after all 12 stages.

## 1. New ontologies use the conversational flow (onboarding cutover)
- `src/app/page.tsx` — removed the deprecated `ai-generate` auto-generation from the QuickStart
  blueprint flow: new ontologies are now created EMPTY (previously each objective's ontology was
  bulk-generated via the deprecated route). Updated the status text accordingly.
- `handleCreateOntology` now calls `loadOntologyData(newId)` after a single create, dropping the
  user straight into the modeler. `ModelerPanel` defaults to the `ai-modeler` tab, so a new empty
  ontology opens directly in the conversational ChatPanel flow (candidate → review → promote).
- Net effect: both create paths ("+ New Ontology" blueprint and single-create) produce empty,
  domain-scoped ontologies that are built by talking, not auto-stuffed by the deprecated engine.
  `ai-generate` now has no live caller from the primary UI.

## 2. CandidateConcept.scope fix
- The turns route already derived scope from the session's domain profile key; the gap was that a
  domain-less (GENERIC-profile) session produced a meaningless `extension:generic` module.
- `src/app/api/sessions/[id]/turns/route.ts` — scope is now `extension:<domainKey>` when the
  session has a recognized domain, and `core` when it doesn't (GENERIC): there is no real domain to
  extend into, so those candidates land in core rather than a noise "generic" extension.
- `prisma/schema.prisma` — `CandidateConcept.scope` default changed `extension:generic` → `core`
  (migration `20260728204909_scope_default_core`, a non-destructive `ALTER COLUMN ... SET DEFAULT`
  only — existing rows untouched).

## Verified
- `tsc --noEmit` clean; `npm run build` succeeds; migration is default-only (no data change).
- Onboarding is a UI change (removed fetch + auto-open) — not browser-tested here (no automation);
  recommend an owner smoke-test that "+ New Ontology" yields an empty ontology open on the AI
  Modeler tab.
- Scope derivation is a trivial ternary verified by build + inspection (a full turns run would burn
  Gemini quota for no added confidence).
