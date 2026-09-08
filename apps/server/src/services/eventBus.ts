import { EventEmitter } from 'node:events';

export type BusChannels = {
  /** A new fused EmotionFrame is available for a session. */
  emotion: { sessionId: string; frame: unknown };
  /** A content generation finished. */
  content: { sessionId: string; contentId: string; title: string };
  /** Engine liveness heartbeat (rust/simulator). */
  engine: { agent: string; sessionId?: string; ts: number };
};

const globalForBus = globalThis as unknown as { __cinesenseBus?: EventEmitter };

export function eventBus(): EventEmitter {
  if (!globalForBus.__cinesenseBus) {
    const bus = new EventEmitter();
    bus.setMaxListeners(100);
    globalForBus.__cinesenseBus = bus;
  }
  return globalForBus.__cinesenseBus;
}

export function publish<K extends keyof BusChannels>(channel: K, payload: BusChannels[K]): void {
  eventBus().emit(channel, payload);
}

export function on<K extends keyof BusChannels>(
  channel: K,
  listener: (payload: BusChannels[K]) => void,
): () => void {
  eventBus().on(channel, listener);
  return () => eventBus().off(channel, listener);
}
