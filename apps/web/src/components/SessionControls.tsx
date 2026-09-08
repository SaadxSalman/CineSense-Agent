'use client';

import { useState } from 'react';
import { Camera, CircleStop, Sparkles, Video } from 'lucide-react';
import type { Session } from '@/utils/types';
import { trpc } from '@/utils/trpc';

const GENRES = ['sci-fi', 'neo-noir', 'drama', 'thriller', 'romance', 'animation', 'horror', 'action'];

export function SessionControls({
  session,
  mode,
  onSession,
  onMode,
}: {
  session: Session | null;
  mode: 'idle' | 'sim' | 'webcam';
  onSession: (s: Session | null) => void;
  onMode: (m: 'idle' | 'sim' | 'webcam') => void;
}) {
  const [genres, setGenres] = useState<string[]>(['sci-fi', 'neo-noir']);
  const [intensity, setIntensity] = useState(0.7);
  const createSession = trpc.emotion.createSession.useMutation();
  const closeSession = trpc.emotion.closeSession.useMutation();

  const toggleGenre = (g: string) =>
    setGenres((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  const start = async (m: 'sim' | 'webcam') => {
    const s = await createSession.mutateAsync({
      preferences: { genres, intensityTarget: intensity },
    });
    onSession(s);
    onMode(m);
  };

  const stop = async () => {
    if (session) await closeSession.mutateAsync({ sessionId: session.sessionId }).catch(() => undefined);
    onSession(null);
    onMode('idle');
  };

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-wide">Session</h2>
          <p className="mono mt-0.5 text-[11px] text-cine-dim">
            {session ? `${session.sessionId} · ${session.status}` : 'no active session'}
          </p>
        </div>
        {session && (
          <button
            onClick={stop}
            className="flex items-center gap-1.5 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-900/40"
          >
            <CircleStop size={14} /> End session
          </button>
        )}
      </div>

      {!session && (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => toggleGenre(g)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  genres.includes(g)
                    ? 'border-cine-amber/70 bg-cine-amber/15 text-cine-amber'
                    : 'border-cine-line bg-cine-bg text-cine-dim hover:text-cine-text'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <label className="mono mb-4 block text-[11px] text-cine-dim">
            target intensity · {intensity.toFixed(2)}
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="mt-1.5 w-full accent-amber-400"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => start('sim')}
              disabled={createSession.isPending}
              className="flex items-center justify-center gap-2 rounded-lg bg-cine-amber px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
            >
              <Sparkles size={15} /> Simulated biometrics
            </button>
            <button
              onClick={() => start('webcam')}
              disabled={createSession.isPending}
              className="flex items-center justify-center gap-2 rounded-lg border border-cine-line bg-cine-bg px-4 py-2.5 text-sm font-semibold text-cine-text transition hover:border-cine-teal/60 hover:text-cine-teal disabled:opacity-50"
            >
              <Video size={15} /> Use my webcam
            </button>
          </div>
        </>
      )}

      {session && mode === 'sim' && (
        <p className="mono text-[11px] leading-relaxed text-cine-dim">
          Streaming synthetic heart-rate / HRV / gaze / facial signals to the
          orchestrator every 1.2s. The Emotion Agent fuses them in real time.
        </p>
      )}
      {session && mode === 'webcam' && (
        <p className="mono text-[11px] leading-relaxed text-cine-dim">
          <Camera size={12} className="mr-1 inline" />
          Camera active: an 8×8 brightness grid + motion energy is sampled every
          1.4s and used as your live heatmap.
        </p>
      )}
    </div>
  );
}
