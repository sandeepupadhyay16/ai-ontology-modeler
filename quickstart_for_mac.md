# Quickstart — macOS

Get the AI Ontology Modeler running locally. App runs on **http://localhost:3006**.

For the full cross-platform reference (Windows, WSL2, native Postgres, publishing to Git), see [SETUP_GUIDE.md](./SETUP_GUIDE.md).

---

## Prerequisites

| Tool | Version | Check |
| :--- | :--- | :--- |
| Node.js | v18.17+ (v20/22 LTS recommended) | `node -v` |
| npm | v9+ | `npm -v` |
| Docker Desktop | any recent | `docker ps` |

Install Node via Homebrew if needed:

```bash
brew install node
```

Docker is the recommended way to run PostgreSQL. If you'd rather use a native Postgres install, see the Homebrew path in [SETUP_GUIDE.md](./SETUP_GUIDE.md#4-macos-setup-guide) and adjust `DATABASE_URL` accordingly.

---

## First run

Run these once, from the project root.

### 1. Start PostgreSQL

```bash
docker run --name postgres-ontology \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ontology_modeler \
  -p 5432:5432 \
  -d postgres:16-alpine
```

Confirm it's up:

```bash
docker ps
```

### 2. Create `.env`

There is **no `.env.example`** in this repo — create the file yourself:

```bash
cat > .env <<'EOF'
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ontology_modeler"
LM_STUDIO_URL="http://localhost:1234/v1"
EOF
```

### 3. Install dependencies

```bash
npm install
```

### 4. Set up the database

```bash
npx prisma generate      # generate the Prisma client
npx prisma migrate deploy # apply the committed migrations to create tables
npx tsx prisma/seed.ts    # load starter ontologies
```

> **Use `migrate`, not `db push`.** This project tracks its schema through committed
> migrations in `prisma/migrations/`. Applying them with `migrate deploy` keeps your local
> database's migration history in sync with the repo. Running `prisma db push` instead
> creates the tables but leaves *no* migration history, which later makes `prisma migrate dev`
> demand a destructive reset. If you have an older database that was set up with `db push`,
> see [Troubleshooting](#troubleshooting).

The seed **clears all existing tables first**, then loads the starter data. Expect roughly:

```
3 Ontologies · 35 Concepts · 33 Relationships · 11 CompetencyQuestions
3 Projects · 3 BusinessProcesses · 2 BusinessFunctions · 2 Organizations
```

### 5. Start the app

```bash
npm run dev
```

Open **http://localhost:3006**.

---

## Subsequent runs

Docker containers don't survive a Mac reboot unless restarted. The everyday sequence is:

```bash
docker start postgres-ontology   # no-op if already running
npm run dev
```

That's it. You do **not** need to re-run `npm install`, `prisma generate`, `migrate deploy`, or the seed script on a normal start.

### When you *do* need extra steps

| Situation | Run |
| :--- | :--- |
| Pulled changes that touched `package.json` | `npm install` |
| Pulled changes that touched `prisma/schema.prisma` or `prisma/migrations/` | `npx prisma generate && npx prisma migrate deploy` |
| Want to wipe and reload starter data | `npx tsx prisma/seed.ts` |

### Stopping

```
Ctrl+C          # stops the dev server
docker stop postgres-ontology   # optional; stops the database
```

Your data persists in the container across `docker stop` / `docker start`.

---

## Production build

```bash
npm run build
npm run start   # serves on port 3006
```

---

## Optional: local AI (LM Studio)

The app loads and browses fine without this, but **AI generation and refinement features will fail** until an LLM is configured.

1. Install and open [LM Studio](https://lmstudio.ai/).
2. Load a model (e.g. `qwen2.5-coder`, `llama-3.1-8b`).
3. Open the **Developer / Local Server** tab and start the server on port `1234`.

Verify it's reachable:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:1234/v1/models
# 200 = good; 000 = not running
```

Alternatively, skip LM Studio entirely and set a cloud provider (OpenAI, Anthropic, Google Gemini) with an API key in the app's **Settings / LLM Config** panel — no server restart required.

---

## Troubleshooting

**`Can't reach database server`**
The container isn't running. `docker ps` to check, `docker start postgres-ontology` to fix. If the container doesn't exist at all, re-run the `docker run` command from step 1.

**Port 3006 already in use**
Find and stop the process, or run on another port:

```bash
lsof -ti:3006 | xargs kill   # free the port
# or
npx next dev -p 3007
```

**Port 5432 already in use**
You likely have another Postgres (e.g. a Homebrew install) already listening. Either stop it (`brew services stop postgresql@16`) or map the container to a different host port (`-p 5433:5432`) and update `DATABASE_URL` to match.

**AI features hang or error**
No LLM is reachable. See the LM Studio section above, or switch providers in Settings / LLM Config.

**`/api/concepts` returns 404**
Expected — concepts are only exposed per-ID at `/api/concepts/[id]`, not as a collection.

**`prisma migrate dev` demands a reset ("All data will be lost") on an existing database**
Your database was set up with `prisma db push` (the old flow) and has no migration history, so
Prisma can't tell it already matches the schema. **Do not reset** if you have data you care
about. Baseline instead — mark the committed migrations as already applied without re-running
their SQL:

```bash
# confirm your live DB already matches the schema (empty output = in sync)
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script

# then baseline each committed migration (repeat for every folder in prisma/migrations/)
npx prisma migrate resolve --applied <migration_folder_name>
```

After baselining, `npx prisma migrate status` should report the database is up to date.
