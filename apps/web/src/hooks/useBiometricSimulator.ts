'use client';

import { useEffect, useRef } from 'react';
import { trpc } from '@/utils/trpc';

/**
 * Simulated biometric stream — generates physiologically-plausible samples
 * (heart rate, HRV, skin conductance, facial actions, gaze, motion, audio)
 * with a slow drift so the whole pipeline can be exercised without hardware.
 */
export function useBiometricSimulator(
  enabled: boolean,
  sessionId: string | null,
  opts?: { onSample?: (phase: number) => void },
) {
  const ingest = trpc.emotion.ingest.useMutation();
  const phaseRef = useRef(0);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    phaseRef.current = 0;

    const tick = () => {
      const i = phaseRef.current;
      const t = (i % 24) / 23; // slow drift 0→1→(restart)
      const wave = Math.sin(t * Math.PI);
      const jitter = () => Math.random() * 0.08;

      const sample = {
        ts: Date.now(),
        heartRate: Math.round(62 + wave * 42 + jitter() * 40),
        hrv: Math.round(80 - wave * 46 + jitter() * 60),
        skinConductance: 2 + wave * 5 + jitter() * 3,
        facial: {
          happy: Math.max(0.02, 0.5 - wave * 0.45 + jitter()),
          sad: Math.min(1, 0.04 + wave * 0.5 + jitter()),
          angry: Math.min(1, wave * 0.35 + jitter() * 0.3),
          surprised: 0.08 + jitter() * 2,
          fearful: Math.min(1, wave * 0.25 + jitter()),
          disgust: Math.min(1, wave * 0.2),
          neutral: 0.25,
        },
        gaze: {
          fixationRate: Math.min(1, 0.5 + wave * 0.45),
          blinkRate: 17 - wave * 10 + Math.random() * 3,
          pupilDilation: Math.min(1, 0.28 + wave * 0.55),
        },
        motion: {
          motionEnergy: Math.min(1, wave * 0.6 + jitter()),
          frameVariance: 0.15 + wave * 0.2,
        },
        audio: {
          rms: Math.min(1, wave * 0.42 + 0.04),
          spectralCentroid: 0.45 + wave * 0.25,
          speechRate: 2.2 + wave * 2,
        },
      };

      ingest.mutate({ sessionId, source: 'simulator', samples: [sample] });
      opts?.onSample?.(t);
      phaseRef.current += 1;
    };

    tick();
    const interval = setInterval(tick, 1200);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId]);

  return { sending: ingest.isPending };
}
