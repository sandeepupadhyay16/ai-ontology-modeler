# Quickstart

## 1. New machine: install & first-time setup

Prerequisites:
- [Node.js LTS (v20.x)](https://nodejs.org/) — verify with `node -v` / `npm -v`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — verify with `docker --version`
- Git — verify with `git --version`
- **Do not install a native PostgreSQL server.** Docker provides Postgres for this project; a native install competing for port 5432 will cause `PrismaClientInitializationError: Authentication failed` errors.

Steps:

```powershell
git clone <your-repo-url> ai-ontology-modeler
cd ai-ontology-modeler

# Start Postgres via Docker
docker run --name postgres-ontology -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ontology_modeler -p 5432:5432 -d postgres:16-alpine
```

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ontology_modeler"
LM_STUDIO_URL="http://localhost:1234/v1"
```

Install dependencies and set up the database:

```powershell
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
```

Run it:

```powershell
npm run dev
```

Open `http://localhost:3006`.

Optional: for local AI generation instead of a cloud provider, install [LM Studio](https://lmstudio.ai/), load a model, and start its local server on port 1234 (matches `LM_STUDIO_URL` above). Otherwise configure a cloud provider key in the app's Settings panel.

---

## 2. Everyday use (once already installed)

```powershell
docker start postgres-ontology
npm run dev
```

Open `http://localhost:3006`.

To stop Postgres when done working:

```powershell
docker stop postgres-ontology
```

If port 5432 ever conflicts with another Postgres instance:

```powershell
docker ps -a | findstr postgres
netstat -ano | findstr :5432
```
