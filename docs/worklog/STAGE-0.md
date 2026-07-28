# Stage 0 — Baseline verification

## Result
App builds, migrates, and runs. Baseline is green.

## Environment
- Node v25.9.0, npm 11.12.1
- Postgres 16-alpine running in Docker (`postgres-ontology` container, already up before this session)
- `.env` already present with `DATABASE_URL` pointing at `ontology_modeler` on `localhost:5432`, and `LM_STUDIO_URL`

## Steps run
1. `npm install` — already up to date, no changes needed.
2. `npx prisma generate` — succeeded cleanly.
3. `npx prisma migrate dev` — **failed the first time**, see "Issue found and fixed" below.
4. `npm run build` — succeeded, all existing routes compiled (App Router, 40 API routes + root page).
5. Confirmed the app serves: a `next-server` process from an earlier session was already listening on port 3006; `GET /` and `GET /api/ontologies` both returned `HTTP 200`. Did not start a second instance (would have hit `EADDRINUSE`) and did not kill the existing process since it wasn't mine to assume was idle.

## Issue found and fixed: migration history didn't match the live DB

**What happened:** `npx prisma migrate dev` refused to run and demanded `migrate reset` ("We need to reset the public schema... All data will be lost"). The live DB had real seed data (3 Ontologies / 35 Concepts / 33 Relationships / 11 CompetencyQuestions), so per the working agreement I did not run `migrate reset` and investigated instead.

**Root cause:** `quickstart_for_mac.md` (untracked, new in this branch) documents a `db push`-based setup flow, not `migrate dev`. The live DB was created and evolved via `prisma db push` directly against `schema.prisma`, so:
- No `_prisma_migrations` history table existed at all.
- The two committed migrations (`20260719150118_init`, `20260719152602_add_templates`) only capture an **early snapshot** of the schema — `schema.prisma` has since grown far beyond them (all the `Organization`/`BusinessFunction`/`BusinessProcess`/`BusinessSolution`/`System`/`DataSource`/`Perspective`/`CausalCycle`/etc. models and various added columns). Those tables/columns already existed live (via `db push`) but were never captured as migration files.

I confirmed via `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` that the **live DB already matches `schema.prisma` exactly** (empty diff) — so there was no actual schema drift to reconcile, only a missing/incomplete migration history.

**Fix (non-destructive, no data touched):**
1. `npx prisma migrate resolve --applied` for both existing migrations, to seed `_prisma_migrations` history (schema already satisfied their contents).
2. Confirmed `migrate dev` still detected drift after that — expected, because the two migration files alone don't produce the current schema.
3. Generated the missing SQL diff (old-migrations-state → current `schema.prisma`) using `prisma migrate diff --from-migrations --to-schema --script`. This requires a shadow database in Prisma 7's config, so I temporarily:
   - created a throwaway `ontology_modeler_shadow` DB in the same Postgres container,
   - added `datasource.shadowDatabaseUrl` to `prisma.config.ts` pointed at it via an env var,
   - ran the diff,
   - reverted `prisma.config.ts` and dropped the shadow DB immediately after (no permanent config change, no orphaned resources).
4. Wrote that SQL into a new named, additive migration: `prisma/migrations/20260727154748_sync_migration_history_with_db_push_state/migration.sql`.
5. Marked it applied via `migrate resolve --applied` (not executed against the live DB — the DB already has this state; running the raw `CREATE TABLE`/`ADD COLUMN` SQL again would have failed or been destructive against existing tables).
6. Verified: `migrate status` → "Database schema is up to date!"; `migrate dev` → "Already in sync, no schema change or pending migration was found." Row counts unchanged (3/35/33/11) before and after.

**Why this approach over alternatives:**
- Rejected `prisma migrate reset`: would drop all seed data. Explicitly disallowed by the working agreement without flagging first, and there was a fully non-destructive path available.
- Rejected leaving migration history broken/unbaselined: every subsequent stage's plan explicitly requires `npx prisma migrate dev --name <...>` for new tables — that command would never get past the drift check without this fix.
- This is a one-time repair of pre-existing drift from the `db push`-based quickstart flow, not a Stage 1 concern — Stage 1 can now assume a clean, trustworthy migration history going forward.

## Migrations added
- `20260727154748_sync_migration_history_with_db_push_state` — **not destructive**. Captures schema that already existed live via `db push`; applied via `migrate resolve --applied` (recorded in history, not re-executed against the live DB). Brings migration history in line with reality so future `migrate dev` calls work normally.

## Verification summary
| Check | Result |
|---|---|
| `npm install` | up to date |
| `npx prisma generate` | success |
| `npx prisma migrate status` | up to date, 3 migrations |
| `npx prisma migrate dev` | no-op, in sync |
| Seed data intact (Ontology/Concept/Relationship/CompetencyQuestion counts) | 3 / 35 / 33 / 11 — unchanged throughout |
| `npm run build` | success, all routes compiled |
| App serves | `GET /` → 200, `GET /api/ontologies` → 200 |

## Known gaps / TODOs carried forward
- None blocking. Note for future stages: this repo's documented dev workflow (`quickstart_for_mac.md`) uses `db push`, but the plan requires `migrate dev` from Stage 1 onward — worth keeping in mind that `quickstart_for_mac.md` may need a note added (not done here, out of scope for Stage 0) once migrations become the source of truth.

## Ready for review
Stage 0 baseline is green. Awaiting review before starting Stage 1 (candidate staging + governance data model).
