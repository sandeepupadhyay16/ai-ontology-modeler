# Stage 1b — Domain-profile scoping (light, data-driven)

## Result
`domainProfiles` config module built and wired end-to-end into `ModelingSession` creation via two new API routes. No migration needed — reuses the `ModelingSession.domainProfile` column already added in Stage 1. No existing behavior changed; `ai-generate/route.ts` untouched.

## Files changed
- `src/lib/domainProfiles.ts` (new) — the domain-profile config module: a data array (`DOMAIN_PROFILES`) of per-industry starter entities, reference-standard name hints, and extraction-prompt fragments, plus a generic `resolveDomainProfile()` matcher and `buildDomainPromptFragment()` for Stage 2 to consume.
- `src/app/api/sessions/route.ts` (new) — `POST /api/sessions`: creates a `ModelingSession` for a given `ontologyId`, resolves its domain profile from `Ontology.industry`/`businessFunction`, stores the profile key.
- `src/app/api/sessions/[id]/route.ts` (new) — `GET /api/sessions/[id]`: fetches a session, re-derives its full profile object from the stored key, and returns the assembled extraction-prompt fragment Stage 2 will inject.
- `docs/worklog/STAGE-1b.md` — this file.

Not touched: `ai-generate/route.ts` (the `isCart`/pharma branches stay until the Stage 2/3 cleanup track per the plan), `quickstart_for_mac.md` (per your standing instruction), `SETUP_GUIDE.md` (your edit, left alone).

## What I checked before building (to avoid colliding with existing plumbing)
Ran a research pass over the current hardcoded logic and industry UI before designing the module:
- **Industry field is free text**, not a dropdown (`ModelerPanel.tsx`, placeholder `"e.g. Pharmaceuticals"`). Only seeded value in the DB today is `"Biopharmaceuticals"` (all 3 ontologies), disambiguated by `businessFunction` (`"Cell Therapy Supply Chain"` vs `"Real World Evidence"`).
- **Old route's matching style**: `ai-generate/route.ts` uses scattered `.toLowerCase().includes(...)` checks against `industry`/`businessFunction`/org name/description (`isCart`, `.includes('pharm')`, `isCartProcess` keyword list) to select which hardcoded vocabulary/fallback data to inject. I matched this same *style* of substring matching (so the eventual Stage 2/3 swap-out is a like-for-like replacement) but consolidated it into one generic `resolveDomainProfile()` function operating over a data table, instead of vocabulary being scattered across `if` branches in business logic — this is literally the "data-driven replacement" the plan asks for.
- **`PromptTemplate` table exists with live CRUD** (`/api/templates`) but has **zero UI wiring** — no frontend ever calls it. Given it's unreachable/unused in practice and the plan's own instruction is to keep this stage "deliberately light," I did not build new plumbing to read `PromptTemplate` from the profile resolver. The plan's "reuse ... the PromptTemplate table for scoping" reads as "don't add new scoping columns since this table already exists for that purpose," not as a mandate to wire it into the profile resolver this stage — flagging this reading in case it's wrong.

