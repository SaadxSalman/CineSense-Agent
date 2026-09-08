import type { EmotionState, GeneratedContent, Screenplay, SessionPrefs, TrailerBlueprint } from '../types';
import type { RetrievalHit } from './retrieval';
import { clamp, round } from '../lib/math';
import { localScreenplay } from './localScreenwriter';
import { generateScreenplayWithLlama, isLlamaConfigured, type CreativeInput } from './llama';

/**
 * Synthesis Agent
 * ───────────────
 * Orchestrates the creative pipeline:
 *   EmotionState + preferences → Semantic Retrieval → Creative Agent
 *   (Llama-3, falling back to the local screenwriter) → TrailerBlueprint,
 *   where pacing, transitions, grade and score cues are derived from the
 *   viewer's fused arousal/valence so the final cut matches the viewer's body.
 */

export async function generateContent(
  sessionId: string,
  state: EmotionState,
  prefs: SessionPrefs,
  hits: RetrievalHit[],
  retrievalQuery: string,
  kind: 'trailer' | 'short-film' | 'script',
): Promise<GeneratedContent> {
  const creativeInput: CreativeInput = {
    dominant: state.dominant,
    labels: state.labels,
    valence: state.valence,
    arousal: state.arousal,
    engagement: state.engagement,
    intensityTarget: prefs.intensityTarget,
    kind,
    concepts: hits.map((h) => ({
      title: h.title,
      mood: h.mood,
      tags: h.tags,
      styleNotes: h.styleNotes,
      palette: h.palette,
    })),
  };

  let screenplay: Screenplay;
  let generator: 'llama-3' | 'local-screenwriter' = 'local-screenwriter';

  if (isLlamaConfigured()) {
    try {
      screenplay = await generateScreenplayWithLlama(creativeInput);
      generator = 'llama-3';
    } catch (err) {
      console.warn(`[creative-agent] Llama-3 generation failed (${(err as Error).message}); using local screenwriter.`);
      screenplay = localScreenplay(state, prefs, hits, kind);
    }
  } else {
    screenplay = localScreenplay(state, prefs, hits, kind);
  }

  const blueprint = synthesizeBlueprint(state, prefs, screenplay, hits, generator, kind);
  const scriptText = renderScriptText(blueprint);

  const content: GeneratedContent = {
    contentId: `cnt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    kind,
    title: blueprint.title,
    logline: blueprint.logline,
    scriptText,
    blueprint,
    retrievalQuery,
    createdAt: Date.now(),
  };

  return { ...content };
}

/** Screenplay + emotion → fully-timed trailer blueprint the frontend can play. */
export function synthesizeBlueprint(
  state: EmotionState,
  _prefs: SessionPrefs,
  screenplay: Screenplay,
  hits: RetrievalHit[],
  generator: 'llama-3' | 'local-screenwriter',
  kind: 'trailer' | 'short-film' | 'script',
): TrailerBlueprint {
  const aN = (state.arousal + 1) / 2;

  let start = 0;
  const scenes = screenplay.scenes.map((s, index) => {
    const scene = {
      index,
      title: s.title,
      durationSec: s.durationSec,
      startSec: round(start, 1),
      shot: s.shot,
      visual: {
        styleNotes: s.styleNotes,
        paletteRef: s.paletteRef,
        motionIntensity: clamp(s.motionIntensity, 0, 1),
      },
      narration: s.narration,
      dialogue: s.dialogue,
      transition: s.transition,
    };
    start += s.durationSec;
    return scene;
  });

  return {
    title: screenplay.title,
    logline: screenplay.logline,
    kind,
    aspect: aN > 0.65 ? '2.39:1' : '16:9',
    grade: screenplay.grade,
    music: screenplay.music,
    scenes,
    totalDurationSec: round(start, 1),
    conceptsUsed: hits.map((h) => ({
      conceptId: h.conceptId,
      title: h.title,
      score: round(h.score, 4),
      tags: h.tags.slice(0, 5),
    })),
    generator,
  };
}

/** Render the blueprint as a readable screenplay text block. */
export function renderScriptText(bp: TrailerBlueprint): string {
  const lines: string[] = [];
  lines.push(`TITLE:  ${bp.title}`);
  lines.push(`GENRE:  ${bp.kind.toUpperCase()}  ·  ASPECT ${bp.aspect}  ·  via ${bp.generator}`);
  lines.push(`LOGLINE: ${bp.logline}`);
  lines.push('');
  lines.push(`COLOR GRADE — ${bp.grade.name}`);
  lines.push(`  ${bp.grade.description}`);
  lines.push('');
  lines.push(`SCORE — ${bp.music.key}, ~${bp.music.tempoBpm} BPM, ${bp.music.mood}`);
  for (const cue of bp.music.cues) lines.push(`  · ${cue}`);
  lines.push('');
  lines.push('='.repeat(64));
  lines.push('');
  for (const s of bp.scenes) {
    lines.push(`${s.index + 1}. ${s.title}  [${s.shot.toUpperCase()} · ${s.durationSec}s · ${s.transition}]`);
    lines.push(`   ${s.visual.styleNotes}`);
    if (s.narration) lines.push(`   NARRATOR: "${s.narration}"`);
    for (const d of s.dialogue) lines.push(`   ${d.speaker}: "${d.line}"`);
    lines.push('');
  }
  lines.push('='.repeat(64));
  lines.push(`TOTAL RUNTIME: ${bp.totalDurationSec}s`);
  lines.push(`CONCEPTS BLENDED: ${bp.conceptsUsed.map((c) => `${c.title} (${c.score.toFixed(2)})`).join(' · ')}`);
  return lines.join('\n');
}
