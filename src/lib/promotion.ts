/**
 * Stage 5 promotion service — the hard gate (idea.md "Batch review (ontologist
 * gate)"). Turns ontologist-ACCEPTED/MERGED CandidateConcept rows into real
 * Concept/Relationship/Attribute rows, grouped under one ChangeSet, inside a
 * single Prisma transaction (see the two-phase note below for why embedding
 * is NOT part of that transaction). This is the ONLY place candidates ever
 * become live graph data — nothing here runs automatically or on an LLM's say-so.
 *
 * Hard requirements from IMPLEMENTATION_PLAN.md Stage 5 (do not relax these):
 *   - Additive only. No delete-by-omission — a candidate not being promoted
 *     never causes an existing Concept/Relationship to be removed.
 *   - Promoted concepts attach under an existing class (idea.md §4) — never a
 *     disconnected new tree. See resolveParentConcept below.
 *   - Correct module: candidate.scope ("core" | "extension:<domain>") decides
 *     which Ontology row (core vs that domain's extension) the promoted
 *     Concept/Relationship lands in; extension Ontology rows are found-or-
 *     created here, importing (via Ontology.extendsOntologyId) the session's
 *     core ontology. Promotion to core only happens because an ontologist
 *     explicitly set candidate.scope = "core" at review — never automatic.
 *   - One-way dependency enforced structurally: a Relationship whose source
 *     concept's module is "core" may not target a concept whose module is an
 *     extension. Violations are skipped and reported, not silently dropped
 *     from the response.
 *   - Embed-on-write (the Stage 4 "deferred to Stage 5" hook): every newly
 *     written Concept is embedded here with the same deterministic
 *     label+type+description pipeline Stage 4/5 use for dup checks.
 *
 * Two-phase, NOT one big transaction wrapping a network call: embedText() is
 * a Gemini network round-trip. All DB writes happen in a single Prisma
 * transaction (phase 1); embedding happens in a separate, non-transactional
 * pass AFTER that transaction commits (phase 2), updating each newly-created
 * Concept by id. A slow/rate-limited embed can no longer hold row locks open
 * or roll back an otherwise-valid promotion. A failed embed in phase 2 is
 * still non-fatal — same tolerance as before, reported as a warning-style
 * PromotionError, concept stays promoted with no embedding until a future
 * backfill run.
 */
import { PrismaClient } from '@prisma/client';
import { db } from './db';
import { embedText, buildConceptEmbeddingText, EMBEDDING_MODEL, EMBEDDING_DIM } from './embeddings';
import { isValidUpperOntologyTag, TAG_ROOT_MARKER, type UpperOntologyTag } from './upperOntology';

export type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface PromotionError {
  candidateId: string;
  label: string;
  reason: string;
}

export interface PromotionResult {
  changeSetId: string | null;
  promotedConceptIds: string[];
  promotedRelationshipIds: string[];
  mergedConceptIds: string[];
  errors: PromotionError[];
}

interface PendingEmbed {
  candidateId: string;
  conceptId: string;
  label: string;
  conceptType: string;
  description: string;
}

function parseScope(scope: string): { isCore: boolean; domainKey: string | null } {
  if (scope === 'core') return { isCore: true, domainKey: null };
  const match = /^extension:(.+)$/.exec(scope);
  if (match) return { isCore: false, domainKey: match[1] };
  // Unknown scope shape — treat as extension:unspecified rather than guessing "core".
  // Extension-by-default applies to malformed data too (IMPLEMENTATION_PLAN.md cross-cutting).
  return { isCore: false, domainKey: 'unspecified' };
}

