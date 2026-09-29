import {apiRequest} from './client';

export type AnalysisStatus = 'QUEUED' | 'PREPARING' | 'OVERVIEW' | 'DETAIL' | 'FINALIZING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export const analysisPending = (status: AnalysisStatus) => !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(status);
export interface ChapterAnalysis {
  id: string; video_id: string; chapter_id: string; start_ms: number; end_ms: number;
  status: AnalysisStatus; stale: boolean; created_at: string; updated_at: string;
  snapshot: {title: string; target: 'NEAR' | 'FAR'; focus: string; model: string; strategy_version: string; timeline_version: number; annotation_version: number};
  result: {summary: string; assessability: 'ASSESSABLE' | 'PARTIAL' | 'NOT_ASSESSABLE'; review_status: 'AI_DRAFT'; observations: {
    dimension: string; kind: 'STRENGTH' | 'IMPROVEMENT' | 'NEUTRAL'; observation: string; evidence_ids: string[]; suggestion: string;
  }[]; limitations: string[]} | null;
  manifest: {id: string; timestamp_ms: number; window_id: string}[];
  coverage: {start_ms: number; end_ms: number; fps: number; kind: string}[];
  usage: {input_tokens: number; output_tokens: number; cost_micro_usd: number}[];
  error: {code: string; message: string} | null;
  budget_micro_usd: number;
}
export interface AnalysisRequest {
  chapter_id: string; title: string; start_ms: number; end_ms: number;
  timeline_version: number; annotation_version: number; annotation_id: string | null;
  target: 'NEAR' | 'FAR'; focus: string; budget_micro_usd: number; consent: true; force: boolean;
}
export const chapterAnalysisApi = {
  list: (videoId: string) => apiRequest<{items: ChapterAnalysis[]}>(`/videos/${videoId}/chapter-analyses`),
  create: (videoId: string, body: AnalysisRequest, key: string, requestId: string) => apiRequest<ChapterAnalysis>(`/videos/${videoId}/chapter-analyses`, {
    method: 'POST', body, headers: {'X-OpenAI-Key': key, 'Idempotency-Key': requestId},
  }),
  cancel: (videoId: string, id: string) => apiRequest<ChapterAnalysis>(`/videos/${videoId}/chapter-analyses/${id}/cancel`, {method: 'POST'}),
};
