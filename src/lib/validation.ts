/**
 * Stage 9 — validation wired into the change-set flow (idea.md §7: "SHACL shape validation /
 * consistency check — the agent reports any failure in plain language... rather than surfacing
 * a raw validator error. Output: pass/fail with specific issues surfaced — never a silent merge").
 *
 * Two checks, both deterministic/auditable (not LLM judgment):
 *   1. One-way module dependency (Extension handling invariant): a `core` concept may not have
 *      a relationship pointing at an `extension:<domain>` concept. Enforced in TS.
 *   2. SHACL / RDFS consistency via scripts/validate_shacl.py (pyshacl) over the affected
 *      modules' combined graph.
 *
 * Gating: validation only runs on an APPROVED (or re-validated) change set. On success the
 * change set advances to VALIDATED; on failure it stays put and the issues are returned — sign-off
 * (Stage 11) requires VALIDATED, so a failing change set can never reach publish.
 */
import { db } from './db';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ValidationIssue {
  severity: 'HIGH' | 'MEDIUM';
  code: string;
  message: string;
}

export interface ValidationResult {
  changeSetId: string;
  conforms: boolean;
  status: string;
  issues: ValidationIssue[];
}

function isCore(moduleScope: string | null | undefined): boolean {
  return (moduleScope || 'core') === 'core';
}
function isExtension(moduleScope: string | null | undefined): boolean {
  return (moduleScope || '').startsWith('extension');
}

async function runShaclScript(payload: { concepts: any[]; relationships: any[] }): Promise<{ conforms: boolean; report: string }> {
  const tempFilePath = join(os.tmpdir(), `tse_validate_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  await writeFile(tempFilePath, JSON.stringify(payload, null, 2));
  try {
    const scriptPath = join(process.cwd(), 'scripts', 'validate_shacl.py');
    const { stdout, stderr } = await execAsync(`python3 "${scriptPath}" "${tempFilePath}"`);
    if (stderr && stderr.trim() && !stdout.trim()) {
      throw new Error(`validate_shacl.py failed: ${stderr}`);
    }
    const parsed = JSON.parse(stdout);
    if (parsed.error) throw new Error(`validate_shacl.py: ${parsed.error}`);
    return { conforms: !!parsed.conforms, report: parsed.report || '' };
  } finally {
    await unlink(tempFilePath).catch(() => {});
  }
}

export async function validateChangeSet(changeSetId: string): Promise<ValidationResult> {
  const changeSet = await db.changeSet.findUnique({ where: { id: changeSetId } });
  if (!changeSet) throw new Error('ChangeSet not found');
  if (!['APPROVED', 'VALIDATED'].includes(changeSet.status)) {
    throw new Error(`ChangeSet must be APPROVED or VALIDATED to validate (is ${changeSet.status})`);
  }

  // Affected modules = the ontologies this change set actually promoted into.
  const candidates = await db.candidateConcept.findMany({ where: { changeSetId } });
  const promotedConceptIds = candidates.filter((c) => c.promotedConceptId).map((c) => c.promotedConceptId as string);
  const promotedRelIds = candidates.filter((c) => c.promotedRelationshipId).map((c) => c.promotedRelationshipId as string);

  const promotedConcepts = promotedConceptIds.length
    ? await db.concept.findMany({ where: { id: { in: promotedConceptIds } }, select: { ontologyId: true } })
    : [];
  const promotedRels = promotedRelIds.length
    ? await db.relationship.findMany({ where: { id: { in: promotedRelIds } }, select: { ontologyId: true } })
    : [];
  const affectedModuleIds = Array.from(new Set([
    ...promotedConcepts.map((c) => c.ontologyId),
    ...promotedRels.map((r) => r.ontologyId),
  ]));

  const issues: ValidationIssue[] = [];

  if (affectedModuleIds.length === 0) {
    // Nothing was promoted (edge case). Treat as trivially valid.
    const updated = await db.changeSet.update({ where: { id: changeSetId }, data: { status: 'VALIDATED' } });
    return { changeSetId, conforms: true, status: updated.status, issues };
  }

  // Full resulting graph of the affected modules (post-promotion state).
  const concepts = await db.concept.findMany({
    where: { ontologyId: { in: affectedModuleIds } },
    include: { attributes: true, ontology: { select: { moduleScope: true } } },
  });
  const relationships = await db.relationship.findMany({
    where: { ontologyId: { in: affectedModuleIds } },
    include: {
      source: { include: { ontology: { select: { moduleScope: true } } } },
      target: { include: { ontology: { select: { moduleScope: true } } } },
    },
  });

  // (1) One-way dependency: core must not reference extension.
  for (const rel of relationships) {
    if (isCore(rel.source.ontology.moduleScope) && isExtension(rel.target.ontology.moduleScope)) {
      issues.push({
        severity: 'HIGH',
        code: 'ONE_WAY_DEPENDENCY',
        message: `Core concept "${rel.source.label}" references extension concept "${rel.target.label}" via "${rel.name}". Core must never depend on an extension — move the concept into core, or reverse the relationship.`,
      });
    }
  }

  // (2) SHACL / RDFS consistency over the combined graph.
  // Shape must match scripts/export_rdf.py: every concept needs `id` (used as a URI-map key).
  const payload = {
    concepts: concepts.map((c) => ({
      id: c.id,
      uri: c.uri,
      label: c.label,
      conceptType: c.conceptType,
      description: c.description,
      parentConceptId: c.parentConceptId,
      attributes: c.attributes.map((a) => ({ name: a.name, datatype: a.datatype, description: a.description })),
    })),
    relationships: relationships.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      cardinality: r.cardinality,
      propertyType: r.propertyType,
      source: { label: r.source.label },
      target: { label: r.target.label },
    })),
  };

  try {
    const shacl = await runShaclScript(payload);
    if (!shacl.conforms) {
      issues.push({
        severity: 'HIGH',
        code: 'SHACL_NONCONFORMANCE',
        message: `The ontology graph failed SHACL/consistency validation. Details:\n${shacl.report.trim().slice(0, 2000)}`,
      });
    }
  } catch (err: any) {
    issues.push({ severity: 'HIGH', code: 'VALIDATOR_ERROR', message: `Could not run the validator: ${err.message}. Ensure Python + pyshacl are installed (see requirements.txt).` });
  }

  const conforms = issues.length === 0;
  let status = changeSet.status;
  if (conforms) {
    const updated = await db.changeSet.update({ where: { id: changeSetId }, data: { status: 'VALIDATED' } });
    status = updated.status;
  }
  return { changeSetId, conforms, status, issues };
}
