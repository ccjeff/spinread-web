import type { TimelineItem } from "../api/types";
import { TIMELINE_TYPE_LABELS } from "../utils/labels";
import { formatMs } from "../utils/format";

interface SegmentListProps {
  items: TimelineItem[];
  activeItemId: string | null;
  onPlayItem: (item: TimelineItem) => void;
  onPlayAll: () => void;
}

function confidencePct(confidence: number): number {
  const pct = confidence <= 1 ? confidence * 100 : confidence;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export default function SegmentList({ items, activeItemId, onPlayItem, onPlayAll }: SegmentListProps) {
  return (
    <section className="segments">
      <div className="segments-header">
        <h3>训练片段（{items.length}）</h3>
        <button type="button" className="btn btn-ghost" onClick={onPlayAll}>
          全部播放
        </button>
      </div>
      {items.length === 0 ? (
        <p className="muted">暂无可播放的片段</p>
      ) : (
        <ul className="segment-list">
          {items.map((item) => {
            const duration = Math.max(0, item.end_ms - item.start_ms);
            const active = item.item_id === activeItemId;
            const typeLabel =
              (TIMELINE_TYPE_LABELS as Partial<Record<string, string>>)[item.type] ?? item.type;
            return (
              <li key={item.item_id}>
                <button
                  type="button"
                  className={`segment-row${active ? " segment-row-active" : ""}`}
                  onClick={() => onPlayItem(item)}
                >
                  <span className={`segment-type segment-type-${item.type}`}>{typeLabel}</span>
                  <span className="segment-time">
                    {formatMs(item.start_ms)}–{formatMs(item.end_ms)}
                  </span>
                  <span className="segment-duration">{formatMs(duration)}</span>
                  <span className="segment-confidence">{confidencePct(item.confidence)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
