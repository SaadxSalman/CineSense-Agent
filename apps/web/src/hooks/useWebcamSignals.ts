'use client';

import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/utils/trpc';

/**
 * Webcam biometrics (the browser-side "vision layer"):
 * samples the camera into an 8x8 brightness grid each frame-poll — that grid
 * doubles as the live emotion heatmap — and derives motion energy from
 * frame-to-frame deltas. The orchestrator fuses these signals (and may
 * forward the grid to the Python inference bridge for expression analysis).
 */
export function useWebcamSignals(enabled: boolean, sessionId: string | null) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevGridRef = useRef<number[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'requesting' | 'live' | 'denied' | 'error'>('idle');
  const ingest = trpc.emotion.ingest.useMutation();

  useEffect(() => {
    if (!enabled || !sessionId) {
      // stop camera when disabled
      const video = videoRef.current;
      const stream = video?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
      prevGridRef.current = null;
      if (status === 'live' || status === 'error') setStatus('idle');
      return;
    }

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let stream: MediaStream | null = null;

    const sample = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, 8, 8);
      const { data } = ctx.getImageData(0, 0, 8, 8);
      const grid: number[] = [];
      for (let i = 0; i < 64; i++) {
        const r = data[i * 4] ?? 0;
        const g = data[i * 4 + 1] ?? 0;
        const b = data[i * 4 + 2] ?? 0;
        grid.push(Math.min(1, (0.299 * r + 0.587 * g + 0.114 * b) / 255));
      }

      const prev = prevGridRef.current;
      const motionEnergy = prev
        ? Math.min(1, grid.reduce((acc, v, i) => acc + Math.abs(v - (prev[i] ?? v)), 0) / 12)
        : 0;
      prevGridRef.current = grid;

      // normalize brightness into a centered 0..1 signal
      const mean = grid.reduce((a, b) => a + b, 0) / 64;
      const centered = grid.map((v) => Math.max(0, Math.min(1, 0.5 + (v - mean) * 2.2)));

      ingest.mutate({
        sessionId,
        source: 'webcam',
        samples: [
          {
            ts: Date.now(),
            heatmap: centered,
            motion: { motionEnergy, frameVariance: 0.1 + motionEnergy * 0.3 },
            gaze: { fixationRate: Math.max(0.15, 0.9 - motionEnergy * 1.2), blinkRate: 14 },
          },
        ],
      });
    };

    const start = async () => {
      try {
        setStatus('requesting');
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setStatus('live');
        interval = setInterval(sample, 1400);
      } catch {
        setStatus('denied');
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId]);

  return { videoRef, canvasRef, status };
}
