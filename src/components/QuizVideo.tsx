import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { getToken } from "../api/client";

// Practice has no unrestricted native scrubber. Guard seeks and playback on
// every animation frame, stopping slightly early to avoid revealing the receive.
export default function QuizVideo({videoId, startMs, endMs, onBoundary}: {
  videoId: string; startMs: number; endMs: number; onBoundary?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const boundary = useRef(onBoundary);
  useEffect(() => {boundary.current = onBoundary;}, [onBoundary]);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let frame = 0;
    let stopped = false;
    let reached = false;
    const start = startMs / 1000, end = endMs / 1000;
    const limit = Math.max(start, end - 0.06);
    setReady(false); setVisible(false); setError(""); setPlaying(false);
    if (!Hls.isSupported()) { setError("此浏览器不支持视频流，请使用支持 HLS 的 Chrome、Edge 或 Safari。"); return; }
    const hls = new Hls({startPosition: start, xhrSetup: xhr => {
      const token = getToken(); if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }});
    hls.loadSource(`/api/videos/${videoId}/stream/master.m3u8`);
    hls.attachMedia(v);
    const loaded = () => {v.currentTime = start; setReady(true);};
    const seeked = () => {if (v.currentTime >= start && v.currentTime <= end) setVisible(true);};
    const guard = () => {
      if (v.currentTime < start - 0.02 || v.currentTime > end) {
        setVisible(false); v.pause(); v.currentTime = Math.min(limit, Math.max(start, v.currentTime));
      }
      if (!v.paused && v.currentTime >= limit) {
        v.pause();
        if (!reached) {reached = true; boundary.current?.();}
      }
    };
    const tick = () => {guard(); if (!stopped) frame = requestAnimationFrame(tick);};
    const seeking = () => {setVisible(false); guard();};
    const visibility = () => {if (document.hidden) v.pause();};
    document.addEventListener("visibilitychange", visibility);
    v.addEventListener("loadedmetadata", loaded);
    v.addEventListener("seeked", seeked);
    v.addEventListener("seeking", seeking);
    v.addEventListener("timeupdate", guard);
    hls.on(Hls.Events.ERROR, (_, data) => {if (data.fatal) setError("视频加载失败，请刷新重试。");});
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true; cancelAnimationFrame(frame); v.pause(); hls.destroy();
      document.removeEventListener("visibilitychange", visibility);
      v.removeEventListener("loadedmetadata", loaded); v.removeEventListener("seeked", seeked);
      v.removeEventListener("seeking", seeking); v.removeEventListener("timeupdate", guard);
    };
  }, [videoId, startMs, endMs]);

  async function play(restart: boolean) {
    const v = ref.current; if (!v) return;
    if (restart || v.currentTime >= endMs / 1000 - 0.07) v.currentTime = startMs / 1000;
    try {await v.play();} catch {setError("播放失败，请重试。");}
  }
  return <div className="quiz-video">
    <div className="quiz-video-surface"><video ref={ref} playsInline preload="auto" style={{visibility: visible ? "visible" : "hidden"}} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />{!visible && <span>正在定位片段…</span>}</div>
    <div className="quiz-controls">
      <button className="btn btn-primary" disabled={!ready || !!error} onClick={() => playing ? ref.current?.pause() : void play(false)}>{playing ? "暂停" : "播放片段"}</button>
      <button className="btn btn-ghost" disabled={!ready || !!error} onClick={() => void play(true)}>重播</button>
      <label>速度 <select value={rate} onChange={e => {const value = Number(e.target.value); setRate(value); if (ref.current) ref.current.playbackRate = value;}}><option value={1}>1×</option><option value={0.5}>0.5×</option><option value={0.25}>0.25×</option></select></label>
      <span className="muted">到片段边界自动暂停</span>
    </div>
    {error && <p className="banner banner-error" role="alert">{error}</p>}
  </div>;
}
