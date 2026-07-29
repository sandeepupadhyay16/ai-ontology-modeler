/**
 * V3 Stage V2 — direct promote / demote (docs/V3_FLOW.md §4).
 *
 * The V3 flow replaces the ChangeSet governance envelope with a single checkbox: checking a
 * staged CandidateConcept promotes it straight into the live graph; un-checking removes it.
 * This module is that gate.
 *
 * Relationship to src/lib/promotion.ts (the v1/v2 batch gate): we REUSE its load-bearing
 * invariant helpers — `resolveTagRoot` ("never a disconnected tree", idea.md §4) and the
 * embed-on-write pipeline — but deliberately DO NOT reuse `resolveModuleOntology`. That router
 * assumes `session.ontology` is always the CORE and routes candidates to a child extension by
 * scope. In V3 the create wizard (Stage V1) already fixed the module: the ontology bound to the
 * session IS the target (core OR extension), so we promote directly into `session.ontologyId`.
 * No ChangeSet row is ever created here.
 */
import { db } from './db';
import { resolveTagRoot, moduleAllowsReference } from './promotion';
import { embedText, buildConceptEmbeddingText, EMBEDDING_MODEL, EMBEDDING_DIM } from './embeddings';
import { isValidUpperOntologyTag, isTagRootConcept } from './upperOntology';

export interface PromoteResult {
  ok: boolean;
  kind: 'concept' | 'relationship' | null;
  conceptId?: string;
  relationshipId?: string;
  alreadyPromoted?: boolean;
  error?: string;
  /** Set when the promote was blocked because a live concept with this label already exists. */
  duplicateOfConceptId?: string;
  /** Non-fatal: promoted, but embedding failed (concept path only). */
  embedWarning?: string;
}

export interface DemoteWarning {
  edited: boolean;
  dependentRelationships: number;
  childConcepts: number;
  reason: string;
}

export interface DemoteResult {
  ok: boolean;
  demoted: boolean;
  /** Present when the caller must confirm (force) before destructive removal — decision Q2. */
  warning?: DemoteWarning;
  error?: string;
}

/**
 * Check-in: promote ONE candidate into the live graph. Idempotent — a candidate already
 * promoted returns its existing live id. Concepts attach under an ontologist parent override
 * or the per-tag anchor root; relationships require BOTH endpoints already live in the
 * ontology (decision Q4). Embedding happens post-commit (non-fatal), mirroring promotion.ts.
 */
