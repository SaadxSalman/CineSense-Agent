import type { EmotionState, Screenplay, SessionPrefs, TrailerBlueprint } from '../types';
import type { RetrievalHit } from './retrieval';
import { clamp, hashSeed, round, seededRandom } from '../lib/math';

/**
 * Local Screenwriter — the deterministic, always-available Creative Agent.
 * Produces an emotionally-coherent structured screenplay from the live
 * EmotionState and the retrieved cinematic concepts, using the circumplex
 * geometry (valence → tone, arousal → pacing) directly as creative rules.
 */

const MAJOR_KEYS = ['C major', 'D major', 'F major', 'A major', 'E♭ major'];
const MINOR_KEYS = ['A minor', 'D minor', 'C# minor', 'G minor', 'F minor'];

const TENSE_SHOTS: Screenplay['scenes'][number]['shot'][] = ['handheld', 'close-up', 'dutch-angle', 'tracking', 'extreme-close-up'];
const CALM_SHOTS: Screenplay['scenes'][number]['shot'][] = ['wide', 'medium', 'overhead', 'extreme-wide', 'close-up'];

const HIGH_TRANSITIONS: TrailerBlueprint['scenes'][number]['transition'][] = ['cut', 'whip-pan', 'cut', 'match-cut'];
const LOW_TRANSITIONS: TrailerBlueprint['scenes'][number]['transition'][] = ['dissolve', 'fade', 'dissolve', 'cut'];

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length) % arr.length] as T;
}

export function localScreenplay(state: EmotionState, prefs: SessionPrefs, hits: RetrievalHit[], kind: string): Screenplay {
  const rand = seededRandom(hashSeed(`${state.sessionId}:${state.dominant}:${hits[0]?.conceptId ?? 'none'}`));

  const vN = (state.valence + 1) / 2; // 0..1
  const aN = (state.arousal + 1) / 2;
  const intensity = clamp((aN * 0.65 + prefs.intensityTarget * 0.35 + 0.08) as number, 0.05, 1);
  const lead = hits[0];
  const second = hits[1] ?? hits[0];
  const palette = (lead?.palette.length ? lead.palette : ['#101014', '#3b3b58', '#c9a227']);
  const dominant = state.dominant;

  const gradeName = vN > 0.6 ? (aN > 0.6 ? 'Candied Overdrive' : 'Golden Hour Wash') : aN > 0.6 ? 'Sodium Bleed' : 'Blue Hour Ash';
  const gradeDesc = `${vN > 0.5 ? 'Warm highlights, lifted blacks' : 'Crushed blacks, cold shadows'}; ${
    aN > 0.5 ? 'aggressive contrast, blooming practicals' : 'soft halation, slow roll-offs'
  }.`;

  const tempo = Math.round(62 + aN * 96);
  const key = vN >= 0 ? pick(MAJOR_KEYS, rand) : pick(MINOR_KEYS, rand);
  const musicMood = `${wordForArousal(aN)} ${wordForValence(vN)} ${lead?.mood ?? 'cinematic'}`;
  const cues = [
    lead ? `Ostinato borrowed from the DNA of ${lead.title}` : 'Pulsing sub bass',
    aN > 0.55 ? 'Brass swells landing on cuts' : 'Long string beds under narration',
    `Rhythm section at ${tempo} BPM ${aN > 0.7 ? 'double-timing the final act' : 'staying out of the way'}`,
  ];

  const beats: Array<{ title: string; narration: string | null; dialogue: Array<{ speaker: string; line: string }> }> = [
    {
      title: 'COLD OPEN',
      narration: `They told you a feeling was a small thing. It isn't. It's a ${dominant} weather system with your name on it.`,
      dialogue: [],
    },
    {
      title: 'INCITING IMAGE',
      narration: null,
      dialogue: [{ speaker: 'The City', line: `You came here to forget something. Stay a while.` }],
    },
    {
      title: 'PRESSURE',
      narration: `Every ${dominant} heart keeps its own time signature. Tonight it's ${tempo}.`,
      dialogue: [],
    },
    {
      title: 'CRUX',
      narration: null,
      dialogue: [
        { speaker: 'MARA', line: `Say it once. Say it like it's ${vN > 0.5 ? 'the only warm thing left' : 'the last cold thing that tells the truth'}.` },
        { speaker: 'JUNE', line: `${dominant.charAt(0).toUpperCase() + dominant.slice(1)} isn't what happened to me. It's what I made out of it.` },
      ],
    },
    {
      title: 'BREATH',
      narration: aN > 0.6 ? null : `For one held breath, the ${lead?.mood ?? 'cinema'} of it all forgives you.`,
      dialogue: [],
    },
    {
      title: 'FINAL IMAGE',
      narration: `${second ? `Somewhere between ${lead?.title} and ${second.title}, ` : ''}a light goes out — and the room stays bright.`,
      dialogue: [],
    },
  ];

  const baseDur = 2.2 + (1 - aN) * 3.2; // calm → longer shots
  const scenes: Screenplay['scenes'] = beats.map((b, i) => {
    const shot = aN > 0.55 ? pick(TENSE_SHOTS, rand) : pick(CALM_SHOTS, rand);
    const conceptNotes = (i % 2 === 0 ? lead?.styleNotes : second?.styleNotes) ?? 'Clean classical coverage.';
    const jitter = 0.9 + rand() * 0.2;
    return {
      title: b.title,
      durationSec: round(clamp(baseDur * (i === beats.length - 1 ? 1.6 : jitter), 0.8, 14), 1),
      shot,
      styleNotes: `${conceptNotes}`,
      paletteRef: palette[i % palette.length] ?? '#101014',
      motionIntensity: round(clamp(intensity * (0.75 + rand() * 0.5), 0.02, 1), 2),
      narration: b.narration ?? undefined,
      dialogue: b.dialogue,
      transition: aN > 0.55 ? pick(HIGH_TRANSITIONS, rand) : pick(LOW_TRANSITIONS, rand),
    };
  });

  const titleWords = (lead?.title ?? 'Cine').split(/[\s:]+/)[0] ?? 'Cine';
  const title = `"${dominant.charAt(0).toUpperCase() + dominant.slice(1)} ${kind === 'trailer' ? 'Trailer' : 'Nocturne'}: ${titleWords} Requiem"`;

  return {
    title,
    logline: `A ${wordForValence(vN)}, ${wordForArousal(aN)} ${kind} assembled live from one viewer's ${dominant} state, cutting together the DNA of ${hits
      .slice(0, 3)
      .map((h) => h.title)
      .join(', ')}.`,
    grade: { name: gradeName, description: gradeDesc },
    music: { tempoBpm: tempo, key, mood: musicMood, cues },
    scenes,
  };
}

function wordForArousal(aN: number): string {
  return aN > 0.7 ? 'frantic' : aN > 0.5 ? 'restless' : aN > 0.3 ? 'steady' : 'hypnotic';
}
function wordForValence(vN: number): string {
  return vN > 0.7 ? 'radiant' : vN > 0.5 ? 'warm' : vN > 0.3 ? 'wistful' : 'sorrowful';
}
