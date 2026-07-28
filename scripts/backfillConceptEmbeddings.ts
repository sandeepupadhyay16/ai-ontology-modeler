/**
 * One-time backfill: embeds every existing Concept row that doesn't yet have a
 * vector pinned to the current EMBEDDING_MODEL/EMBEDDING_DIM (src/lib/embeddings.ts),
 * using a single batchEmbedContents call. Non-destructive — only ever sets
 * embedding/embeddingModel/embeddingDim on existing Concept rows; never creates,
 * deletes, or touches any other field.
 *
 * Usage: npx tsx --env-file=.env scripts/backfillConceptEmbeddings.ts
 */
import { db } from '../src/lib/db';
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIM,
  buildConceptEmbeddingText,
  embedTextBatch,
  isComparable,
} from '../src/lib/embeddings';

async function main() {
  const allConcepts = await db.concept.findMany({
    select: { id: true, label: true, conceptType: true, description: true, embeddingModel: true, embeddingDim: true },
  });

  const toEmbed = allConcepts.filter((c) => !isComparable(c.embeddingModel, c.embeddingDim));

  console.log(`Total concepts: ${allConcepts.length}`);
  console.log(`Already embedded with current model/dim (${EMBEDDING_MODEL}/${EMBEDDING_DIM}): ${allConcepts.length - toEmbed.length}`);
  console.log(`To backfill: ${toEmbed.length}`);

  if (toEmbed.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const texts = toEmbed.map((c) => buildConceptEmbeddingText(c.label, c.conceptType, c.description));
  const vectors = await embedTextBatch(texts);

  for (let i = 0; i < toEmbed.length; i++) {
    await db.concept.update({
      where: { id: toEmbed[i].id },
      data: {
        embedding: vectors[i],
        embeddingModel: EMBEDDING_MODEL,
        embeddingDim: EMBEDDING_DIM,
      },
    });
  }

  console.log(`Backfilled ${toEmbed.length} concepts.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
