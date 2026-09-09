import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from '../trpc';
import { store } from '../../store';
import type { EmotionState } from '../../types';
import { currentEmotionState, synthesizeHeatmap } from '../../services/emotionAgent';
import { retrieveByEmotion } from '../../services/retrieval';
import { generateContent } from '../../services/synthesis';
import { publish } from '../../services/eventBus';

export const contentRouter = router({
  /**
   * Full pipeline: live emotion (or an uploaded video's emotional arc) →
   * semantic retrieval → creative agent (Llama-3 / local) → synthesis agent →
   * persisted GeneratedContent.
   */
  generate: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        kind: z.enum(['trailer', 'short-film', 'script']).default('trailer'),
        videoJobId: z.string().optional(), // analyze-the-video mode: use the video's arc as the mood source
      }),
    )
    .mutation(async ({ input }) => {
      const session = await store().getSession(input.sessionId);
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `session ${input.sessionId} not found` });
      }

      let state: EmotionState;
      if (input.videoJobId) {
        // Mood source = the uploaded video's analyzed emotional arc.
        const job = await store().getVideoJob(input.videoJobId);
        if (!job) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `video job ${input.videoJobId} not found` });
        }
        if (job.status !== 'complete' || !job.summary) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'video analysis is not complete yet',
          });
        }
        const s = job.summary;
        state = {
          sessionId: input.sessionId,
          sampleCount: job.points.length,
          windowSec: Math.round(job.durationSec),
          valence: s.valence,
          arousal: s.arousal,
          engagement: s.engagement,
          dominant: s.dominant,
          labels: s.labels,
          heatmap: synthesizeHeatmap(s.valence, s.arousal, s.engagement),
          updatedAt: Date.now(),
        };
      } else {
        const live = currentEmotionState(input.sessionId);
        if (!live || live.sampleCount < 3) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'not enough emotional signal yet — stream biometric samples for a few seconds before generating',
          });
        }
        state = live;
      }

      const { query, hits } = await retrieveByEmotion(state, session.preferences, 6);
      const result = await generateContent(
        input.sessionId,
        state,
        session.preferences,
        hits,
        query,
        input.kind,
      );

      await store().saveContent(result);
      publish('content', {
        sessionId: input.sessionId,
        contentId: result.contentId,
        title: result.title,
      });

      return result;
    }),

  list: publicProcedure
    .input(
      z
        .object({
          sessionId: z.string().optional(),
          limit: z.number().int().min(1).max(50).default(12),
        })
        .optional(),
    )
    .query(async ({ input }) => store().listContent(input?.sessionId, input?.limit ?? 12)),

  get: publicProcedure
    .input(z.object({ contentId: z.string() }))
    .query(async ({ input }) => {
      const content = await store().getContent(input.contentId);
      if (!content) throw new TRPCError({ code: 'NOT_FOUND', message: `content ${input.contentId} not found` });
      return content;
    }),
});
