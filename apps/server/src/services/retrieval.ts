import type { Concept, EmotionState, SessionPrefs } from '../types';
import { embed } from './embedding';
import { store } from '../store';

/**
 * Semantic Cinematic Retrieval
 * ────────────────────────────
 * Translates a live emotional state (+ user preferences) into a natural
 * language query, embeds it, and retrieves the nearest cinematic concepts
 * from the vector space. Works identically against Atlas Vector Search or
 * the in-memory cosine fallback.
 */

const AROUSAL_WORDS: Array<[number, string]> = [
  [-1.0, 'still meditative near-sleep'],
  [-0.5, 'calm unhurried'],
  [0.0, 'steady measured'],
  [0.5, 'propulsive restless'],
  [1.0, 'frantic explosive high-voltage'],
];

const VALENCE_WORDS: Array<[number, string]> = [
  [-1.0, 'devastating bleak sorrowful'],
  [-0.5, 'melancholic bittersweet'],
  [0.0, 'wistful ambiguous'],
  [0.5, 'warm hopeful'],
  [1.0, 'euphoric joyful luminous'],
];

function wordFor(table: Array<[number, string]>, x: number): string {
  let best = table[0];
  for (const row of table) {
    if (Math.abs(row[0] - x) < Math.abs(best[0] - x)) best = row;
  }
  return best[1];
}

export function buildEmotionQuery(state: EmotionState, prefs?: SessionPrefs): string {
  const topLabels = state.labels.slice(0, 3).map((l) => l.emotion);
  const genres = prefs?.genres ?? [];
  return [
    `emotion: ${state.dominant}`,
    `feelings: ${topLabels.join(' ')}`,
    `mood: ${wordFor(VALENCE_WORDS, state.valence)} ${wordFor(AROUSAL_WORDS, state.arousal)}`,
    genres.length > 0 ? `genres: ${genres.join(' ')}` : '',
    'cinematography film style color palette soundtrack',
  ]
    .filter(Boolean)
    .join(', ');
}

export interface RetrievalHit extends Concept {
  score: number;
}

export async function retrieveByEmotion(
  state: EmotionState,
  prefs: SessionPrefs | undefined,
  k = 6,
): Promise<{ query: string; hits: RetrievalHit[]; provider: string }> {
  const query = buildEmotionQuery(state, prefs);
  const { vector, provider } = await embed(query);
  const hits = await store().searchConcepts(vector, k);
  return { query, hits, provider };
}

export async function retrieveByText(query: string, k = 8): Promise<RetrievalHit[]> {
  const { vector } = await embed(query);
  return store().searchConcepts(vector, k);
}
