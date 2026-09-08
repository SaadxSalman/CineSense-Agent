import { store } from '../store';
import { CONCEPT_SEEDS } from '../data/concepts';
import { embed } from './embedding';

/**
 * Semantic Cinematic Retrieval needs a populated vector space. The server
 * self-seeds an empty store on boot (in-memory store is per-process, so this
 * guarantees the concept library exists no matter how the server starts).
 * `scripts/seed_concepts.ts` at the repo root re-runs this explicitly —
 * e.g. after switching to MongoDB or a different embedding provider.
 */
export async function ensureConceptsSeeded(force = false): Promise<number> {
  const s = store();
  const existing = await s.countConcepts();
  if (existing > 0 && !force) {
    return existing;
  }
  const docs = await Promise.all(
    CONCEPT_SEEDS.map(async (c) => ({
      ...c,
      embedding: (
        await embed(
          `${c.title} ${c.year ?? ''} ${c.mood} ${c.genres.join(' ')} ${c.tags.join(' ')} ${c.pacing} pacing ${c.styleNotes}`,
        )
      ).vector,
    })),
  );
  await s.upsertConcepts(docs);
  return docs.length;
}
