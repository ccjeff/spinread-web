import { useCallback, useState } from "react";
import type { TimelineItem } from "../api/types";
import { TIMELINE_TYPE_LABELS } from "../utils/labels";
import { formatMs } from "../utils/format";
import ExportButton from "./ExportButton";
import EditControls from "./EditControls";
import type { PendingEdit } from "./EditControls";
import type { ExportEntry } from "../hooks/useExports";

interface TreeGroup {
  segment: TimelineItem;
  rallies: TimelineItem[];
}

function buildGroups(items: TimelineItem[]): TreeGroup[] {
  const top: TimelineItem[] = [];
  const byParent = new Map<string, TimelineItem[]>();
  for (const item of items) {
    if (item.parent_id === null) {
      top.push(item);
    } else {
      const arr = byParent.get(item.parent_id) ?? [];
      arr.push(item);
      byParent.set(item.parent_id, arr);
    }
  }
  top.sort((a, b) => a.start_ms - b.start_ms);
  return top.map((segment) => ({
    segment,
    rallies: (byParent.get(segment.item_id) ?? [])
      .filter((i) => i.type === "RALLY")
      .sort((a, b) => a.start_ms - b.start_ms),
  }));
}

function hitsOf(item: TimelineItem): number | null {
  const hits = item.attributes["hits"];
  return typeof hits === "number" && Number.isFinite(hits) ? hits : null;
}

