export interface User {
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
  target_player: { mode: TargetPlayerMode };
  recorded_at: string | null;
  probe: Record<string, unknown> | null;
}

export type StageName = "PROBE" | "NORMALIZE" | "QUALITY" | "ACTIVITY" | "TIMELINE";

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

export type TimelineItemType = "RALLY_LIKE" | "BALL_PICKUP" | "BREAK" | "INSTRUCTION" | "UNKNOWN";

export interface TimelineItem {
  item_id: string;
  type: TimelineItemType;
  start_ms: number;
  end_ms: number;
  actor: string | null;
  confidence: number;
  provenance: Record<string, unknown>;
  attributes: Record<string, unknown>;
}

export interface ActiveTimeline {
  timeline_id: string;
  version: number;
  video_duration_ms: number;
  items: TimelineItem[];
}

export function isProcessingState(state: VideoState): boolean {
  return (
    state === "UPLOAD_PENDING" ||
    state === "UPLOADED" ||
    state === "PROBING" ||
    state === "NORMALIZING" ||
    state === "QUALITY_CHECKING" ||
    state === "SEGMENTING" ||
    state === "BUILDING_TIMELINE"
  );
}

export function isReadyState(state: VideoState): boolean {
  return state === "READY" || state === "PARTIAL_READY";
}

export function isFailureState(state: VideoState): boolean {
  return state === "RETRYABLE_FAILURE" || state === "PERMANENT_FAILURE";
}
