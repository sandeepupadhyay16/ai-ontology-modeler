/**
 * Stage 8 — business-rule elicitation (idea.md §6: "conversational elicitation that turns
 * vague statements into explicit thresholds — e.g. if the user says 'formulary tier
 * determines access priority,' the agent asks 'what specific tier levels map to which
 * priority?' rather than leaving it implicit"). Output: a structured rule entry
 * (condition -> derived value), tagged to the ontology property it reads from.
 *
 * Storage decision (owner, Stage 8): rules are stored as DATA (RuleDraft), not compiled
 * straight to SHACL/SPARQL. Compilation is a later pass once shapes stabilize.
 *
 * Mirrors src/lib/glossary.ts: one grounded, batched LLM call per changeset, non-fatal on
 * failure (a drafting failure must never undo the already-live promotion), idempotent
 * (re-running skips properties that already have a rule under this changeset), and staging
 * only — a RuleDraft is never written into the live rules store; it awaits conversational
 * confirmation (PATCH /api/rules/[id]).
 *
 * A rule reads from exactly one ontology property: a datatype property (Attribute) or an
 * object property (Relationship). We resolve the model's property reference against the
 * properties this changeset actually promoted, so a rule is always grounded in a real,
 * DB-enforced FK (linkedAttributeId / linkedRelationshipId). Vague rules still get drafted,
 * with `clarifyingQuestion` set so the ontologist can pin the thresholds before confirming.
 */
import { db } from './db';
import { callLLMProvider, cleanAndParseJSON } from './llm';

export interface RuleDraftSkip {
  name: string;
  reason: string;
}

export interface RuleDraftResult {
  changeSetId: string;
  created: any[];
  skipped: RuleDraftSkip[];
}

interface AttributeRef {
  id: string;
  name: string;
  conceptLabel: string;
}

function buildElicitationSystemPrompt(): string {
  return `You are the AI Ontology Modeling Assistant, eliciting business rules from a modeling conversation.

A business rule is derived logic of the form CONDITION -> DERIVED VALUE that reads from ONE ontology property. Look ONLY for genuine derived logic the conversation implies (statements like "X determines Y", "Y is based on X", "if X then Y", "X drives Y"). Do NOT invent rules that were not implied.

Each rule must read from exactly one property listed under AVAILABLE PROPERTIES below — reference it by its EXACT name string. A property is either an ATTRIBUTE (a datatype field of a class) or a RELATIONSHIP (an object property between classes).

Crucially (idea.md §6): if the conversation states the derived logic but NOT the specific thresholds/mappings (e.g. "formulary tier determines access priority" without saying which tiers map to which priority), still draft the rule but set "clarifyingQuestion" to the precise question that would pin it down (e.g. "Which formulary tier levels map to which access priority values?"). Leave condition/derivedValue as your best partial structuring. If the thresholds ARE explicit, set clarifyingQuestion to null.

Return ONLY a single valid JSON object with this exact schema:
{
  "rules": [
    {
      "name": "ShortRuleName",
      "readsFromType": "Attribute" | "Relationship",
      "readsFromName": "exact name from AVAILABLE PROPERTIES",
      "condition": { "description": "plain-English condition", "expression": "e.g. formularyTier in {Tier1, Tier2}" },
      "derivedValue": { "description": "plain-English result", "expression": "e.g. accessPriority = High" },
      "clarifyingQuestion": "question to pin vague thresholds, or null if fully specified"
    }
  ]
}

Rules:
1. Only reference properties that appear in AVAILABLE PROPERTIES, by exact name.
2. If the conversation implies no derived logic, return {"rules": []}.
3. Return ONLY the JSON object. No markdown fences, no other text.`;
}

/**
 * Drafts RuleDraft rows for the derived logic implied by this ChangeSet's promotion.
 * Idempotent: skips any property that already has a RuleDraft under this changeset.
 */
