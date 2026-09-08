import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Load the nearest `.env` file: check the server dir, then the repo root
 * (works whether you run `npm run dev` from apps/server or the repo root).
 */
function loadEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return;
    }
  }
  dotenv.config(); // fall back to default lookup
}
loadEnv();

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}
function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}

export const CONFIG = {
  port: num('PORT', 4000),
  corsOrigin: str('CORS_ORIGIN', 'http://localhost:3000'),
  mongodbUri: process.env.MONGODB_URI?.trim() ?? '',

  llama: {
    apiKey: process.env.LLAMA_API_KEY?.trim() ?? '',
    baseUrl: str('LLAMA_BASE_URL', 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
    model: str('LLAMA_MODEL', 'llama-3.1-8b-instant'),
    timeoutMs: num('LLAMA_TIMEOUT_MS', 20_000),
  },

  pyInferenceUrl: process.env.PY_INFERENCE_URL?.trim() ?? '',
  internalApiKey: str('INTERNAL_API_KEY', 'dev-internal-key'),

  embedding: {
    provider: str('EMBEDDING_PROVIDER', 'local'),
    dim: num('EMBEDDING_DIM', 128),
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
  },
} as const;

export type Config = typeof CONFIG;
