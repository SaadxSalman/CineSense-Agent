import type { Concept, GeneratedContent, Session, VideoAnalysisJob } from '../types';

/**
 * Persistence abstraction. The same interface is implemented twice:
 *  - MemoryStore: zero-dependency in-process store (default, always available)
 *  - MongoStore: mongoose + Atlas Vector Search (used when MONGODB_URI is set)
 */
export interface Store {
  readonly kind: 'memory' | 'mongo';

  createSession(session: Session): Promise<void>;
  getSession(id: string): Promise<Session | null>;
  listSessions(limit: number): Promise<Session[]>;
  closeSession(id: string): Promise<void>;

  upsertConcepts(concepts: Array<Concept & { embedding: number[] }>): Promise<number>;
  countConcepts(): Promise<number>;
  listConcepts(limit: number): Promise<Concept[]>;
  searchConcepts(vector: number[], k: number): Promise<Array<Concept & { score: number }>>;

  saveContent(content: GeneratedContent): Promise<void>;
  getContent(id: string): Promise<GeneratedContent | null>;
  listContent(sessionId: string | undefined, limit: number): Promise<GeneratedContent[]>;

  createVideoJob(job: VideoAnalysisJob): Promise<void>;
  getVideoJob(id: string): Promise<VideoAnalysisJob | null>;
  updateVideoJob(id: string, patch: Partial<VideoAnalysisJob>): Promise<void>;
  listVideoJobs(limit: number): Promise<VideoAnalysisJob[]>;
}

