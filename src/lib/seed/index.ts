/**
 * V3 seed loaders (docs/V3_FLOW.md §3). Three sources, one `SeedSource` shape:
 *   - curatedTemplate  — standards-aligned starter map for an industry × domain (ship now)
 *   - fromLinkedOntology — copy an existing ontology's live graph as the seed (ship now)
 *   - fromStandardVocab  — live FIBO/schema.org RDF ingestion (DEFERRED — throws)
 *
 * A new source is a new loader here; the create flow that consumes a SeedSource never changes.
 */
import { db } from '@/lib/db';
import { isTagRootConcept, isValidUpperOntologyTag, type UpperOntologyTag } from '@/lib/upperOntology';
import { EMPTY_SEED, type SeedClass, type SeedConceptType, type SeedRelationship, type SeedSource } from '@/lib/seed/types';
import { findTemplate, type TemplateMatch } from '@/lib/seed/templates';

export type SeedOrigin = 'template' | 'linked' | 'empty';

export interface ResolvedSeed {
  origin: SeedOrigin;
  /** Template key when origin==='template', linked ontology id when origin==='linked'. */
  ref: string | null;
  label: string | null;
  seed: SeedSource;
}

/** Curated, standards-aligned template for an industry × domain. Null-safe: unknown combo → empty seed. */
export function curatedTemplate(industry: string | null | undefined, domain: string | null | undefined): ResolvedSeed {
  const match: TemplateMatch | null = findTemplate(industry, domain);
  if (!match) return { origin: 'empty', ref: null, label: null, seed: EMPTY_SEED };
  return { origin: 'template', ref: match.key, label: match.label, seed: match.seed };
}

// Live Concept rows don't store the Layer-1 tag directly; derive it. If the concept's parent
// is a Layer-1 tag-root, that root's label IS the tag. Otherwise fall back to a coarse
// conceptType → tag mapping. Always lands on a valid closed-set tag.
const CONCEPT_TYPE_TO_TAG: Record<string, UpperOntologyTag> = {
  Entity: 'Entity',
  Agent: 'Agent',
  Process: 'Process',
  Event: 'Event',
  Metric: 'Quality',
  Persona: 'Agent', // legacy value from earlier data — map onto Agent
};

function coerceConceptType(conceptType: string | null | undefined): SeedConceptType {
  switch (conceptType) {
    case 'Agent':
    case 'Process':
    case 'Event':
    case 'Metric':
      return conceptType;
    case 'Persona': // legacy
      return 'Agent';
    default:
      return 'Entity';
  }
}

/**
 * Seed = an existing ontology's live graph (docs/V3_FLOW.md §3 "linked" source). Tag-root
 * anchor concepts are excluded — they're Layer-1 infrastructure, not domain classes to re-seed.
 * Relationship endpoints are mapped from concept ids back to labels; a relationship whose
 * endpoint was filtered out (e.g. pointed at a tag root) is dropped.
 */
export async function fromLinkedOntology(linkedOntologyId: string): Promise<ResolvedSeed> {
  const linked = await db.ontology.findUnique({
    where: { id: linkedOntologyId },
    select: { id: true, name: true },
  });
  if (!linked) {
    throw new Error(`Linked ontology not found: ${linkedOntologyId}`);
  }

  const concepts = await db.concept.findMany({
    where: { ontologyId: linkedOntologyId },
    select: {
      id: true,
      label: true,
      description: true,
      conceptType: true,
      uri: true,
      typeFields: true,
      parentConcept: { select: { label: true, typeFields: true } },
      attributes: { select: { name: true, datatype: true, description: true } },
    },
  });

  const idToLabel = new Map<string, string>();
  const classes: SeedClass[] = [];
  for (const c of concepts) {
    if (isTagRootConcept(c)) continue; // skip Layer-1 anchors
    idToLabel.set(c.id, c.label);

    const parentTag =
      c.parentConcept && isTagRootConcept(c.parentConcept) && isValidUpperOntologyTag(c.parentConcept.label)
        ? (c.parentConcept.label as UpperOntologyTag)
        : null;
    const upperOntologyTag = parentTag ?? CONCEPT_TYPE_TO_TAG[c.conceptType] ?? 'Entity';

    classes.push({
      label: c.label,
      conceptType: coerceConceptType(c.conceptType),
      upperOntologyTag,
      description: c.description ?? undefined,
      uri: c.uri ?? undefined,
      attributes: c.attributes.map((a) => ({
        name: a.name,
        datatype: a.datatype,
        description: a.description ?? undefined,
      })),
    });
  }

  const relationships = await db.relationship.findMany({
    where: { ontologyId: linkedOntologyId },
    select: { name: true, description: true, cardinality: true, uri: true, sourceId: true, targetId: true },
  });

  const seedRels: SeedRelationship[] = [];
  for (const r of relationships) {
    const source = idToLabel.get(r.sourceId);
    const target = idToLabel.get(r.targetId);
    if (!source || !target) continue; // endpoint was filtered out (e.g. tag root) → drop the edge
    seedRels.push({
      name: r.name,
      source,
      target,
      upperOntologyTag: 'Relation',
      cardinality: r.cardinality,
      description: r.description ?? undefined,
      uri: r.uri ?? undefined,
    });
  }

  return {
    origin: 'linked',
    ref: linked.id,
    label: linked.name,
    seed: { classes, relationships: seedRels },
  };
}

/** DEFERRED (docs/V3_FLOW.md §3): live standard-vocabulary ingestion. Same output shape when built. */
export async function fromStandardVocab(): Promise<ResolvedSeed> {
  throw new Error('fromStandardVocab is deferred — not implemented in v3. Use curatedTemplate or fromLinkedOntology.');
}

/**
 * Dispatch for the create wizard: a linked ontology wins (copy its graph); otherwise use the
 * curated template for the industry × domain, which itself falls back to an empty seed.
 */
export async function resolveSeed(opts: {
  industry?: string | null;
  domain?: string | null;
  linkedOntologyId?: string | null;
}): Promise<ResolvedSeed> {
  if (opts.linkedOntologyId) {
    return fromLinkedOntology(opts.linkedOntologyId);
  }
  return curatedTemplate(opts.industry, opts.domain);
}

export { EMPTY_SEED } from '@/lib/seed/types';
