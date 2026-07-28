/**
 * Deterministic, cosine-similarity-only duplicate/conflict classification for
 * candidate concepts (idea.md §2.3 / Stage 4 — "Deterministic and auditable — not
 * LLM judgment"). No model call is made here; this is pure arithmetic over vectors
 * already produced by src/lib/embeddings.ts.
 *
 * POSSIBLE_DUP_THRESHOLD calibrated (2026-07-27, Stage 4) and re-verified
 * (2026-07-28, Stage 5) against real gemini-embedding-2 (768-dim,
 * SEMANTIC_SIMILARITY) vectors — see docs/worklog/STAGE-4.md and
 * docs/worklog/STAGE-5.md for the full tables. Stage 5 added `description` to
 * the embedded text (idea.md §2.3's Payer≈Insurer case — same concept,
 * different label, only distinguishable via description) and re-ran
 * calibration to confirm 0.90 still holds once description is folded in,
 * PROVIDED both sides of a comparison use the same text shape (see
 * buildConceptEmbeddingText's doc comment — this is the caller's job, not
 * this module's). Summary of what was measured:
 *   - identical label+type+description                         -> 1.0000
 *   - paraphrase, same description meaning                      -> 0.9389
 *   - Payer vs Insurer, label+type+description (idea.md §2.3)   -> 0.9112
 *   - Payer vs Insurer, label+type ONLY (no description)        -> 0.8641 (would be missed — why description matters)
 *   - same label+description, type token only differs           -> 0.9347 (CONFLICT case, see below)
 *   - related-but-distinct concept, same domain                 -> 0.8593
 *   - same domain, clearly different type/purpose                -> 0.8211
 *   - unrelated concept, different domain                        -> 0.6972
 * That data shows the same clean gap Stage 4 found: genuine matches cluster
 * >=0.90, legitimately distinct concepts in the same domain cluster <=0.86.
 */

/** A match at/above this is either the same concept (POSSIBLE_DUP) or the same concept with a disagreeing type (CONFLICT). */
export const POSSIBLE_DUP_THRESHOLD = 0.9;

export type DupStatus = 'UNIQUE' | 'POSSIBLE_DUP' | 'CONFLICT';

export interface DupCheckResult {
  dupStatus: DupStatus;
  dupTargetConceptId: string | null;
  similarityScore: number | null;
}

/**
 * Classifies a best-match similarity score into a dupStatus.
 *
 * Stage 5 redefinition (dropped the Stage 4 magnitude-based CONFLICT_THRESHOLD):
 * `similarityScore` already carries confidence, so a second magnitude tier added
 * nothing but an arbitrary cutoff. CONFLICT now means something real — "this is
 * almost certainly the same real-world concept, but the candidate and the
 * matched Concept disagree on what KIND of thing it is" (e.g. one says Entity,
 * the other says Process for what is textually the same concept) — a genuine
 * modeling conflict for the ontologist to resolve, not just a wording variant.
 * POSSIBLE_DUP is a match with agreeing (or unknown) type. Still pure
 * arithmetic + string comparison — no LLM judgment.
 */
export function classifyBySimilarity(
  bestScore: number | null,
  bestConceptId: string | null,
  candidateType?: string | null,
  matchedConceptType?: string | null
): DupCheckResult {
  if (bestScore === null || bestConceptId === null) {
    return { dupStatus: 'UNIQUE', dupTargetConceptId: null, similarityScore: null };
  }
  if (bestScore < POSSIBLE_DUP_THRESHOLD) {
    return { dupStatus: 'UNIQUE', dupTargetConceptId: null, similarityScore: bestScore };
  }
  const typeDisagrees =
    !!candidateType && !!matchedConceptType && candidateType !== matchedConceptType;
  return {
    dupStatus: typeDisagrees ? 'CONFLICT' : 'POSSIBLE_DUP',
    dupTargetConceptId: bestConceptId,
    similarityScore: bestScore,
  };
}
