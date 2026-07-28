/**
 * Gemini embedding generation for deterministic duplicate/conflict detection
 * (idea.md §2.3 / Stage 4). This is a separate API surface from chat completions
 * (embedContent/batchEmbedContents, not generateContent) — deliberately NOT routed
 * through callLLMProvider (src/lib/llm.ts), which is chat-completion-shaped.
 *
 * Model + dimension confirmed live (2026-07-27) against
 * https://ai.google.dev/gemini-api/docs/embeddings and https://ai.google.dev/api/embeddings,
 * cross-checked against this project's own GET /v1beta/models listing — not hardcoded
 * from memory:
 *   - gemini-embedding-2 is the current stable/GA model (supersedes gemini-embedding-001).
 *   - Supports outputDimensionality from 128-3072 via Matryoshka Representation Learning
 *     truncation; Google recommends 768, 1536, or 3072.
 *   - gemini-embedding-2 auto-normalizes truncated output (unlike gemini-embedding-001,
 *     which required manual re-normalization) — no extra normalization step needed here
 *     before cosine similarity.
 *
 * Vectors are ONLY comparable within the same model+dim — see EMBEDDING_MODEL/EMBEDDING_DIM
 * below and Concept.embeddingModel/embeddingDim in prisma/schema.prisma. isComparable()
 * is the single gate that must be checked before any cosine comparison.
 */

export const EMBEDDING_MODEL = 'gemini-embedding-2';
export const EMBEDDING_DIM = 768;

const EMBEDDING_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function resolveEmbeddingApiKey(): string {
  // Same dev-only governance as callLLMProvider's env fallback (src/lib/llm.ts):
  // embeddings also egress domain text to an external provider, so an unconfigured
  // production environment must fail loudly rather than silently call out.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Embedding generation has no explicit production configuration. The GEMINI_API_KEY dev-only fallback is disabled in production — configure an embedding provider explicitly before calling this.'
    );
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in the environment — required for embedding generation in dev.');
  }
  return apiKey;
}

function embedContentConfig() {
  return { outputDimensionality: EMBEDDING_DIM, taskType: 'SEMANTIC_SIMILARITY' as const };
}

function assertShape(values: unknown, context: string): number[] {
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIM || !values.every((v) => typeof v === 'number')) {
    throw new Error(`Unexpected embedding shape from Gemini (${context}): expected ${EMBEDDING_DIM} numeric dims, got ${Array.isArray(values) ? values.length : typeof values}`);
  }
  return values as number[];
}

/** Embeds a single piece of text — used for per-candidate checks in the turn pipeline. */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = resolveEmbeddingApiKey();
  const response = await fetch(`${EMBEDDING_API_BASE}/models/${EMBEDDING_MODEL}:embedContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      embedContentConfig: embedContentConfig(),
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini embedContent returned an error: ${errText}`);
  }
  const data = await response.json();
  return assertShape(data.embedding?.values, 'embedContent');
}

/** Embeds many texts in a single request — used for the existing-Concept backfill. */
export async function embedTextBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = resolveEmbeddingApiKey();
  const response = await fetch(`${EMBEDDING_API_BASE}/models/${EMBEDDING_MODEL}:batchEmbedContents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        embedContentConfig: embedContentConfig(),
      })),
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini batchEmbedContents returned an error: ${errText}`);
  }
  const data = await response.json();
  const embeddings = data.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    throw new Error(`Unexpected batchEmbedContents response shape: expected ${texts.length} embeddings, got ${Array.isArray(embeddings) ? embeddings.length : typeof embeddings}`);
  }
  return embeddings.map((e: any, i: number) => assertShape(e?.values, `batchEmbedContents[${i}]`));
}

/**
 * Canonical text used to embed BOTH a live Concept and a candidate concept for
 * dup/conflict comparison. Stage 4 found live that comparing text of mismatched
 * "shape" — a verbose LLM-written description against a bare "Type: Label" —
 * under-scores genuine near-duplicates (0.80 instead of ~0.92), because the
 * extra prose dilutes the similarity signal rather than sharpening it. So the
 * two sides being compared must always use the same shape.
 *
 * `Concept.description` was added in Stage 5 (previously this schema had no
 * description column on Concept at all, forcing label+type-only). Passing a
 * description now folds it in for richer matches (idea.md §2.3's Payer≈Insurer
 * case — same concept, different label, only distinguishable via description).
 * Omitting/empty description degrades gracefully to the Stage 4 label+type form.
 *
 * IMPORTANT — per-pair symmetry is the caller's responsibility: many existing
 * Concept rows still have no description (nothing backfills it retroactively;
 * Stage 5 only populates it going forward at promotion). If a candidate WITH a
 * description were embedded once with that description and compared against a
 * legacy Concept embedded WITHOUT one, the exact Stage 4 shape-mismatch bug
 * would reappear. Callers must embed the candidate BOTH ways (see
 * src/app/api/sessions/[id]/turns/route.ts's checkDuplicate) and pick whichever
 * vector matches the shape of each target Concept's own stored embedding.
 */
export function buildConceptEmbeddingText(
  label: string,
  typeLabel?: string | null,
  description?: string | null
): string {
  const base = typeLabel ? `${typeLabel}: ${label}` : label;
  const trimmedDescription = description?.trim();
  return trimmedDescription ? `${base}. ${trimmedDescription}` : base;
}

/** Deterministic cosine similarity — the auditable, non-LLM half of dup/conflict detection. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Cannot compare embeddings of different length (${a.length} vs ${b.length}) — likely a model/dim mismatch; check isComparable() first.`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Guard: only compare vectors produced by the currently-pinned model+dim. */
export function isComparable(model: string | null | undefined, dim: number | null | undefined): boolean {
  return model === EMBEDDING_MODEL && dim === EMBEDDING_DIM;
}
