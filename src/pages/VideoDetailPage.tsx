import TrainingAnnotationEditor from "../components/TrainingAnnotationEditor";
import type {AnnotationDraft} from "../components/TrainingAnnotationEditor";
import {useTrainingAnnotations} from "../hooks/useTrainingAnnotations";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { isFailureState, isProcessingState, isReadyState } from "../api/types";
import type {
  ActiveTimeline,
  AnalysisReport,
  ProcessingStatus,
  StageStatus,
  TimelineEditOperation,
  TimelineItem,
  VideoDetail,
} from "../api/types";
import TopBar from "../components/TopBar";
import StatusBadge from "../components/StatusBadge";
import ProgressBar from "../components/ProgressBar";
import Player from "../components/Player";
import type { PlayerHandle } from "../components/Player";
import EventPanel from "../components/EventPanel";
import SessionTimeline from "../components/SessionTimeline";
import { buildTrainingNavigation } from "../utils/trainingTimeline";
import type { TrainingChapter } from "../utils/trainingTimeline";
import type { PendingEdit } from "../components/EditControls";
import ReportPanel from "../components/ReportPanel";
import { useExports } from "../hooks/useExports";
import type { ExportEntry } from "../hooks/useExports";
import { formatDateTime, formatMs } from "../utils/format";
import {
  SESSION_TYPE_LABELS,
  STAGE_LABELS,
  TARGET_PLAYER_LABELS,
  VIDEO_STATE_LABELS,
} from "../utils/labels";

const PRE_ROLL_MS = 800;
const POST_ROLL_MS = 1200;

function stageIcon(status: StageStatus): { icon: string; className: string } {
  switch (status) {
    case "SUCCEEDED":
    case "PARTIAL_SUCCESS":
    case "REUSED_CACHE":
      return { icon: "✓", className: "stage-ok" };
    case "RUNNING":
      return { icon: "↻", className: "stage-run" };
    case "RETRYABLE_FAILURE":
    case "PERMANENT_FAILURE":
      return { icon: "✗", className: "stage-err" };
    case "SKIPPED_UNSUPPORTED":
      return { icon: "–", className: "stage-skip" };
    default:
      return { icon: "○", className: "stage-wait" };
  }
}

function buildOps(items: TimelineItem[], pending: Record<string, PendingEdit>): TimelineEditOperation[] {
  const byId = new Map(items.map((i) => [i.item_id, i]));
  const deletedTop = new Set<string>();
  for (const [itemId, p] of Object.entries(pending)) {
    const item = byId.get(itemId);
    if (p.deleted && item && item.parent_id === null) deletedTop.add(itemId);
  }
  const ops: TimelineEditOperation[] = [];
  for (const [itemId, p] of Object.entries(pending)) {
    const item = byId.get(itemId);
    if (!item) continue;
    if (item.parent_id !== null && deletedTop.has(item.parent_id)) continue;
    if (p.deleted) {
      ops.push({ op: "DELETE", timeline_item_id: itemId });
      continue;
    }
    if (p.boundary && (p.boundary.start_ms !== item.start_ms || p.boundary.end_ms !== item.end_ms)) {
      ops.push({
        op: "UPDATE_BOUNDARY",
        timeline_item_id: itemId,
        start_ms: p.boundary.start_ms,
        end_ms: p.boundary.end_ms,
      });
    }
    if (p.label && p.label !== item.type) {
      ops.push({ op: "SET_LABEL", timeline_item_id: itemId, field: "type", value: p.label });
    }
    if (p.splitAtMs !== undefined) {
      ops.push({ op: "SPLIT", timeline_item_id: itemId, at_ms: p.splitAtMs });
    }
    if (p.mergeNext) {
      ops.push({ op: "MERGE_NEXT", timeline_item_id: itemId });
    }
  }
  return ops;
}

