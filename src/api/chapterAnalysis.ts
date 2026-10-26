import {apiRequest} from './client';

export type AnalysisStatus = 'QUEUED' | 'PREPARING' | 'OVERVIEW' | 'DETAIL' | 'FINALIZING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export const analysisPending = (status: AnalysisStatus) => !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(status);
export interface PracticePlan {
  goal: string; observation_indices: number[]; evidence_ids: string[]; drill: string;
  steps: string[]; dosage: string; cue: string; success_criteria: string; retest: string;
}
export interface ComparisonCandidate {
  video_id: string; annotation_id: string; annotation_version: number; title: string;
  filename: string; start_ms: number; end_ms: number; target: 'NEAR' | 'FAR'; recorded_at: string | null;
}
export interface ChapterAnalysis {
  id: string; video_id: string; chapter_id: string; start_ms: number; end_ms: number;
  status: AnalysisStatus; stale: boolean; created_at: string; updated_at: string;
  snapshot: {title: string; target: 'NEAR' | 'FAR'; focus: string};
  result: {summary: string; assessability: 'ASSESSABLE' | 'PARTIAL' | 'NOT_ASSESSABLE'; review_status: 'AI_DRAFT'; observations: {
    dimension: string; kind: 'STRENGTH' | 'IMPROVEMENT' | 'NEUTRAL'; observation: string; evidence_ids: string[]; suggestion: string;
  }[]; practice_plan?: PracticePlan[]; comparison?: {
    comparability: 'COMPARABLE' | 'LIMITED' | 'NOT_COMPARABLE'; summary: string; limitations: string[];
    changes: {dimension: string; change: 'IMPROVED' | 'UNCHANGED' | 'NEEDS_WORK' | 'UNCERTAIN'; observation: string;
      current_evidence_ids: string[]; previous_evidence_ids: string[]}[];
  } | null} | null;
  comparison_source: {video_id: string; title: string; filename: string; target: 'NEAR' | 'FAR'; start_ms: number; end_ms: number} | null;
  manifest: {id: string; timestamp_ms: number; video_id?: string; role?: 'CURRENT' | 'PREVIOUS'}[];
  error: {message: string} | null;
}
export interface AnalysisRequest {
  chapter_id: string; title: string; start_ms: number; end_ms: number;
  timeline_version: number; annotation_version: number; annotation_id: string | null;
  target: 'NEAR' | 'FAR'; focus: string; force: boolean;
  comparison: {video_id: string; annotation_id: string; annotation_version: number; same_player: true} | null;
}
export const chapterAnalysisApi = {
  list: (videoId: string) => apiRequest<{items: ChapterAnalysis[]}>(`/videos/${videoId}/chapter-analyses`),
  candidates: (videoId: string, annotationId: string, target: string) => apiRequest<{items: ComparisonCandidate[]; reason: string}>(
    `/videos/${videoId}/chapter-comparison-candidates?${new URLSearchParams({annotation_id: annotationId, target})}`),
  create: (videoId: string, body: AnalysisRequest, requestId: string) => apiRequest<ChapterAnalysis>(`/videos/${videoId}/chapter-analyses`, {
    method: 'POST', body, headers: {'Idempotency-Key': requestId},
  }),
  cancel: (videoId: string, id: string) => apiRequest<ChapterAnalysis>(`/videos/${videoId}/chapter-analyses/${id}/cancel`, {method: 'POST'}),
};
