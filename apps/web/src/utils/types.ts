/**
 * Shared domain types re-exported (type-only) from the orchestrator source so
 * the web app and the server can never drift apart.
 */
export type {
  SignalSample,
  EmotionFrame,
  EmotionState,
  EmotionLabel,
  Concept,
  Scene,
  Screenplay,
  TrailerBlueprint,
  Session,
  SessionPrefs,
  GeneratedContent,
  VideoSample,
  VideoEmotionPoint,
  VideoPeak,
  VideoSummary,
  VideoAnalysisJob,
} from '../../../../apps/server/src/types';
