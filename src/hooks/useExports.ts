import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiFetchBlob } from "../api/client";
import { CLIP_POST_ROLL_MS, CLIP_PRE_ROLL_MS } from "../api/types";
import type { ExportManifest, TimelineItem } from "../api/types";

export type ExportStatus = "RENDERING" | "READY" | "FAILED";
export type ExportKind = "CLIP" | "HIGHLIGHT";

export interface ExportEntry {
  clipId: string;
  kind: ExportKind;
  status: ExportStatus;
  intervals: [number, number][];
  itemId: string | null;
}

function normStatus(status: string): ExportStatus {
  return status === "READY" || status === "FAILED" ? status : "RENDERING";
}

function toEntry(m: ExportManifest, itemId: string | null): ExportEntry {
  return {
    clipId: m.clip_id,
    kind: m.kind === "HIGHLIGHT" ? "HIGHLIGHT" : "CLIP",
    status: normStatus(m.status),
    intervals: m.intervals,
    itemId,
  };
}

function matchItem(m: ExportManifest, items: TimelineItem[]): string | null {
  if (m.kind !== "CLIP" || m.intervals.length === 0) return null;
  const [start, end] = m.intervals[0];
  for (const it of items) {
    if (it.type === "HIT_CANDIDATE") continue;
    // manifest 存的是原始区间（仅做 0/duration 截断），优先精确匹配
    if (it.start_ms === start && it.end_ms === end) return it.item_id;
  }
  for (const it of items) {
    if (it.type === "HIT_CANDIDATE") continue;
    // 兼容未来可能按 pre/post roll 存储的区间
    const s = Math.max(0, it.start_ms - CLIP_PRE_ROLL_MS);
    if ((s === start || it.start_ms - CLIP_PRE_ROLL_MS === start) && it.end_ms + CLIP_POST_ROLL_MS === end) {
      return it.item_id;
    }
  }
  return null;
}

export function useExports(
  videoId: string | undefined,
  items: TimelineItem[],
  onError: (message: string) => void,
) {
  const [entries, setEntries] = useState<ExportEntry[]>([]);
  const entriesRef = useRef<ExportEntry[]>([]);
  entriesRef.current = entries;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const itemsFingerprint = items.map((i) => `${i.item_id}:${i.start_ms}:${i.end_ms}`).join("|");

  useEffect(() => {
    if (!videoId) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    setEntries([]);
    api
      .listClips(videoId)
      .then((clips) => {
        if (cancelled) return;
        const fresh = clips.map((c) => toEntry(c, matchItem(c, items)));
        setEntries((prev) => {
          const localOnly = prev.filter((e) => !fresh.some((f) => f.clipId === e.clipId));
          return [...fresh, ...localOnly];
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // itemsFingerprint 与 items 内容一一对应，用它做依赖避免每次渲染重拉
  }, [videoId, itemsFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasRendering = entries.some((e) => e.status === "RENDERING");

  useEffect(() => {
    if (!hasRendering) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      const targets = entriesRef.current.filter((e) => e.status === "RENDERING");
      for (const t of targets) {
        void (async () => {
          try {
            const fresh =
              t.kind === "CLIP" ? await api.getClip(t.clipId) : await api.getHighlightReel(t.clipId);
            if (stopped) return;
            const status = normStatus(fresh.status);
            if (status !== t.status) {
              setEntries((prev) =>
                prev.map((x) => (x.clipId === t.clipId ? { ...x, status } : x)),
              );
            }
          } catch {
            // 单次轮询失败，等待下一周期
          }
        })();
      }
    }, 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [hasRendering]);

  const requestClip = useCallback(
    (item: TimelineItem) => {
      if (!videoId) return;
      void (async () => {
        try {
          const created = await api.createClip({
            video_id: videoId,
            timeline_item_id: item.item_id,
          });
          const entry = toEntry(created, item.item_id);
          setEntries((prev) => [...prev.filter((e) => e.clipId !== entry.clipId), entry]);
        } catch (err) {
          onErrorRef.current(err instanceof Error ? err.message : "导出创建失败");
        }
      })();
    },
    [videoId],
  );

  const requestHighlight = useCallback(
    (itemIds: string[]) => {
      if (!videoId || itemIds.length === 0) return;
      void (async () => {
        try {
          const created = await api.createHighlightReel(videoId, itemIds);
          const entry = toEntry(created, null);
          setEntries((prev) => [...prev.filter((e) => e.clipId !== entry.clipId), entry]);
        } catch (err) {
          onErrorRef.current(err instanceof Error ? err.message : "集锦创建失败");
        }
      })();
    },
    [videoId],
  );

  const download = useCallback((entry: ExportEntry, filename: string) => {
    void (async () => {
      try {
        const path =
          entry.kind === "CLIP"
            ? `/clips/${entry.clipId}/download`
            : `/highlight-reels/${entry.clipId}/download`;
        const blob = await apiFetchBlob(path);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } catch (err) {
        onErrorRef.current(err instanceof Error ? err.message : "下载失败");
      }
    })();
  }, []);

  const clipByItemId: Record<string, ExportEntry> = {};
  for (const e of entries) {
    if (e.kind !== "CLIP" || !e.itemId) continue;
    const existing = clipByItemId[e.itemId];
    if (!existing || (existing.status !== "READY" && e.status === "READY")) {
      clipByItemId[e.itemId] = e;
    }
  }
  const highlight = [...entries].reverse().find((e) => e.kind === "HIGHLIGHT") ?? null;

  return { clipByItemId, highlight, requestClip, requestHighlight, download };
}
