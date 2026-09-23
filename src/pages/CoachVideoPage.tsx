import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import Player from "../components/Player";
import type { PlayerHandle } from "../components/Player";
import ReportPanel from "../components/ReportPanel";
import { api, ApiError } from "../api/client";
import type { VideoDetail, AnalysisReport } from "../api/types";

export default function CoachVideoPage() {
  const {id = ""} = useParams(); const player = useRef<PlayerHandle>(null);
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {let alive = true; setVideo(null); setReport(null); setError("");
    Promise.all([api.getVideo(id), api.getActiveReport(id).catch(e => {if(e instanceof ApiError && e.status === 404) return null; throw e;})]).then(([v,r]) => {if(alive) {setVideo(v); setReport(r);}}).catch(e => {if(alive) setError(e.message);});
    return () => {alive = false;};
  }, [id]);
  return <div className="page"><TopBar/><main className="container loop-container"><Link to="/coach">← 教练工作台</Link>{error ? <p role="alert" className="banner banner-error">{error}</p> : video ? <><h1>{video.filename}</h1><p className="muted">球员授权的视频与报告证据。评审批注请从工作台的评审请求进入。</p>{["READY", "PARTIAL_READY"].includes(video.state) ? <Player ref={player} videoId={id}/> : <p>视频尚未处理完成。</p>}<ReportPanel report={report} unavailable={!report} stale={false} playerId={video.owner_id} onSeek={seconds => player.current?.seekTo(seconds)}/></> : <p>正在加载授权视频…</p>}</main></div>;
}
