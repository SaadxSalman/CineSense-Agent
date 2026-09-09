import { CONFIG } from '../config';
import { fnv1a, l2Normalize } from '../lib/math';

/**
 * Embeddings for Semantic Cinematic Retrieval.
 *
 * provider = "local" (default): deterministic hashed n-gram embedding.
 * Zero dependencies, stable across restarts, and consistent because the SAME
 * function embeds both the seeded concepts and incoming queries — cosine
 * similarity is therefore meaningful without any external API.
 *
 * provider = "openai": uses an OpenAI-compatible /embeddings endpoint when
 * OPENAI_API_KEY is set (recommended for production-grade retrieval).
 */

function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]}_${words[i + 1]}`);
  }
  return [...words, ...bigrams];
}

/** Local deterministic hashed embedding with sublinear TF weighting. */
export function localEmbed(text: string, dim: number): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = tokenize(text);
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [token, tf] of counts) {
    const weight = 1 + Math.log(tf); // sublinear TF
    // Two independent hash buckets reduce collision artifacts (signed hashing).
    const h1 = fnv1a(token);
    const h2 = fnv1a(`salt:${token}`);
    const i1 = h1 % dim;
    const i2 = h2 % dim;
    const sign1 = (h1 & 1) === 0 ? 1 : -1;
    const sign2 = (h2 & 1) === 0 ? 1 : -1;
    vec[i1] += sign1 * weight;
    vec[i2] += 0.5 * sign2 * weight;
  }
  return l2Normalize(vec);
}

export interface EmbedResult {
  vector: number[];
  provider: 'local' | 'openai';
}

export async function embed(text: string): Promise<EmbedResult> {
  const { provider, dim, openaiApiKey } = CONFIG.embedding;

  if (provider === 'openai' && openaiApiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
        const vector = json.data?.[0]?.embedding;
        if (Array.isArray(vector) && vector.length > 0) {
          return { vector, provider: 'openai' };
        }
      } else {
        console.warn(
          `[embeddings] OpenAI embeddings responded ${res.status} — falling back to local provider`,
        );
      }
    } catch (err) {
      console.warn(
        `[embeddings] OpenAI embeddings unreachable (${(err as Error).message}) — falling back to local provider`,
      );
    }
  }

  return { vector: localEmbed(text, dim), provider: 'local' };
}
