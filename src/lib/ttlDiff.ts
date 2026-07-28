/**
 * Stage 6 — serialize an approved ChangeSet into valid Turtle, scoped as a patch (idea.md
 * §4: "Output: a .ttl diff/patch file"), plus a deterministic human-readable "what changed"
 * summary (idea.md §8). Reuses scripts/export_rdf.py as the serializer — this module's job
 * is building the per-module JSON payload export_rdf.py expects, not re-implementing RDF
 * serialization.
 *
 * This is a PATCH, not a full-ontology snapshot: only the concepts/relationships/attributes
 * this specific ChangeSet's candidates actually produced (traced via
 * CandidateConcept.promotedConceptId/promotedRelationshipId and Attribute.addedInChangeSetId
 * — never "every Concept row that happens to exist"). Anything the patch references but
 * didn't itself create (an existing parent class, an existing relationship endpoint) is
 * included only as a reference stub (`external: true`) so export_rdf.py registers its URI
 * for subClassOf/domain/range resolution without re-asserting an already-existing class.
 *
 * Extension handling (IMPLEMENTATION_PLAN.md cross-cutting): concepts/relationships are
 * grouped by the actual Ontology row (module) they were promoted into, one export_rdf.py
 * call per module — extension concepts land in the extension's file, never core's. Each
 * extension module's file carries `owl:imports` pointing at its core ontology's namespace.
 *
 * Tag-root canonicalization (required, carried forward from the Stage 5 review): a promoted
 * concept's parent is very often one of Stage 5's auto-created per-module Layer 1 anchor
 * concepts (typeFields.marker === TAG_ROOT_MARKER — see src/lib/upperOntology.ts). These are
 * NEVER serialized as their own per-module class. Instead every reference to a tag-root
 * resolves to upperOntology.ts's canonicalLayer1Iri(tag) — the SAME IRI regardless of which
 * module's tag-root stood in for it — so all modules' "Agent" concepts subClassOf the one
 * shared Layer 1 Agent, never module-invented lookalikes.
 */
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { db } from './db';
import { isTagRootConcept, canonicalLayer1Iri } from './upperOntology';

const execAsync = promisify(exec);

export interface ChangeSetTtlFile {
  ontologyId: string;
  moduleScope: string;
  namespaceUri: string;
  filename: string;
  ttl: string;
}

export interface ChangeSetTtlResult {
  ttlDiff: string;
  ttlFiles: Record<string, ChangeSetTtlFile>;
  diffSummary: string;
}

function conceptIri(namespaceUri: string, label: string): string {
  const base = namespaceUri.endsWith('#') || namespaceUri.endsWith('/') ? namespaceUri : `${namespaceUri}#`;
  return `${base}${label.replace(/\s+/g, '')}`;
}

function slugifyFilename(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'module'}.ttl`;
}

async function runExportScript(payload: Record<string, any>): Promise<string> {
  const tempFilePath = join(os.tmpdir(), `tse_ttl_diff_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  await writeFile(tempFilePath, JSON.stringify(payload, null, 2));
  try {
    const scriptPath = join(process.cwd(), 'scripts', 'export_rdf.py');
    const { stdout, stderr } = await execAsync(`python3 "${scriptPath}" "${tempFilePath}" turtle`);
    if (stderr && stderr.trim() && !stdout.trim()) {
      throw new Error(`export_rdf.py failed: ${stderr}`);
    }
    return stdout;
  } finally {
    await unlink(tempFilePath).catch(() => {});
  }
}

interface ModulePayload {
  ontology: { id: string; name: string; namespaceUri: string; moduleScope: string; extendsOntology: { namespaceUri: string } | null };
  concepts: Record<string, any>[];
  relationships: Record<string, any>[];
  seenConceptIds: Set<string>;
  seenLayer1Tags: Set<string>;
}