export async function generateRuleDrafts(changeSetId: string): Promise<RuleDraftResult> {
  const changeSet = await db.changeSet.findUnique({ where: { id: changeSetId } });
  if (!changeSet) throw new Error('ChangeSet not found');

  const candidates = await db.candidateConcept.findMany({
    where: { changeSetId, decision: 'ACCEPTED' },
  });

  const promotedConceptIds = candidates
    .filter((c) => (c.payload as any)?.kind !== 'relationship' && c.promotedConceptId)
    .map((c) => c.promotedConceptId!);
  const promotedRelationshipIds = candidates
    .filter((c) => (c.payload as any)?.kind === 'relationship' && c.promotedRelationshipId)
    .map((c) => c.promotedRelationshipId!);

  // Properties this changeset actually created: attributes of promoted concepts + promoted
  // relationships. These are the only things a rule from this changeset may be tagged to.
  const concepts = promotedConceptIds.length
    ? await db.concept.findMany({ where: { id: { in: promotedConceptIds } }, include: { attributes: true } })
    : [];
  const relationships = promotedRelationshipIds.length
    ? await db.relationship.findMany({ where: { id: { in: promotedRelationshipIds } } })
    : [];

  const attrByName = new Map<string, AttributeRef>();
  for (const c of concepts) {
    for (const a of c.attributes) {
      // last-writer-wins on duplicate names is fine — resolution is a best-effort grounding
      attrByName.set(a.name.toLowerCase(), { id: a.id, name: a.name, conceptLabel: c.label });
    }
  }
  const relByName = new Map<string, { id: string; name: string }>();
  for (const r of relationships) relByName.set(r.name.toLowerCase(), { id: r.id, name: r.name });

  if (attrByName.size === 0 && relByName.size === 0) {
    return { changeSetId, created: [], skipped: [] };
  }

  // Idempotency: which properties already carry a rule under this changeset.
  const existing = await db.ruleDraft.findMany({ where: { changeSetId } });
  const ruledAttrIds = new Set(existing.map((r) => r.linkedAttributeId).filter(Boolean));
  const ruledRelIds = new Set(existing.map((r) => r.linkedRelationshipId).filter(Boolean));

  // Grounding: the session's conversation is where the derived logic was actually stated.
  const turns = await db.conversationTurn.findMany({
    where: { sessionId: changeSet.sessionId },
    orderBy: { ordinal: 'asc' },
  });
  const conversationText = turns.map((t) => `[${t.role}] ${t.content}`).join('\n');

  const attrLines = [...attrByName.values()].map((a) => `- ATTRIBUTE "${a.name}" (of ${a.conceptLabel})`);
  const relLines = [...relByName.values()].map((r) => `- RELATIONSHIP "${r.name}"`);

  const userPrompt = `CONVERSATION:\n${conversationText || '(none)'}\n\nAVAILABLE PROPERTIES:\n${[...attrLines, ...relLines].join('\n')}`;

  const skipped: RuleDraftSkip[] = [];
  let parsedRules: any[] = [];
  try {
    const reply = await callLLMProvider(buildElicitationSystemPrompt(), userPrompt);
    const parsed = cleanAndParseJSON(reply);
    parsedRules = Array.isArray(parsed.rules) ? parsed.rules : [];
  } catch (err: any) {
    // Non-fatal, same tolerance as glossary/promotion: report and allow retry.
    return { changeSetId, created: [], skipped: [{ name: '(all)', reason: `Rule elicitation call failed: ${err.message || 'unknown error'}` }] };
  }

  const created: any[] = [];
  for (const r of parsedRules) {
    const name = (r?.name || '').toString().trim() || 'UnnamedRule';
    const refName = (r?.readsFromName || '').toString().trim().toLowerCase();
    if (!refName) {
      skipped.push({ name, reason: 'rule did not reference a property' });
      continue;
    }

    let linkedAttributeId: string | null = null;
    let linkedRelationshipId: string | null = null;
    if (r.readsFromType === 'Relationship' && relByName.has(refName)) {
      linkedRelationshipId = relByName.get(refName)!.id;
    } else if (attrByName.has(refName)) {
      linkedAttributeId = attrByName.get(refName)!.id;
    } else if (relByName.has(refName)) {
      linkedRelationshipId = relByName.get(refName)!.id;
    }

    if (!linkedAttributeId && !linkedRelationshipId) {
      skipped.push({ name, reason: `references a property not created by this changeset: "${r.readsFromName}"` });
      continue;
    }
    if ((linkedAttributeId && ruledAttrIds.has(linkedAttributeId)) || (linkedRelationshipId && ruledRelIds.has(linkedRelationshipId))) {
      skipped.push({ name, reason: 'this property already has a rule under this changeset' });
      continue;
    }

    const draft = await db.ruleDraft.create({
      data: {
        changeSetId,
        linkedAttributeId,
        linkedRelationshipId,
        condition: r.condition && typeof r.condition === 'object' ? r.condition : { description: String(r?.condition ?? ''), expression: '' },
        derivedValue: r.derivedValue && typeof r.derivedValue === 'object' ? r.derivedValue : { description: String(r?.derivedValue ?? ''), expression: '' },
        clarifyingQuestion: typeof r.clarifyingQuestion === 'string' && r.clarifyingQuestion.trim() ? r.clarifyingQuestion.trim() : null,
        // best-effort provenance: the last turn is where elicitation ran; fall back to a
        // promoted candidate's own (always-valid) sourceTurnId so the required FK never breaks.
        sourceTurnId: turns.length ? turns[turns.length - 1].id : candidates[0].sourceTurnId,
      },
    });
    // Mark this property as ruled so a second rule in the same batch can't double-link it.
    if (linkedAttributeId) ruledAttrIds.add(linkedAttributeId);
    if (linkedRelationshipId) ruledRelIds.add(linkedRelationshipId);
    created.push(draft);
  }

  return { changeSetId, created, skipped };
}
