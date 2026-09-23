import { apiRequest } from "./client";

export interface QuizItem {
  id: string; video_id: string; version: number;
  start_ms: number; contact_ms: number; pause_ms: number; end_ms: number;
  approval: "DRAFT" | "APPROVED" | "WITHDRAWN";
  stale: boolean; attempted: boolean; scorable: boolean;
  provenance: {source: string; boundary_confirmed?: boolean};
}
export interface QuizCollection {
  video_id: string; filename: string; duration_ms: number; timeline_version: number;
  generation: null | {id: string; status: string; error: string | null; limitations: string[]};
  items: QuizItem[];
}
export interface QuizEdit {
  timeline_version: number; base_version?: number;
  start_ms: number; contact_ms: number; pause_ms: number; end_ms: number;
  approval: QuizItem["approval"];
}
export interface QuizAnswer {spin: string; length: string; receive: string; note: string}
export interface QuizAttempt {
  id: string; quiz_item_id: string; answer: QuizAnswer; confidence: number;
  scored: boolean; feedback: string; created_at: string;
}
export const quizApi = {
  list: (id: string) => apiRequest<QuizCollection>(`/videos/${id}/quiz-items`),
  generate: (id: string) => apiRequest(`/videos/${id}/quiz-candidates`, {method: "POST"}),
  save: (videoId: string, body: QuizEdit, itemId?: string) => apiRequest<QuizItem>(itemId ? `/quiz-items/${itemId}/revisions` : `/videos/${videoId}/quiz-items`, {method: "POST", body}),
  recommended: (videoId?: string) => apiRequest<{items: QuizItem[]}>(`/quiz-sets/recommended${videoId ? `?video_id=${encodeURIComponent(videoId)}` : ""}`),
  history: (id: string) => apiRequest<QuizAttempt[]>(`/quiz-items/${id}/attempts`),
  attempt: (id: string, body: {item_version: number; answer: QuizAnswer; confidence: number; elapsed_ms: number}, key: string) => apiRequest<QuizAttempt>(`/quiz-items/${id}/attempts`, {method: "POST", body, headers: {"Idempotency-Key": key}}),
};

export const SPINS = {UNKNOWN: "不确定", TOPSPIN: "上旋", BACKSPIN: "下旋", SIDESPIN: "侧旋", SIDE_TOP: "侧上旋", SIDE_BACK: "侧下旋", NO_SPIN: "不转"};
export const LENGTHS = {UNKNOWN: "不确定", SHORT: "短球", HALF_LONG: "半出台", LONG: "长球"};
export const RECEIVES = {UNKNOWN: "不确定", PUSH: "搓球", FLICK: "挑打 / 拧拉", TOPSPIN: "拉球", BLOCK: "挡球", CHOP: "削球"};
