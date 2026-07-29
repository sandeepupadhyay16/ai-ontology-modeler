import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { callLLMProvider, cleanAndParseJSON } from '@/lib/llm';
import { getDomainProfileByKey, buildDomainPromptFragment } from '@/lib/domainProfiles';
import { buildUpperOntologyPromptFragment, isValidUpperOntologyTag, isTagRootConcept } from '@/lib/upperOntology';
import { embedText, buildConceptEmbeddingText, cosineSimilarity, isComparable } from '@/lib/embeddings';
import { classifyBySimilarity, type DupStatus } from '@/lib/duplicateDetection';

// How many prior turns to include as conversation context for extraction.
const CONTEXT_TURN_LIMIT = 6;

/**
 * Extraction schema is a trimmed version of ai-generate/route.ts's generator schema:
 * concepts + relationships only. Driver trees, causal cycles, and perspectives are
 * out of scope for candidate extraction (idea.md's Layer 2/3 modeling boundary), and
 * there is no orphan-weaving mandate here — candidates may be extracted unconnected;
 * connectivity/parenting happens at promotion time (Stage 5), not extraction time.
 */
/** Lists the live graph so the model reuses existing classes/relationships instead of recreating them. */
function buildExistingGraphFragment(
  concepts: { label: string; conceptType: string }[],
  rels: { name: string; source: { label: string } | null; target: { label: string } | null }[]
): string {
  if (!concepts.length && !rels.length) return '';
  const MAX = 150;
  const conceptLines = concepts.slice(0, MAX).map((c) => `- ${c.label} (${c.conceptType})`).join('\n');
  const relLines = rels.slice(0, MAX).map((r) => `- ${r.source?.label ?? '?'} —${r.name}→ ${r.target?.label ?? '?'}`).join('\n');
  return `CURRENT ONTOLOGY — these classes and relationships ALREADY EXIST. Do NOT propose a concept or relationship that is already here or an obvious synonym of one; reuse it instead. You MAY (and should) use these existing classes as the source/target of a NEW relationship.
Existing classes:
${conceptLines || '- (none yet)'}
${relLines ? `Existing relationships:\n${relLines}\n` : ''}`;
}