function baseName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function msToName(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s`;
}

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [timeline, setTimeline] = useState<ActiveTimeline | null>(null);
  const [timelineUnavailable, setTimelineUnavailable] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [reportUnavailable, setReportUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [chapterId, setChapterId] = useState("all");
  const [navigationRequest, setNavigationRequest] = useState(0);
  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraft | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [pending, setPending] = useState<Record<string, PendingEdit>>({});
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const rangeEndRef = useRef<number | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const toastTimer = useRef<number | null>(null);

  const ready = video !== null && isReadyState(video.state);
  const annotations = useTrainingAnnotations(ready ? id : undefined);
  const navigation = useMemo(() => buildTrainingNavigation(timeline?.items ?? [], annotations.document?.segments ?? []), [timeline, annotations.document]);
  const failure = video !== null && isFailureState(video.state);
  const processing = video !== null && isProcessingState(video.state);

  const showToast = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const { clipByItemId, highlight, requestClip, requestHighlight, download } = useExports(
    ready ? id : undefined,
    timeline?.items ?? [],
    useCallback((msg: string) => showToast("err", msg), [showToast]),
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setVideo(null);
    setStatus(null);
    setTimeline(null);
    setTimelineUnavailable(false);
    setReport(null);
    setReportUnavailable(false);
    setLoadError(null);
    setActiveItemId(null);
    setCurrentMs(0);
    setAnnotationDraft(null);
    setChapterId("all");
    setEditMode(false);
    setPending({});
    setSelected(new Set());
    api
      .getVideo(id)
      .then((v) => {
        if (!cancelled) setVideo(v);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "加载视频信息失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !processing) return;
    let stopped = false;

    async function tick() {
      try {
        const s = await api.getProcessingStatus(id as string);
        if (stopped) return;
        setStatus(s);
        if (!isProcessingState(s.state)) {
          const v = await api.getVideo(id as string);
          if (stopped) return;
          setVideo(v);
          stopped = true;
        }
      } catch {
        // 轮询失败则等待下一周期重试
      }
    }

    void tick();
    const timer = window.setInterval(() => {
      if (!stopped) void tick();
    }, 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [id, processing]);

  useEffect(() => {
    if (!id || !video) return;
    if (!isReadyState(video.state) && !isFailureState(video.state)) return;
    if (status) return;
    let cancelled = false;
    api
      .getProcessingStatus(id)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, video, status]);

  const timelineVersion = timeline?.version ?? 0;

  useEffect(() => {
    if (!id || !ready) return;
    let cancelled = false;
    api
      .getActiveTimeline(id)
      .then((tl) => {
        if (!cancelled) {
          setTimeline(tl);
          setTimelineUnavailable(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status !== 404) {
          setLoadError(err.message);
        }
        setTimelineUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, ready, timelineVersion]);

  useEffect(() => {
    if (!id || !ready) return;
    let cancelled = false;
    api
      .getActiveReport(id)
      .then((r) => {
        if (!cancelled) {
          setReport(r);
          setReportUnavailable(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReport(null);
          setReportUnavailable(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, ready, timelineVersion]);

  const reportStale =
    ready &&
    timeline !== null &&
    (reportUnavailable || (report !== null && report.timeline_version < timeline.version));

  useEffect(() => {
    if (!id || !reportStale) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      api
        .getActiveReport(id)
        .then((r) => {
          if (stopped) return;
          setReport(r);
          setReportUnavailable(false);
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [id, reportStale]);

  const ops = useMemo(
    () => buildOps(timeline?.items ?? [], pending),
    [timeline, pending],
  );

  useEffect(() => {
    if (ops.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [ops.length]);

  const playSegment = useCallback((item: TimelineItem) => {
    const startSec = Math.max(0, item.start_ms - PRE_ROLL_MS) / 1000;
    rangeEndRef.current = (item.end_ms + POST_ROLL_MS) / 1000;
    setActiveItemId(item.item_id);
    setCurrentMs(startSec * 1000);
    playerRef.current?.seekTo(startSec);
    playerRef.current?.play();
  }, []);

  const playAll = useCallback(() => {
    rangeEndRef.current = null;
    setActiveItemId(null);
    playerRef.current?.play();
  }, []);

  const handleTimeUpdate = useCallback((seconds: number) => {
    setCurrentMs(Math.round(seconds * 1000));
    if (rangeEndRef.current !== null && seconds >= rangeEndRef.current) {
      rangeEndRef.current = null;
      setActiveItemId(null);
      playerRef.current?.pause();
    }
  }, []);

  const handleSeek = useCallback((seconds: number) => {
    setCurrentMs(Math.round(seconds * 1000));
    rangeEndRef.current = null;
    setActiveItemId(null);
    playerRef.current?.seekTo(seconds);
  }, []);

  const selectChapter = useCallback((chapter: TrainingChapter) => {
    setChapterId(chapter.id);
    setNavigationRequest(value => value + 1);
    if (chapter.entries.length && !chapter.annotation) playSegment(chapter.entries[0].item);
    else {
      handleSeek(chapter.start_ms / 1000);
      rangeEndRef.current = chapter.end_ms / 1000;
      playerRef.current?.play();
    }
  }, [playSegment, handleSeek]);

  const refreshTimeline = useCallback(async () => {
    if (!id) return;
    try {
      const tl = await api.getActiveTimeline(id);
      setTimeline(tl);
      setChapterId("all");
      setActiveItemId(null);
      rangeEndRef.current = null;
      setTimelineUnavailable(false);
    } catch {
      setTimelineUnavailable(true);
    }
  }, [id]);

  const onNudge = useCallback((item: TimelineItem, edge: "start" | "end", deltaMs: number) => {
    setPending((prev) => {
      const cur: PendingEdit = { ...(prev[item.item_id] ?? {}) };
      const base = cur.boundary ?? { start_ms: item.start_ms, end_ms: item.end_ms };
      const next = { ...base };
      if (edge === "start") {
        next.start_ms = Math.max(0, base.start_ms + deltaMs);
      } else {
        next.end_ms = base.end_ms + deltaMs;
      }
      if (next.end_ms <= next.start_ms) return prev;
      if (next.start_ms === item.start_ms && next.end_ms === item.end_ms) {
        delete cur.boundary;
      } else {
        cur.boundary = next;
      }
      return { ...prev, [item.item_id]: cur };
    });
  }, []);

  const onTypeChange = useCallback((item: TimelineItem, value: string) => {
    setPending((prev) => {
      const cur: PendingEdit = { ...(prev[item.item_id] ?? {}) };
      if (value === item.type) {
        delete cur.label;
      } else {
        cur.label = value;
      }
      return { ...prev, [item.item_id]: cur };
    });
  }, []);

  const onSplit = useCallback(
    (item: TimelineItem) => {
      const t = playerRef.current?.currentTime();
      if (t === undefined || t === null || t <= 0) {
        showToast("err", "请先播放或拖动播放器到拆分位置");
        return;
      }
      const atMs = Math.round(t * 1000);
      const p = pendingRef.current[item.item_id];
      const start = p?.boundary?.start_ms ?? item.start_ms;
      const end = p?.boundary?.end_ms ?? item.end_ms;
      if (atMs <= start || atMs >= end) {
        showToast("err", `播放头不在该片段内（${formatMs(start)}–${formatMs(end)}）`);
        return;
      }
      setPending((prev) => ({
        ...prev,
        [item.item_id]: { ...prev[item.item_id], splitAtMs: atMs },
      }));
    },
    [showToast],
  );

  const onMergeNext = useCallback((item: TimelineItem) => {
    setPending((prev) => {
      const cur: PendingEdit = { ...(prev[item.item_id] ?? {}) };
      cur.mergeNext = !cur.mergeNext;
      if (!cur.mergeNext) delete cur.mergeNext;
      return { ...prev, [item.item_id]: cur };
    });
  }, []);

  const onDelete = useCallback((item: TimelineItem) => {
    setPending((prev) => {
      const cur: PendingEdit = { ...(prev[item.item_id] ?? {}) };
      if (cur.deleted) {
        delete cur.deleted;
      } else {
        cur.deleted = true;
      }
      return { ...prev, [item.item_id]: cur };
    });
  }, []);

  const toggleEditMode = useCallback(() => {
    if (editMode && ops.length > 0) {
      if (!window.confirm(`有 ${ops.length} 项未保存的修改，退出编辑将丢弃，继续？`)) return;
      setPending({});
    }
    setEditMode((v) => !v);
  }, [editMode, ops.length]);

  const resetEdits = useCallback(() => {
    setPending({});
  }, []);

  const saveEdits = useCallback(async () => {
    if (!id || !timeline || ops.length === 0 || saving) return;
    setSaving(true);
    try {
      await api.submitTimelineEdits(id, {
        base_timeline_version: timeline.version,
        operations: ops,
      });
      setPending({});
      setSelected(new Set());
      showToast("ok", "已保存，指标正在重算");
      await refreshTimeline();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        showToast("err", "时间线版本已被更新，已自动刷新，请重新应用修改");
        setPending({});
        await refreshTimeline();
      } else {
        showToast("err", err instanceof Error ? err.message : "保存失败");
      }
    } finally {
      setSaving(false);
    }
  }, [id, timeline, ops, saving, showToast, refreshTimeline]);

  const onToggleSelect = useCallback((item: TimelineItem) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.item_id)) {
        next.delete(item.item_id);
      } else {
        next.add(item.item_id);
      }
      return next;
    });
  }, []);

  const onCreateHighlight = useCallback(() => {
    const items = timeline?.items ?? [];
    const ids = items
      .filter((i) => selected.has(i.item_id))
      .sort((a, b) => a.start_ms - b.start_ms)
      .map((i) => i.item_id);
    if (ids.length === 0) return;
    requestHighlight(ids);
  }, [timeline, selected, requestHighlight]);

  const onDownload = useCallback(
    (entry: ExportEntry, item: TimelineItem) => {
      if (!video) return;
      const name = `${baseName(video.filename)}_${msToName(item.start_ms)}-${msToName(item.end_ms)}.mp4`;
      download(entry, name);
    },
    [video, download],
  );

  const onDownloadHighlight = useCallback(() => {
    if (!video || !highlight) return;
    const n = highlight.intervals.length;
    download(highlight, `${baseName(video.filename)}_集锦_${n}段.mp4`);
  }, [video, highlight, download]);

  const rerun = useCallback(async () => {
    if (!id) return;
    if (!window.confirm("将重新运行完整分析流水线，期间时间线与报告会暂时不可用。继续？")) {
      return;
    }
    try {
      await api.createPipelineRun(id);
      showToast("ok", "已触发重新分析");
      setStatus(null);
      setTimeline(null);
      setTimelineUnavailable(false);
      setReport(null);
      setReportUnavailable(false);
      setPending({});
      setEditMode(false);
      setSelected(new Set());
      setActiveItemId(null);
      const v = await api.getVideo(id);
      setVideo(v);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        showToast("err", "已有分析在进行中");
      } else {
        showToast("err", err instanceof Error ? err.message : "触发重新分析失败");
      }
    }
  }, [id, showToast]);

  if (loadError) {
    return (
      <div className="page">
        <TopBar />
        <main className="container video-detail-container">
          <div className="banner banner-error">{loadError}</div>
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/")}>
            返回列表
          </button>
        </main>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="page">
        <TopBar />
        <main className="container video-detail-container">
          <p className="muted">加载中…</p>
        </main>
      </div>
    );
  }

  const failureCode = failure
    ? (status?.stages.find((s) => s.error_code)?.error_code ?? null)
    : null;
  const durationMs = video.duration_ms ?? timeline?.video_duration_ms ?? 0;

  return (
    <div className="page">
      <TopBar />
      <main className="container video-detail-container">
        <div className="page-header">
          <div className="page-header-main">
            <h2 className="video-title">{video.filename}</h2>
            <div className="video-meta">
              <StatusBadge state={video.state} />
              <span>{SESSION_TYPE_LABELS[video.session_type] ?? video.session_type}</span>
              <span>
                目标球员：
                {TARGET_PLAYER_LABELS[video.target_player.mode] ?? video.target_player.mode}
              </span>
              {video.duration_ms != null && <span>时长 {formatMs(video.duration_ms)}</span>}
              <span>{formatDateTime(video.created_at)}</span>
            </div>
          </div>
          <div className="page-header-actions">
            {ready && <button className="btn btn-primary" onClick={() => navigate(`/videos/${id}/quizzes`)}>发球练习</button>}
            {ready && (
              <button
                type="button"
                className={`btn ${editMode ? "btn-primary" : "btn-ghost"}`}
                disabled={!!annotationDraft}
                onClick={toggleEditMode}
              >
                {editMode ? "退出编辑" : "编辑时间线"}
              </button>
            )}
            {(ready || failure) && (
              <button type="button" className="btn btn-ghost" onClick={() => void rerun()}>
                重新分析
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => navigate("/")}>
              返回列表
            </button>
          </div>
        </div>

        {video.state === "PARTIAL_READY" && (
          <div className="banner banner-warn">
            部分分析不可用，以下结果可能不完整。

          </div>
        )}

        {failure && (
          <div className="banner banner-error">
            视频处理失败
            {failureCode
              ? `：${failureCode}`
              : `（${VIDEO_STATE_LABELS[video.state] ?? video.state}）`}

          </div>
        )}

        {processing && (
          <section className="card processing-card">
            <h3>正在处理视频…</h3>
            <ProgressBar percent={status?.progress_pct ?? 0} />
            {status ? (
              <ul className="stage-list">
                {status.stages.map((s) => {
                  const icon = stageIcon(s.status);
                  return (
                    <li key={s.stage} className="stage-row">
                      <span className={`stage-icon ${icon.className}`}>{icon.icon}</span>
                      <span className="stage-name">{STAGE_LABELS[s.stage] ?? s.stage}</span>
                      <span className="stage-status">
                        {s.status}
                        {s.attempt > 1 ? `（第 ${s.attempt} 次尝试）` : ""}
                      </span>
                      {s.error_code && <span className="stage-error">{s.error_code}</span>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">状态加载中…</p>
            )}

          </section>
        )}

        {ready && (
          <>
            <div className="review-workspace">
              <div className="review-viewer">
                <Player ref={playerRef} videoId={video.id} onTimeUpdate={handleTimeUpdate} />
                <SessionTimeline chapters={navigation.chapters} entries={navigation.entries}
                  durationMs={durationMs} currentMs={currentMs} chapterId={chapterId}
                  draftRange={annotationDraft}
                  annotationEnabled={!!annotations.document && !editMode && !annotationDraft}
                  onAnnotate={draft => {playerRef.current?.pause(); setAnnotationDraft(draft);}}
                  activeItemId={activeItemId} onPlayAll={playAll}
                  onChapter={selectChapter} onSeek={handleSeek}
                  onPlay={entry => {setChapterId("all"); setNavigationRequest(value => value + 1); playSegment(entry.item);}} />
                {annotations.error && <div className="banner banner-warn">人工标注加载失败：{annotations.error} <button className="btn btn-ghost btn-sm" onClick={annotations.reload}>重试</button></div>}
                {timelineUnavailable && !timeline && <div className="banner banner-warn">时间线尚未生成，暂无法展示关键节点。</div>}
              </div>
              <div className="review-events">
                {annotationDraft ? <TrainingAnnotationEditor
                  onRangeChange={(start_ms, end_ms) => setAnnotationDraft(current => current ? {...current, start_ms, end_ms} : null)}
                  draft={annotationDraft} segments={annotations.document?.segments ?? []}
                  durationMs={durationMs} currentMs={currentMs} target={video.target_player.mode}
                  onSeek={handleSeek} onClose={() => setAnnotationDraft(null)}
                  onSave={async segments => {await annotations.save(segments); setChapterId("all"); showToast("ok", "训练标注已保存");}}/>
                : <EventPanel key={`${timeline?.timeline_id ?? video.id}:${navigationRequest}`}
                  entries={navigation.entries} chapters={navigation.chapters}
                  chapterId={chapterId} currentMs={currentMs} onChapterFilter={setChapterId}
                  items={timeline?.items ?? []}
                  activeItemId={activeItemId}
                  editMode={editMode}
                  pending={pending}
                  clipByItemId={clipByItemId}
                  selected={selected}
                  highlight={highlight}
                  onPlayItem={playSegment}
                  onPlayAll={playAll}
                  onNudge={onNudge}
                  onTypeChange={onTypeChange}
                  onSplit={onSplit}
                  onMergeNext={onMergeNext}
                  onDelete={onDelete}
                  onExport={requestClip}
                  onDownload={onDownload}
                  onToggleSelect={onToggleSelect}
                  onCreateHighlight={onCreateHighlight}
                  onDownloadHighlight={onDownloadHighlight}
                />}
              </div>
            </div>
            <details className="session-report">
              <summary>训练报告与教练协作 <span>时间线 v{timelineVersion}</span></summary>
              <ReportPanel report={report} unavailable={reportUnavailable} stale={reportStale} onSeek={handleSeek} />
            </details>
            {editMode && (
              <div className="edit-bar">
                <span className="edit-bar-hint">
                  {ops.length > 0 ? `有 ${ops.length} 项未保存的修改` : "编辑模式：暂无修改"}
                </span>
                <div className="edit-bar-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={resetEdits}
                    disabled={ops.length === 0 || saving}
                  >
                    重置
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void saveEdits()}
                    disabled={ops.length === 0 || saving}
                  >
                    {saving ? "保存中…" : `保存修改（${ops.length} 项修改）`}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}
