import { router } from '../trpc/trpc';
import { healthRouter } from './routers/health';
import { emotionRouter } from './routers/emotion';
import { conceptsRouter } from './routers/concepts';
import { contentRouter } from './routers/content';

export const appRouter = router({
  health: healthRouter,
  emotion: emotionRouter,
  concepts: conceptsRouter,
  content: contentRouter,
});

export type AppRouter = typeof appRouter;