function buildExtractionSystemPrompt(domainFragment: string, contextText: string, existingGraphFragment: string): string {
  return `You are the AI Ontology Modeling Assistant, extracting candidate concepts from a conversational ontology-modeling session.

${domainFragment}

IMPORTANT: You are extracting CANDIDATES ONLY. These are proposals for a human ontologist to review, edit, merge, or reject later — nothing you output here is written directly to the live ontology graph. Only extract what is grounded in what the user actually said; do not invent unrelated business machinery to "complete" the model. ALWAYS check the CURRENT ONTOLOGY list below first and reuse what already exists — only propose genuinely NEW classes and relationships.

${buildUpperOntologyPromptFragment()}

${existingGraphFragment ? existingGraphFragment + '\n' : ''}
${contextText ? `RECENT CONVERSATION CONTEXT (oldest first):\n${contextText}\n` : ''}
Extract candidate concepts, relationships, and attributes mentioned or implied by the LATEST user turn (given as the user message below). Use the conversation context only to resolve references (e.g. pronouns, "that process", concepts named in earlier turns) — do not re-extract things already fully covered by earlier turns unless the latest turn adds or changes something about them.

Return ONLY a single valid JSON object with this exact schema:
{
  "concepts": [
    {
      "label": "ConceptLabel",
      "candidateType": "Entity|Agent|Process|Event|Metric",
      "upperOntologyTag": "Entity|Event|Agent|Relation|Process|Quality",
      "description": "Short technical description",
      "businessJustification": "One sentence: why this matters to the business (see rule 6)",
      "attributes": [
        { "name": "attrName", "datatype": "string|integer|float|boolean", "description": "description" }
      ]
    }
  ],
  "relationships": [
    {
      "name": "relationshipName",
      "upperOntologyTag": "Entity|Event|Agent|Relation|Process|Quality",
      "description": "Short technical description",
      "businessJustification": "One sentence: what this relationship means for the business (see rule 6)",
      "source": "SourceConceptLabel",
      "target": "TargetConceptLabel",
      "cardinality": "one-to-many"
    }
  ],
  "reply": "A short conversational message to the user (see rule 6)."
}

Rules:
1. Use CamelCase for concept labels and camelCase for attribute names.
2. A relationship's "source"/"target" must exactly match a "label" in this turn's "concepts" list, or name a concept already established earlier in the conversation context.
3. If the turn contains no extractable ontology content (e.g. small talk, a question back to the assistant, an out-of-scope request), return { "concepts": [], "relationships": [] }.
4. Do NOT invent driver trees, causal cycles, or perspectives — they are out of scope for this extraction step.
5. "upperOntologyTag" is REQUIRED on every concept and relationship, and MUST be exactly one of the six Layer 1 tags listed above — never a variant spelling, never a new tag. Most relationships should be tagged "Relation" unless they represent a workflow step ("Process") or a timed occurrence ("Event").
6. "businessJustification" is REQUIRED on every concept and relationship: a ONE-sentence business rationale — why this element belongs in the model and what it means for the organization — grounded only in what the user said. Make it business-oriented (the value/role it plays), not a restatement of the technical "description".
7. "reply" is a conversational message to the user. In it: (a) name the concepts and relationships you extracted THIS turn and briefly say WHY each was created, grounded ONLY in what the user actually said; (b) then ask ONE focused follow-up question, or suggest a concrete direction to explore next (a related concept, a useful attribute, a missing process step). Keep it to 2–4 sentences, plain and specific — no bullet lists, no restating the JSON verbatim. If you extracted nothing this turn, do NOT invent anything: briefly say so and ask a short clarifying question instead.
8. Return ONLY the JSON object. Do not wrap it in markdown code blocks or add any other text.`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const session = await db.modelingSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ error: 'Modeling session not found' }, { status: 404 });
    }

    const priorTurns = await db.conversationTurn.findMany({
      where: { sessionId },
      orderBy: { ordinal: 'desc' },
      take: CONTEXT_TURN_LIMIT,
    });
    const nextOrdinal = priorTurns.length > 0 ? priorTurns[0].ordinal + 1 : 1;
    const trimmedContent = content.trim();

    // Persist the turn first: traceability requires a real sourceTurnId even if extraction fails below.
    const turn = await db.conversationTurn.create({
      data: {
        sessionId,
        ordinal: nextOrdinal,
        role: 'user',
        content: trimmedContent,
      },
    });

    const profile = getDomainProfileByKey(session.domainProfile || '');
    const domainFragment = buildDomainPromptFragment(profile);
    // Extension-by-default (IMPLEMENTATION_PLAN.md cross-cutting: Extension & module
    // handling): every new candidate lands in this session's DOMAIN extension unless an
    // ontologist deliberately promotes it to core at the Stage 5 review gate. Deterministic,
    // never an LLM choice. When the session has no recognized domain (GENERIC profile), there
    // is no meaningful domain to extend — an "extension:generic" module would be noise — so
    // those candidates default to `core` instead.
    const profileKey = profile.key || 'GENERIC';
    const defaultScope = profileKey === 'GENERIC' ? 'core' : `extension:${profileKey.toLowerCase()}`;
    const contextText = priorTurns
      .slice()
      .reverse()
      .map((t) => `[${t.role}] ${t.content}`)
      .join('\n');

    // Give the agent the CURRENT ontology (this ontology + any imported base) so it reuses existing
    // classes/relationships instead of recreating them. Tag-root anchors are excluded from the list.
    const ont = await db.ontology.findUnique({ where: { id: session.ontologyId }, select: { id: true, extendsOntologyId: true } });
    const familyIds = ont?.extendsOntologyId ? [session.ontologyId, ont.extendsOntologyId] : [session.ontologyId];
    const [existingForPrompt, existingRelsForPrompt] = await Promise.all([
      db.concept.findMany({ where: { ontologyId: { in: familyIds } }, select: { label: true, conceptType: true, typeFields: true }, orderBy: { label: 'asc' } }),
      db.relationship.findMany({ where: { ontologyId: { in: familyIds } }, select: { name: true, source: { select: { label: true } }, target: { select: { label: true } } }, orderBy: { name: 'asc' } }),
    ]);
    const existingGraphFragment = buildExistingGraphFragment(
      existingForPrompt.filter((c) => !isTagRootConcept(c)),
      existingRelsForPrompt
    );

    const systemPrompt = buildExtractionSystemPrompt(domainFragment, contextText, existingGraphFragment);

    let extractedConcepts: any[] = [];
    let extractedRelationships: any[] = [];
    let assistantReply = '';
    try {
      const reply = await callLLMProvider(systemPrompt, trimmedContent);
      const parsed = cleanAndParseJSON(reply);
      extractedConcepts = Array.isArray(parsed.concepts) ? parsed.concepts : [];
      extractedRelationships = Array.isArray(parsed.relationships) ? parsed.relationships : [];
      assistantReply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    } catch (err: any) {
      // Non-destructive: the turn is already saved; just report zero candidates for this turn.
      return NextResponse.json({
        turn,
        newCandidates: [],
        error: `Extraction failed: ${err.message || 'unknown error'}`,
      }, { status: 502 });
    }

    const newCandidates = [];

    // Layer 1 is a closed set (idea.md §2): a candidate whose tag isn't in the allowed
    // set is flagged (upperOntologyTag left null, raw value preserved in payload for
    // review) rather than dropped — staging accumulates for human review, so a bad tag
    // on an otherwise-valid candidate shouldn't destroy the extracted content.
    function resolveTag(rawTag: unknown): { tag: string | null; flag: string | null } {
      if (isValidUpperOntologyTag(rawTag)) return { tag: rawTag, flag: null };
      return { tag: null, flag: `Invalid upperOntologyTag from model: ${JSON.stringify(rawTag ?? null)}` };
    }

    // Stage 4: deterministic (cosine-only, no LLM judgment) dup/conflict check against
    // existing live Concept embeddings in this session's ontology. Fetched once per turn,
    // reused for every concept candidate. Relationships are intentionally NOT dup-checked
    // here — CandidateConcept.dupTargetConceptId only ever points at Concept rows, and a
    // relationship candidate isn't the same kind of thing as a Concept, so there's no
    // meaningful target to compare it against.
    const existingConcepts = await db.concept.findMany({
      where: { ontologyId: session.ontologyId },
      select: { id: true, conceptType: true, description: true, embedding: true, embeddingModel: true, embeddingDim: true },
    });
    const comparableConcepts = existingConcepts.filter(
      (c) => isComparable(c.embeddingModel, c.embeddingDim) && c.embedding.length > 0
    );

    async function checkDuplicate(
      label: string,
      candidateType: string,
      description: string
    ): Promise<{ dupStatus: DupStatus | 'UNCHECKED'; dupTargetConceptId: string | null; similarityScore: number | null; dupCheckFlag: string | null }> {
      try {
        // Per-pair shape symmetry (embeddings.ts's buildConceptEmbeddingText doc
        // comment): most existing Concepts still have no description (Stage 5 only
        // populates it going forward, at promotion), so comparing this candidate's
        // full label+type+description vector against a description-less Concept
        // vector would reintroduce the exact Stage 4 shape-mismatch bug. Embed the
        // candidate BOTH ways and pick per-target based on whether that target has
        // its own description.
        const fullText = buildConceptEmbeddingText(label, candidateType, description);
        const degradedText = buildConceptEmbeddingText(label, candidateType, null);
        const hasDescription = !!description?.trim();
        const fullVec = await embedText(fullText);
        const degradedVec = hasDescription ? await embedText(degradedText) : fullVec;

        let best: { id: string; score: number; conceptType: string } | null = null;
        for (const c of comparableConcepts) {
          const vec = c.description?.trim() ? fullVec : degradedVec;
          const score = cosineSimilarity(vec, c.embedding);
          if (!best || score > best.score) best = { id: c.id, score, conceptType: c.conceptType };
        }
        const result = classifyBySimilarity(best?.score ?? null, best?.id ?? null, candidateType, best?.conceptType ?? null);
        return { ...result, dupCheckFlag: null };
      } catch (err: any) {
        // Non-destructive: a failed embedding call must not block candidate creation —
        // just leave dupStatus at its UNCHECKED default and record why on the payload.
        return {
          dupStatus: 'UNCHECKED',
          dupTargetConceptId: null,
          similarityScore: null,
          dupCheckFlag: `Duplicate check failed: ${err.message || 'unknown error'}`,
        };
      }
    }

    for (const concept of extractedConcepts) {
      if (!concept.label || !concept.label.trim()) continue;
      const { tag, flag } = resolveTag(concept.upperOntologyTag);
      const candidateType = concept.candidateType || 'Entity';
      const dup = await checkDuplicate(concept.label.trim(), candidateType, concept.description || '');
      const candidate = await db.candidateConcept.create({
        data: {
          sessionId,
          sourceTurnId: turn.id,
          label: concept.label.trim(),
          candidateType,
          upperOntologyTag: tag,
          scope: defaultScope,
          ...(dup.dupStatus !== 'UNCHECKED' ? { dupStatus: dup.dupStatus } : {}),
          dupTargetConceptId: dup.dupTargetConceptId,
          similarityScore: dup.similarityScore,
          payload: {
            kind: 'concept',
            description: concept.description || '',
            businessJustification: concept.businessJustification || '',
            attributes: Array.isArray(concept.attributes) ? concept.attributes : [],
            ...(flag ? { upperOntologyTagFlag: flag } : {}),
            ...(dup.dupCheckFlag ? { dupCheckFlag: dup.dupCheckFlag } : {}),
          },
        },
      });
      newCandidates.push(candidate);
    }

    for (const rel of extractedRelationships) {
      if (!rel.name || !rel.source || !rel.target) continue;
      const { tag, flag } = resolveTag(rel.upperOntologyTag);
      const candidate = await db.candidateConcept.create({
        data: {
          sessionId,
          sourceTurnId: turn.id,
          label: rel.name.trim(),
          candidateType: 'Relationship',
          upperOntologyTag: tag,
          scope: defaultScope,
          payload: {
            kind: 'relationship',
            description: rel.description || '',
            businessJustification: rel.businessJustification || '',
            source: rel.source,
            target: rel.target,
            cardinality: rel.cardinality || 'one-to-many',
            ...(flag ? { upperOntologyTagFlag: flag } : {}),
          },
        },
      });
      newCandidates.push(candidate);
    }

    const allCandidates = await db.candidateConcept.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      turn,
      newCandidates,
      candidates: allCandidates,
      reply: assistantReply,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to process turn' }, { status: 500 });
  }
}
