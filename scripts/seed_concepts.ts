/**
 * Explicit (re-)seeding of the cinematic concept library into the configured
 * store. The server also auto-seeds on boot when its store is empty — this
 * script exists for the MongoDB workflow and for re-embedding after changing
 * the embedding provider/dimension.
 *
 * Usage:
 *   npm run seed                 # seed via .env config (Mongo if set, else memory of this process)
 *   npm run seed -- --force      # re-embed and upsert even if concepts exist
 */
import { initStore, store } from '../apps/server/src/store';
import { CONCEPT_SEEDS } from '../apps/server/src/data/concepts';
import { embed } from '../apps/server/src/services/embedding';

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const s = await initStore();

  const existing = await s.countConcepts();
  if (existing > 0 && !force) {
    console.log(`Store "${s.kind}" already has ${existing} concepts. Use --force to re-embed.`);
    return;
  }

  console.log(`Embedding ${CONCEPT_SEEDS.length} concepts (local process, store=${s.kind})…`);
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
  console.log(`✅ Seeded ${docs.length} cinematic concepts into the ${s.kind} store.`);
  if (s.kind === 'memory') {
    console.log('   Note: the in-memory store is per-process. The running server seeds');
    console.log('   its own memory store on boot, so the UI works without this step.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
