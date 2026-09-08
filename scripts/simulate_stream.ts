/**
 * End-to-end pipeline smoke test against a RUNNING orchestrator
 * (default http://localhost:4000):
 *
 *   1. health check            → tRPC query
 *   2. create session          → tRPC mutation
 *   3. stream 14 multi-modal biometric samples (calm → tense drift)
 *   4. read fused emotion state
 *   5. semantic concept search
 *   6. full content generation (retrieval → creative → synthesis)
 *
 * Usage:
 *   npm run simulate                 # against localhost:4000
 *   npm run simulate -- --port 5000  # custom port
 */
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../apps/server/src/trpc/root';

const port = (() => {
  const i = process.argv.indexOf('--port');
  return i !== -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : 4000;
})();

const url = `http://localhost:${port}/trpc`;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Synthetic biometric stream: a slow drift from calm-warm to tense-negative. */
function makeSample(i: number) {
  const t = i / 13; // 0..1 progression
  const drift = Math.sin(t * Math.PI); // ease in/out
  return {
    ts: Date.now(),
    heartRate: Math.round(64 + drift * 38 + Math.random() * 4),
    hrv: Math.round(78 - drift * 42 + Math.random() * 6),
    skinConductance: 2.1 + drift * 4.4 + Math.random() * 0.4,
    facial: {
      happy: Math.max(0, 0.55 - drift * 0.5),
      sad: Math.min(1, 0.05 + drift * 0.55),
      angry: Math.min(1, 0.02 + drift * 0.4),
      surprised: 0.1 + Math.random() * 0.15,
      fearful: Math.min(1, drift * 0.3),
      disgust: Math.min(1, drift * 0.25),
      neutral: 0.3,
    },
    gaze: {
      fixationRate: Math.min(1, 0.55 + drift * 0.4),
      blinkRate: 18 - drift * 9,
      pupilDilation: Math.min(1, 0.3 + drift * 0.55),
    },
    motion: { motionEnergy: Math.min(1, drift * 0.55 + Math.random() * 0.1), frameVariance: 0.2 },
    audio: { rms: Math.min(1, drift * 0.4 + 0.05), spectralCentroid: 0.5 + drift * 0.2, speechRate: 2.5 },
  };
}

async function main(): Promise<void> {
  const client = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url, transformer: superjson })],
  });

  console.log(`▶ 1. health check → ${url}`);
  const health = await client.health.health.query();
  console.log(`   ok=${health.ok} store=${health.store}`);

  console.log('▶ 2. creating session…');
  const session = await client.emotion.createSession.mutate({
    preferences: { genres: ['sci-fi', 'neo-noir', 'thriller'], intensityTarget: 0.75 },
  });
  console.log(`   session ${session.sessionId} (${session.status})`);

  console.log('▶ 3. streaming 14 biometric samples (calm → tense)…');
  for (let i = 0; i < 14; i++) {
    const res = await client.emotion.ingest.mutate({
      sessionId: session.sessionId,
      source: 'simulator',
      samples: [makeSample(i)],
    });
    const state = res.state;
    if (i % 4 === 0 && state) {
      console.log(
        `   t=${i}  dominant=${state.dominant.padEnd(8)} valence=${state.valence.toFixed(2)} arousal=${state.arousal.toFixed(2)} engagement=${state.engagement.toFixed(2)}`,
      );
    }
    await delay(120);
  }

  console.log('▶ 4. fused emotion state (30s window)…');
  const state = await client.emotion.current.query({ sessionId: session.sessionId });
  if (!state) throw new Error('no emotion state — ingest failed?');
  console.log(
    `   dominant=${state.dominant}  labels=${state.labels.map((l) => `${l.emotion}:${l.weight}`).join(', ')}`,
  );

  console.log('▶ 5. semantic retrieval — query: "tense rain-soaked neon detective dread"…');
  const search = await client.concepts.search.mutate({
    query: 'tense rain-soaked neon detective dread',
    k: 5,
  });
  for (const r of search.results) {
    console.log(`   ${r.score.toFixed(3)}  ${r.title} (${r.mood})`);
  }

  console.log('▶ 6. generating personalized trailer (retrieval → creative → synthesis)…');
  const content = await client.content.generate.mutate({
    sessionId: session.sessionId,
    kind: 'trailer',
  });
  console.log(`   title      : ${content.title}`);
  console.log(`   logline    : ${content.logline}`);
  console.log(`   generator  : ${content.generator}`);
  console.log(`   runtime    : ${content.blueprint.totalDurationSec}s across ${content.blueprint.scenes.length} scenes`);
  console.log(`   grade      : ${content.blueprint.grade.name} — ${content.blueprint.grade.description}`);
  console.log(`   music      : ${content.blueprint.music.key}, ${content.blueprint.music.tempoBpm} BPM`);
  console.log(`   concepts   : ${content.blueprint.conceptsUsed.slice(0, 3).map((c) => `${c.title} (${c.score.toFixed(2)})`).join(' · ')}`);
  console.log('   ── script excerpt ──');
  for (const line of content.scriptText.split('\n').slice(12, 24)) console.log(`   ${line}`);

  const list = await client.content.list.query({ sessionId: session.sessionId });
  console.log(`▶ 7. content list for session: ${list.length} item(s)`);
  console.log('\n✅ End-to-end pipeline verified.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ simulate failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
