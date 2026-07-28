/**
 * Stage 7 — glossary drafting (idea.md §5: "agent drafts a plain-English definition for
 * each new class/property and confirms it conversationally... rather than routing to a
 * silent review queue"). For every NEW class (Concept) and NEW property (Relationship) a
 * ChangeSet actually created, draft a definition via one grounded, batched LLM call and
 * stage it as a GlossaryDraft — never written straight to the live graph, and never
 * auto-confirmed. Confirmation (PATCH /api/glossary/[id]) is a separate, human step.
 *
 * Scope — "class/property" = Concept/Relationship only, deliberately excluding
 * Attributes: GlossaryDraft's schema only has linkedConceptId/linkedRelationshipId (no
 * linkedAttributeId), matching idea.md's own "linked ontology property" wording, which in
 * this schema means an object property (Relationship), not a datatype attribute.
 * Merge-target candidates are excluded too — a MERGED candidate's target Concept already
 * existed before this changeset, so it is not a "new" class; only its (already-drafted or
 * undrafted) prior glossary status applies, unaffected by this pass.
 *
 * GlossaryDraft.definition vs Concept.description (explicit design decision — see
 * docs/worklog/STAGE-7.md): these are separate fields, never synced. Concept.description is
 * a structural field set at promotion time (Stage 5) that also feeds the embedding text
 * (src/lib/embeddings.ts) and the TTL rdfs:comment (src/lib/ttlDiff.ts) — it is not owned by
 * the glossary confirmation lifecycle. GlossaryDraft.definition is the human-facing artifact
 * idea.md's confirm step ("Does this capture what you meant by X?") can revise before
 * confirmation, tracked via its own confirmationStatus. Concept.description IS passed to the
 * LLM as grounding context (so the draft doesn't contradict what's already been said), but
 * the two fields are independently persisted and may diverge after conversational edits.
 */
import { db } from './db';
import { callLLMProvider, cleanAndParseJSON } from './llm';

export interface GlossaryDraftSkip {
  term: string;
  reason: string;
}

export interface GlossaryDraftResult {
  changeSetId: string;
  created: any[];
  skipped: GlossaryDraftSkip[];
}

interface DraftTarget {
  term: string;
  linkedConceptId: string | null;
  linkedRelationshipId: string | null;
  sourceTurnId: string;
  contextLines: string[];
}

function buildDraftingSystemPrompt(): string {
  return `You are the AI Ontology Modeling Assistant, drafting glossary definitions for newly approved ontology terms.

Each term below is either a CLASS (a concept/entity type) or a PROPERTY (a relationship between two classes). Write ONE short, plain-English definition per term — a sentence or two, understandable by a business stakeholder, not a technical schema description. Ground the definition in the label, type, and any existing description/attributes/endpoints given for that term — do not invent facts not implied by the input.

Return ONLY a single valid JSON object with this exact schema:
{
  "definitions": [
    { "term": "ExactTermLabelGivenBelow", "definition": "Plain-English definition." }
  ]
}

Rules:
1. Include exactly one entry per term listed in the input, using the EXACT term string given (case-sensitive — it is used to link the definition back to its term).
2. Return ONLY the JSON object. No markdown fences, no other text.`;
}

/**
 * Drafts glossary entries for every ACCEPTED (never MERGED), not-yet-drafted concept or
 * relationship this ChangeSet promoted. Idempotent: re-invoking for the same changeSetId
 * skips terms that already have a GlossaryDraft row under it, so calling this twice (e.g. a
 * UI retry) never creates duplicate drafts.
 */
