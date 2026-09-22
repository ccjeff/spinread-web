import type {
  SessionType,
  StageName,
  TargetPlayerMode,
  TimelineItemType,
  VideoState,
} from "../api/types";

export const VIDEO_STATE_LABELS: Record<VideoState, string> = {
  UPLOAD_PENDING: "等待上传",
  UPLOADED: "已上传",
  PROBING: "解析中",
  NORMALIZING: "转码中",
  QUALITY_CHECKING: "质量检查中",
  SEGMENTING: "片段识别中",
  BUILDING_TIMELINE: "生成时间线中",
  GENERATING_REPORT: "生成报告中",
  READY: "就绪",
  PARTIAL_READY: "部分就绪",
  RETRYABLE_FAILURE: "处理失败（可重试）",
  PERMANENT_FAILURE: "处理失败",
};

export const STAGE_LABELS: Record<StageName, string> = {
  PROBE: "视频解析",
  NORMALIZE: "转码",
  QUALITY: "质量检查",
  ACTIVITY: "活动识别",
  RALLY: "回合检测",
  EVENTS: "事件提取",
  TIMELINE: "时间线生成",
  METRICS: "指标计算",
  REPORT: "报告生成",
};

export const TIMELINE_TYPE_LABELS: Record<TimelineItemType, string> = {
  RALLY_LIKE: "训练回合",
  BALL_PICKUP: "捡球",
  BREAK: "休息",
  INSTRUCTION: "讲解",
  UNKNOWN: "未知",
  RALLY: "回合",
  HIT_CANDIDATE: "击球",
};

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  TRAINING: "训练",
  MATCH: "比赛",
};

export const TARGET_PLAYER_LABELS: Record<TargetPlayerMode, string> = {
  NEAR: "近端",
  FAR: "远端",
  LEFT: "左侧",
  RIGHT: "右侧",
};

export const FINDING_CATEGORY_LABELS: Record<string, string> = {
  COVERAGE: "置信度覆盖",
  ACTIVITY_MIX: "活动构成",
  RALLY_LENGTH: "回合长度",
};
