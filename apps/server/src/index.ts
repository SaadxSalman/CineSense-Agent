import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { CONFIG } from './config';
import { initStore, store } from './store';
import { appRouter } from './trpc/root';
import { createContext } from './trpc/context';
import { attachWebSocket } from './ws';
import { fuseSample, currentEmotionState, pushFrame } from './services/emotionAgent';
import { SignalSample } from './types';
import { publish, on } from './services/eventBus';
import { markEngineSeen } from './trpc/routers/health';
import { ensureConceptsSeeded } from './services/seed';

async function main(): Promise<void> {
  console.log('🎬 CineSense-Agent orchestrator booting…');
  await initStore();
  const seeded = await ensureConceptsSeeded();
  console.log(`   Concept library: ${seeded} cinematic vectors indexed for retrieval`);

  const app = express();
  app.use(
    cors({
      origin: CONFIG.corsOrigin.split(',').map((s) => s.trim()),
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  // Plain HTTP health probe (for Docker / scripts)
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, store: store().kind, time: Date.now() });
  });

  /**
   * Internal ingest endpoint — the Rust core-engine POSTs batches of fused
   * samples here. Requires the shared internal key. Samples arrive already
   * fused by the engine's emotion_agent; we re-validate and rebroadcast so
   * the browser stays in sync regardless of which producer is active.
   */
  app.post('/internal/ingest', (req, res) => {
    const key = req.header('x-internal-key');
    if (key !== CONFIG.internalApiKey) {
      res.status(401).json({ ok: false, error: 'invalid internal key' });
      return;
    }
    const body = req.body as { sessionId?: string; samples?: unknown[]; agent?: string };
    if (!body.sessionId || !Array.isArray(body.samples) || body.samples.length === 0) {
      res.status(400).json({ ok: false, error: 'sessionId and non-empty samples[] required' });
      return;
    }

    markEngineSeen();
    const agent = typeof body.agent === 'string' ? body.agent : 'rust-engine';
    publish('engine', { agent, sessionId: body.sessionId, ts: Date.now() });

    let accepted = 0;
    for (const raw of body.samples) {
      const s = SignalSample.safeParse(raw);
      if (!s.success) continue;
      const frame = fuseSample(s.data, agent, s.data.ts ?? Date.now());
      pushFrame(body.sessionId, frame);
      publish('emotion', { sessionId: body.sessionId, frame });
      accepted += 1;
    }
    res.json({ ok: true, accepted, state: currentEmotionState(body.sessionId) });
  });

  // tRPC endpoint
  const trpcHandler = createExpressMiddleware({
    router: appRouter,
    createContext,
  });
  app.use('/trpc', trpcHandler);

  const server = http.createServer(app);
  attachWebSocket(server);

  // Log engine heartbeats
  on('engine', (p) => {
    console.log(`[engine] ${p.agent} heartbeat${p.sessionId ? ` (session ${p.sessionId})` : ''}`);
  });

  server.listen(CONFIG.port, () => {
    console.log(`✅ Orchestrator listening on http://localhost:${CONFIG.port}`);
    console.log(`   tRPC        → http://localhost:${CONFIG.port}/trpc`);
    console.log(`   WebSocket   → ws://localhost:${CONFIG.port}/ws`);
    console.log(`   Ingest      → POST http://localhost:${CONFIG.port}/internal/ingest`);
    console.log(`   Store       → ${store().kind}`);
  });
}

main().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
