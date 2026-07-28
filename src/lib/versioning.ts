/**
 * Stage 10 — versioning & git (idea.md §8: "every accepted change set becomes a git commit
 * against the ontology repo, with a human-readable diff... Output: a PR-style change summary").
 *
 * The ontology store is a SEPARATE git repo (default <cwd>/ontology-store, override with
 * ONTOLOGY_STORE_DIR) — we never commit generated Turtle into the application's own repo. Each
 * validated change set writes its per-module .ttl files there and commits them; the commit sha
 * and a PR-style changelog are recorded on an OntologyVersion row (one per change set — the
 * schema enforces changeSetId @unique).
 *
 * Gating: requires a VALIDATED change set (Stage 9 must have passed).
 */
import { db } from './db';
import { generateChangeSetTtl } from './ttlDiff';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface VersionResult {
  changeSetId: string;
  versionId: string;
  gitCommitSha: string;
  changelog: string;
  files: string[];
}

function storeDir(): string {
  return process.env.ONTOLOGY_STORE_DIR || join(process.cwd(), 'ontology-store');
}

// Isolated, non-interactive git in the store dir. `-c user.*` avoids depending on global config.
async function git(dir: string, args: string): Promise<string> {
  const { stdout } = await execAsync(
    `git -c user.name="Ontology Modeler" -c user.email="modeler@localhost" -C "${dir}" ${args}`
  );
  return stdout.trim();
}

function buildChangelog(summary: string, diffSummary: string, files: string[]): string {
  return [
    `# Change set ${summary}`,
    '',
    '## What changed',
    diffSummary || '(no diff summary)',
    '',
    '## Files',
    ...files.map((f) => `- ${f}`),
  ].join('\n');
}

export async function versionChangeSet(changeSetId: string): Promise<VersionResult> {
  const changeSet = await db.changeSet.findUnique({
    where: { id: changeSetId },
    include: { session: { include: { ontology: true } } },
  });
  if (!changeSet) throw new Error('ChangeSet not found');
  if (changeSet.status !== 'VALIDATED') {
    throw new Error(`ChangeSet must be VALIDATED to version (is ${changeSet.status})`);
  }

  const existing = await db.ontologyVersion.findUnique({ where: { changeSetId } });
  if (existing?.gitCommitSha) {
    return {
      changeSetId,
      versionId: existing.id,
      gitCommitSha: existing.gitCommitSha,
      changelog: existing.changelog || '',
      files: [],
    };
  }

  // Ensure TTL exists (Stage 6). Regenerate if it wasn't produced/persisted yet.
  let ttlFiles = (changeSet.ttlFiles as any) || null;
  let diffSummary = changeSet.diffSummary || '';
  if (!ttlFiles || Object.keys(ttlFiles).length === 0) {
    const gen = await generateChangeSetTtl(changeSetId);
    ttlFiles = gen.ttlFiles;
    diffSummary = gen.diffSummary;
    await db.changeSet.update({
      where: { id: changeSetId },
      data: { ttlDiff: gen.ttlDiff, ttlFiles: gen.ttlFiles as any, diffSummary: gen.diffSummary },
    });
  }

  const dir = storeDir();
  await mkdir(dir, { recursive: true });
  if (!existsSync(join(dir, '.git'))) {
    await git(dir, 'init -q');
  }

  const files: string[] = [];
  for (const key of Object.keys(ttlFiles)) {
    const file = ttlFiles[key] as { filename: string; ttl: string };
    await writeFile(join(dir, file.filename), file.ttl);
    files.push(file.filename);
  }
  const changelog = buildChangelog(changeSet.summary || changeSetId, diffSummary, files);
  await writeFile(join(dir, `CHANGELOG-${changeSetId}.md`), changelog);
  files.push(`CHANGELOG-${changeSetId}.md`);

  await git(dir, 'add -A');
  // --allow-empty so re-running on identical content still yields a versioned commit.
  await git(dir, `commit --allow-empty -q -m "ChangeSet ${changeSet.summary || changeSetId}"`);
  const sha = await git(dir, 'rev-parse HEAD');

  const version = await db.ontologyVersion.upsert({
    where: { changeSetId },
    create: { changeSetId, ontologyId: changeSet.session.ontologyId, gitCommitSha: sha, changelog },
    update: { gitCommitSha: sha, changelog },
  });

  return { changeSetId, versionId: version.id, gitCommitSha: sha, changelog, files };
}
