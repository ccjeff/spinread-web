import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { isProcessingState } from "../api/types";
import type { VideoSummary } from "../api/types";
import TopBar from "../components/TopBar";
import StatusBadge from "../components/StatusBadge";
import ProgressBar from "../components/ProgressBar";
import { formatDateTime, formatMs } from "../utils/format";
import { SESSION_TYPE_LABELS } from "../utils/labels";

export default function VideoListPage() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const [pendingDelete, setPendingDelete] = useState<VideoSummary[] | null>(null);
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedVideos = videos?.filter(v => selected.has(v.id)) ?? [];

  const refresh = useCallback(async () => {
    try {
      const list = await api.listVideos();
      setVideos(list);
      setSelected(previous => new Set([...previous].filter(id => list.some(v => v.id === id))));
      setError(null);
      const processing = list.filter((v) => isProcessingState(v.state));
      const entries = await Promise.all(
        processing.map(async (v) => {
          try {
            const s = await api.getProcessingStatus(v.id);
            return [v.id, s.progress_pct] as const;
          } catch {
            return [v.id, undefined] as const;
          }
        }),
      );
      const next: Record<string, number> = {};
      for (const [vid, pct] of entries) {
        if (pct !== undefined) next[vid] = pct;
      }
      setProgress(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载视频列表失败");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (pendingDelete) confirmation.current?.showModal();
    else confirmation.current?.close();
  }, [pendingDelete]);

  function onDelete(e: MouseEvent, video: VideoSummary) {
    e.stopPropagation();
    setPendingDelete([video]);
  }

  function toggle(id: string) {
    if (deleting) return;
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function deleteVideos(targets: VideoSummary[]) {
    if (deleting || targets.length === 0) return;
    setDeleting(true); setDeleteError(""); setNotice("");
    const succeeded = new Set<string>();
    const failures: string[] = [];
    // Bound concurrency; each request retains the existing owner checks.
    for (let offset = 0; offset < targets.length; offset += 5) {
      const batch = targets.slice(offset, offset + 5);
      const results = await Promise.allSettled(batch.map(v => api.deleteVideo(v.id)));
      results.forEach((result, i) => {
        if (result.status === "fulfilled") succeeded.add(batch[i].id);
        else failures.push(`${batch[i].filename}：${result.reason instanceof Error ? result.reason.message : "删除失败"}`);
      });
    }
    setVideos(previous => previous?.filter(v => !succeeded.has(v.id)) ?? null);
    setSelected(previous => new Set([...previous].filter(id => !succeeded.has(id))));
    setNotice(`已删除 ${succeeded.size} 个视频。`);
    if (failures.length) setDeleteError(`${failures.length} 个视频未删除，可重试。${failures.slice(0, 3).join("；")}`);
    setDeleting(false);
    await refresh();
  }

  return (
    <div className="page">
      <TopBar />
      <dialog className="delete-confirmation" ref={confirmation} aria-labelledby="delete-title" onCancel={() => setPendingDelete(null)}>
        <h2 id="delete-title">删除 {pendingDelete?.length ?? 0} 个视频？</h2>
        <p>删除后，这些视频及其练习将不再可访问。</p>
        <ul>{pendingDelete?.map(v => <li key={v.id}>{v.filename}</li>)}</ul>
        <div className="video-list-toolbar">
          <button className="btn btn-ghost" autoFocus onClick={() => setPendingDelete(null)}>取消</button>
          <button className="btn btn-danger" onClick={() => {const targets = pendingDelete; setPendingDelete(null); if (targets) void deleteVideos(targets);}}>确认删除</button>
        </div>
      </dialog>
      <main className="container">
        <div className="page-header">
          <h2>我的视频</h2>
          <div className="video-list-toolbar"><button type="button" className="btn btn-ghost" disabled={deleting || !videos?.length} onClick={() => {setManaging(!managing); setSelected(new Set());}}>
            {managing ? "完成管理" : "批量管理"}
          </button><button type="button" className="btn btn-primary" disabled={deleting} onClick={() => navigate("/upload")}>
            上传视频
          </button></div>
        </div>
        {error && <div className="banner banner-error">{error}</div>}
        {deleteError && <div role="alert" className="banner banner-error">{deleteError}</div>}
        {notice && <p role="status">{notice}</p>}
        {managing && <div className="video-list-toolbar bulk-toolbar" aria-label="批量管理工具栏">
          <label><input type="checkbox" disabled={deleting || !videos?.length} checked={!!videos?.length && selectedVideos.length === videos.length} onChange={e => setSelected(new Set(e.target.checked ? videos?.map(v => v.id) : []))}/> 全选当前列表</label>
          <span>已选 {selectedVideos.length} / {videos?.length ?? 0}</span>
          <button className="btn btn-ghost" disabled={deleting || selectedVideos.length === 0} onClick={() => setSelected(new Set())}>取消选择</button>
          <button className="btn btn-danger" disabled={deleting || selectedVideos.length === 0} onClick={() => setPendingDelete(selectedVideos)}>{deleting ? "正在删除…" : `删除所选 (${selectedVideos.length})`}</button>
        </div>}
        {videos === null ? (
          <p className="muted">加载中…</p>
        ) : videos.length === 0 ? (
          <p className="muted">还没有视频，点击右上角「上传视频」开始分析。</p>
        ) : (
          <div className="video-grid">
            {videos.map((v) => {
              const processing = isProcessingState(v.state);
              const pct = progress[v.id];
              return (
                <div
                  key={v.id}
                  className={`card video-card ${managing && selected.has(v.id) ? "video-card-selected" : ""}`}
                  onClick={() => {if (!deleting) {if (managing) toggle(v.id); else navigate(`/videos/${v.id}`);}}}
                >
                  {managing && <label className="video-select" onClick={e => e.stopPropagation()}><input type="checkbox" disabled={deleting} checked={selected.has(v.id)} onChange={() => toggle(v.id)} aria-label={`选择 ${v.filename}`}/> 选择视频</label>}
                  <div className="video-card-top">
                    <span className="video-name" title={v.filename}>
                      {v.filename}
                    </span>
                    <StatusBadge state={v.state} />
                  </div>
                  <div className="video-meta">
                    <span>{SESSION_TYPE_LABELS[v.session_type] ?? v.session_type}</span>
                    <span>时长 {v.duration_ms != null ? formatMs(v.duration_ms) : "--:--"}</span>
                    <span>{formatDateTime(v.created_at)}</span>
                  </div>
                  {processing && (
                    <ProgressBar
                      percent={pct ?? 0}
                      label={pct !== undefined ? `${Math.round(pct)}%` : "排队中"}
                    />
                  )}
                  {!managing && <div className="video-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-danger"
                      disabled={deleting}
                      onClick={(e) => void onDelete(e, v)}
                    >
                      删除
                    </button>
                  </div>}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