function confidencePct(confidence: number): number {
  const pct = confidence <= 1 ? confidence * 100 : confidence;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

interface DisplayRange {
  start_ms: number;
  end_ms: number;
  type: string;
}

function displayOf(item: TimelineItem, pending: PendingEdit | undefined): DisplayRange {
  return {
    start_ms: pending?.boundary?.start_ms ?? item.start_ms,
    end_ms: pending?.boundary?.end_ms ?? item.end_ms,
    type: pending?.label ?? item.type,
  };
}

const RALLY_PREVIEW_COUNT = 5;

interface SegmentTreeProps {
  items: TimelineItem[];
  activeItemId: string | null;
  editMode: boolean;
  pending: Record<string, PendingEdit>;
  clipByItemId: Record<string, ExportEntry>;
  selected: ReadonlySet<string>;
  highlight: ExportEntry | null;
  onPlayItem: (item: TimelineItem) => void;
  onPlayAll: () => void;
  onNudge: (item: TimelineItem, edge: "start" | "end", deltaMs: number) => void;
  onTypeChange: (item: TimelineItem, value: string) => void;
  onSplit: (item: TimelineItem) => void;
  onMergeNext: (item: TimelineItem) => void;
  onDelete: (item: TimelineItem) => void;
  onExport: (item: TimelineItem) => void;
  onDownload: (entry: ExportEntry, item: TimelineItem) => void;
  onToggleSelect: (item: TimelineItem) => void;
  onCreateHighlight: () => void;
  onDownloadHighlight: () => void;
}

export default function SegmentTree({
  items,
  activeItemId,
  editMode,
  pending,
  clipByItemId,
  selected,
  highlight,
  onPlayItem,
  onPlayAll,
  onNudge,
  onTypeChange,
  onSplit,
  onMergeNext,
  onDelete,
  onExport,
  onDownload,
  onToggleSelect,
  onCreateHighlight,
  onDownloadHighlight,
}: SegmentTreeProps) {
  const groups = buildGroups(items);
  const rallyTotal = groups.reduce((n, g) => n + g.rallies.length, 0);
  const selectedCount = selected.size;
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = useCallback((segmentId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(segmentId)) {
        next.delete(segmentId);
      } else {
        next.add(segmentId);
      }
      return next;
    });
  }, []);

  return (
    <section className="segments">
      <div className="segments-header">
        <h3>
          训练片段（{groups.length} 段 · {rallyTotal} 回合）
        </h3>
        <div className="segments-actions">
          <button type="button" className="btn btn-ghost" onClick={onPlayAll}>
            全部播放
          </button>
          {highlight && highlight.status === "READY" ? (
            <button type="button" className="btn btn-primary" onClick={onDownloadHighlight}>
              下载集锦
            </button>
          ) : highlight && highlight.status === "RENDERING" ? (
            <button type="button" className="btn btn-ghost" disabled>
              集锦渲染中…
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={selectedCount === 0}
              onClick={onCreateHighlight}
            >
              生成集锦{selectedCount > 0 ? `（${selectedCount}）` : ""}
            </button>
          )}
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="muted">暂无可播放的片段</p>
      ) : (
        <div className="segment-tree">
          {groups.map((group) => {
            const seg = group.segment;
            const segPending = pending[seg.item_id];
            const d = displayOf(seg, segPending);
            const duration = Math.max(0, d.end_ms - d.start_ms);
            const typeLabel =
              (TIMELINE_TYPE_LABELS as Partial<Record<string, string>>)[d.type] ?? d.type;
            return (
              <div key={seg.item_id} className="segment-group">
                <div className="segment-unit">
                  <div
                    className={`segment-row segment-row-top${
                      seg.item_id === activeItemId ? " segment-row-active" : ""
                    }${segPending?.deleted ? " segment-deleted" : ""}`}
                    onClick={() => onPlayItem(seg)}
                  >
                    <span className={`segment-type segment-type-${seg.type}`}>{typeLabel}</span>
                    <span className="segment-time">
                      {formatMs(d.start_ms)}–{formatMs(d.end_ms)}
                    </span>
                    <span className="segment-duration">{formatMs(duration)}</span>
                    <span className="segment-confidence">{confidencePct(seg.confidence)}%</span>
                    <span className="segment-export">
                      <ExportButton
                        entry={clipByItemId[seg.item_id] ?? null}
                        onExport={() => onExport(seg)}
                        onDownload={(entry) => onDownload(entry, seg)}
                      />
                    </span>
                  </div>
                  {editMode && (
                    <EditControls
                      item={seg}
                      isTopLevel
                      pending={segPending}
                      onNudge={(edge, delta) => onNudge(seg, edge, delta)}
                      onTypeChange={(value) => onTypeChange(seg, value)}
                      onSplit={() => onSplit(seg)}
                      onMergeNext={() => onMergeNext(seg)}
                      onDelete={() => onDelete(seg)}
                    />
                  )}
                </div>
                {(() => {
                  const expanded = expandedGroups.has(seg.item_id);
                  const shownRallies = expanded
                    ? group.rallies
                    : group.rallies.slice(0, RALLY_PREVIEW_COUNT);
                  const hiddenRallies = group.rallies.length - shownRallies.length;
                  return (
                    <>
                      {shownRallies.map((rally, idx) => {
                        const rPending = pending[rally.item_id];
                        const rd = displayOf(rally, rPending);
                        const rDuration = Math.max(0, rd.end_ms - rd.start_ms);
                        const hits = hitsOf(rally);
                        return (
                          <div key={rally.item_id} className="segment-unit segment-unit-rally">
                            <div
                              className={`segment-row segment-row-rally${
                                rally.item_id === activeItemId ? " segment-row-active" : ""
                              }${rPending?.deleted ? " segment-deleted" : ""}`}
                              onClick={() => onPlayItem(rally)}
                            >
                              <input
                                type="checkbox"
                                className="rally-check"
                                checked={selected.has(rally.item_id)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => onToggleSelect(rally)}
                              />
                              <span className="rally-label">回合 {idx + 1}</span>
                              <span className="segment-time">
                                {formatMs(rd.start_ms)}–{formatMs(rd.end_ms)}
                              </span>
                              <span className="segment-duration">{formatMs(rDuration)}</span>
                              <span className="segment-hits">
                                {hits !== null ? `${hits} 球` : "—"}
                              </span>
                              <span className="segment-confidence">{confidencePct(rally.confidence)}%</span>
                              <span className="segment-export">
                                <ExportButton
                                  entry={clipByItemId[rally.item_id] ?? null}
                                  onExport={() => onExport(rally)}
                                  onDownload={(entry) => onDownload(entry, rally)}
                                />
                              </span>
                            </div>
                            {editMode && (
                              <EditControls
                                item={rally}
                                isTopLevel={false}
                                pending={rPending}
                                onNudge={(edge, delta) => onNudge(rally, edge, delta)}
                                onTypeChange={() => undefined}
                                onSplit={() => undefined}
                                onMergeNext={() => undefined}
                                onDelete={() => onDelete(rally)}
                              />
                            )}
                          </div>
                        );
                      })}
                      {group.rallies.length > RALLY_PREVIEW_COUNT && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm rally-more"
                          onClick={() => toggleGroup(seg.item_id)}
                        >
                          {expanded ? "折叠回合" : `展开剩余 ${hiddenRallies} 个回合`}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
