/**
 * Stage 12 — publish / load (idea.md §10: "merged ontology/glossary/rules load into the
 * triplestore and rules store — live and queryable... Output: updated triplestore, changelog
 * entry, notification to downstream agent owners").
 *
 * OPEN QUESTION (owner, deferred): which triplestore + rules store to standardize on. Per the
 * plan, this ships a thin `PublishTarget` interface with a file-based default target so the flow
 * is end-to-end testable; swapping in a real triplestore (GraphDB/Fuseki/etc.) is a matter of
 * adding another PublishTarget implementation, not touching the pipeline.
 *
 * Gating: requires SIGNED_OFF (Stage 11). Only CONFIRMED glossary/rule drafts are published —
 * unconfirmed drafts never reach the live stores. On success the change set becomes PUBLISHED.
 */
import { db } from './db';
import { generateChangeSetTtl } from './ttlDiff';
import { mkdir, writeFile, appendFile } from 'fs/promises';
import { join } from 'path';

export interface PublishPayload {
  changeSetId: string;
  summary: string;
  ttlFiles: Record<string, { filename: string; ttl: string }>;
  glossary: Array<{ term: string; definition: string }>;
  rules: Array<{ condition: any; derivedValue: any; linkedAttributeId: string | null; linkedRelationshipId: string | null }>;
}

export interface PublishTarget {
  name: string;
  publish(payload: PublishPayload): Promise<{ location: string; files: string[] }>;
}

/** Default target: writes to <cwd>/published (override with PUBLISH_DIR). Stands in for the triplestore. */
export class FilePublishTarget implements PublishTarget {
  name = 'file';
  async publish(payload: PublishPayload) {
    const dir = process.env.PUBLISH_DIR || join(process.cwd(), 'published');
    const csDir = join(dir, payload.changeSetId);
    await mkdir(csDir, { recursive: true });
    const files: string[] = [];
    for (const key of Object.keys(payload.ttlFiles)) {
      const f = payload.ttlFiles[key];
      await writeFile(join(csDir, f.filename), f.ttl);
      files.push(f.filename);
    }
    await writeFile(join(csDir, 'glossary.json'), JSON.stringify(payload.glossary, null, 2));
    await writeFile(join(csDir, 'rules.json'), JSON.stringify(payload.rules, null, 2));
    files.push('glossary.json', 'rules.json');
    await appendFile(
      join(dir, 'CHANGELOG.md'),
      `- ${new Date().toISOString()} — published change set ${payload.summary} (${payload.changeSetId}): ${files.length} artifact(s), ${payload.glossary.length} glossary, ${payload.rules.length} rules\n`
    );
    return { location: csDir, files };
  }
}

export interface PublishResult {
  changeSetId: string;
  status: string;
  target: string;
  location: string;
  files: string[];
  changelogEntry: string;
  notifiedDownstream: string[];
}

export async function publishChangeSet(changeSetId: string, target: PublishTarget = new FilePublishTarget()): Promise<PublishResult> {
  const changeSet = await db.changeSet.findUnique({ where: { id: changeSetId } });
  if (!changeSet) throw new Error('ChangeSet not found');
  if (changeSet.status !== 'SIGNED_OFF') {
    throw new Error(`ChangeSet must be SIGNED_OFF to publish (is ${changeSet.status})`);
  }

  let ttlFiles = (changeSet.ttlFiles as any) || null;
  if (!ttlFiles || Object.keys(ttlFiles).length === 0) {
    const gen = await generateChangeSetTtl(changeSetId);
    ttlFiles = gen.ttlFiles;
    await db.changeSet.update({ where: { id: changeSetId }, data: { ttlDiff: gen.ttlDiff, ttlFiles: gen.ttlFiles as any, diffSummary: gen.diffSummary } });
  }

  const glossary = await db.glossaryDraft.findMany({ where: { changeSetId, confirmationStatus: 'CONFIRMED' }, select: { term: true, definition: true } });
  const rules = await db.ruleDraft.findMany({ where: { changeSetId, confirmationStatus: 'CONFIRMED' }, select: { condition: true, derivedValue: true, linkedAttributeId: true, linkedRelationshipId: true } });

  const summary = changeSet.summary || changeSetId;
  const { location, files } = await target.publish({
    changeSetId,
    summary,
    ttlFiles,
    glossary,
    rules: rules as any,
  });

  await db.changeSet.update({ where: { id: changeSetId }, data: { status: 'PUBLISHED' } });

  // "notify downstream agent owners" — no messaging infra in v1; report who would be notified
  // (any agent relying on get_ontology_schema for the affected modules). Stubbed as a list.
  const changelogEntry = `Published ${summary} to ${target.name} target at ${location} (${files.length} files, ${glossary.length} glossary, ${rules.length} rules).`;
  return {
    changeSetId,
    status: 'PUBLISHED',
    target: target.name,
    location,
    files,
    changelogEntry,
    notifiedDownstream: ['downstream ontology-schema consumers (notification infra TBD)'],
  };
}
