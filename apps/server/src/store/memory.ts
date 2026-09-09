import type { Concept, GeneratedContent, Session, VideoAnalysisJob } from '../types';
import { cosineSim } from '../lib/math';
import type { Store } from './store';

/**
 * In-process store — the zero-configuration default. Fully functional for a
 * single-node deployment; swap to MongoStore by setting MONGODB_URI.
 */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;

  private sessions = new Map<string, Session>();
  private concepts = new Map<string, Concept & { embedding: number[] }>();
  private contents = new Map<string, GeneratedContent>();
  private videoJobs = new Map<string, VideoAnalysisJob>();

  async createSession(session: Session): Promise<void> {
    this.sessions.set(session.sessionId, { ...session });
  }

  async getSession(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null;
  }

  async listSessions(limit: number): Promise<Session[]> {
    return [...this.sessions.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  async closeSession(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (s) s.status = 'closed';
  }

  async upsertConcepts(concepts: Array<Concept & { embedding: number[] }>): Promise<number> {
    for (const c of concepts) this.concepts.set(c.conceptId, { ...c });
    return concepts.length;
  }

  async countConcepts(): Promise<number> {
    return this.concepts.size;
  }

  async listConcepts(limit: number): Promise<Concept[]> {
    return [...this.concepts.values()].slice(0, limit).map(({ embedding: _e, ...rest }) => rest);
  }

  async searchConcepts(vector: number[], k: number): Promise<Array<Concept & { score: number }>> {
    const scored = [...this.concepts.values()].map((c) => ({
      ...c,
      score: cosineSim(vector, c.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map(({ embedding: _e, ...rest }) => rest);
  }

  async saveContent(content: GeneratedContent): Promise<void> {
    this.contents.set(content.contentId, { ...content });
  }

  async getContent(id: string): Promise<GeneratedContent | null> {
    return this.contents.get(id) ?? null;
  }

  async listContent(sessionId: string | undefined, limit: number): Promise<GeneratedContent[]> {
    const all = [...this.contents.values()]
      .filter((c) => sessionId === undefined || c.sessionId === sessionId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    return all.map((c) => ({ ...c }));
  }

  async createVideoJob(job: VideoAnalysisJob): Promise<void> {
    this.videoJobs.set(job.jobId, structuredClone(job));
  }

  async getVideoJob(id: string): Promise<VideoAnalysisJob | null> {
    const job = this.videoJobs.get(id);
    return job ? structuredClone(job) : null;
  }

  async updateVideoJob(id: string, patch: Partial<VideoAnalysisJob>): Promise<void> {
    const job = this.videoJobs.get(id);
    if (job) Object.assign(job, structuredClone(patch));
  }

  async listVideoJobs(limit: number): Promise<VideoAnalysisJob[]> {
    return [...this.videoJobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((j) => structuredClone(j));
  }
}
