import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { isFailureState, isProcessingState, isReadyState } from "../api/types";
import type {
  ActiveTimeline,
  ProcessingStatus,
  StageStatus,
  TimelineItem,
  VideoDetail,
} from "../api/types";
import TopBar from "../components/TopBar";
import StatusBadge from "../components/StatusBadge";
import ProgressBar from "../components/ProgressBar";
import Player from "../components/Player";
import type { PlayerHandle } from "../components/Player";
import SegmentList from "../components/SegmentList";
import Filmstrip from "../components/Filmstrip";
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

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [timeline, setTimeline] = useState<ActiveTimeline | null>(null);
  const [timelineUnavailable, setTimelineUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const rangeEndRef = useRef<number | null>(null);

  const ready = video !== null && isReadyState(video.state);
  const failure = video !== null && isFailureState(video.state);
  const processing = video !== null && isProcessingState(video.state);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setVideo(null);
    setStatus(null);
    setTimeline(null);
    setTimelineUnavailable(false);
    setLoadError(null);
    setActiveItemId(null);
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

  useEffect(() => {
    if (!id || !ready) return;
    let cancelled = false;
    api
      .getActiveTimeline(id)
      .then((tl) => {
        if (!cancelled) setTimeline(tl);
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
  }, [id, ready]);

  const playSegment = useCallback((item: TimelineItem) => {
    const startSec = Math.max(0, item.start_ms - PRE_ROLL_MS) / 1000;
    rangeEndRef.current = (item.end_ms + POST_ROLL_MS) / 1000;
    setActiveItemId(item.item_id);
    playerRef.current?.seekTo(startSec);
    playerRef.current?.play();
  }, []);

  const playAll = useCallback(() => {
    rangeEndRef.current = null;
    setActiveItemId(null);
    playerRef.current?.play();
  }, []);

  const handleTimeUpdate = useCallback((seconds: number) => {
    if (rangeEndRef.current !== null && seconds >= rangeEndRef.current) {
      rangeEndRef.current = null;
      setActiveItemId(null);
      playerRef.current?.pause();
    }
  }, []);

  const handleFilmstripSeek = useCallback((seconds: number) => {
    rangeEndRef.current = null;
    setActiveItemId(null);
    playerRef.current?.seekTo(seconds);
  }, []);

  if (loadError) {
    return (
      <div className="page">
        <TopBar />
        <main className="container">
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
        <main className="container">
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
      <main className="container">
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
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/")}>
            返回列表
          </button>
        </div>

        {video.state === "PARTIAL_READY" && (
          <div className="banner banner-warn">
            部分分析不可用，以下结果可能不完整。
            {status && status.limitations.length > 0 && (
              <ul>
                {status.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {failure && (
          <div className="banner banner-error">
            视频处理失败
            {failureCode
              ? `：${failureCode}`
              : `（${VIDEO_STATE_LABELS[video.state] ?? video.state}）`}
            {status && status.limitations.length > 0 && (
              <ul>
                {status.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
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
                      <span className="stage-name">
                        {STAGE_LABELS[s.stage] ?? s.stage}
                      </span>
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
            {status && status.limitations.length > 0 && (
              <ul className="limitations">
                {status.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {ready && (
          <>
            <Player ref={playerRef} videoId={video.id} onTimeUpdate={handleTimeUpdate} />
            {durationMs > 0 && (
              <Filmstrip videoId={video.id} durationMs={durationMs} onSeek={handleFilmstripSeek} />
            )}
            {timelineUnavailable && !timeline && (
              <div className="banner banner-warn">时间线尚未生成，暂无法展示片段列表。</div>
            )}
            <SegmentList
              items={timeline?.items ?? []}
              activeItemId={activeItemId}
              onPlayItem={playSegment}
              onPlayAll={playAll}
            />
          </>
        )}
      </main>
    </div>
  );
}
