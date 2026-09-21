import type { VideoState } from "../api/types";
import { VIDEO_STATE_LABELS } from "../utils/labels";

type Tone = "ok" | "warn" | "err" | "run" | "idle";

const STATE_TONES: Record<VideoState, Tone> = {
  UPLOAD_PENDING: "idle",
  UPLOADED: "idle",
  PROBING: "run",
  NORMALIZING: "run",
  QUALITY_CHECKING: "run",
  SEGMENTING: "run",
  BUILDING_TIMELINE: "run",
  READY: "ok",
  PARTIAL_READY: "warn",
  RETRYABLE_FAILURE: "err",
  PERMANENT_FAILURE: "err",
};

export default function StatusBadge({ state }: { state: VideoState }) {
  const tone = (STATE_TONES as Partial<Record<string, Tone>>)[state] ?? "idle";
  const label = (VIDEO_STATE_LABELS as Partial<Record<string, string>>)[state] ?? state;
  return <span className={`badge badge-${tone}`}>{label}</span>;
}
