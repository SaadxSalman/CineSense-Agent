'use client';

import { useCallback, useState } from 'react';
import { trpc } from '@/utils/trpc';
import type { VideoAnalysisJob, VideoSample } from '@/utils/types';

export type ScanPhase = 'idle' | 'preparing' | 'audio' | 'extracting' | 'submitting' | 'complete' | 'error';

const GRID_W = 16;
const GRID_H = 12;
const MAX_SAMPLES = 240;
const MIN_SAMPLES = 36;
const SAMPLES_PER_SEC = 3;
const BATCH_SIZE = 30;
const MAX_AUDIO_BYTES = 150 * 1024 * 1024; // skip audio decode for very large files

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 1200); // never hang on a stubborn seek
    video.addEventListener('seeked', done);
    video.currentTime = t;
  });
}

/**
 * Video Scan extraction layer — decodes the uploaded video entirely in the
 * browser: samples frames into 16x12 grayscale grids + color statistics,
 * derives motion energy between consecutive samples, and (best-effort)
 * decodes the audio track into loudness/brightness windows. Observations are
 * streamed to the orchestrator in batches, where the Video Analyst fuses
 * them into an emotion timeline. The file itself never leaves the machine.
 */
export function useVideoScan() {
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<VideoAnalysisJob | null>(null);

  const startM = trpc.videos.startUpload.useMutation();
  const submitM = trpc.videos.submitSamples.useMutation();
  const finalizeM = trpc.videos.finalize.useMutation();

  const scan = useCallback(
    async (file: File) => {
      setPhase('preparing');
      setProgress(0);
      setError(null);
      setJob(null);

      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = url;

      try {
        // 1. metadata
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('could not read video metadata')), 20_000);
          video.onloadedmetadata = () => {
            clearTimeout(timer);
            resolve();
          };
          video.onerror = () => {
            clearTimeout(timer);
            reject(new Error('the browser cannot decode this video format'));
          };
        });
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0.5) {
          throw new Error('invalid video duration');
        }

        const total = Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.round(duration * SAMPLES_PER_SEC)));
        const step = duration / total;

        // 2. register the analysis job
        const started = await startM.mutateAsync({
          name: file.name.slice(0, 160),
          durationSec: duration,
          sizeBytes: file.size,
          totalSamples: total,
        });

        // 3. audio features (best effort)
        setPhase('audio');
        let audio: Array<{ loudness: number; brightness: number }> | null = null;
        if (file.size <= MAX_AUDIO_BYTES) {
          try {
            const ab = await file.arrayBuffer();
            const AC: typeof AudioContext =
              window.AudioContext ??
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const ac = new AC();
            const buf = await ac.decodeAudioData(ab);
            const data = buf.getChannelData(0);
            const sr = buf.sampleRate;
            audio = [];
            for (let i = 0; i < total; i++) {
              const start = Math.floor(i * step * sr);
              const end = Math.min(Math.floor((i + 1) * step * sr), data.length);
              let sum = 0;
              let cross = 0;
              let count = 0;
              let prev = 0;
              for (let j = start; j < end; j++) {
                const v = data[j] ?? 0;
                sum += v * v;
                if (j > start && v >= 0 !== prev >= 0) cross += 1;
                prev = v;
                count += 1;
              }
              const rms = Math.sqrt(count > 0 ? sum / count : 0);
              audio.push({
                loudness: clamp01(rms * 3.5),
                brightness: clamp01(count > 0 ? (cross / count) * 12 : 0),
              });
            }
            void ac.close();
          } catch {
            audio = null; // no decodable audio — analysis continues without it
          }
        }

        // 4. frame extraction + batched submission
        setPhase('extracting');
        const canvas = document.createElement('canvas');
        canvas.width = GRID_W;
        canvas.height = GRID_H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('canvas unavailable');

        const samples: VideoSample[] = [];
        let prevGray: number[] | null = null;

        for (let i = 0; i < total; i++) {
          const t = i * step + step / 2;
          await seek(video, Math.min(t, Math.max(0, duration - 0.05)));
          ctx.drawImage(video, 0, 0, GRID_W, GRID_H);
          const { data } = ctx.getImageData(0, 0, GRID_W, GRID_H);

          const grid: number[] = [];
          const gray: number[] = [];
          let rS = 0;
          let gS = 0;
          let bS = 0;
          let satS = 0;
          const n = GRID_W * GRID_H;
          for (let p = 0; p < n; p++) {
            const r = (data[p * 4] ?? 0) / 255;
            const g = (data[p * 4 + 1] ?? 0) / 255;
            const b = (data[p * 4 + 2] ?? 0) / 255;
            const mx = Math.max(r, g, b);
            const mn = Math.min(r, g, b);
            const y = 0.299 * r + 0.587 * g + 0.114 * b;
            grid.push(r2(clamp01(y)));
            gray.push(y);
            rS += r;
            gS += g;
            bS += b;
            satS += mx === 0 ? 0 : (mx - mn) / mx;
          }
          const motion = prevGray
            ? clamp01(
                (gray.reduce((a, v, idx) => a + Math.abs(v - (prevGray![idx] ?? v)), 0) / n) * 4,
              )
            : 0;
          prevGray = gray;

          samples.push({
            tSec: r2(t),
            grid,
            avgR: r2(clamp01(rS / n)),
            avgG: r2(clamp01(gS / n)),
            avgB: r2(clamp01(bS / n)),
            saturation: r2(clamp01(satS / n)),
            motionEnergy: r2(motion),
            audio: audio ? audio[i] : undefined,
          });

          setProgress(0.05 + 0.5 * ((i + 1) / total));

          if (samples.length === BATCH_SIZE || i === total - 1) {
            setPhase('submitting');
            await submitM.mutateAsync({ jobId: started.jobId, samples: samples.splice(0) });
            setProgress(0.6 + 0.35 * ((i + 1) / total));
            setPhase('extracting');
          }
        }

        // 5. finalize
        setPhase('submitting');
        const done = await finalizeM.mutateAsync({ jobId: started.jobId });
        setProgress(1);
        setJob(done);
        setPhase('complete');
        URL.revokeObjectURL(url);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'scan failed');
        setPhase('error');
        URL.revokeObjectURL(url);
      }
    },
    [startM, submitM, finalizeM],
  );

  const reset = useCallback(() => {
    setPhase('idle');
    setProgress(0);
    setError(null);
    setJob(null);
  }, []);

  return { scan, reset, phase, progress, error, job };
}

