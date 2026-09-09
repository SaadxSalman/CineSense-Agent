import { CONFIG } from '../config';
import { Screenplay } from '../types';

/**
 * Creative Agent — Llama-3 bridge.
 *
 * Calls any OpenAI-compatible chat-completions endpoint (Groq, Together,
 * OpenRouter, Ollama, vLLM, ...) to translate an emotional state + retrieved
 * cinematic concepts into a structured screenplay. Output is strictly
 * validated with the Screenplay zod schema; any failure (missing key,
 * network error, malformed JSON) throws and the caller falls back to the
 * deterministic local screenwriter.
 */

export function isLlamaConfigured(): boolean {
  return CONFIG.llama.apiKey.length > 0;
}

export interface CreativeInput {
  dominant: string;
  labels: Array<{ emotion: string; weight: number }>;
  valence: number; // -1..1
  arousal: number; // -1..1
  engagement: number; // 0..1
  intensityTarget: number; // 0..1 desired output intensity
  kind: 'trailer' | 'short-film' | 'script';
  concepts: Array<{ title: string; mood: string; tags: string[]; styleNotes: string; palette: string[] }>;
}

const SYSTEM_PROMPT = `You are the CineSense Creative Agent: an award-winning screenwriter who translates a viewer's real-time emotional state into bespoke cinematic pieces.
Respond with ONLY a JSON object (no markdown, no commentary) matching exactly this TypeScript type:

{
  "title": string,            // evocative piece title
  "logline": string,          // one sentence
  "grade": { "name": string, "description": string },   // color-grade identity
  "music": { "tempoBpm": number, "key": string, "mood": string, "cues": string[] }, // 3-5 cues
  "scenes": [                 // 5-7 scenes
    {
      "title": string,
      "durationSec": number,  // 1-12, pacing must reflect the target arousal
      "shot": "extreme-close-up" | "close-up" | "medium" | "wide" | "extreme-wide" | "tracking" | "overhead" | "handheld" | "dutch-angle",
      "styleNotes": string,   // visual language of the shot
      "paletteRef": string,   // hex color like "#0b1f2a"
      "motionIntensity": number, // 0..1
      "narration": string,    // optional voice-over line
      "dialogue": [{ "speaker": string, "line": string }],
      "transition": "cut" | "dissolve" | "fade" | "whip-pan" | "match-cut"
    }
  ]
}`;

function userPrompt(input: CreativeInput): string {
  return `Viewer's live emotional state:
- dominant emotion: ${input.dominant}
- emotional labels (weighted): ${input.labels.map((l) => `${l.emotion} (${l.weight})`).join(', ')}
- valence: ${input.valence.toFixed(2)} (negative → sorrowful, positive → bright)
- arousal: ${input.arousal.toFixed(2)} (low → slow hypnotic pacing, high → rapid cutting)
- engagement: ${input.engagement.toFixed(2)}
- target output intensity: ${input.intensityTarget.toFixed(2)}
- piece type: ${input.kind}

Retrieved cinematic concepts (blend their DNA, do not copy them):
${input.concepts
  .map(
    (c, i) =>
      `${i + 1}. "${c.title}" — mood: ${c.mood}; tags: ${c.tags.join(', ')}; style: ${c.styleNotes}; palette: ${c.palette.join(' ')}`,
  )
  .join('\n')}

Write the JSON now.`;
}

/** Strip code fences / stray text and extract the outermost JSON object. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('no JSON object found');
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function generateScreenplayWithLlama(input: CreativeInput): Promise<Screenplay> {
  if (!isLlamaConfigured()) throw new Error('LLAMA_API_KEY not configured');

  const body: Record<string, unknown> = {
    model: CONFIG.llama.model,
    temperature: 0.9,
    max_tokens: 6000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt(input) },
    ],
  };
  // Reasoning-family models (gpt-oss, o1/o3) spend tokens "thinking" before
  // answering; keep that cheap so message.content carries the JSON. Other
  // providers/models ignore the parameter.
  if (/gpt-oss|^o[13]/.test(CONFIG.llama.model)) {
    body.reasoning_effort = 'low';
  }

  const res = await fetch(`${CONFIG.llama.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CONFIG.llama.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CONFIG.llama.timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Llama API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty completion');

  const parsed = Screenplay.safeParse(extractJson(content));
  if (!parsed.success) {
    throw new Error(`screenplay schema mismatch: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
  }
  return parsed.data;
}
