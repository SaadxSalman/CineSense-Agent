import { CONFIG } from '../config';
import { MemoryStore } from './memory';
import { MongoStore } from './mongo';
import type { Store } from './store';

const globalForStore = globalThis as unknown as { __cinesenseStore?: Store };

/**
 * Store selection: MongoDB when MONGODB_URI is reachable, otherwise the
 * built-in MemoryStore. Both expose the exact same interface, so the rest of
 * the system is unaware of the swap.
 */
export async function initStore(): Promise<Store> {
  if (globalForStore.__cinesenseStore) return globalForStore.__cinesenseStore;

  let store: Store = new MemoryStore();

  if (CONFIG.mongodbUri) {
    try {
      const mongo = new MongoStore(CONFIG.mongodbUri);
      // Await the real connection promise — surfaces the actual failure
      // reason (auth, DNS/SRV, network access) if Atlas is unreachable.
      await mongo.ready;
      store = mongo;
    } catch (err) {
      console.warn(
        `[store] MongoDB unavailable (${(err as Error).message}); falling back to in-memory store.`,
      );
      store = new MemoryStore();
    }
  }

  globalForStore.__cinesenseStore = store;
  console.log(`[store] Using ${store.kind} store`);
  return store;
}

export function store(): Store {
  const s = globalForStore.__cinesenseStore;
  if (!s) throw new Error('Store not initialized — call initStore() first');
  return s;
}
