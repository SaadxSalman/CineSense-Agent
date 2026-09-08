import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { store } from '../../store';
import { currentEmotionState } from '../../services/emotionAgent';
import { probeBridge } from '../../services/inference';
import { isLlamaConfigured } from '../../services/llama';
import { CONFIG } from '../../config';
import { publish } from '../../services/eventBus';
import type { BusChannels } from '../../services/eventBus';

const globalForDiag = globalThis as unknown as {
  __cinesenseEngineLastSeen?: number;
  __cinesenseWsClients?: number;
};

export function markEngineSeen(): void {
  globalForDiag.__cinesenseEngineLastSeen = Date.now();
}
export function engineLastSeen(): number | null {
  return globalForDiag.__cinesenseEngineLastSeen ?? null;
}
export function setWsClientCount(n: number): void {
  globalForDiag.__cinesenseWsClients = n;
}
export function wsClientCount(): number {
  return globalForDiag.__cinesenseWsClients ?? 0;
}

export const healthRouter = router({
  health: publicProcedure.query(() => ({
    ok: true,
    service: 'cinesense-orchestrator',
    time: Date.now(),
    store: store().kind,
  })),

  diagnostics: publicProcedure.query(async () => {
    const bridge = await probeBridge();
    const conceptCount = await store().countConcepts();
    const engineSeen = engineLastSeen();

    const engine: { online: boolean; detail: string } = (() => {
      if (engineSeen === null) {
        return { online: false, detail: 'Rust core-engine has not connected (start it or use the browser/simulator producers)' };
      }
      const age = Date.now() - engineSeen;
      return age < 15_000
        ? { online: true, detail: `engine streaming (last sample ${Math.round(age / 1000)}s ago)` }
        : { online: false, detail: `engine silent for ${Math.round(age / 1000)}s` };
    })();

    const subsystems: Record<string, { online: boolean; detail: string }> = {
      orchestrator: { online: true, detail: 'tRPC + WebSocket + REST ingest running' },
      store: {
        online: true,
        detail:
          store().kind === 'mongo'
            ? 'MongoDB (Atlas Vector Search when available)'
            : `in-memory store (${conceptCount} concepts indexed)`,
      },
      creativeAgent: {
        online: isLlamaConfigured(),
        detail: isLlamaConfigured()
          ? `Llama-3 via ${CONFIG.llama.baseUrl} (${CONFIG.llama.model})`
          : 'LLAMA_API_KEY not set — deterministic local screenwriter active',
      },
      inferenceBridge: bridge,
      engine,
      embeddings: {
        online: true,
        detail: `provider=${CONFIG.embedding.provider}, dim=${CONFIG.embedding.dim}`,
      },
      websocket: { online: true, detail: `${wsClientCount()} live subscriber(s)` },
    };

    return {
      ok: true,
      time: Date.now(),
      conceptCount,
      subsystems,
    };
  }),

  /** Emits a synthetic test event over the WebSocket bus (used by the dashboard). */
  pingBus: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(({ input }) => {
      const payload: BusChannels['engine'] = { agent: 'web-diagnostic', sessionId: input.sessionId, ts: Date.now() };
      publish('engine', payload);
      return { emitted: true, ts: payload.ts };
    }),
});
