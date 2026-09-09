'use client';

import { useMemo, useState } from 'react';
import { Clapperboard, Eye, Loader2, Sparkles, Video, Waves } from 'lucide-react';
import { SystemStatus } from '@/components/SystemStatus';
import { SessionControls } from '@/components/SessionControls';
import { EmotionHeatmap } from '@/components/EmotionHeatmap';
import { EmotionReadout } from '@/components/EmotionReadout';
import { ConceptSearch } from '@/components/ConceptSearch';
import { TrailerPlayer } from '@/components/TrailerPlayer';
import { ScriptView } from '@/components/ScriptView';
import { HistoryList } from '@/components/HistoryList';
import { VideoScan } from '@/components/VideoScan';
import { useEmotionStream } from '@/hooks/useEmotionStream';
import { useBiometricSimulator } from '@/hooks/useBiometricSimulator';
import { useWebcamSignals } from '@/hooks/useWebcamSignals';
import { trpc } from '@/utils/trpc';
import type { GeneratedContent, Session } from '@/utils/types';

type Mode = 'idle' | 'sim' | 'webcam';

export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [selected, setSelected] = useState<GeneratedContent | null>(null);

  const { frame, connected, lastEngineBeat } = useEmotionStream(session?.sessionId ?? null);
  useBiometricSimulator(session !== null && mode === 'sim', session?.sessionId ?? null);
  const webcam = useWebcamSignals(session !== null && mode === 'webcam', session?.sessionId ?? null);

  const stateQuery = trpc.emotion.current.useQuery(
    { sessionId: session?.sessionId ?? '' },
    { enabled: session !== null, refetchInterval: 4000 },
  );

  const contentList = trpc.content.list.useQuery(
    { sessionId: session?.sessionId ?? undefined, limit: 12 },
    { enabled: session !== null },
  );

  const generate = trpc.content.generate.useMutation({
    onSuccess: (c) => setSelected(c),
  });

  // Prefer live WS frames; fall back to the polled aggregate for the heatmap.
  const heatmap = frame?.heatmap ?? stateQuery.data?.heatmap ?? null;
  const valence = frame?.valence ?? stateQuery.data?.valence ?? 0;
  const readoutState = stateQuery.data ?? null;

  const engineOnline = lastEngineBeat !== null && Date.now() - lastEngineBeat < 15_000;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cine-amber/40 bg-cine-amber/10">
            <Clapperboard size={20} className="text-cine-amber" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">CineSense-Agent</h1>
            <p className="mono text-[10px] text-cine-dim">
              emotion-driven cinema, synthesized live from your body
            </p>
          </div>
        </div>
        <div className="mono flex items-center gap-3 text-[10px] text-cine-dim">
          <span className={`flex items-center gap-1 ${connected ? 'text-emerald-400' : ''}`}>
            <Waves size={12} /> bus {connected ? 'live' : 'offline'}
          </span>
          <span className={`flex items-center gap-1 ${engineOnline ? 'text-emerald-400' : ''}`}>
            engine {engineOnline ? 'streaming' : 'idle'}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left column */}
        <section className="flex flex-col gap-4 lg:col-span-4">
          <SystemStatus />
          <SessionControls session={session} mode={mode} onSession={setSession} onMode={setMode} />
          <div className="panel p-5">
            <ConceptSearch />
          </div>
        </section>

        {/* Center column — live emotion */}
        <section className="flex flex-col gap-4 lg:col-span-4">
          <div className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide">
                <Eye size={15} className="text-cine-rose" /> Live emotion
              </h2>
              {mode === 'webcam' && (
                <span className="mono flex items-center gap-1 text-[10px] text-cine-teal">
                  <Video size={11} /> webcam {webcam.status}
                </span>
              )}
              {mode === 'sim' && (
                <span className="mono flex items-center gap-1 text-[10px] text-cine-amber">
                  <Sparkles size={11} /> simulator streaming
                </span>
              )}
            </div>
            {heatmap ? (
              <EmotionHeatmap heatmap={heatmap} valence={valence} />
            ) : (
              <div className="mono flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-cine-line text-[11px] text-cine-dim">
                heatmap appears when signals stream
              </div>
            )}
            <p className="mono mt-2 text-center text-[10px] text-cine-dim">
              8×8 affect grid · {valence >= 0 ? 'warm' : 'cold'} tone follows valence
            </p>
            {mode === 'webcam' && (
              <div className="mt-3 overflow-hidden rounded-lg border border-cine-line">
                <video ref={webcam.videoRef} muted playsInline className="h-24 w-full object-cover" />
                <canvas ref={webcam.canvasRef} width={8} height={8} className="hidden" />
              </div>
            )}
          </div>

          <div className="panel min-h-0 flex-1 p-5">
            <EmotionReadout state={readoutState} />
          </div>
        </section>

        {/* Right column — creative output */}
        <section className="flex flex-col gap-4 lg:col-span-4">
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide">
                <Sparkles size={15} className="text-cine-amber" /> Director
              </h2>
              {session && (
                <span className="mono text-[10px] text-cine-dim">
                  {stateQuery.data ? `mood: ${stateQuery.data.dominant}` : 'waiting for signal…'}
                </span>
              )}
            </div>
            <button
              onClick={() => session && generate.mutate({ sessionId: session.sessionId, kind: 'trailer' })}
              disabled={!session || generate.isPending}
              className="mono mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cine-rose to-cine-amber px-4 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generate.isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> synthesizing…
                </>
              ) : (
                <>synthesize my trailer</>
              )}
            </button>
            {!session && (
              <p className="mono mt-2 text-center text-[10px] text-cine-dim">
                start a session first — the agents need your live emotional state
              </p>
            )}
            {generate.isError && (
              <p className="mono mt-2 rounded border border-rose-900/60 bg-rose-950/40 p-2 text-[10px] text-rose-300">
                {generate.error.message}
              </p>
            )}
          </div>

          <div className="panel p-5">
            {selected ? (
              <TrailerPlayer blueprint={selected.blueprint} />
            ) : (
              <div className="mono flex aspect-video items-center justify-center rounded-xl border border-dashed border-cine-line text-[11px] text-cine-dim">
                your synthesized piece plays here
              </div>
            )}
          </div>

          <div className="panel min-h-0 flex-1 p-5">
            <ScriptView content={selected} />
          </div>

          <div className="panel p-5">
            <HistoryList
              items={contentList.data ?? []}
              selectedId={selected?.contentId}
              onSelect={setSelected}
            />
          </div>
        </section>
      </div>

      {/* Video Scan — analyze the emotions inside any uploaded video */}
      <div className="mt-4">
        <VideoScan sessionId={session?.sessionId ?? null} onGenerated={setSelected} />
      </div>

      <footer className="mono mt-8 pb-4 text-center text-[10px] text-cine-dim/70">
        CineSense-Agent · Emotion Agent → Semantic Retrieval → Creative Agent → Synthesis Agent
      </footer>

    </main>

  );
}