export async function promoteCandidateDirect(candidateId: string): Promise<PromoteResult> {
  const pending = await db.$transaction(async (tx) => {
    const candidate = await tx.candidateConcept.findUnique({
      where: { id: candidateId },
      include: { session: { include: { ontology: true } } },
    });
    if (!candidate) return { result: { ok: false, kind: null, error: 'Candidate not found' } as PromoteResult, embed: null };

    // Idempotent: already live.
    if (candidate.promotedConceptId) {
      return { result: { ok: true, kind: 'concept', conceptId: candidate.promotedConceptId, alreadyPromoted: true } as PromoteResult, embed: null };
    }
    if (candidate.promotedRelationshipId) {
      return { result: { ok: true, kind: 'relationship', relationshipId: candidate.promotedRelationshipId, alreadyPromoted: true } as PromoteResult, embed: null };
    }

    const ontologyId = candidate.session.ontologyId;
    const moduleScope = candidate.session.ontology.moduleScope;
    // The module "family" a relationship endpoint or a duplicate label may live in: this
    // ontology plus the ontology it imports (owl:imports via extendsOntologyId), if any. This
    // is what makes a linked ontology a TRUE import rather than a copy — an extension concept
    // can reference an imported base concept, and we refuse to re-declare one that already exists.
    const parentOntologyId = candidate.session.ontology.extendsOntologyId;
    const familyIds = parentOntologyId ? [ontologyId, parentOntologyId] : [ontologyId];
    const payload = (candidate.payload as any) || {};
    const isRelationship = payload.kind === 'relationship' || candidate.candidateType === 'Relationship';

    if (!isRelationship) {
      // ---- Concept ----
      const tag = candidate.upperOntologyTag;
      if (!tag || !isValidUpperOntologyTag(tag)) {
        return { result: { ok: false, kind: 'concept', error: 'Candidate has no valid upperOntologyTag — cannot determine a Layer 1 parent to attach under.' } as PromoteResult, embed: null };
      }

      // Duplicate-label guard: block if a live (non-tag-root) concept with this label already
      // exists in the family — creating a second one produces ambiguous relationship endpoints
      // and duplicate nodes on the canvas. Case-insensitive.
      const clashes = await tx.concept.findMany({
        where: { ontologyId: { in: familyIds }, label: { equals: candidate.label, mode: 'insensitive' } },
        select: { id: true, typeFields: true, ontologyId: true },
      });
      const dup = clashes.find((c) => !isTagRootConcept(c));
      if (dup) {
        const imported = dup.ontologyId !== ontologyId;
        return {
          result: {
            ok: false,
            kind: 'concept',
            duplicateOfConceptId: dup.id,
            error: `A concept named "${candidate.label}" already exists${imported ? ' in the imported base ontology' : ' in this ontology'}. ${imported ? 'Reference it directly instead of re-declaring it.' : 'Rename this one, or remove the existing concept first.'}`,
          } as PromoteResult,
          embed: null,
        };
      }

      let parentConceptId: string;
      if (candidate.parentConceptId) {
        const overrideParent = await tx.concept.findUnique({ where: { id: candidate.parentConceptId }, include: { ontology: true } });
        if (!overrideParent) {
          return { result: { ok: false, kind: 'concept', error: `Parent override ${candidate.parentConceptId} does not exist.` } as PromoteResult, embed: null };
        }
        if (!moduleAllowsReference(moduleScope, overrideParent.ontology.moduleScope)) {
          return { result: { ok: false, kind: 'concept', error: `Parent override violates one-way dependency: ${moduleScope} may not attach under ${overrideParent.ontology.moduleScope}.` } as PromoteResult, embed: null };
        }
        parentConceptId = overrideParent.id;
      } else {
        parentConceptId = await resolveTagRoot(tx, ontologyId, tag);
      }

      const description = payload.description || '';
      const concept = await tx.concept.create({
        data: {
          label: candidate.label,
          conceptType: candidate.candidateType,
          description: description || null,
          businessJustification: payload.businessJustification || null,
          uri: payload.uri || null,
          parentConceptId,
          ontologyId,
        },
      });

      const attrs = Array.isArray(payload.attributes) ? payload.attributes : [];
      for (const attr of attrs) {
        if (!attr?.name) continue;
        await tx.attribute.create({
          data: { name: attr.name, datatype: attr.datatype || 'string', description: attr.description || null, conceptId: concept.id },
        });
      }

      await tx.candidateConcept.update({
        where: { id: candidate.id },
        data: { decision: 'ACCEPTED', promotedConceptId: concept.id },
      });

      return {
        result: { ok: true, kind: 'concept', conceptId: concept.id } as PromoteResult,
        embed: { conceptId: concept.id, label: concept.label, conceptType: concept.conceptType, description },
      };
    }

    // ---- Relationship ----
    const sourceLabel = payload.source as string | undefined;
    const targetLabel = payload.target as string | undefined;
    if (!sourceLabel || !targetLabel) {
      return { result: { ok: false, kind: 'relationship', error: 'Relationship candidate is missing a source/target label.' } as PromoteResult, embed: null };
    }
    // Both endpoints must already be live somewhere in the family (this ontology or the one it
    // imports) — decision Q4, extended to imported concepts so an extension can point at its base.
    const source = await tx.concept.findFirst({ where: { ontologyId: { in: familyIds }, label: sourceLabel }, include: { ontology: { select: { moduleScope: true } } } });
    const target = await tx.concept.findFirst({ where: { ontologyId: { in: familyIds }, label: targetLabel }, include: { ontology: { select: { moduleScope: true } } } });
    if (!source || !target) {
      const missing = !source ? `source "${sourceLabel}"` : `target "${targetLabel}"`;
      return { result: { ok: false, kind: 'relationship', error: `Cannot create relationship yet: ${missing} is not checked in. Check in both endpoint concepts first.` } as PromoteResult, embed: null };
    }
    // One-way dependency: a base ("core") concept may not point at an extension concept.
    if (!moduleAllowsReference(source.ontology.moduleScope, target.ontology.moduleScope)) {
      return { result: { ok: false, kind: 'relationship', error: `One-way dependency violation: a "${source.ontology.moduleScope}" concept can't have a relationship pointing at a "${target.ontology.moduleScope}" concept.` } as PromoteResult, embed: null };
    }

    const relationship = await tx.relationship.create({
      data: {
        name: candidate.label,
        description: payload.description || null,
        businessJustification: payload.businessJustification || null,
        cardinality: payload.cardinality || 'one-to-many',
        uri: payload.uri || null,
        sourceId: source.id,
        targetId: target.id,
        // The edge lives in the source concept's ontology (the extension when it's cross-module).
        ontologyId: source.ontologyId,
      },
    });

    await tx.candidateConcept.update({
      where: { id: candidate.id },
      data: { decision: 'ACCEPTED', promotedRelationshipId: relationship.id },
    });

    return { result: { ok: true, kind: 'relationship', relationshipId: relationship.id } as PromoteResult, embed: null };
  });

  // Phase 2 (post-commit, non-transactional): embed a newly-created concept. Non-fatal.
  if (pending.result.ok && pending.embed) {
    try {
      const vec = await embedText(buildConceptEmbeddingText(pending.embed.label, pending.embed.conceptType, pending.embed.description));
      await db.concept.update({
        where: { id: pending.embed.conceptId },
        data: { embedding: vec, embeddingModel: EMBEDDING_MODEL, embeddingDim: EMBEDDING_DIM },
      });
    } catch (err: any) {
      pending.result.embedWarning = `Promoted, but embedding failed (will backfill later): ${err.message || 'unknown error'}`;
    }
  }

  return pending.result;
}

