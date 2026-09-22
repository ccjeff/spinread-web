import type { TimelineItem, TimelineItemType } from "../api/types";
import { TIMELINE_TYPE_LABELS } from "../utils/labels";
import { formatMs } from "../utils/format";

export interface PendingEdit {
  boundary?: { start_ms: number; end_ms: number };
  label?: string;
  splitAtMs?: number;
  mergeNext?: boolean;
  deleted?: boolean;
}

interface EditControlsProps {
  item: TimelineItem;
  isTopLevel: boolean;
  pending: PendingEdit | undefined;
  onNudge: (edge: "start" | "end", deltaMs: number) => void;
  onTypeChange: (value: string) => void;
  onSplit: () => void;
  onMergeNext: () => void;
  onDelete: () => void;
}

const NUDGES: { label: string; delta: number }[] = [
  { label: "−1s", delta: -1000 },
  { label: "−0.1s", delta: -100 },
  { label: "+0.1s", delta: 100 },
  { label: "+1s", delta: 1000 },
];

const TOP_LEVEL_TYPES: TimelineItemType[] = [
  "RALLY_LIKE",
  "BALL_PICKUP",
  "BREAK",
  "INSTRUCTION",
  "UNKNOWN",
];

export default function EditControls({
  item,
  isTopLevel,
  pending,
  onNudge,
  onTypeChange,
  onSplit,
  onMergeNext,
  onDelete,
}: EditControlsProps) {
  return (
    <div className="edit-controls" onClick={(e) => e.stopPropagation()}>
      <span className="edit-group">
        <span className="edit-label">起点</span>
        {NUDGES.map((n) => (
          <button
            key={`start-${n.delta}`}
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => onNudge("start", n.delta)}
          >
            {n.label}
          </button>
        ))}
      </span>
      <span className="edit-group">
        <span className="edit-label">终点</span>
        {NUDGES.map((n) => (
          <button
            key={`end-${n.delta}`}
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => onNudge("end", n.delta)}
          >
            {n.label}
          </button>
        ))}
      </span>
      {isTopLevel && (
        <>
          <span className="edit-group">
            <select
              className="edit-type-select"
              value={(pending?.label as TimelineItemType | undefined) ?? item.type}
              onChange={(e) => onTypeChange(e.target.value)}
            >
              {TOP_LEVEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TIMELINE_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </span>
          <button
            type="button"
            className={`btn btn-ghost btn-xs${pending?.splitAtMs !== undefined ? " btn-warn" : ""}`}
            onClick={onSplit}
          >
            {pending?.splitAtMs !== undefined
              ? `拆分于 ${formatMs(pending.splitAtMs)}`
              : "在此拆分"}
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-xs${pending?.mergeNext ? " btn-warn" : ""}`}
            onClick={onMergeNext}
          >
            与下一段合并
          </button>
        </>
      )}
      <button
        type="button"
        className={`btn btn-ghost btn-xs${pending?.deleted ? "" : " btn-danger"}`}
        onClick={onDelete}
      >
        {pending?.deleted ? "撤销删除" : "删除"}
      </button>
    </div>
  );
}
