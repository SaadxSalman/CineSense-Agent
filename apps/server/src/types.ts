import { z } from 'zod';

/* ──────────────────────────── Emotion pipeline ──────────────────────────── */

const unit = z.number().min(0).max(1);
const unitish = z.number().min(-1).max(1);

/** One multi-modal observation coming from any producer (Rust engine, browser, simulator). */
export const SignalSample = z.object({
  ts: z.number().int().nonnegative().optional(), // epoch ms; server fills if absent
  // Physiological signals
  heartRate: z.number().min(30).max(220).optional(), // bpm
  hrv: z.number().min(1).max(250).optional(), // ms (RMSSD)
  skinConductance: z.number().min(0).max(40).optional(), // µS
  respRate: z.number().min(4).max(60).optional(), // breaths/min
  // Facial action likelihoods (vision model output)
  facial: z
    .object({
      happy: unit.optional(),
      sad: unit.optional(),
      angry: unit.optional(),
      surprised: unit.optional(),
      fearful: unit.optional(),
      disgust: unit.optional(),
      neutral: unit.optional(),
    })
    .optional(),
  // Gaze / attention (eye tracker or face mesh)
  gaze: z
    .object({
      fixationRate: unit.optional(), // fraction of samples fixating
      blinkRate: z.number().min(0).max(60).optional(), // blinks/min
      pupilDilation: unit.optional(), // normalized 0..1
    })
    .optional(),
  // Body / camera motion
  motion: z
    .object({
      motionEnergy: unit.optional(), // mean abs frame diff, normalized
      frameVariance: unit.optional(),
    })
    .optional(),
  // Audio scene
  audio: z
    .object({
      rms: z.number().min(0).max(1).optional(), // loudness
      spectralCentroid: z.number().min(0).max(1).optional(), // brightness 0..1
      speechRate: z.number().min(0).max(8).optional(), // syllables/sec
    })
    .optional(),
  // 8x8 normalized heat grid (0..1) from the vision layer; used directly as heatmap
  heatmap: z.array(unit).length(64).optional(),
});
export type SignalSample = z.infer<typeof SignalSample>;

export const EmotionLabel = z.object({
  emotion: z.string(),
  weight: z.number().min(0).max(1),
});
export type EmotionLabel = z.infer<typeof EmotionLabel>;

/** Fused emotional state for one instant — the output of the Emotion Agent. */
export const EmotionFrame = z.object({
  ts: z.number().int().nonnegative(),
  source: z.string(),
  valence: unitish, // -1 negative .. +1 positive
  arousal: unitish, // -1 calm .. +1 activated
  engagement: unit, // 0 distracted .. 1 absorbed
  labels: z.array(EmotionLabel), // top-k circumplex labels
  heatmap: z.array(unit).length(64), // 8x8 grid for the live heatmap
});
export type EmotionFrame = z.infer<typeof EmotionFrame>;

/** Aggregate of the recent window — what downstream agents reason over. */
export const EmotionState = z.object({
  sessionId: z.string(),
  sampleCount: z.number().int().nonnegative(),
  windowSec: z.number(),
  valence: unitish,
  arousal: unitish,
  engagement: unit,
  dominant: z.string(),
  labels: z.array(EmotionLabel),
  heatmap: z.array(unit).length(64),
  updatedAt: z.number().int().nonnegative(),
});
export type EmotionState = z.infer<typeof EmotionState>;

/* ─────────────────────────── Retrieval concepts ─────────────────────────── */

export const Concept = z.object({
  conceptId: z.string(),
  title: z.string(),
  year: z.number().int().optional(),
  genres: z.array(z.string()),
  mood: z.string(),
  palette: z.array(z.string()), // hex colors
  pacing: z.enum(['slow', 'measured', 'brisk', 'frantic']),
  tags: z.array(z.string()),
  styleNotes: z.string(),
  embedding: z.array(z.number()).optional(), // present when fetched from store
  score: z.number().optional(), // similarity score when returned by search
});
export type Concept = z.infer<typeof Concept>;

