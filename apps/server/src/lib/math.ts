/** Small numeric helpers shared by the emotion agents and retrieval. */

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Linear normalization of x from [lo, hi] into [0, 1], clamped. */
export function norm(x: number, lo: number, hi: number): number {
  if (hi === lo) return 0.5;
  return clamp((x - lo) / (hi - lo), 0, 1);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Softmax over negative squared distance — turns distances into label weights. */
export function softmaxDist(dists: number[], tau = 0.35): number[] {
  const scores = dists.map((d) => -d * d / tau);
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

export function cosineSim(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** FNV-1a 32-bit hash — deterministic, tiny, good enough for hashed embeddings. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) seeded from an integer. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str: string): number {
  return fnv1a(str) % 2147483647;
}

export function l2Normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  if (n === 0) return v;
  return v.map((x) => x / n);
}

export function round(x: number, digits = 3): number {
  const p = 10 ** digits;
  return Math.round(x * p) / p;
}
