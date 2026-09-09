'use client';

import { useMemo, useRef, useState } from 'react';
import { Film, Loader2, Sparkles, UploadCloud } from 'lucide-react';
import type { GeneratedContent } from '@/utils/types';
import { trpc } from '@/utils/trpc';
import { useVideoScan, type ScanPhase } from '@/hooks/useVideoScan';

const PHASE_LABEL: Record<ScanPhase, string> = {
  idle: 'waiting for a video',
  preparing: 'reading video…',
  audio: 'decoding audio…',
  extracting: 'sampling frames…',
  submitting: 'analyzing emotions…',
  complete: 'analysis complete',
  error: 'failed',
};

/**
 * Video Scan — upload any video, watch its emotional arc get analyzed, and
 * optionally synthesize a new piece from the video's mood.
 */
export function VideoScan({
  sessionId,
  onGenerated,
}: {
  sessionId: string | null;
  onGenerated: (c: GeneratedContent) => void;
}) {
  const { scan, reset, phase, progress, error, job } = useVideoScan();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const generate = trpc.content.generate.useMutation({ onSuccess: onGenerated });

  const onPick = (file: File | undefined) => {
    if (!file) return;
    setCurrentTime(0);
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    void scan(file);
  };

  const points = job?.points ?? [];
  const duration = job?.durationSec ?? 1;

  // Emotion curves (valence amber, arousal violet) as SVG paths.
  const curves = useMemo(() => {
    if (points.length === 0) return null;
    const x = (t: number) => (t / duration) * 100;
    const y = (v: number) => 50 - (v / 2) * 42; // [-1,1] → [71,29]
    const path = (key: 'valence' | 'arousal') =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.tSec).toFixed(2)} ${y(p[key]).toFixed(2)}`).join(' ');
    return { valence: path('valence'), arousal: path('arousal') };
  }, [points, duration]);

  const playhead = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="panel p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide">
          <Film size={15} className="text-cine-teal" /> Video Scan
          <span className="mono ml-1 text-[10px] font-normal text-cine-dim">
            — upload a video, analyze the emotions inside it
          </span>
        </h2>
        {phase === 'complete' && (
          <button
            onClick={() => {
              reset();
              setPreviewUrl(null);
            }}
            className="mono rounded-lg border border-cine-line px-2.5 py-1 text-[10px] text-cine-dim transition hover:text-cine-text"
          >
            scan another
          </button>
        )}
      </div>

      {phase === 'idle' || phase === 'error' ? (
        <label className="mono flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-cine-line bg-cine-bg/50 px-4 py-8 text-center transition hover:border-cine-teal/60">
          <UploadCloud size={22} className="text-cine-teal" />
          <span className="text-xs text-cine-text">choose a video to scan</span>
          <span className="text-[10px] text-cine-dim">
            mp4 / webm / mov · decoded privately in your browser — the file never uploads
          </span>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
        </label>
      ) : null}

      {error && (
        <p className="mono mt-2 rounded border border-rose-900/60 bg-rose-950/40 p-2 text-[10px] text-rose-300">
          {error}
        </p>
      )}

      {(phase !== 'idle' && phase !== 'error') || previewUrl ? (
        <div className="mt-3">
          {previewUrl && (
            <video
              ref={videoRef}
              src={previewUrl}
              controls
              className="aspect-video w-full rounded-xl border border-cine-line bg-black"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
          )}

          {(phase !== 'complete' || progress < 1) && (
            <div className="mt-3">
              <div className="mono mb-1 flex items-center justify-between text-[10px] text-cine-dim">
                <span className="flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin text-cine-teal" />
                  {PHASE_LABEL[phase]}
                </span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-cine-line/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cine-teal to-cine-violet transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}

      {job && phase === 'complete' && <VideoScanResults job={job} curves={curves} playhead={playhead} onSeek={(t) => {
        if (videoRef.current) {
          videoRef.current.currentTime = t;
          void videoRef.current.play();
        }
      }} sessionId={sessionId} generate={generate} />}
    </div>
  );
}

function VideoScanResults({
  job,
  curves,
  playhead,
  onSeek,
  sessionId,
  generate,
}: {
  job: NonNullable<ReturnType<typeof useVideoScan>['job']>;
  curves: { valence: string; arousal: string } | null;
  playhead: number;
  onSeek: (t: number) => void;
  sessionId: string | null;
  generate: ReturnType<typeof trpc.content.generate.useMutation>;
}) {
  const s = job.summary;
  if (!s || !curves) return null;

  return (
    <div className="mt-4">
      {/* emotion curves over the timeline */}
      <div className="relative h-24 w-full overflow-hidden rounded-xl border border-cine-line bg-cine-bg">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <line x1="0" y1="50" x2="100" y2="50" stroke="#23232f" strokeWidth="0.4" />
          <path d={curves.valence} fill="none" stroke="#f2a33c" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          <path d={curves.arousal} fill="none" stroke="#8d7bff" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          <line x1={playhead} y1="0" x2={playhead} y2="100" stroke="#e8e6e3" strokeWidth="0.5" opacity="0.7" />
        </svg>
        <div className="mono pointer-events-none absolute right-2 top-1.5 flex gap-2 text-[9px]">
          <span className="text-cine-amber">— valence</span>
          <span className="text-cine-violet">— arousal</span>
        </div>
      </div>

      {/* summary */}
      <p className="mono mt-2 text-[11px] text-cine-dim">
        overall mood:{' '}
        <span className="text-cine-amber">{s.dominant}</span> · valence {s.valence.toFixed(2)} ·
        arousal {s.arousal.toFixed(2)} · {job.points.length} sampled moments ·{' '}
        {(job.durationSec >= 60 ? `${Math.floor(job.durationSec / 60)}m ` : '') +
          `${Math.round(job.durationSec % 60)}s`}
      </p>

      {/* peak moments */}
      {s.peaks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {s.peaks.map((p) => (
            <button
              key={`${p.label}-${p.tSec}`}
              onClick={() => onSeek(p.tSec)}
              className="mono rounded-full border border-cine-line bg-cine-bg/60 px-2.5 py-1 text-[10px] text-cine-text transition hover:border-cine-amber/60"
            >
              {p.label} @ {Math.floor(p.tSec / 60)}:{String(Math.round(p.tSec % 60)).padStart(2, '0')}
              <span className="ml-1 text-cine-teal">{p.intensity.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}

      {/* mashup: generate from this video's mood */}
      <button
        onClick={() => sessionId && generate.mutate({ sessionId, kind: 'trailer', videoJobId: job.jobId })}
        disabled={!sessionId || generate.isPending}
        className="mono mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cine-teal to-cine-violet px-4 py-2.5 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Sparkles size={14} />
        {generate.isPending ? 'synthesizing…' : 'synthesize trailer from this video’s mood'}
      </button>
      {!sessionId && (
        <p className="mono mt-1.5 text-center text-[10px] text-cine-dim">
          start a session above to enable generation
        </p>
      )}
      {generate.isError && (
        <p className="mono mt-2 rounded border border-rose-900/60 bg-rose-950/40 p-2 text-[10px] text-rose-300">
          {generate.error.message}
        </p>
      )}
    </div>
  );
}

