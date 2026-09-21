import { useCallback, useEffect, useState } from "react";
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

  const refresh = useCallback(async () => {
    try {
      const list = await api.listVideos();
      setVideos(list);
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

  async function onDelete(e: MouseEvent, video: VideoSummary) {
    e.stopPropagation();
    if (!window.confirm(`确定删除视频「${video.filename}」吗？`)) return;
    try {
      await api.deleteVideo(video.id);
      void refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="page">
      <TopBar />
      <main className="container">
        <div className="page-header">
          <h2>我的视频</h2>
          <button type="button" className="btn btn-primary" onClick={() => navigate("/upload")}>
            上传视频
          </button>
        </div>
        {error && <div className="banner banner-error">{error}</div>}
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
                  className="card video-card"
                  onClick={() => navigate(`/videos/${v.id}`)}
                >
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
                  <div className="video-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-danger"
                      onClick={(e) => void onDelete(e, v)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
