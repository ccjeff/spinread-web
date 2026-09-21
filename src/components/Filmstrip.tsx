import { useEffect, useState } from "react";
import { apiFetchBlob } from "../api/client";
import { formatMs } from "../utils/format";

interface Thumb {
  ts: number;
  url: string;
}

interface FilmstripProps {
  videoId: string;
  durationMs: number;
  onSeek: (seconds: number) => void;
}

export default function Filmstrip({ videoId, durationMs, onSeek }: FilmstripProps) {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];
    setThumbs([]);
    setFinished(false);

    async function load() {
      const maxCount = Math.floor(durationMs / 5000) + 1;
      for (let i = 0; i < maxCount; i += 1) {
        const ts = i * 5000;
        try {
          const blob = await apiFetchBlob(`/videos/${videoId}/thumbs/${ts}.jpg`);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          createdUrls.push(url);
          setThumbs((prev) => [...prev, { ts, url }]);
        } catch {
          if (!cancelled) setFinished(true);
          return;
        }
      }
      if (!cancelled) setFinished(true);
    }

    void load();
    return () => {
      cancelled = true;
      for (const url of createdUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [videoId, durationMs]);

  if (thumbs.length === 0) {
    return finished ? (
      <div className="filmstrip-wrap">
        <p className="muted">缩略图尚未生成</p>
      </div>
    ) : (
      <div className="filmstrip-wrap">
        <p className="muted">缩略图加载中…</p>
      </div>
    );
  }

  return (
    <div className="filmstrip-wrap">
      <div className="filmstrip">
        {thumbs.map((t) => (
          <button
            key={t.ts}
            type="button"
            className="thumb"
            onClick={() => onSeek(t.ts / 1000)}
            title={`跳转到 ${formatMs(t.ts)}`}
          >
            <img src={t.url} alt={`${formatMs(t.ts)} 缩略图`} loading="lazy" />
            <span className="thumb-time">{formatMs(t.ts)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