export async function generateGlossaryDrafts(changeSetId: string): Promise<GlossaryDraftResult> {
  const changeSet = await db.changeSet.findUnique({ where: { id: changeSetId } });
  if (!changeSet) throw new Error('ChangeSet not found');

  const candidates = await db.candidateConcept.findMany({
    where: { changeSetId, decision: 'ACCEPTED' },
  });

  const existingDrafts = await db.glossaryDraft.findMany({ where: { changeSetId } });
  const draftedConceptIds = new Set(existingDrafts.map((d) => d.linkedConceptId).filter(Boolean));
  const draftedRelationshipIds = new Set(existingDrafts.map((d) => d.linkedRelationshipId).filter(Boolean));

  const targets: DraftTarget[] = [];
  const skipped: GlossaryDraftSkip[] = [];

  const conceptCandidates = candidates.filter((c) => (c.payload as any)?.kind !== 'relationship' && c.promotedConceptId);
  const relCandidates = candidates.filter((c) => (c.payload as any)?.kind === 'relationship' && c.promotedRelationshipId);

  if (conceptCandidates.length > 0) {
    const concepts = await db.concept.findMany({
      where: { id: { in: conceptCandidates.map((c) => c.promotedConceptId!) } },
      include: { attributes: true },
    });
    const conceptById = new Map(concepts.map((c) => [c.id, c]));
    for (const candidate of conceptCandidates) {
      const concept = conceptById.get(candidate.promotedConceptId!);
      if (!concept) continue;
      if (draftedConceptIds.has(concept.id)) {
        skipped.push({ term: concept.label, reason: 'already has a glossary draft under this changeset' });
        continue;
      }
      const attrNames = concept.attributes.map((a) => a.name).join(', ');
      targets.push({
        term: concept.label,
        linkedConceptId: concept.id,
        linkedRelationshipId: null,
        sourceTurnId: candidate.sourceTurnId,
        contextLines: [
          `Term: ${concept.label} (CLASS, type: ${concept.conceptType})`,
          concept.description ? `Existing description: ${concept.description}` : '',
          attrNames ? `Attributes: ${attrNames}` : '',
        ].filter(Boolean),
      });
    }
  }

  if (relCandidates.length > 0) {
    const rels = await db.relationship.findMany({
      where: { id: { in: relCandidates.map((c) => c.promotedRelationshipId!) } },
      include: { source: true, target: true },
    });
    const relById = new Map(rels.map((r) => [r.id, r]));
    for (const candidate of relCandidates) {
      const rel = relById.get(candidate.promotedRelationshipId!);
      if (!rel) continue;
      if (draftedRelationshipIds.has(rel.id)) {
        skipped.push({ term: rel.name, reason: 'already has a glossary draft under this changeset' });
        continue;
      }
      targets.push({
        term: rel.name,
        linkedConceptId: null,
        linkedRelationshipId: rel.id,
        sourceTurnId: candidate.sourceTurnId,
        contextLines: [
          `Term: ${rel.name} (PROPERTY, relates ${rel.source.label} -> ${rel.target.label}, cardinality: ${rel.cardinality})`,
          rel.description ? `Existing description: ${rel.description}` : '',
        ].filter(Boolean),
      });
    }
  }

  if (targets.length === 0) {
    return { changeSetId, created: [], skipped };
  }

  const systemPrompt = buildDraftingSystemPrompt();
  const userPrompt = targets.map((t) => t.contextLines.join('\n')).join('\n\n');

  const definitionsByTerm = new Map<string, string>();
  try {
    const reply = await callLLMProvider(systemPrompt, userPrompt);
    const parsed = cleanAndParseJSON(reply);
    const defs = Array.isArray(parsed.definitions) ? parsed.definitions : [];
    for (const d of defs) {
      if (d?.term && typeof d.definition === 'string' && d.definition.trim()) {
        definitionsByTerm.set(d.term, d.definition.trim());
      }
    }
  } catch (err: any) {
    // Non-destructive, same tolerance as promotion.ts's embed failures: a drafting failure
    // must not block the (already-live) promotion or crash the caller. Every target is
    // reported in `skipped` and can be retried later by calling this again.
    for (const t of targets) {
      skipped.push({ term: t.term, reason: `Drafting call failed: ${err.message || 'unknown error'}` });
    }
    return { changeSetId, created: [], skipped };
  }

  const created: any[] = [];
  for (const t of targets) {
    const definition = definitionsByTerm.get(t.term);
    if (!definition) {
      skipped.push({ term: t.term, reason: 'model did not return a definition for this term' });
      continue;
    }
    const draft = await db.glossaryDraft.create({
      data: {
        changeSetId,
        linkedConceptId: t.linkedConceptId,
        linkedRelationshipId: t.linkedRelationshipId,
        term: t.term,
        definition,
        sourceTurnId: t.sourceTurnId,
      },
    });
    created.push(draft);
  }

  return { changeSetId, created, skipped };
}