export async function generateChangeSetTtl(changeSetId: string): Promise<ChangeSetTtlResult> {
  const changeSet = await db.changeSet.findUnique({ where: { id: changeSetId } });
  if (!changeSet) throw new Error('ChangeSet not found');

  const candidates = await db.candidateConcept.findMany({ where: { changeSetId } });

  const newConceptIds = candidates
    .filter((c) => c.decision === 'ACCEPTED' && c.promotedConceptId)
    .map((c) => c.promotedConceptId as string);
  const mergeTargetIds = Array.from(new Set(
    candidates.filter((c) => c.decision === 'MERGED' && c.promotedConceptId).map((c) => c.promotedConceptId as string)
  ));
  const relationshipIds = candidates
    .filter((c) => c.promotedRelationshipId)
    .map((c) => c.promotedRelationshipId as string);

  const newConcepts = await db.concept.findMany({
    where: { id: { in: newConceptIds } },
    include: {
      ontology: { include: { extendsOntology: { select: { namespaceUri: true } } } },
      parentConcept: { include: { ontology: { include: { extendsOntology: { select: { namespaceUri: true } } } } } },
      attributes: true,
    },
  });
  const mergeTargets = await db.concept.findMany({
    where: { id: { in: mergeTargetIds } },
    include: { ontology: { include: { extendsOntology: { select: { namespaceUri: true } } } } },
  });
  const newAttributesOnMergeTargets = await db.attribute.findMany({
    where: { addedInChangeSetId: changeSetId, conceptId: { in: mergeTargetIds } },
  });
  const relationships = await db.relationship.findMany({
    where: { id: { in: relationshipIds } },
    include: {
      source: { include: { ontology: { include: { extendsOntology: { select: { namespaceUri: true } } } } } },
      target: { include: { ontology: { include: { extendsOntology: { select: { namespaceUri: true } } } } } },
      ontology: { include: { extendsOntology: { select: { namespaceUri: true } } } },
    },
  });

  const newConceptIdSet = new Set(newConcepts.map((c) => c.id));
  const modules = new Map<string, ModulePayload>();

  function getModule(ontology: ModulePayload['ontology']): ModulePayload {
    let m = modules.get(ontology.id);
    if (!m) {
      m = { ontology, concepts: [], relationships: [], seenConceptIds: new Set(), seenLayer1Tags: new Set() };
      modules.set(ontology.id, m);
    }
    return m;
  }

  /**
   * Ensures `concept` (or the canonical Layer 1 class it stands in for) is resolvable — as a
   * parentConceptId/sourceId/targetId — WITHIN `intoModule`'s own payload specifically, since
   * each module is serialized via its own independent export_rdf.py call with its own
   * concept_uri_map. `intoModule` is deliberately the referencing module, not
   * `concept.ontology` — a relationship can cross modules (extension -> core is allowed), so
   * the endpoint's stub must land in whichever module's payload actually needs to resolve it,
   * which is not always the endpoint's own home module. Never re-declares an already-existing
   * or cross-module concept as its own class here — reference-only (`external: true`).
   */
  function registerReference(intoModule: ModulePayload, concept: any): string {
    if (isTagRootConcept(concept)) {
      const tag = concept.label;
      const sentinelId = `__layer1__${tag}`;
      if (!intoModule.seenLayer1Tags.has(tag)) {
        intoModule.seenLayer1Tags.add(tag);
        intoModule.concepts.push({
          id: sentinelId,
          label: tag,
          uri: canonicalLayer1Iri(tag),
          description: 'Adopted Layer 1 upper-ontology class (idea.md: adopted, never modified) — the same class shared across every module, not owned by this ontology.',
          attributes: [],
        });
      }
      return sentinelId;
    }
    if (!intoModule.seenConceptIds.has(concept.id)) {
      intoModule.seenConceptIds.add(concept.id);
      const homeModule = getModule(concept.ontology);
      if (homeModule !== intoModule || !newConceptIdSet.has(concept.id)) {
        // Either genuinely external to this changeset's delta, or one of this changeset's
        // own new concepts but referenced from a DIFFERENT module's payload (cross-module
        // relationship) — either way, a reference-only stub, not a redeclaration.
        pushExternalStub(intoModule, concept);
      }
    }
    return concept.id;
  }

  function pushExternalStub(m: ModulePayload, concept: any) {
    m.concepts.push({
      id: concept.id,
      label: concept.label,
      uri: concept.uri || conceptIri(concept.ontology.namespaceUri, concept.label),
      external: true,
      attributes: [],
    });
  }

  // New concepts: full declarations, parent resolved (tag-root canonicalized or external stub).
  for (const concept of newConcepts) {
    const m = getModule(concept.ontology);
    m.seenConceptIds.add(concept.id);
    const parentConceptId = concept.parentConcept ? registerReference(m, concept.parentConcept) : null;
    m.concepts.push({
      id: concept.id,
      label: concept.label,
      description: concept.description || '',
      uri: concept.uri || null,
      parentConceptId,
      attributes: concept.attributes.map((a: any) => ({ name: a.name, datatype: a.datatype, description: a.description || '' })),
    });
  }

  // Merge targets: external stub, carrying only the NEW attributes this changeset added.
  for (const target of mergeTargets) {
    const newAttrs = newAttributesOnMergeTargets.filter((a) => a.conceptId === target.id);
    if (newAttrs.length === 0) continue; // nothing new to assert about this concept in the TTL
    const m = getModule(target.ontology);
    m.seenConceptIds.add(target.id);
    m.concepts.push({
      id: target.id,
      label: target.label,
      uri: target.uri || conceptIri(target.ontology.namespaceUri, target.label),
      external: true,
      attributes: newAttrs.map((a) => ({ name: a.name, datatype: a.datatype, description: a.description || '' })),
    });
  }

  // Relationships: source/target resolved the same way (external stub if outside the delta).
  for (const rel of relationships) {
    const m = getModule(rel.ontology);
    const sourceId = registerReference(m, rel.source);
    const targetId = registerReference(m, rel.target);
    m.relationships.push({ name: rel.name, description: rel.description || '', sourceId, targetId, uri: rel.uri || null });
  }

  const ttlFiles: Record<string, ChangeSetTtlFile> = {};
  const parts: string[] = [];
  for (const [ontologyId, m] of modules) {
    if (m.concepts.length === 0 && m.relationships.length === 0) continue;
    const payload = {
      name: m.ontology.name,
      namespaceUri: m.ontology.namespaceUri,
      description: `Stage 6 patch — ChangeSet ${changeSetId}`,
      owlImports: m.ontology.moduleScope !== 'core' && m.ontology.extendsOntology ? [m.ontology.extendsOntology.namespaceUri] : [],
      concepts: m.concepts,
      relationships: m.relationships,
    };
    const ttl = await runExportScript(payload);
    const filename = slugifyFilename(m.ontology.name);
    ttlFiles[ontologyId] = { ontologyId, moduleScope: m.ontology.moduleScope, namespaceUri: m.ontology.namespaceUri, filename, ttl };
    parts.push(`### FILE: ${filename} (module: ${m.ontology.moduleScope}, namespace: ${m.ontology.namespaceUri}) ###\n${ttl}`);
  }

  const diffSummary = buildDiffSummary({ newConcepts, mergeTargets, newAttributesOnMergeTargets, relationships });

  return { ttlDiff: parts.join('\n\n'), ttlFiles, diffSummary };
}

