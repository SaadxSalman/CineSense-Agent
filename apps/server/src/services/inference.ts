import { CONFIG } from '../config';

/**
 * Client for the Python inference bridge (models/inference_server.py — FastAPI).
 * The bridge hosts the VideoMAE-v2 / AudioCLIP adapters when available.
 * Every call is optional: if the bridge is offline the orchestrator's built-in
 * heuristic analysis takes over, so the system never hard-depends on it here.
 */

export interface BridgeHealth {
  online: boolean;
  detail: string;
  models?: Record<string, boolean>;
}

export async function probeBridge(timeoutMs = 1200): Promise<BridgeHealth> {
  if (!CONFIG.pyInferenceUrl) {
    return { online: false, detail: 'PY_INFERENCE_URL not configured — using built-in heuristics' };
  }
  try {
    const res = await fetch(`${CONFIG.pyInferenceUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { online: false, detail: `bridge responded ${res.status}` };
    const json = (await res.json()) as { status?: string; models?: Record<string, boolean> };
    return {
      online: json.status === 'ok',
      detail: `bridge online at ${CONFIG.pyInferenceUrl}`,
      models: json.models,
    };
  } catch (err) {
    return { online: false, detail: `bridge unreachable (${(err as Error).message})` };
  }
}

export interface VisionRead {
  facial?: {
    happy: number;
    sad: number;
    angry: number;
    surprised: number;
    fearful: number;
    disgust: number;
    neutral: number;
  };
  heatmap?: number[];
}

/**
 * Ask the bridge to analyze a batch of 8x8 frame-stat grids (from the browser
 * vision layer or the Rust engine). Returns per-sample expression likelihoods
 * and refined heatmaps, or null if the bridge is unavailable.
 */
export async function analyzeVisionBatch(grids: number[][]): Promise<VisionRead[] | null> {
  if (!CONFIG.pyInferenceUrl) return null;
  try {
    const res = await fetch(`${CONFIG.pyInferenceUrl}/analyze/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grids }),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { reads?: VisionRead[] };
    return Array.isArray(json.reads) && json.reads.length === grids.length ? json.reads : null;
  } catch {
    return null;
  }
}