async function resolveModuleOntology(
  tx: Tx,
  coreOntology: { id: string; name: string; namespaceUri: string; layer: string; projectId: string | null; businessFunctionId: string | null; organizationId: string | null },
  scope: string
): Promise<{ id: string; moduleScope: string; namespaceUri: string }> {
  const { isCore, domainKey } = parseScope(scope);
  if (isCore) {
    return { id: coreOntology.id, moduleScope: 'core', namespaceUri: coreOntology.namespaceUri };
  }

  const moduleScope = `extension:${domainKey}`;
  const existing = await tx.ontology.findFirst({
    where: { extendsOntologyId: coreOntology.id, moduleScope },
  });
  if (existing) return { id: existing.id, moduleScope, namespaceUri: existing.namespaceUri };

  const created = await tx.ontology.create({
    data: {
      name: `${coreOntology.name} — ${domainKey} extension`,
      namespaceUri: `${coreOntology.namespaceUri.replace(/\/$/, '')}/ext/${domainKey}`,
      layer: coreOntology.layer,
      moduleScope,
      extendsOntologyId: coreOntology.id,
      projectId: coreOntology.projectId,
      businessFunctionId: coreOntology.businessFunctionId,
      organizationId: coreOntology.organizationId,
    },
  });
  return { id: created.id, moduleScope, namespaceUri: created.namespaceUri };
}

/**
 * Layer 1 is adopted, never modified — but Layer 2/3 concepts still need SOME
 * existing class to attach under (idea.md §4: "never a disconnected new
 * tree"). Absent an ontologist-chosen parent, a promoted concept attaches
 * under a per-module, per-tag anchor concept named after its
 * upperOntologyTag (e.g. every "Entity"-tagged concept in the core ontology
 * roots under one auto-created "Entity" Concept in that ontology). This is
 * deterministic and auditable, not a guess: same tag, same module -> same
 * root, every time.
 */
export async function resolveTagRoot(tx: Tx, ontologyId: string, tag: UpperOntologyTag): Promise<string> {
  const existing = await tx.concept.findFirst({
    where: { ontologyId, label: tag, parentConceptId: null, typeFields: { path: ['marker'], equals: TAG_ROOT_MARKER } },
  });
  if (existing) return existing.id;

  const created = await tx.concept.create({
    data: {
      label: tag,
      conceptType: tag,
      ontologyId,
      description: `Auto-created Layer 1 anchor root for the "${tag}" upper-ontology tag — every promoted concept tagged ${tag} in this module attaches here unless the ontologist chose a more specific parent. Do not delete; Stage 5 promotion recreates it if missing.`,
      typeFields: { marker: TAG_ROOT_MARKER },
    },
  });
  return created.id;
}

/** Enforces the one-way dependency: a concept in "core" may not attach under (or reference) a concept living in an extension. */
export function moduleAllowsReference(fromModuleScope: string, toModuleScope: string): boolean {
  if (fromModuleScope === 'core' && toModuleScope !== 'core') return false;
  return true;
}

