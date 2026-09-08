import type { EmotionFrame, EmotionLabel, EmotionState, SignalSample } from '../types';
import { clamp, mean, norm, round, softmaxDist } from '../lib/math';

/**
 * Emotion Agent
 * ─────────────
 * Fuses heterogeneous multi-modal signals into a compact emotional state:
 *   1. Normalize each raw signal into [0, 1] against physiological reference ranges.
 *   2. Weighted fusion → valence (pleasantness) & arousal (activation) in [-1, 1].
 *   3. Project (valence, arousal) onto the Russell circumplex to label discrete emotions.
 *   4. Produce an 8x8 heatmap for real-time visualization.
 *
 * This mirrors the Rust core-engine's `emotion_agent` so the pipeline behaves
 * identically whether frames arrive from the engine, the browser, or the simulator.
 */

interface CircumplexAnchor {
  emotion: string;
  v: number; // valence -1..1
  a: number; // arousal -1..1
}

const ANCHORS: CircumplexAnchor[] = [
  { emotion: 'excited', v: 0.55, a: 0.85 },
  { emotion: 'happy', v: 0.85, a: 0.5 },
  { emotion: 'content', v: 0.65, a: 0.1 },
  { emotion: 'relaxed', v: 0.45, a: -0.5 },
  { emotion: 'calm', v: 0.2, a: -0.75 },
  { emotion: 'sleepy', v: -0.35, a: -0.85 },
  { emotion: 'bored', v: -0.55, a: -0.45 },
  { emotion: 'sad', v: -0.8, a: -0.4 },
  { emotion: 'anxious', v: -0.5, a: 0.55 },
  { emotion: 'tense', v: -0.35, a: 0.8 },
  { emotion: 'alert', v: 0.1, a: 0.9 },
  { emotion: 'fearful', v: -0.7, a: 0.7 },
  { emotion: 'angry', v: -0.75, a: 0.85 },
];

/** Fused computation for a single sample. All missing signals are skipped gracefully. */
export function fuseSample(sample: SignalSample, source: string, ts: number): EmotionFrame {
  /* ── Arousal: physiological + behavioral activation ── */
  const aParts: Array<[number, number]> = []; // [value, weight]
  if (sample.heartRate !== undefined) aParts.push([norm(sample.heartRate, 55, 120), 0.3]);
  if (sample.motion?.motionEnergy !== undefined) aParts.push([sample.motion.motionEnergy, 0.2]);
  if (sample.audio?.rms !== undefined) aParts.push([norm(sample.audio.rms, 0, 0.5), 0.15]);
  if (sample.gaze?.blinkRate !== undefined)
    aParts.push([1 - norm(sample.gaze.blinkRate, 4, 25), 0.15]); // few blinks → focus/activation
  if (sample.skinConductance !== undefined)
    aParts.push([norm(sample.skinConductance, 0.5, 8), 0.2]);
  if (sample.respRate !== undefined) aParts.push([norm(sample.respRate, 8, 28), 0.1]);
  if (sample.facial?.surprised !== undefined) aParts.push([sample.facial.surprised * 0.7, 0.1]);

  const aW = aParts.reduce((s, [, w]) => s + w, 0) || 1;
  const arousalRaw = aParts.reduce((s, [v, w]) => s + v * w, 0) / aW; // 0..1
  const arousal = clamp(arousalRaw * 2 - 1, -1, 1);

  /* ── Valence: affective tone ── */
  const vParts: Array<[number, number]> = [];
  if (sample.facial !== undefined) {
    const f = sample.facial;
    const positive = (f.happy ?? 0) + (f.surprised ?? 0) * 0.35;
    const negative = (f.sad ?? 0) + (f.angry ?? 0) + (f.fearful ?? 0) + (f.disgust ?? 0);
    const affect = Math.tanh(2.2 * (positive - negative));
    vParts.push([affect, 0.55]);
  }
  if (sample.hrv !== undefined) vParts.push([norm(sample.hrv, 20, 90), 0.25]); // high HRV ↔ calm positive state
  if (sample.gaze?.fixationRate !== undefined)
    vParts.push([norm(sample.gaze.fixationRate, 0.2, 0.95) * 0.5, 0.2]); // engaged gaze mildly positive
  if (sample.audio?.spectralCentroid !== undefined)
    vParts.push([(sample.audio.spectralCentroid - 0.5) * 0.4, 0.1]); // brighter audio ↔ slightly positive

  const vW = vParts.reduce((s, [, w]) => s + w, 0) || 1;
  const valenceRaw = vParts.reduce((s, [v, w]) => s + v * w, 0) / vW;
  const valence = clamp(valenceRaw, -1, 1);

  /* ── Engagement: attention & absorption ── */
  const gazeEng = sample.gaze?.fixationRate !== undefined ? norm(sample.gaze.fixationRate, 0.2, 0.95) : null;
  const blinkEng = sample.gaze?.blinkRate !== undefined ? 1 - norm(sample.gaze.blinkRate, 4, 25) : null;
  const motionEng = sample.motion?.motionEnergy !== undefined ? 1 - sample.motion.motionEnergy * 0.5 : null;
  const engParts = [gazeEng, blinkEng, motionEng].filter((x): x is number => x !== null);
  const engagement = engParts.length > 0 ? clamp(mean(engParts), 0, 1) : 0.5;

  /* ── Discrete labels via circumplex projection ── */
  const dists = ANCHORS.map((an) => Math.hypot(valence - an.v, arousal - an.a));
  const weights = softmaxDist(dists, 0.35);
  const labels: EmotionLabel[] = ANCHORS.map((an, i) => ({
    emotion: an.emotion,
    weight: round(weights[i] ?? 0, 4),
  }))
    .sort((x, y) => y.weight - x.weight)
    .slice(0, 5);

  /* ── Heatmap: provided by the vision layer, or synthesized from state ── */
  const heatmap = sample.heatmap ?? synthesizeHeatmap(valence, arousal, engagement);

  return {
    ts,
    source,
    valence: round(valence),
    arousal: round(arousal),
    engagement: round(engagement),
    labels,
    heatmap,
  };
}