function buildDiffSummary(args: {
  newConcepts: any[];
  mergeTargets: any[];
  newAttributesOnMergeTargets: any[];
  relationships: any[];
}): string {
  const { newConcepts, mergeTargets, newAttributesOnMergeTargets, relationships } = args;
  const lines: string[] = [];

  if (newConcepts.length > 0) {
    lines.push(`Added ${newConcepts.length} new concept(s):`);
    for (const c of newConcepts) {
      const parentLabel = c.parentConcept ? (isTagRootConcept(c.parentConcept) ? `Layer 1 ${c.parentConcept.label}` : c.parentConcept.label) : null;
      const parentNote = parentLabel ? `, extends ${parentLabel}` : '';
      const attrNote = c.attributes.length > 0 ? `, ${c.attributes.length} attribute(s)` : '';
      lines.push(`  - ${c.label} (${c.conceptType})${parentNote}${attrNote} — in ${c.ontology.moduleScope}`);
    }
  }

  if (relationships.length > 0) {
    lines.push(`Added ${relationships.length} new relationship(s):`);
    for (const r of relationships) {
      lines.push(`  - ${r.source.label} --[${r.name}]--> ${r.target.label}`);
    }
  }

  if (mergeTargets.length > 0) {
    lines.push(`Merged ${mergeTargets.length} candidate(s) into existing concepts:`);
    for (const t of mergeTargets) {
      const attrs = newAttributesOnMergeTargets.filter((a) => a.conceptId === t.id);
      const attrNote = attrs.length > 0 ? `, added attribute(s): ${attrs.map((a) => a.name).join(', ')}` : ', no new attributes';
      lines.push(`  - merged into "${t.label}"${attrNote}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'No changes in this change set.';
}
