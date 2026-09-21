import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Hls from "hls.js";
import { getToken } from "../api/client";

export interface PlayerHandle {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  currentTime: () => number;
}

interface PlayerProps {
  videoId: string;
  onTimeUpdate?: (seconds: number) => void;
}

const Player = forwardRef<PlayerHandle, PlayerProps>(function Player({ videoId, onTimeUpdate }, ref) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
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
      currentTime() {
        return videoRef.current?.currentTime ?? 0;
      },
    }),
    [],
  );

  return (
    <div className="player">
      <video
        ref={videoRef}
        className="player-video"
        controls
        playsInline
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
      />
      {error && <div className="banner banner-error">{error}</div>}
    </div>
  );
});

export default Player;
