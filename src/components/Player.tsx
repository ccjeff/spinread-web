import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode } from "react";
import Hls from "hls.js";
import { getToken } from "../api/client";

export interface PlayerHandle {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  currentTime: () => number;
  setPlaybackRate: (rate: number) => void;
}

interface PlayerProps {
  videoId: string;
  overlay?: (width: number, height: number) => ReactNode;
  onTimeUpdate?: (seconds: number) => void;
}

const Player = forwardRef<PlayerHandle, PlayerProps>(function Player({ videoId, onTimeUpdate, overlay }, ref) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [size, setSize] = useState<[number,number]>([16,9]);
  const callback = useRef(onTimeUpdate); callback.current = onTimeUpdate;
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.requestVideoFrameCallback) return;
    let frame = 0, cancelled = false;
    const update = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (cancelled) return;
      callback.current?.(metadata.mediaTime);
      frame = video.requestVideoFrameCallback(update);
    };
    frame = video.requestVideoFrameCallback(update);
    return () => {cancelled = true; video.cancelVideoFrameCallback(frame);};
  }, [videoId]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    if (!Hls.isSupported()) {
      setError("当前浏览器不支持 HLS 播放，请使用最新版 Chrome / Edge / Safari");
      return;
    }
    const hls = new Hls({
      xhrSetup: (xhr) => {
        const token = getToken();
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      },
    });
    hls.loadSource(`/api/videos/${videoId}/stream/master.m3u8`);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        setError("视频流加载失败，请刷新页面重试");
      }
    });
    return () => {
      hls.destroy();
    };
  }, [videoId]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo(seconds: number) {
        if (videoRef.current) videoRef.current.currentTime = seconds;
      },
      play() {
        videoRef.current
          ?.play()
          .catch(() => undefined);
      },
      pause() {
        videoRef.current?.pause();
      },
      setPlaybackRate(rate: number) {
        if (videoRef.current) videoRef.current.playbackRate = rate;
      },
      currentTime() {
        return videoRef.current?.currentTime ?? 0;
      },
    }),
    [],
  );

  return (
    <div className="player">
      <div className="replay-video-surface">
      <video
        ref={videoRef}
        className="player-video"
        controls
        playsInline
        onLoadedMetadata={e => setSize([e.currentTarget.videoWidth, e.currentTarget.videoHeight])}
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
      />
      {overlay?.(size[0], size[1])}
      </div>
      {error && <div className="banner banner-error">{error}</div>}
    </div>
  );
});

export default Player;