/* ─────────────────────────── Creative synthesis ─────────────────────────── */

export const ShotType = z.enum([
  'extreme-close-up',
  'close-up',
  'medium',
  'wide',
  'extreme-wide',
  'tracking',
  'overhead',
  'handheld',
  'dutch-angle',
]);
export type ShotType = z.infer<typeof ShotType>;

export const TransitionType = z.enum(['cut', 'dissolve', 'fade', 'whip-pan', 'match-cut']);

export const DialogueLine = z.object({
  speaker: z.string(),
  line: z.string(),
});

export const Scene = z.object({
  index: z.number().int().nonnegative(),
  title: z.string(),
  durationSec: z.number().min(0.8).max(30),
  startSec: z.number().nonnegative(),
  shot: ShotType,
  visual: z.object({
    styleNotes: z.string(),
    paletteRef: z.string(), // hex color anchoring the scene's grade
    motionIntensity: unit, // drives the player's animation energy
  }),
  narration: z.string().optional(),
  dialogue: z.array(DialogueLine).max(4).default([]),
  transition: TransitionType,
});
export type Scene = z.infer<typeof Scene>;

export const TrailerBlueprint = z.object({
  title: z.string(),
  logline: z.string(),
  kind: z.enum(['trailer', 'short-film', 'script']),
  aspect: z.enum(['2.39:1', '16:9', '4:3']),
  grade: z.object({
    name: z.string(),
    description: z.string(),
  }),
  music: z.object({
    tempoBpm: z.number().min(40).max(220),
    key: z.string(),
    mood: z.string(),
    cues: z.array(z.string()),
  }),
  scenes: z.array(Scene).min(1),
  totalDurationSec: z.number(),
  conceptsUsed: z.array(
    z.object({
      conceptId: z.string(),
      title: z.string(),
      score: z.number(),
      tags: z.array(z.string()),
    }),
  ),
  generator: z.enum(['llama-3', 'local-screenwriter']),
});
export type TrailerBlueprint = z.infer<typeof TrailerBlueprint>;

/** Structured screenplay the Creative Agent produces (LLM or local). */
export const Screenplay = z.object({
  title: z.string(),
  logline: z.string(),
  grade: z.object({ name: z.string(), description: z.string() }),
  music: z.object({
    tempoBpm: z.number().min(40).max(220),
    key: z.string(),
    mood: z.string(),
    cues: z.array(z.string()),
  }),
  scenes: z
    .array(
      z.object({
        title: z.string(),
        durationSec: z.number().min(0.8).max(30),
        shot: ShotType,
        styleNotes: z.string(),
        paletteRef: z.string(),
        motionIntensity: unit,
        narration: z.string().optional(),
        dialogue: z.array(DialogueLine).max(4).default([]),
        transition: TransitionType,
      }),
    )
    .min(1)
    .max(10),
});
export type Screenplay = z.infer<typeof Screenplay>;

/* ─────────────────────────────── Sessions ─────────────────────────────────── */

export const SessionPrefs = z.object({
  genres: z.array(z.string()).max(8).default([]),
  intensityTarget: unit.default(0.6), // desired arousal of the output piece
});
export type SessionPrefs = z.infer<typeof SessionPrefs>;

export const Session = z.object({
  sessionId: z.string(),
  userId: z.string().optional(),
  preferences: SessionPrefs,
  status: z.enum(['active', 'closed']),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().optional(),
});
export type Session = z.infer<typeof Session>;

export const GeneratedContent = z.object({
  contentId: z.string(),
  sessionId: z.string(),
  kind: z.enum(['trailer', 'short-film', 'script']),
  title: z.string(),
  logline: z.string(),
  scriptText: z.string(),
  blueprint: TrailerBlueprint,
  retrievalQuery: z.string().optional(), // provenance: the query that drove retrieval
  createdAt: z.number().int().nonnegative(),
});
export type GeneratedContent = z.infer<typeof GeneratedContent>;

