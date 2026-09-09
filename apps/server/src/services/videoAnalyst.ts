import { clamp, norm, round } from '../lib/math';
import { circumplexLabels, synthesizeHeatmap } from './emotionAgent';
import type { VideoEmotionPoint, VideoPeak, VideoSample, VideoSummary } from '../types';

/**
 * Video Analyst
 * ─────────────
 * Derives an emotion timeline from observations extracted out of an uploaded
 * video (downscaled frame grids, scene color statistics, motion energy and
 * audio features). The model follows established color-psychology and
 * dynamics cues:
 *
 *   arousal    ← motion energy, loudness, saturation, frame contrast
 *   valence    ← scene warmth (R vs B), brightness, saturation,
 *                minus a "dread" pull when the frame is dark AND frantic
 *   engagement ← motion + loudness + contrast
 *
 * The (valence, arousal) pairs are projected onto the same Russell circumplex
 * used by the live Emotion Agent, so both pipelines share one emotional
 * vocabulary. When a real VideoMAE-v2 backend is enabled in the Python
 * bridge, its per-clip classifications can replace/augment these cues
 * without changing this interface.
 */

function gridStats(grid: number[]): { mean: number; std: number } {
  const mean = grid.reduce((a, b) => a + b, 0) / grid.length;
  const std = Math.sqrt(grid.reduce((a, b) => a + (b - mean) ** 2, 0) / grid.length);
  return { mean, std };
}

export function analyzeVideoSample(s: VideoSample): VideoEmotionPoint {
  const { mean: brightness, std } = gridStats(s.grid);
  const contrast = clamp(std * 3.2, 0, 1);
  const brightN = norm(brightness, 0.1, 0.85);
  const warmth01 = clamp(0.5 + (s.avgR - s.avgB) * 1.9, 0, 1);
  const warmthN = norm(warmth01, 0.12, 0.88);
  const satN = s.saturation;
  const motion = s.motionEnergy;
  const loud = s.audio ? s.audio.loudness : clamp(motion * 0.7 + brightN * 0.25, 0, 1);

  /* Arousal: how energetically the video moves and sounds. */
  const a01 = clamp(0.35 * motion + 0.25 * loud + 0.2 * satN + 0.2 * contrast, 0.02, 1);

  /* Valence: warm/bright/saturated reads pleasant; dark+frantic reads dread. */
  const dread = clamp((1 - brightN) * 0.55 + motion * 0.45 - 0.5, 0, 1);
  const v01 = clamp(0.5 * warmthN + 0.3 * brightN + 0.2 * satN - dread * 0.45, 0, 1);

  const valence = clamp(v01 * 2 - 1, -1, 1);
  const arousal = clamp(a01 * 2 - 1, -1, 1);
  const engagement = clamp(0.35 * motion + 0.35 * loud + 0.3 * contrast, 0, 1);

  return {
    tSec: round(s.tSec, 2),
    valence: round(valence),
    arousal: round(arousal),
    engagement: round(engagement),
    labels: circumplexLabels(valence, arousal, 5),
    heatmap: synthesizeHeatmap(valence, arousal, engagement),
    motionEnergy: round(motion),
    palette: { r: round(s.avgR), g: round(s.avgG), b: round(s.avgB) },
  };
}

/** Aggregate a finished timeline: overall mood, top labels and peak moments. */
export function summarizeVideo(points: VideoEmotionPoint[]): VideoSummary {
  if (points.length === 0) {
    throw new Error('no analyzed points to summarize');
  }
  const n = points.length;
  const valence = points.reduce((a, p) => a + p.valence, 0) / n;
  const arousal = points.reduce((a, p) => a + p.arousal, 0) / n;
  const engagement = points.reduce((a, p) => a + p.engagement, 0) / n;

  const acc = new Map<string, number>();
  for (const p of points) {
    for (const l of p.labels) acc.set(l.emotion, (acc.get(l.emotion) ?? 0) + l.weight);
  }
  const labels = [...acc.entries()]
    .map(([emotion, w]) => ({ emotion, weight: round(w / n, 4) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  // Peaks: moments where the frame's top emotion is felt most intensely.
  const scored: VideoPeak[] = points.map((p) => {
    const top = p.labels[0];
    const intensity = clamp((top?.weight ?? 0) * (0.55 + 0.45 * p.engagement), 0, 1);
    return { tSec: p.tSec, label: top?.emotion ?? 'neutral', intensity: round(intensity) };
  });
  const peaks = [...scored]
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 3)
    .sort((a, b) => a.tSec - b.tSec);

  return {
    dominant: labels[0]?.emotion ?? 'neutral',
    valence: round(valence),
    arousal: round(arousal),
    engagement: round(engagement),
    labels,
    peaks,
  };
}