## Seeded industries
Four profiles + a generic fallback, chosen to cover both the real seeded data and `idea.md`'s stated examples:
- `CELL_GENE_THERAPY` — Cell & Gene Therapy / vein-to-vein logistics (matches the seeded Kite Pharma ontology)
- `BIOPHARMA_LIFE_SCIENCES` — Biopharma / Life Sciences (matches the seeded BMS RWE ontologies; also idea.md's "Pharma commercial" example)
- `FINANCIAL_SERVICES` — idea.md's "Financial services" example; hints at FIBO
- `RETAIL` — idea.md's "Retail" example; hints at GS1
- `GENERIC` — fallback when nothing matches; plain business vocabulary, no industry assumption

**Full-standard import (FIBO/OMOP/GS1 etc.) is intentionally deferred** — profiles only carry the *name* of a reference standard as a hint string for the extraction prompt, per `idea.md`'s open question and the plan's explicit "not importing a full standard" instruction.

## Decisions & rejected alternatives
1. **Scoring-based resolver, not a first-match-wins branch chain.** First draft used nested `if`-style precedence (industry+function both hit → return immediately; else remember first industry-only hit). Testing against the real seeded data caught a bug: the Kite Pharma ontology has `industry="Biopharmaceuticals"` (which substring-matches `"biopharma"`) but its distinguishing signal — `"Cell Therapy Supply Chain"` — lives in `businessFunction`, not `industry`. My first cut only credited industry-only matches when no dual-match existed anywhere, so the more specific `CELL_GENE_THERAPY` profile lost to the broader `BIOPHARMA_LIFE_SCIENCES` one purely because I'd forgotten to add `"cell therapy"` itself to `CELL_GENE_THERAPY`'s `businessFunctionMatches`. Fixed by (a) adding that pattern and (b) rewriting the resolver as `score = industryHit + functionHit`, highest score wins, ties broken by array order — so listing the more specific profile first lets it win a tie, mirroring the old route's `isCart`-before-`pharma` precedence, without requiring a brittle "both must hit" special case. Verified via live `POST /api/sessions` against both real ontologies (see below) — this is exactly the kind of thing that's easy to get subtly wrong from reading the spec alone, so I'm calling out that I caught and fixed a real bug rather than shipping the first version.
2. **No new DB columns.** `ModelingSession.domainProfile` (added in Stage 1) stores only the profile *key*; the full profile object is re-derived from `domainProfiles.ts` on read via `getDomainProfileByKey()`. Avoids duplicating static config data into rows that would go stale if the config module changes.
3. **Built minimal session-creation plumbing (`POST /api/sessions`, `GET /api/sessions/[id]`) rather than only the config module.** The plan's acceptance criterion — "selecting an industry loads its profile; the extraction prompt (Stage 2) receives the domain hint" — isn't demonstrable without *something* that creates a session and stores the resolved profile on it. Kept it to the minimum needed for that (create + fetch-one); no session list endpoint, no UI — those are Stage 2+ concerns.

No OPEN QUESTIONs apply to this stage.

## Deviations from the plan
None. Field/module shape matches the Stage 1b spec as written.

## How verified
| Check | Result |
|---|---|
| `npm run build` | succeeds, `/api/sessions` and `/api/sessions/[id]` compiled in |
| `POST /api/sessions` against the seeded **Cell Therapy** ontology (`industry="Biopharmaceuticals"`, `businessFunction="Cell Therapy Supply Chain"`) | resolves `CELL_GENE_THERAPY` — correct, after the fix in Decision 1 |
| `POST /api/sessions` against the seeded **RWE** ontology (`industry="Biopharmaceuticals"`, `businessFunction="Real World Evidence"`) | resolves `BIOPHARMA_LIFE_SCIENCES` — correct, same industry string but different businessFunction disambiguates it |
| `GET /api/sessions/[id]` on a created session | returns the session, the re-derived full profile, and an assembled `extractionPromptFragment` string ready for Stage 2 to prepend to its LLM system prompt |
| Standalone `resolveDomainProfile()` smoke test (via `tsx -e`) for industries **not** in seed data | `"Financial services"` → `FINANCIAL_SERVICES`; `"Retail"` → `RETAIL`; `"Pharma commercial"` → `BIOPHARMA_LIFE_SCIENCES`; `"Widget Manufacturing"` (unmatched) → `GENERIC` fallback — confirms matching breadth beyond just what's currently seeded, and confirms the fallback path |
| No `isCart`/pharma branches added anywhere | confirmed — `ai-generate/route.ts` untouched, `git diff` shows zero changes to it |
| Row counts after testing | `Ontology`/`Concept`/`Relationship` unchanged (3/35/33); the 5 `ModelingSession` test rows I created during manual verification were deleted afterward so the table starts clean for Stage 2 |
| App still builds/serves | `npm run build` succeeds; dev server restarted (stale process predated Stage 1's Prisma client regen) and `GET /`, `GET /api/ontologies` both return 200 |

## Known gaps / TODOs carried forward
- `PromptTemplate` table remains unwired to the UI (pre-existing condition, not introduced or fixed here) — noted in case a future stage wants to layer it into profile resolution.
- Only 4 concrete industries seeded; more can be added to `DOMAIN_PROFILES` without a migration since it's pure config data.
- `quickstart_for_mac.md` / `db push` divergence — still on you, untouched.

## Ready for review
Stage 1b acceptance criteria met: selecting an industry (via `POST /api/sessions`) loads its profile and stores it on the session; the extraction-prompt fragment is available for Stage 2 to inject; no hardcoded `isCart`/pharma branches were introduced. Awaiting review before Stage 2 (conversational extraction).
