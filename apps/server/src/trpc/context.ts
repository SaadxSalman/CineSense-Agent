import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

/**
 * tRPC context — carries the request identity through every procedure.
 * Clients pass `x-session-id` to bind calls to an active session.
 */
export async function createContext({ req }: CreateExpressContextOptions) {
  return {
    sessionId: (req.headers['x-session-id'] as string | undefined) ?? null,
    clientName: (req.headers['x-client'] as string | undefined) ?? 'web',
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
