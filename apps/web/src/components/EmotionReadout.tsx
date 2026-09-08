'use client';

import { motion } from 'framer-motion';
import { Brain, Gauge, HeartPulse } from 'lucide-react';
import type { EmotionState } from '@/utils/types';

/**
 * Emotion readout: circumplex plot (valence × arousal), dominant-label bars
 * (the "EmotionChart") and the engagement gauge.
 */
export function EmotionReadout({ state }: { state: EmotionState | null }) {
  if (!state) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center text-center">
        <p className="mono max-w-56 text-[11px] leading-relaxed text-cine-dim">
          No emotional signal yet. Start a session and stream biometrics to
          bring the agents online.
        </p>
      </div>
    );
  }

  const x = ((state.valence + 1) / 2) * 100; // 0..100 %
  const y = ((1 - state.arousal) / 2) * 100;

  return (
    <div className="flex flex-col gap-5">
      {/* Circumplex */}
      <div>
        <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-cine-line bg-cine-bg">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
            <div className="border-b border-r border-cine-line/50" />
            <div className="border-b border-cine-line/50" />
            <div className="border-r border-cine-line/50" />
            <div />
          </div>
          <span className="mono absolute left-2 top-1.5 text-[9px] uppercase tracking-widest text-cine-dim/70">
            tense
          </span>
          <span className="mono absolute right-2 top-1.5 text-[9px] uppercase tracking-widest text-cine-dim/70">
            excited
          </span>
          <span className="mono absolute bottom-1.5 left-2 text-[9px] uppercase tracking-widest text-cine-dim/70">
            depressed
          </span>
          <span className="mono absolute bottom-1.5 right-2 text-[9px] uppercase tracking-widest text-cine-dim/70">
            serene
          </span>
          <motion.div
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/40 shadow-[0_0_18px_rgba(242,163,60,0.8)]"
            style={{ background: state.valence >= 0 ? '#f2a33c' : '#e51937' }}
            animate={{ left: `${x}%`, top: `${y}%` }}
            transition={{ type: 'spring', stiffness: 60, damping: 15 }}
          />
        </div>
        <p className="mono mt-1.5 text-center text-[10px] text-cine-dim">
          circumplex · valence {state.valence.toFixed(2)} · arousal {state.arousal.toFixed(2)}
        </p>
      </div>

      {/* Dominant emotion bars */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cine-dim">
          <Brain size={13} /> Dominant emotions
        </h3>
        <div className="flex flex-col gap-1.5">
          {state.labels.map((l) => (
            <div key={l.emotion} className="flex items-center gap-2">
              <span className="mono w-16 shrink-0 text-[11px] text-cine-text">{l.emotion}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-cine-line/60">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cine-violet to-cine-amber"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, l.weight * 500)}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="mono w-10 text-right text-[10px] text-cine-dim">
                {(l.weight * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Engagement */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cine-dim">
          <Gauge size={13} /> Engagement
        </h3>
        <div className="h-2 overflow-hidden rounded-full bg-cine-line/60">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-cine-teal to-cine-violet"
            animate={{ width: `${state.engagement * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <p className="mono mt-1 flex items-center gap-1 text-[10px] text-cine-dim">
          <HeartPulse size={11} /> {state.sampleCount} fused samples in the 30s window ·
          dominant <span className="text-cine-amber">{state.dominant}</span>
        </p>
      </div>
    </div>
  );
}
