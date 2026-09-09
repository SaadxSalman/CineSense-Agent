import mongoose, { Schema, type Model } from 'mongoose';
import { CONFIG } from '../config';
import type { Concept, GeneratedContent, Session, VideoAnalysisJob } from '../types';
import { cosineSim } from '../lib/math';
import type { Store } from './store';

/**
 * MongoDB (Mongoose) store. When running against MongoDB Atlas with Vector
 * Search enabled, `searchConcepts` uses the native $vectorSearch stage
 * (cosine similarity). Against a plain MongoDB, it transparently falls back
 * to in-process cosine ranking over the concept collection.
 */

const SessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String },
    preferences: {
      genres: { type: [String], default: [] },
      intensityTarget: { type: Number, default: 0.6 },
    },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    startedAt: { type: Number, required: true },
    endedAt: { type: Number },
  },
  { versionKey: false },
);

const ConceptSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    year: { type: Number },
    genres: { type: [String], default: [] },
    mood: { type: String, default: '' },
    palette: { type: [String], default: [] },
    pacing: { type: String, enum: ['slow', 'measured', 'brisk', 'frantic'], default: 'measured' },
    tags: { type: [String], default: [] },
    styleNotes: { type: String, default: '' },
    embedding: { type: [Number], required: true },
  },
  { versionKey: false },
);

const ContentSchema = new Schema(
  {
    _id: { type: String, required: true },
    sessionId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['trailer', 'short-film', 'script'], required: true },
    title: { type: String, required: true },
    logline: { type: String, default: '' },
    scriptText: { type: String, default: '' },
    blueprint: { type: Schema.Types.Mixed, required: true },
    retrievalQuery: { type: String },
    createdAt: { type: Number, required: true },
  },
  { versionKey: false },
);

const VideoJobSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    durationSec: { type: Number, required: true },
    sizeBytes: { type: Number, default: 0 },
    status: { type: String, enum: ['analyzing', 'complete', 'failed'], default: 'analyzing' },
    progress: { type: Number, default: 0 },
    totalSamples: { type: Number, default: 1 },
    points: { type: [Schema.Types.Mixed], default: [] },
    summary: { type: Schema.Types.Mixed },
    createdAt: { type: Number, required: true },
    completedAt: { type: Number },
  },
  { versionKey: false },
);

export class MongoStore implements Store {
  readonly kind = 'mongo' as const;
  /** Vector index dimensionality — must match the active embedding provider. */
  private readonly embeddingDim: number;

  private SessionModel: Model<Record<string, unknown>>;
  private ConceptModel: Model<Record<string, unknown>>;
  private ContentModel: Model<Record<string, unknown>>;
  private VideoJobModel: Model<Record<string, unknown>>;
  private vectorSearchIndexName = 'concept_vector_index';

  /** Resolves when the connection is up (and index creation started). */
  readonly ready: Promise<void>;

