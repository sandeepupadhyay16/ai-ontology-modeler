/**
 * V3 seed seam (docs/V3_FLOW.md §3). Every seed source — curated template,
 * linked ontology, or (deferred) live standard vocabulary — produces this ONE
 * shape, so adding a new source is a new loader, never a flow change.
 *
 * Field shapes deliberately mirror what the extraction pipeline already emits
 * for a CandidateConcept (see src/app/api/sessions/[id]/turns/route.ts): a seed
 * class becomes a `kind:'concept'` candidate and a seed relationship becomes a
 * `kind:'relationship'` candidate, so the existing Staging + promotion machinery
 * consumes seed rows with no special-casing.
 */
import { UPPER_ONTOLOGY_TAGS, type UpperOntologyTag } from '@/lib/upperOntology';

/**
 * Coarse candidate kind, matching CandidateConcept.candidateType for concepts. These 5 categories
 * align 1:1 with the upper ontology (Layer 1): Entity→Entity, Agent→Agent, Process→Process,
 * Event→Event, Metric→Quality. "Relation" is the sixth Layer-1 tag but is modeled as edges
 * (relationships), never a node type here.
 */
export const SEED_CONCEPT_TYPES = ['Entity', 'Agent', 'Process', 'Event', 'Metric'] as const;
export type SeedConceptType = (typeof SEED_CONCEPT_TYPES)[number];

export interface SeedAttribute {
  name: string;
  datatype: string; // string | integer | float | boolean
  description?: string;
}

export interface SeedClass {
  label: string;
  conceptType: SeedConceptType; // coarse kind (CandidateConcept.candidateType)
  upperOntologyTag: UpperOntologyTag; // one of the six closed Layer-1 tags
  description?: string;
  /** Why this class exists in business terms — distinct from the technical `description`. */
  businessJustification?: string;
  /** Standards IRI this term is aligned to (schema.org / FIBO), when we have one. Hint only. */
  uri?: string;
  attributes?: SeedAttribute[];
}

export interface SeedRelationship {
  name: string;
  source: string; // must equal a SeedClass.label in the same SeedSource
  target: string; // must equal a SeedClass.label in the same SeedSource
  upperOntologyTag: UpperOntologyTag;
  cardinality?: string; // default one-to-many
  description?: string;
  /** Why this relationship exists / what it means for the business. */
  businessJustification?: string;
  uri?: string;
}

export interface SeedSource {
  classes: SeedClass[];
  relationships: SeedRelationship[];
}

export const EMPTY_SEED: SeedSource = { classes: [], relationships: [] };

/**
 * Structural validation for a SeedSource — used by the V0 checkpoint test and as a
 * guard before materializing a template into candidates. Returns a list of problems
 * (empty === valid). Does NOT call any network/LLM; pure and deterministic.
 */
export function validateSeedSource(seed: SeedSource): string[] {
  const problems: string[] = [];
  const labels = new Set<string>();

  seed.classes.forEach((c, i) => {
    if (!c.label?.trim()) problems.push(`class[${i}]: missing label`);
    if (labels.has(c.label)) problems.push(`class[${i}]: duplicate label "${c.label}"`);
    labels.add(c.label);
    if (!(SEED_CONCEPT_TYPES as readonly string[]).includes(c.conceptType)) {
      problems.push(`class "${c.label}": invalid conceptType "${c.conceptType}"`);
    }
    if (!(UPPER_ONTOLOGY_TAGS as readonly string[]).includes(c.upperOntologyTag)) {
      problems.push(`class "${c.label}": invalid upperOntologyTag "${c.upperOntologyTag}"`);
    }
  });

  seed.relationships.forEach((r, i) => {
    if (!r.name?.trim()) problems.push(`relationship[${i}]: missing name`);
    if (!labels.has(r.source)) problems.push(`relationship "${r.name}": source "${r.source}" is not a class in this seed`);
    if (!labels.has(r.target)) problems.push(`relationship "${r.name}": target "${r.target}" is not a class in this seed`);
    if (!(UPPER_ONTOLOGY_TAGS as readonly string[]).includes(r.upperOntologyTag)) {
      problems.push(`relationship "${r.name}": invalid upperOntologyTag "${r.upperOntologyTag}"`);
    }
  });

  return problems;
}
