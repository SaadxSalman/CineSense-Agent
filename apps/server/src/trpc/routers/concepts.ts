import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { store } from '../../store';
import { retrieveByText } from '../../services/retrieval';

export const conceptsRouter = router({
  /** Semantic retrieval: embed the free-text query and find nearest concepts. */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(2).max(400),
        k: z.number().int().min(1).max(20).default(8),
      }),
    )
    .mutation(async ({ input }) => {
      const hits = await retrieveByText(input.query, input.k);
      return {
        query: input.query,
        results: hits.map((h) => ({
          conceptId: h.conceptId,
          title: h.title,
          year: h.year,
          genres: h.genres,
          mood: h.mood,
          palette: h.palette,
          pacing: h.pacing,
          tags: h.tags,
          styleNotes: h.styleNotes,
          score: h.score,
        })),
      };
    }),

  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(40) }).optional())
    .query(async ({ input }) => store().listConcepts(input?.limit ?? 40)),
});
