'use client';

import { useEffect, useRef, useState } from 'react';
import { WS_URL } from '@/utils/trpc';

export interface LiveEmotionFrame {
  ts: number;
  source: string;
  valence: number;
  arousal: number;
  engagement: number;
  labels: Array<{ emotion: string; weight: number }>;
  heatmap: number[];
}

type BusMessage =
  | { type: 'hello'; detail: string }
  | { type: 'subscribed'; sessionId: string }
  | { type: 'emotion'; sessionId: string; frame: LiveEmotionFrame }
  | { type: 'engine'; agent: string; ts: number }
  | { type: 'content'; sessionId: string; contentId: string; title: string }
  | { type: 'pong'; ts: number }
  | { type: 'error'; detail: string };

/**
 * Live emotion bus (native WebSocket at /ws). One connection for the app's
 * lifetime; re-subscribes whenever the active session changes. Falls back
 * silently if the orchestrator restarts (auto-reconnect with backoff).
 */
export function useEmotionStream(sessionId: string | null) {
  const [frame, setFrame] = useState<LiveEmotionFrame | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEngineBeat, setLastEngineBeat] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const sessionRef = useRef<string | null>(sessionId);
  sessionRef.current = sessionId;

  useEffect(() => {
    let closed = false;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        const sid = sessionRef.current;
        if (sid) ws.send(JSON.stringify({ type: 'subscribe', sessionId: sid }));
      };

      ws.onmessage = (ev) => {
        let msg: BusMessage;
        try {
          msg = JSON.parse(ev.data as string) as BusMessage;
        } catch {
          return;
        }
        if (msg.type === 'emotion' && msg.sessionId === sessionRef.current) {
          setFrame(msg.frame);
        } else if (msg.type === 'engine') {
          setLastEngineBeat(msg.ts);
        } else if (msg.type === 'subscribed' || msg.type === 'hello') {
          // noop
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          const wait = Math.min(1000 * 2 ** retryRef.current, 8000);
          retryRef.current += 1;
          setTimeout(connect, wait);
        }
      };

      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && sessionId) {
      ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
      setFrame(null); // fresh window for the new session
    }
  }, [sessionId]);

  return { frame, connected, lastEngineBeat };
}
