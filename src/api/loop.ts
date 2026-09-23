import { apiRequest } from "./client";
import type { User } from "./types";

const pending = new Map<string, string>();
async function mutation<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const signature = JSON.stringify([path, method, body]);
  const key = pending.get(signature) ?? crypto.randomUUID();
  pending.set(signature, key);
  const result = await apiRequest<T>(path, {method, body, headers: {"Idempotency-Key": key}});
  pending.delete(signature);
  return result;
}
export interface Context {practice_context: string; target_identity: string; camera_setup: string; opponent_or_feeder: string}
export interface ContextData {version: number; context: Partial<Context>}
export interface Drill {description: string; target_repetitions: number; sessions: number}
export interface Criteria {context: string; metric: string; minimum_samples: number; direction: "increase" | "decrease"; relative_threshold: number}
export interface PlanItem {id: string; plan_id: string; source_report_id: string; video_id: string; version: number; priority: number; title: string; finding_ids: string[]; drill: Drill; retest: Criteria; source: string; locked_by_coach: boolean; status: string; player_note: string; baseline_stale: boolean; history: {version: number; title: string; source: string; changed_at: string}[]}
export interface Plan {id: string; user_id: string; state: string; items: PlanItem[]}
export interface Retest {id: string; video_id: string; plan_item_version: number; created_at: string; result: {comparable: boolean; reasons: string[]; relative_change: number | null; delta: number | null; success: boolean | null; metric: string; baseline: {value: number | null}; retest: {value: number | null}; limitations: string[]}}
export interface CoachGrant {id: string; player_id: string; player_name: string; coach_id: string; coach_name: string; coach_email: string; status: string; version: number}
export interface Consent {id: string; video_id: string; granted_to: string; purpose: string; state: string; version: number}
export interface Review {id: string; video_id: string; filename: string; player_id: string; player_name: string; coach_id: string; coach_name: string; status: string; version: number; timeline_version: number; question: string; stale: boolean; created_at: string}
export interface ReviewDetail extends Review {feedback: {id: string; body: string; start_ms: number | null; end_ms: number | null; provenance: {source: string; source_id: string}; created_at: string}[]; practice_notes: {start_ms: number; answer: {note: string; spin: string; length: string; receive: string}; confidence: number; created_at: string}[]}
export interface CoachDashboard {
  summary: {players: number; pending_reviews: number; active_tasks: number; retests: number};
  reviews: Review[];
  players: {id: string; name: string; pending_reviews: number; progress: Record<string, number>;
    videos: {id: string; filename: string; state: string; created_at: string}[];
    tasks: {id: string; title: string; status: string; player_note: string; updated_at: string; video_id: string}[];
    retests: {id: string; task_id: string; created_at: string; comparable: boolean; success: boolean | null}[];
  }[];
}
export const loopApi = {
  dashboard: (coachId: string) => apiRequest<CoachDashboard>(`/coaches/${coachId}/dashboard`),
  me: () => apiRequest<User>("/auth/me"),
  context: (id: string) => apiRequest<ContextData>(`/videos/${id}/context`),
  saveContext: (id: string, version: number, context: Context) => mutation<ContextData>(`/videos/${id}/context`, {base_version: version, ...context}, "PATCH"),
  plan: (id: string) => apiRequest<{plan: Plan | null}>(`/users/${id}/training-plans/active`),
  generate: (reportId: string) => mutation<{plan: Plan; added: number}>("/training-plans/generate", {report_id: reportId}),
  createItem: (body: {report_id: string; title: string; priority: number; drill: Drill; retest: Criteria}) => mutation<PlanItem>("/training-plans/items", body),
  editItem: (item: PlanItem, changes: Record<string, unknown>) => mutation<PlanItem>(`/training-plans/${item.plan_id}/items/${item.id}`, {base_version: item.version, ...changes}, "PATCH"),
  retests: (item: PlanItem) => apiRequest<{items: Retest[]}>(`/training-plans/${item.plan_id}/items/${item.id}/retests`),
  retest: (item: PlanItem, videoId: string) => mutation<Retest>(`/training-plans/${item.plan_id}/items/${item.id}/retests`, {base_version: item.version, video_id: videoId}),
  grants: () => apiRequest<{items: CoachGrant[]}>("/coach-grants"),
  grant: (email: string) => mutation<CoachGrant>("/coach-grants", {coach_email: email}),
  revokeGrant: (g: CoachGrant) => mutation<CoachGrant>(`/coach-grants/${g.id}/revoke`, {base_version: g.version}),
  consents: (videoId: string) => apiRequest<{items: Consent[]}>(`/videos/${videoId}/consents`),
  consent: (videoId: string, coachId: string) => mutation<Consent>(`/videos/${videoId}/consents`, {purpose: "COACH_VIEW", granted_to: coachId}),
  revokeConsent: (c: Consent) => mutation<Consent>(`/consents/${c.id}/revoke`, {base_version: c.version}),
  reviews: () => apiRequest<{items: Review[]}>("/review-requests"),
  queue: (coachId: string) => apiRequest<{items: Review[]}>(`/coaches/${coachId}/review-queue`),
  requestReview: (videoId: string, coachId: string, question: string) => mutation<Review>("/review-requests", {video_id: videoId, coach_id: coachId, question}),
  review: (id: string) => apiRequest<ReviewDetail>(`/review-requests/${id}`),
  feedback: (r: Review, body: string, complete: boolean, interval?: {start_ms: number; end_ms: number}) => mutation<ReviewDetail>(`/review-requests/${r.id}/feedback`, {base_version: r.version, body, complete, ...interval}),
  cancelReview: (r: Review) => mutation<Review>(`/review-requests/${r.id}/cancel`, {base_version: r.version}),
};
export const METRICS = {active_fraction: "有效训练时间占比", "rally_duration_ms.mean": "平均回合时长", "rally_duration_ms.max": "最长回合时长", "hits_per_rally.mean": "每回合击球数"};
export const SOURCES: Record<string, string> = {SYSTEM: "系统建议 · 待讨论", USER: "球员制定", COACH: "教练制定"};
export const REVIEW_STATUS: Record<string, string> = {OPEN: "待教练评审", CLAIMED: "评审中", DONE: "已完成", CANCELLED: "已取消"};
export function comparisonReason(reason: string) {
  const fields: Record<string, string> = {PRACTICE_CONTEXT: "训练场景", TARGET_IDENTITY: "目标球员", CAMERA_SETUP: "录制机位", OPPONENT_OR_FEEDER: "对手 / 喂球方式"};
  for (const [key, value] of Object.entries(fields)) {
    if (reason === `MISSING_${key}`) return `请补充两段视频的${value}`;
    if (reason === `${key}_MISMATCH`) return `${value}不一致`;
  }
  return ({SAME_VIDEO: "请选择另一次训练的视频", VIDEO_DELETED: "视频已删除", BASELINE_REPORT_STALE: "基线报告已更新，需要重新建立任务基线", RETEST_REPORT_STALE: "复测报告正在更新", SESSION_TYPE_MISMATCH: "训练与比赛不能直接比较", METRIC_VERSION_MISMATCH: "指标版本不一致", PLAN_CONTEXT_MISMATCH: "任务要求与基线训练场景不一致", CAPABILITY_UNSUPPORTED: "当前检测能力不支持可靠比较此指标", QUALITY_VERSION_MISMATCH: "质量检测版本不一致或缺失", INSUFFICIENT_SAMPLES: "样本数不足", METRIC_UNAVAILABLE: "指标不可用", ZERO_BASELINE: "基线为零，不能计算相对变化"} as Record<string, string>)[reason] ?? reason;
}
