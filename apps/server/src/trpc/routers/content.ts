import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from '../trpc';
import { store } from '../../store';
import { currentEmotionState } from '../../services/emotionAgent';
import { retrieveByEmotion } from '../../services/retrieval';
import { generateContent } from '../../services/synthesis';
import { publish } from '../../services/eventBus';

export const contentRouter = router({
  /**
   * Full pipeline: live emotion → semantic retrieval → creative agent
   * (Llama-3 / local) → synthesis agent → persisted GeneratedContent.
   */
  generate: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        kind: z.enum(['trailer', 'short-film', 'script']).default('trailer'),
      }),
    )
    .mutation(async ({ input }) => {
      const session = await store().getSession(input.sessionId);
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `session ${input.sessionId} not found` });
      }
      const state = currentEmotionState(input.sessionId);
      if (!state || state.sampleCount < 3) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'not enough emotional signal yet — stream biometric samples for a few seconds before generating',
        });
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