/**
 * Deterministic 8x8 grid: an engagement-centered blob widened by arousal,
 * with valence shifting the blob's column bias. Purely for visualization.
 */
export function synthesizeHeatmap(valence: number, arousal: number, engagement: number): number[] {
  const grid: number[] = new Array(64).fill(0);
  const vN = (valence + 1) / 2; // 0..1
  const aN = (arousal + 1) / 2;
  const cx = 2 + vN * 4; // blob center drifts with valence
  const cy = 2 + aN * 4; // and with arousal
  const spread = 1.2 + aN * 1.8;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const d = Math.hypot(r - cy, c - cx);
      const blob = Math.exp(-(d * d) / (2 * spread * spread));
      grid[r * 8 + c] = round(clamp(0.08 + 0.85 * engagement * blob, 0, 1), 3);
    }
  }
  return grid;
}

/* ── Rolling per-session window ── */

const globalForWindows = globalThis as unknown as {
  __cinesenseWindows?: Map<string, EmotionFrame[]>;
};
function windows(): Map<string, EmotionFrame[]> {
  if (!globalForWindows.__cinesenseWindows) globalForWindows.__cinesenseWindows = new Map();
  return globalForWindows.__cinesenseWindows;
}

export function pushFrame(sessionId: string, frame: EmotionFrame): void {
  const win = windows();
  const arr = win.get(sessionId) ?? [];
  arr.push(frame);
  const cutoff = frame.ts - 90_000; // keep ~90s of history
  while (arr.length > 0 && (arr[0]?.ts ?? 0) < cutoff) arr.shift();
  win.set(sessionId, arr);
}

export function recentFrames(sessionId: string, limitSec = 30): EmotionFrame[] {
  const arr = windows().get(sessionId) ?? [];
  const cutoff = Date.now() - limitSec * 1000;
  return arr.filter((f) => f.ts >= cutoff);
}

export function currentEmotionState(sessionId: string): EmotionState | null {
  const frames = recentFrames(sessionId, 30);
  if (frames.length === 0) return null;

  const valence = mean(frames.map((f) => f.valence));
  const arousal = mean(frames.map((f) => f.arousal));
  const engagement = mean(frames.map((f) => f.engagement));

  // Aggregate labels by accumulating weights across the window.
  const acc = new Map<string, number>();
  for (const f of frames) for (const l of f.labels) acc.set(l.emotion, (acc.get(l.emotion) ?? 0) + l.weight);
  const labels: EmotionLabel[] = [...acc.entries()]
    .map(([emotion, w]) => ({ emotion, weight: round(w / frames.length, 4) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  // Heatmap: temporal stability matters — blend the most recent frames element-wise.
  const last = frames.slice(-6);
  const heatmap = new Array(64).fill(0).map((_, i) => round(mean(last.map((f) => f.heatmap[i] ?? 0)), 3));

  return {
    sessionId,
    sampleCount: frames.length,
    windowSec: 30,
    valence: round(valence),
    arousal: round(arousal),
    engagement: round(engagement),
    dominant: labels[0]?.emotion ?? 'neutral',
    labels,
    heatmap,
    updatedAt: frames[frames.length - 1]?.ts ?? Date.now(),
  };
}