export async function promoteSessionCandidates(sessionId: string): Promise<PromotionResult> {
  const txResult = await db.$transaction(async (tx) => {
    const session = await tx.modelingSession.findUnique({
      where: { id: sessionId },
      include: { ontology: true },
    });
    if (!session) throw new Error('Modeling session not found');
    const coreOntology = session.ontology;

    const candidates = await tx.candidateConcept.findMany({
      where: { sessionId, decision: { in: ['ACCEPTED', 'MERGED'] }, changeSetId: null },
      orderBy: { createdAt: 'asc' },
    });

    if (candidates.length === 0) {
      return { changeSetId: null, promotedConceptIds: [], promotedRelationshipIds: [], mergedConceptIds: [], errors: [], pendingEmbeds: [] };
    }

    const changeSet = await tx.changeSet.create({
      data: { sessionId, status: 'APPROVED', summary: `Promoted ${candidates.length} reviewed candidate(s)` },
    });

    const errors: PromotionError[] = [];
    const promotedConceptIds: string[] = [];
    const promotedRelationshipIds: string[] = [];
    const mergedConceptIds: string[] = [];
    const pendingEmbeds: PendingEmbed[] = [];
    // label -> { conceptId, ontologyId, moduleScope } for concepts resolved THIS batch
    // (freshly created or merge-redirected), so same-turn relationship candidates can
    // reference them without a DB round-trip finding nothing.
    const labelToConcept = new Map<string, { conceptId: string; ontologyId: string; moduleScope: string }>();

    const conceptCandidates = candidates.filter((c) => (c.payload as any)?.kind !== 'relationship');
    const relationshipCandidates = candidates.filter((c) => (c.payload as any)?.kind === 'relationship');

    // --- Pass 1: concepts (including merges) ---
    for (const candidate of conceptCandidates) {
      const payload = (candidate.payload as any) || {};

      if (candidate.decision === 'MERGED') {
        if (!candidate.mergeTargetConceptId) {
          errors.push({ candidateId: candidate.id, label: candidate.label, reason: 'decision=MERGED but mergeTargetConceptId is not set' });
          continue;
        }
        const target = await tx.concept.findUnique({ where: { id: candidate.mergeTargetConceptId }, include: { ontology: true, attributes: true } });
        if (!target) {
          errors.push({ candidateId: candidate.id, label: candidate.label, reason: `mergeTargetConceptId ${candidate.mergeTargetConceptId} does not exist` });
          continue;
        }
        // Additive-only merge: add any attributes the candidate proposed that the
        // target doesn't already have by name. Never overwrite/remove existing ones.
        const existingAttrNames = new Set(target.attributes.map((a) => a.name.toLowerCase()));
        const newAttrs = Array.isArray(payload.attributes) ? payload.attributes : [];
        for (const attr of newAttrs) {
          if (!attr?.name || existingAttrNames.has(String(attr.name).toLowerCase())) continue;
          await tx.attribute.create({
            data: {
              name: attr.name,
              datatype: attr.datatype || 'string',
              description: attr.description || null,
              conceptId: target.id,
              addedInChangeSetId: changeSet.id,
            },
          });
        }
        await tx.candidateConcept.update({
          where: { id: candidate.id },
          data: { changeSetId: changeSet.id, promotedConceptId: target.id },
        });
        mergedConceptIds.push(target.id);
        labelToConcept.set(candidate.label, { conceptId: target.id, ontologyId: target.ontologyId, moduleScope: target.ontology.moduleScope });
        continue;
      }

      if (candidate.decision !== 'ACCEPTED') continue; // REJECTED / PENDING never reach here (query filter), defensive no-op

      const tag = candidate.upperOntologyTag;
      if (!tag || !isValidUpperOntologyTag(tag)) {
        errors.push({ candidateId: candidate.id, label: candidate.label, reason: 'no valid upperOntologyTag — cannot determine a Layer 1 parent to attach under; fix the tag before promoting' });
        continue;
      }

      const moduleOntology = await resolveModuleOntology(tx, coreOntology, candidate.scope);

      let parentConceptId: string;
      const overrideParentId = candidate.parentConceptId;
      if (overrideParentId) {
        const overrideParent = await tx.concept.findUnique({ where: { id: overrideParentId }, include: { ontology: true } });
        if (!overrideParent) {
          errors.push({ candidateId: candidate.id, label: candidate.label, reason: `parentConceptId override ${overrideParentId} does not exist` });
          continue;
        }
        if (!moduleAllowsReference(moduleOntology.moduleScope, overrideParent.ontology.moduleScope)) {
          errors.push({ candidateId: candidate.id, label: candidate.label, reason: `parent override violates one-way dependency: ${moduleOntology.moduleScope} may not attach under ${overrideParent.ontology.moduleScope}` });
          continue;
        }
        parentConceptId = overrideParent.id;
      } else {
        parentConceptId = await resolveTagRoot(tx, moduleOntology.id, tag);
      }

      const description = payload.description || '';
      const concept = await tx.concept.create({
        data: {
          label: candidate.label,
          conceptType: candidate.candidateType,
          description: description || null,
          parentConceptId,
          ontologyId: moduleOntology.id,
        },
      });

      const attrs = Array.isArray(payload.attributes) ? payload.attributes : [];
      for (const attr of attrs) {
        if (!attr?.name) continue;
        await tx.attribute.create({
          data: {
            name: attr.name,
            datatype: attr.datatype || 'string',
            description: attr.description || null,
            conceptId: concept.id,
            addedInChangeSetId: changeSet.id,
          },
        });
      }

      // Embed-on-write (Stage 4's hook, deferred to here): queued for the
      // post-commit phase 2 pass below — no network call inside the transaction.
      pendingEmbeds.push({ candidateId: candidate.id, conceptId: concept.id, label: concept.label, conceptType: concept.conceptType, description });

      await tx.candidateConcept.update({
        where: { id: candidate.id },
        data: { changeSetId: changeSet.id, promotedConceptId: concept.id },
      });
      promotedConceptIds.push(concept.id);
      labelToConcept.set(candidate.label, { conceptId: concept.id, ontologyId: moduleOntology.id, moduleScope: moduleOntology.moduleScope });
    }

    // --- Pass 2: relationships (source/target may be in this batch or already live) ---
    async function resolveConceptByLabel(label: string): Promise<{ conceptId: string; ontologyId: string; moduleScope: string } | null> {
      const inBatch = labelToConcept.get(label);
      if (inBatch) return inBatch;
      // Search the whole module family for this session (core + its extensions),
      // matching Stage 4's cross-cutting requirement that scope isn't a single ontology.
      const family = await tx.ontology.findMany({
        where: { OR: [{ id: coreOntology.id }, { extendsOntologyId: coreOntology.id }] },
        select: { id: true, moduleScope: true },
      });
      const familyIds = family.map((o) => o.id);
      const found = await tx.concept.findFirst({ where: { ontologyId: { in: familyIds }, label } });
      if (!found) return null;
      const ontology = family.find((o) => o.id === found.ontologyId)!;
      return { conceptId: found.id, ontologyId: found.ontologyId, moduleScope: ontology.moduleScope };
    }

    for (const candidate of relationshipCandidates) {
      if (candidate.decision !== 'ACCEPTED') continue; // relationships aren't merge-targets in this design
      const payload = (candidate.payload as any) || {};
      const sourceLabel = payload.source as string | undefined;
      const targetLabel = payload.target as string | undefined;
      if (!sourceLabel || !targetLabel) {
        errors.push({ candidateId: candidate.id, label: candidate.label, reason: 'relationship candidate is missing source/target label' });
        continue;
      }

      const source = await resolveConceptByLabel(sourceLabel);
      const target = await resolveConceptByLabel(targetLabel);
      if (!source || !target) {
        errors.push({
          candidateId: candidate.id,
          label: candidate.label,
          reason: `could not resolve ${!source ? `source "${sourceLabel}"` : `target "${targetLabel}"`} to a promoted or existing concept`,
        });
        continue;
      }
      if (!moduleAllowsReference(source.moduleScope, target.moduleScope)) {
        errors.push({
          candidateId: candidate.id,
          label: candidate.label,
          reason: `one-way dependency violation: a "${source.moduleScope}" concept may not have a relationship pointing at a "${target.moduleScope}" concept`,
        });
        continue;
      }

      const relationship = await tx.relationship.create({
        data: {
          name: candidate.label,
          description: payload.description || null,
          cardinality: payload.cardinality || 'one-to-many',
          sourceId: source.conceptId,
          targetId: target.conceptId,
          ontologyId: source.ontologyId,
        },
      });

      await tx.candidateConcept.update({
        where: { id: candidate.id },
        data: { changeSetId: changeSet.id, promotedRelationshipId: relationship.id },
      });
      promotedRelationshipIds.push(relationship.id);
    }

    return { changeSetId: changeSet.id, promotedConceptIds, promotedRelationshipIds, mergedConceptIds, errors, pendingEmbeds };
  }, { timeout: 30000 });

  if (txResult.changeSetId === null) {
    return txResult;
  }

  // --- Phase 2 (post-commit, non-transactional): embed newly-created concepts ---
  const embedErrors: PromotionError[] = [];
  for (const p of txResult.pendingEmbeds) {
    try {
      const vec = await embedText(buildConceptEmbeddingText(p.label, p.conceptType, p.description));
      await db.concept.update({
        where: { id: p.conceptId },
        data: { embedding: vec, embeddingModel: EMBEDDING_MODEL, embeddingDim: EMBEDDING_DIM },
      });
    } catch (err: any) {
      // Non-fatal: the concept is still validly promoted without a fresh embedding;
      // it just won't be comparable until a future backfill run picks it up.
      embedErrors.push({ candidateId: p.candidateId, label: p.label, reason: `promoted, but embedding failed: ${err.message || 'unknown error'}` });
    }
  }

  return {
    changeSetId: txResult.changeSetId,
    promotedConceptIds: txResult.promotedConceptIds,
    promotedRelationshipIds: txResult.promotedRelationshipIds,
    mergedConceptIds: txResult.mergedConceptIds,
    errors: [...txResult.errors, ...embedErrors],
  };
}
