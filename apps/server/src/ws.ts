import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { setWsClientCount } from './trpc/routers/health';

/**
 * Native WebSocket endpoint at /ws for real-time emotion streaming.
 * Clients send { type: "subscribe", sessionId } and then receive:
 *   { type: "emotion", sessionId, frame }   — fused EmotionFrames as they land
 *   { type: "engine", agent, ts }           — engine heartbeats
 *   { type: "content", sessionId, ... }     — finished generated pieces
 */

interface ClientState {
  ws: WebSocket;
  sessionId: string | null;
  alive: boolean;
}

const globalForWss = globalThis as unknown as { __cinesenseWss?: WebSocketServer };

export function attachWebSocket(server: HttpServer): void {
  if (globalForWss.__cinesenseWss) return;

  const wss = new WebSocketServer({ noServer: true });
  globalForWss.__cinesenseWss = wss;

  const clients = new Set<ClientState>();

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket as never, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const state: ClientState = { ws, sessionId: null, alive: true };
    clients.add(state);
    setWsClientCount(clients.size);

    ws.on('pong', () => {
      state.alive = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data)) as {
          type?: string;
          sessionId?: string;
        };
        if (msg.type === 'subscribe' && typeof msg.sessionId === 'string') {
          state.sessionId = msg.sessionId;
          ws.send(JSON.stringify({ type: 'subscribed', sessionId: msg.sessionId, ts: Date.now() }));
        } else if (msg.type === 'unsubscribe') {
          state.sessionId = null;
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        ws.send(JSON.stringify({ type: 'error', detail: 'malformed message' }));
      }
    });

    ws.on('close', () => {
      clients.delete(state);
      setWsClientCount(clients.size);
    });

    ws.send(
      JSON.stringify({ type: 'hello', detail: 'cinesense real-time bus', ts: Date.now() }),
    );
  });

  // Deliver bus events to subscribed clients.
  const deliver = (channel: 'emotion' | 'content' | 'engine', make: (sessionId: string | null) => unknown) => {
    for (const client of clients) {
      if (client.ws.readyState !== 1 /* OPEN */) continue;
      const payload = make(client.sessionId);
      if (payload === null) continue;
      client.ws.send(JSON.stringify(payload));
    }
  };

  const { eventBus } = require('./services/eventBus') as typeof import('./services/eventBus');
  const bus = eventBus();
  bus.on('emotion', (p: { sessionId: string; frame: unknown }) =>
    deliver('emotion', (sid) => (sid === p.sessionId ? { type: 'emotion', ...p } : null)),
  );
  bus.on('content', (p: { sessionId: string; contentId: string; title: string }) =>
    deliver('content', (sid) => (sid === p.sessionId ? { type: 'content', ...p } : null)),
  );
  bus.on('engine', (p: { agent: string; sessionId?: string; ts: number }) =>
    deliver('engine', () => ({ type: 'engine', ...p })),
  );

  // Heartbeat to reap dead connections.
  const interval = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.ws.terminate();
        continue;
      }
      client.alive = false;
      client.ws.ping();
    }
  }, 20_000);
  wss.on('close', () => clearInterval(interval));
}
