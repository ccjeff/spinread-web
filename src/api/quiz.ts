import { apiRequest } from "./client";
import type {Replay} from './replay';

export const PRACTICE_TYPES = {RALLY: "连续对练", SERVE_RECEIVE: "发接发练习", OTHER: "其他 / 停顿", UNKNOWN: "不确定"};
export type PracticeType = keyof typeof PRACTICE_TYPES;
export interface PracticeDecision {type: PracticeType; source: string; reason: string; margin: number | null; model_version: string}
export interface PracticeWindow {id: string; start_ms: number; end_ms: number; revision: number; label: PracticeType | null; decision: PracticeDecision; prediction: PracticeDecision}
export interface PracticeContextData {model: {ready: boolean; examples: Record<Exclude<PracticeType, "UNKNOWN">, number>}; windows: PracticeWindow[]}

export interface QuizItem {
  id: string; video_id: string; version: number;
  start_ms: number; contact_ms: number; pause_ms: number; end_ms: number;
  approval: "DRAFT" | "APPROVED" | "WITHDRAWN";
  stale: boolean; attempted: boolean; scorable: boolean;
  practice: PracticeWindow | null;
  provenance: {source: string; boundary_confirmed?: boolean};
}
export interface QuizCollection {
  practice: PracticeContextData;
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
export interface ReferenceAnswer {
  id:string;quiz_item_id:string;quiz_item_version:number;version:number;coach_id:string;created_at:string;
  answer:{spin:string;length:string;acceptable_receives:string[];note:string};
  evidence:{rally_id:string;contact_ms:number};diagnosis:'READING'|'EXECUTION'|'MIXED'|'UNKNOWN';
}
export interface QuizEvidence {quiz_item_id:string;item_version:number;timeline_version:number;rally_id:string|null;replay:Replay|null;reference_answers:ReferenceAnswer[]}
const replayKeys=new Map<string,string>();
export const quizApi = {
  evidence: (id:string) => apiRequest<QuizEvidence>(`/quiz-items/${id}/evidence`),
  fromReplay: async (video:string,version:number,rallies?:string[]) => {
    const signature=JSON.stringify([video,version,rallies]),key=replayKeys.get(signature)??crypto.randomUUID();replayKeys.set(signature,key);
    const result=await apiRequest<{items:QuizItem[]}>(`/videos/${video}/replay-quiz-candidates`,{method:'POST',body:{timeline_version:version,rally_ids:rallies??[]},headers:{'Idempotency-Key':key}});
    replayKeys.delete(signature);return result;
  },
  reviewPractice: (videoId: string, window: PracticeWindow, timelineVersion: number, label: PracticeType | null) => apiRequest<PracticeContextData>(`/videos/${videoId}/practice-windows/${window.id}/review`, {method: "POST", body: {timeline_version: timelineVersion, revision: window.revision, label}}),
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