/**
 * Un-check: remove a candidate's live element and re-stage it (decision Q2).
 *
 * Two-step by default: the first call with `force !== true` DOES NOT delete if the live element
 * was edited after check-in or has dependents (relationships pointing at it, or child concepts);
 * it returns a `warning` for the caller to confirm. A second call with `force: true` performs the
 * destructive removal. A clean element (no edits, no dependents) is removed on the first call.
 *
 * "Edited" = the live concept's label/description/attribute set diverged from the candidate's
 * frozen payload (edits are live-only, decision Q3, so any divergence means the user changed it).
 */
export async function demoteCandidate(candidateId: string, opts?: { force?: boolean }): Promise<DemoteResult> {
  const candidate = await db.candidateConcept.findUnique({ where: { id: candidateId } });
  if (!candidate) return { ok: false, demoted: false, error: 'Candidate not found' };

  // Nothing live yet — just make sure it's back to PENDING.
  if (!candidate.promotedConceptId && !candidate.promotedRelationshipId) {
    if (candidate.decision !== 'PENDING') {
      await db.candidateConcept.update({ where: { id: candidateId }, data: { decision: 'PENDING' } });
    }
    return { ok: true, demoted: false };
  }

  // ---- Relationship: no cascade concerns, always safe to remove ----
  if (candidate.promotedRelationshipId) {
    await db.$transaction(async (tx) => {
      await tx.relationship.delete({ where: { id: candidate.promotedRelationshipId! } }).catch(() => {});
      await tx.candidateConcept.update({ where: { id: candidateId }, data: { decision: 'PENDING', promotedRelationshipId: null } });
    });
    return { ok: true, demoted: true };
  }

  // ---- Concept: check for edits + dependents before a destructive delete ----
  const conceptId = candidate.promotedConceptId!;
  const concept = await db.concept.findUnique({ where: { id: conceptId }, include: { attributes: true } });
  if (!concept) {
    // Live row already gone — just re-stage.
    await db.candidateConcept.update({ where: { id: candidateId }, data: { decision: 'PENDING', promotedConceptId: null } });
    return { ok: true, demoted: true };
  }

  const payload = (candidate.payload as any) || {};
  const seedAttrNames = new Set((Array.isArray(payload.attributes) ? payload.attributes : []).map((a: any) => String(a?.name).toLowerCase()));
  const edited =
    concept.label !== candidate.label ||
    (concept.description || '') !== (payload.description || '') ||
    concept.attributes.some((a) => !seedAttrNames.has(a.name.toLowerCase()));

  const [dependentRelationships, childConcepts] = await Promise.all([
    db.relationship.count({ where: { OR: [{ sourceId: conceptId }, { targetId: conceptId }] } }),
    db.concept.count({ where: { parentConceptId: conceptId } }),
  ]);

  const hasDependents = dependentRelationships > 0 || childConcepts > 0;

  if ((edited || hasDependents) && !opts?.force) {
    const parts: string[] = [];
    if (edited) parts.push('it was edited after check-in');
    if (dependentRelationships > 0) parts.push(`${dependentRelationships} relationship(s) reference it`);
    if (childConcepts > 0) parts.push(`${childConcepts} concept(s) are parented under it`);
    return {
      ok: true,
      demoted: false,
      warning: {
        edited,
        dependentRelationships,
        childConcepts,
        reason: `Removing "${concept.label}" will also affect ${parts.join(' and ')}. Confirm to proceed.`,
      },
    };
  }

  // Destructive removal. Deleting the concept cascades to its attributes and to any
  // relationships referencing it (schema onDelete: Cascade on source/target); child concepts
  // are re-parented to null (onDelete: SetNull). Re-stage any candidates whose promoted
  // relationship gets swept up, so the staging list stays truthful.
  await db.$transaction(async (tx) => {
    const doomedRels = await tx.relationship.findMany({
      where: { OR: [{ sourceId: conceptId }, { targetId: conceptId }] },
      select: { id: true },
    });
    const doomedRelIds = doomedRels.map((r) => r.id);
    if (doomedRelIds.length > 0) {
      await tx.candidateConcept.updateMany({
        where: { promotedRelationshipId: { in: doomedRelIds } },
        data: { decision: 'PENDING', promotedRelationshipId: null },
      });
    }
    await tx.concept.delete({ where: { id: conceptId } });
    await tx.candidateConcept.update({ where: { id: candidateId }, data: { decision: 'PENDING', promotedConceptId: null } });
  });

  return { ok: true, demoted: true };
}
