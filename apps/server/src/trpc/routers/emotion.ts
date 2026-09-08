import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { store } from '../../store';
import { Session, SessionPrefs, SignalSample, EmotionState } from '../../types';
import {
  currentEmotionState,
  fuseSample,
  pushFrame,
  recentFrames,
} from '../../services/emotionAgent';
import { publish } from '../../services/eventBus';
import { analyzeVisionBatch } from '../../services/inference';
import { TRPCError } from '@trpc/server';

async function requireSession(sessionId: string) {
  const session = await store().getSession(sessionId);
  if (!session) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `session ${sessionId} not found` });
  }
  return session;
}

export const emotionRouter = router({
  /** Create a new viewing session. */
  createSession: publicProcedure
    .input(
      z.object({
        userId: z.string().max(64).optional(),
        preferences: SessionPrefs.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const session: Session = {
        sessionId: `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        userId: input.userId,
        preferences: input.preferences ?? SessionPrefs.parse({}),
        status: 'active',
        startedAt: Date.now(),
      };
      await store().createSession(session);
      return session;
    }),

  getSession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const s = await store().getSession(input.sessionId);
      if (!s) throw new TRPCError({ code: 'NOT_FOUND', message: `session ${input.sessionId} not found` });
      return s;
    }),

  listSessions: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }).optional())
    .query(async ({ input }) => store().listSessions(input?.limit ?? 10)),

  closeSession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      await requireSession(input.sessionId);
      await store().closeSession(input.sessionId);
      return { closed: true, sessionId: input.sessionId };
    }),

  /**
   * Ingest a batch of multi-modal samples (browser vision layer, Rust engine
   * relay, or simulator). Each sample is fused into an EmotionFrame, pushed
   * onto the rolling window, persisted, and broadcast over the WebSocket bus.
   */
  ingest: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        source: z.string().max(32).default('browser'),
        samples: z.array(SignalSample).min(1).max(64),
      }),
    )
    .mutation(async ({ input }) => {
      const session = await requireSession(input.sessionId);

      // Optional Python-bridge enrichment for samples lacking facial data.
      const needingVision = input.samples.filter((s) => s.facial === undefined && s.heatmap !== undefined);
      if (needingVision.length > 0) {
        const reads = await analyzeVisionBatch(needingVision.map((s) => s.heatmap as number[]));
        if (reads) {
          needingVision.forEach((s, i) => {
            const read = reads[i];
            if (read?.facial) s.facial = read.facial;
            if (read?.heatmap) s.heatmap = read.heatmap;
          });
        }
      }

      const frames = input.samples.map((s) =>
        fuseSample(s, input.source, s.ts ?? Date.now()),
      );

      let lastState: EmotionState | null = null;
      for (const frame of frames) {
        pushFrame(session.sessionId, frame);
        publish('emotion', { sessionId: session.sessionId, frame });
      }
      lastState = currentEmotionState(session.sessionId);

      return { accepted: frames.length, state: lastState };
    }),

  /** Aggregated emotional state over the last 30s. */
  current: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ input }) => {
      const state = currentEmotionState(input.sessionId);
      if (!state) {
        return null;
      }
      return state;
    }),

  /** Raw frame history (for charts / replay). */
  history: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        limitSec: z.number().int().min(1).max(90).default(60),
      }),
    )
    .query(({ input }) => ({
      frames: recentFrames(input.sessionId, input.limitSec),
    })),
});
