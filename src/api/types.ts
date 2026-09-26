export interface User {
  role: "USER" | "COACH" | "SUPPORT" | "ADMIN";
  id: string;
  email: string;
  display_name: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type SessionType = "TRAINING" | "MATCH";

export type TargetPlayerMode = "NEAR" | "FAR" | "LEFT" | "RIGHT";

export interface CreateUploadRequest {
  filename: string;
  byte_size: number;
  content_type: string;
  session_type: SessionType;
  target_player: { mode: TargetPlayerMode };
}

export interface UploadPartInfo {
  part_number: number;
  presigned_url: string;
}

export interface CreateUploadResponse {
  video_id: string;
  upload_id: string;
  part_size: number;
  parts: UploadPartInfo[];
  expires_at: string;
}

export interface CompletedPart {
  part_number: number;
  etag: string;
}

export interface CompleteUploadResponse {
  video_id: string;
  state: string;
}

export type VideoState =
  | "UPLOAD_PENDING"
  | "UPLOADED"
  | "PROBING"
  | "NORMALIZING"
  | "QUALITY_CHECKING"
  | "SEGMENTING"
  | "BUILDING_TIMELINE"
  | "GENERATING_REPORT"
  | "READY"
  | "PARTIAL_READY"
  | "RETRYABLE_FAILURE"
  | "PERMANENT_FAILURE";

export interface VideoSummary {
  id: string;
  state: VideoState;
  filename: string;
  session_type: SessionType;
  duration_ms: number | null;
  created_at: string;
}

export interface VideoDetail extends VideoSummary {
  owner_id: string;
  target_player: { mode: TargetPlayerMode };
  recorded_at: string | null;
  probe: Record<string, unknown> | null;
}

export type StageName =
  | "PROBE"
  | "NORMALIZE"
  | "QUALITY"
  | "ACTIVITY"
  | "RALLY"
  | "EVENTS"
  | "TIMELINE"
  | "METRICS"
  | "REPORT";

export type StageStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "PARTIAL_SUCCESS"
  | "RETRYABLE_FAILURE"
  | "PERMANENT_FAILURE"
  | "SKIPPED_UNSUPPORTED"
  | "REUSED_CACHE";

export interface StageInfo {
  stage: StageName;
  status: StageStatus;
  attempt: number;
  error_code: string | null;
}

export interface ProcessingStatus {
  state: VideoState;
  progress_pct: number;
  stages: StageInfo[];
  limitations: string[];
}

export type TimelineItemType =
  | "RALLY_LIKE"
  | "BALL_PICKUP"
  | "BREAK"
  | "INSTRUCTION"
  | "UNKNOWN"
  | "RALLY"
  | "HIT_CANDIDATE";

export interface TimelineItem {
  item_id: string;
  type: TimelineItemType;
  start_ms: number;
  end_ms: number;
  parent_id: string | null;
  actor: string | null;
  confidence: number | null;
  provenance: Record<string, unknown>;
  attributes: Record<string, unknown>;
}

export interface ActiveTimeline {
  timeline_id: string;
  version: number;
  video_duration_ms: number;
  items: TimelineItem[];
}

export type TimelineEditOperation =
  | { op: "UPDATE_BOUNDARY"; timeline_item_id: string; start_ms: number; end_ms: number }
  | { op: "SET_LABEL"; timeline_item_id: string; field: "type"; value: string }
  | { op: "SPLIT"; timeline_item_id: string; at_ms: number }
  | { op: "MERGE_NEXT"; timeline_item_id: string }
  | { op: "MERGE_RALLIES"; timeline_item_ids: string[] }
  | { op: "DELETE"; timeline_item_id: string };

export interface TimelineEditRequest {
  base_timeline_version: number;
  operations: TimelineEditOperation[];
}

export interface TimelineEditResponse {
  timeline_id: string;
  version: number;
  n_items: number;
}

export interface ReportFinding {
  id: string;
  category: string;
  observation: string;
  evidence_intervals: [number, number][];
  sample_count: number;
  priority_score: number;
  limitations: string[];
  state: string;
}

export interface AnalysisReport {
  report_id: string;
  video_id: string;
  timeline_version: number;
  state: string;
  metric_versions: Record<string, unknown>;
  structured: Record<string, unknown>;
  findings: ReportFinding[];
}

export interface ExportManifest {
  clip_id: string;
  video_id: string;
  kind: string;
  status: string;
  intervals: [number, number][];
  download_url: string | null;
}

export interface CreateClipRequest {
  video_id: string;
  timeline_item_id: string;
  pre_roll_ms?: number;
  post_roll_ms?: number;
}

export interface CreateHighlightRequest {
  video_id: string;
  timeline_item_ids: string[];
}

export const CLIP_PRE_ROLL_MS = 800;
export const CLIP_POST_ROLL_MS = 1200;

export function isProcessingState(state: VideoState): boolean {
  return (
    state === "UPLOAD_PENDING" ||
    state === "UPLOADED" ||
    state === "PROBING" ||
    state === "NORMALIZING" ||
    state === "QUALITY_CHECKING" ||
    state === "SEGMENTING" ||
    state === "BUILDING_TIMELINE" ||
    state === "GENERATING_REPORT"
  );
}

export function isReadyState(state: VideoState): boolean {
  return state === "READY" || state === "PARTIAL_READY";
}

export function isFailureState(state: VideoState): boolean {
  return state === "RETRYABLE_FAILURE" || state === "PERMANENT_FAILURE";
}
