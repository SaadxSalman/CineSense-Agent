import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from '../trpc';
import { store } from '../../store';
import { VideoSample } from '../../types';
import { analyzeVideoSample, summarizeVideo } from '../../services/videoAnalyst';

/**
 * Video Emotion Analysis
 * ──────────────────────
 * The browser decodes an uploaded video locally (frame grids + color stats +
 * motion + audio features) and streams the observations here in batches.
 * Each observation is fused into an emotion point by the Video Analyst, and
 * on finalize the full timeline is summarized (dominant mood, peaks) and
 * persisted. The summary can then drive the Creative Agent via
 * `content.generate({ videoJobId })`.
 */
export const videosRouter = router({
  /** Register a new analysis job (metadata only — the file never leaves the browser). */
  startUpload: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(160),
        durationSec: z.number().min(0.5).max(7200),
        sizeBytes: z.number().min(1),
        totalSamples: z.number().int().min(1).max(400),
      }),
    )
    .mutation(async ({ input }) => {
      const job = {
        jobId: `vid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: input.name,
        durationSec: input.durationSec,
        sizeBytes: input.sizeBytes,
        status: 'analyzing' as const,
        progress: 0,
        totalSamples: input.totalSamples,
        points: [],
        createdAt: Date.now(),
      };
      await store().createVideoJob(job);
      return job;
    }),

  /** Submit a batch of extracted observations; each is fused into an emotion point. */
  submitSamples: publicProcedure
    .input(
      z.object({
        jobId: z.string(),
        samples: z.array(VideoSample).min(1).max(40),
      }),
    )
    .mutation(async ({ input }) => {
      const job = await store().getVideoJob(input.jobId);
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: `job ${input.jobId} not found` });
      if (job.status !== 'analyzing') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'job is no longer accepting samples' });
      }

      const newPoints = input.samples.map(analyzeVideoSample);
      const points = [...job.points, ...newPoints].slice(0, job.totalSamples);
      const progress = Math.min(1, points.length / job.totalSamples);
      await store().updateVideoJob(input.jobId, { points, progress });

      return {
        accepted: newPoints.length,
        progress,
        latest: newPoints[newPoints.length - 1] ?? null,
      };
    }),

  /** Close the job: summarize the full timeline and mark it complete. */
  finalize: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input }) => {
      const job = await store().getVideoJob(input.jobId);
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: `job ${input.jobId} not found` });
      if (job.points.length === 0) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'no samples were submitted' });
      }

      const summary = summarizeVideo(job.points);
      const updated = {
        ...job,
        summary,
        status: 'complete' as const,
        progress: 1,
        completedAt: Date.now(),
      };
      await store().updateVideoJob(input.jobId, {
        summary,
        status: 'complete',
        progress: 1,
        completedAt: updated.completedAt,
      });
      return updated;
    }),

  get: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = await store().getVideoJob(input.jobId);
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: `job ${input.jobId} not found` });
      return job;
    }),

  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(8) }).optional())
    .query(async ({ input }) => {
      const jobs = await store().listVideoJobs(input?.limit ?? 8);
      // Strip heavy timelines from list responses.
      return jobs.map(({ points: _points, ...meta }) => meta);
    }),
});