  constructor(uri: string) {
    this.embeddingDim = CONFIG.embedding.dim;
    this.SessionModel =
      (mongoose.models.cinesense_sessions as Model<Record<string, unknown>>) ??
      mongoose.model('cinesense_sessions', SessionSchema);
    this.ConceptModel =
      (mongoose.models.cinesense_concepts as Model<Record<string, unknown>>) ??
      mongoose.model('cinesense_concepts', ConceptSchema);
    this.ContentModel =
      (mongoose.models.cinesense_contents as Model<Record<string, unknown>>) ??
      mongoose.model('cinesense_contents', ContentSchema);
    this.VideoJobModel =
      (mongoose.models.cinesense_videojobs as Model<Record<string, unknown>>) ??
      mongoose.model('cinesense_videojobs', VideoJobSchema);

    this.ready = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 10_000 })
      .then(() => this.ensureVectorIndex())
      .catch((err: unknown) => {
        throw new Error(`MongoDB connection failed: ${(err as Error).message}`);
      });
  }

  /** Best-effort creation of the Atlas Vector Search index (no-op on plain MongoDB). */
  private async ensureVectorIndex(): Promise<void> {
    try {
      const model = this.ConceptModel as unknown as {
        createSearchIndex?: (spec: Record<string, unknown>) => Promise<string>;
        listSearchIndexes?: () => AsyncIterable<{ name: string }>;
      };
      if (typeof model.createSearchIndex !== 'function') return;
      if (model.listSearchIndexes) {
        for await (const idx of model.listSearchIndexes()) {
          if (idx.name === this.vectorSearchIndexName) return; // already exists
        }
      }
      await model.createSearchIndex({
        name: this.vectorSearchIndexName,
        definition: {
          mappings: {
            dynamic: false,
            fields: {
              embedding: [
                { type: 'knnVector', dimensions: this.embeddingDim, similarity: 'cosine' },
              ],
            },
          },
        },
      });
    } catch {
      // Plain MongoDB (local) does not support search indexes — cosine fallback covers us.
    }
  }

  async createSession(session: Session): Promise<void> {
    await this.SessionModel.create({ ...session, _id: session.sessionId });
  }

  async getSession(id: string): Promise<Session | null> {
    const doc = (await this.SessionModel.findById(id).lean()) as unknown as
      | (Session & { _id: string })
      | null;
    return doc ? this.toSession(doc) : null;
  }

  async listSessions(limit: number): Promise<Session[]> {
    const docs = (await this.SessionModel.find()
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean()) as unknown as Array<Session & { _id: string }>;
    return docs.map((d) => this.toSession(d));
  }

  async closeSession(id: string): Promise<void> {
    await this.SessionModel.updateOne({ _id: id }, { status: 'closed', endedAt: Date.now() });
  }

  private toSession(doc: Session & { _id: string }): Session {
    return {
      sessionId: doc._id,
      userId: doc.userId,
      preferences: doc.preferences,
      status: doc.status,
      startedAt: doc.startedAt,
      endedAt: doc.endedAt,
    };
  }
  async upsertConcepts(concepts: Array<Concept & { embedding: number[] }>): Promise<number> {
    if (concepts.length === 0) return 0;
    const ops = concepts.map((c) => ({
      replaceOne: { filter: { _id: c.conceptId }, replacement: { ...c, _id: c.conceptId }, upsert: true },
    }));
    const res = await this.ConceptModel.bulkWrite(ops);
    return res.upsertedCount + res.modifiedCount;
  }

  async countConcepts(): Promise<number> {
    return this.ConceptModel.countDocuments();
  }

  async listConcepts(limit: number): Promise<Concept[]> {
    const docs = (await this.ConceptModel.find()
      .limit(limit)
      .lean()) as unknown as Array<Concept & { embedding: number[]; _id: string }>;
    return docs.map((d) => this.toConcept(d));
  }

  async searchConcepts(vector: number[], k: number): Promise<Array<Concept & { score: number }>> {
    // Try native Atlas Vector Search first.
    try {
      const pipeline = [
        {
          $vectorSearch: {
            index: this.vectorSearchIndexName,
            path: 'embedding',
            queryVector: vector,
            numCandidates: Math.max(k * 10, 100),
            limit: k,
          },
        },
        { $addFields: { score: { $meta: 'vectorSearchScore' } } },
      ];
      const docs = (await this.ConceptModel.aggregate(pipeline).exec()) as unknown as Array<
        Concept & { embedding: number[]; _id: string; score: number }
      >;
      if (docs.length > 0) {
        return docs.map((d) => ({ ...this.toConcept(d), score: d.score }));
      }
    } catch {
      // fall through to cosine fallback
    }
    // In-process cosine fallback (correct, just not index-accelerated).
    const docs = (await this.ConceptModel.find()
      .lean()) as unknown as Array<Concept & { embedding: number[]; _id: string }>;
    const scored = docs.map((d) => ({ ...d, score: cosineSim(vector, d.embedding) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map((d) => ({ ...this.toConcept(d), score: d.score }));
  }

  private toConcept(doc: Concept & { embedding: number[]; _id: string }): Concept {
    const { embedding: _e, _id, ...rest } = doc;
    return { ...rest, conceptId: _id };
  }

  async saveContent(content: GeneratedContent): Promise<void> {
    await this.ContentModel.create({ ...content, _id: content.contentId });
  }

  async getContent(id: string): Promise<GeneratedContent | null> {
    const doc = (await this.ContentModel.findById(id).lean()) as unknown as
      | (GeneratedContent & { _id: string })
      | null;
    return doc ? this.toContent(doc) : null;
  }

  async listContent(sessionId: string | undefined, limit: number): Promise<GeneratedContent[]> {
    const filter = sessionId ? { sessionId } : {};
    const docs = (await this.ContentModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()) as unknown as Array<GeneratedContent & { _id: string }>;
    return docs.map((d) => this.toContent(d));
  }

  private toContent(doc: GeneratedContent & { _id: string }): GeneratedContent {
    const { _id, ...rest } = doc;
    return { ...rest, contentId: _id };
  }

  async createVideoJob(job: VideoAnalysisJob): Promise<void> {
    await this.VideoJobModel.create({ ...job, _id: job.jobId });
  }

  async getVideoJob(id: string): Promise<VideoAnalysisJob | null> {
    const doc = (await this.VideoJobModel.findById(id).lean()) as unknown as
      | (VideoAnalysisJob & { _id: string })
      | null;
    return doc ? this.toVideoJob(doc) : null;
  }

  async updateVideoJob(id: string, patch: Partial<VideoAnalysisJob>): Promise<void> {
    await this.VideoJobModel.updateOne({ _id: id }, { $set: patch });
  }

  async listVideoJobs(limit: number): Promise<VideoAnalysisJob[]> {
    const docs = (await this.VideoJobModel.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()) as unknown as Array<VideoAnalysisJob & { _id: string }>;
    return docs.map((d) => this.toVideoJob(d));
  }

  private toVideoJob(doc: VideoAnalysisJob & { _id: string }): VideoAnalysisJob {
    const { _id, ...rest } = doc;
    return { ...rest, jobId: _id, points: rest.points ?? [], summary: rest.summary ?? undefined };
  }
}


