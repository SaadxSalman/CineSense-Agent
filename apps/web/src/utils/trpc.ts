'use client';

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../../apps/server/src/trpc/root';

/**
 * End-to-end type safety: the router type is imported directly from the
 * orchestrator's source. Changes on the server surface here at compile time.
 */
export const trpc = createTRPCReact<AppRouter>();

export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';
export const TRPC_URL = `${SERVER_URL}/trpc`;
export const WS_URL = `${SERVER_URL.replace(/^http/, 'ws')}/ws`;
