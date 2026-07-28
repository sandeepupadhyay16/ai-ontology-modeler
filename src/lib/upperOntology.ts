/**
 * Fixed Layer 1 (upper-ontology) vocabulary — idea.md §2, bullet 2
 * ("Upper-ontology mapping — proposes a Layer 1 parent (Entity, Event,
 * Agent, Relation, Process, Quality) for each candidate").
 *
 * Layer 1 is adopted, never modified (idea.md line 10: "extends Layers 2
 * and 3 only. It does not modify Layer 1."). This module is the single
 * source of truth for the allowed set — the LLM chooses among these tags,
 * it never invents new ones. Any value outside this set is invalid.
 */
export const UPPER_ONTOLOGY_TAGS = [
  'Entity',
  'Event',
  'Agent',
  'Relation',
  'Process',
  'Quality',
] as const;

export type UpperOntologyTag = (typeof UPPER_ONTOLOGY_TAGS)[number];

export const UPPER_ONTOLOGY_DESCRIPTIONS: Record<UpperOntologyTag, string> = {
  Entity: 'A thing or object that exists in the domain (e.g. a Product, Document, Facility, Sample).',
  Event: 'Something that happens at a point or interval in time (e.g. a ReinfusionEvent, OrderPlaced, ShipmentReceived).',
  Agent: 'An actor capable of initiating action — a person, role, organization, or system (e.g. Payer, QAReviewer, Courier).',
  Relation: 'The association itself between two other concepts, when modeled as a first-class candidate rather than a plain link (e.g. an Assignment, a Custody relation).',
  Process: 'A multi-step activity or workflow that transforms inputs to outputs over time (e.g. ChainOfIdentity, QCRelease, OnboardingWorkflow).',
  Quality: 'A characteristic or measurable property ascribed to another concept, when modeled as its own concept rather than a plain attribute (e.g. Purity, TurnaroundTime, RiskLevel).',
};

export function isValidUpperOntologyTag(value: unknown): value is UpperOntologyTag {
  return typeof value === 'string' && (UPPER_ONTOLOGY_TAGS as readonly string[]).includes(value);
}

/** Prompt fragment listing the closed set for injection into extraction system prompts. */
export function buildUpperOntologyPromptFragment(): string {
  const lines = UPPER_ONTOLOGY_TAGS.map((tag) => `- ${tag}: ${UPPER_ONTOLOGY_DESCRIPTIONS[tag]}`);
  return `LAYER 1 (UPPER-ONTOLOGY) VOCABULARY — this is a CLOSED SET. Every concept and relationship must be tagged with exactly one of these; never invent a new tag:\n${lines.join('\n')}`;
}

/**
 * Stage 5's promotion service (src/lib/promotion.ts) materializes each Layer 1 tag as a
 * per-module anchor `Concept` row ("never a disconnected new tree" — idea.md §4), marked
 * with this typeFields.marker so every other consumer can recognize and exclude it. These
 * rows are pure hierarchy infrastructure, not real domain concepts — a query that lists
 * "concepts in this ontology" for metrics, graph viz, or a diff must not count them.
 */
export const TAG_ROOT_MARKER = '__layer1_tag_root__';

export function isTagRootConcept(concept: { typeFields?: unknown } | null | undefined): boolean {
  if (!concept) return false;
  const tf = concept.typeFields as any;
  return !!tf && typeof tf === 'object' && tf.marker === TAG_ROOT_MARKER;
}

/**
 * Layer 1 is adopted, never modified (idea.md line 10) — but nothing in this system
 * persists an actual RDF document for it (no external upper-ontology file is wired in yet).
 * This fixed namespace is the single canonical IRI space Stage 6 (src/lib/ttlDiff.ts) uses
 * for every module's Layer 1 references, so e.g. every module's "Agent" tag-root resolves to
 * the SAME IRI (`rdfs:subClassOf`/`owl:equivalentClass` target), never a per-module invented
 * class. Not tied to any customer/tenant namespace — this is shared infrastructure.
 */
export const LAYER1_NAMESPACE = 'http://enterprise.org/ontologies/upper-layer1#';

export function canonicalLayer1Iri(tag: UpperOntologyTag | string): string {
  return `${LAYER1_NAMESPACE}${tag}`;
}
