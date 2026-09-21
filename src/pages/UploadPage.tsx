import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { uploadFileParts } from "../api/upload";
import type { SessionType, TargetPlayerMode } from "../api/types";
import TopBar from "../components/TopBar";
import ProgressBar from "../components/ProgressBar";
import { formatBytes } from "../utils/format";

type UploadPhase = "idle" | "creating" | "uploading" | "completing";

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [sessionType, setSessionType] = useState<SessionType>("TRAINING");
  const [targetMode, setTargetMode] = useState<TargetPlayerMode>("NEAR");
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== "idle";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    setError(null);
    setUploadedBytes(0);
    try {
      setPhase("creating");
      const session = await api.createUpload({
        filename: file.name,
        byte_size: file.size,
        content_type: file.type || "application/octet-stream",
        session_type: sessionType,
        target_player: { mode: targetMode },
      });
      setPhase("uploading");
      const parts = await uploadFileParts({
        file,
        parts: session.parts,
        partSize: session.part_size,
        concurrency: 4,
        retries: 3,
        onProgress: (loaded) => setUploadedBytes(loaded),
      });
      setPhase("completing");
      const done = await api.completeUpload(session.upload_id, parts);
      navigate(`/videos/${done.video_id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败，请重试");
      setPhase("idle");
    }
  }

  const percent = file && file.size > 0 ? (uploadedBytes / file.size) * 100 : 0;

  return (
    <div className="page">
      <TopBar />
      <main className="container container-narrow">
        <div className="page-header">
          <h2>上传视频</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate("/")}
            disabled={busy}
          >
            返回列表
          </button>
        </div>
        <form className="card form-card" onSubmit={(e) => void onSubmit(e)}>
          <label className="field">
            <span>视频文件</span>
            <input
              type="file"
              accept="video/*,.mov,.mp4"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && (
            <p className="muted">
              已选择：{file.name}（{formatBytes(file.size)}）
            </p>
          )}
          <label className="field">
            <span>视频类型</span>
            <select
              value={sessionType}
              disabled={busy}
              onChange={(e) => setSessionType(e.target.value as SessionType)}
            >
              <option value="TRAINING">训练</option>
              <option value="MATCH">比赛</option>
            </select>
          </label>
          <label className="field">
            <span>目标球员位置</span>
            <select
              value={targetMode}
              disabled={busy}
              onChange={(e) => setTargetMode(e.target.value as TargetPlayerMode)}
            >
              <option value="NEAR">近端</option>
              <option value="FAR">远端</option>
              <option value="LEFT">左侧</option>
              <option value="RIGHT">右侧</option>
            </select>
          </label>
          {phase === "uploading" && file && (
            <ProgressBar
              percent={percent}
              label={`${formatBytes(uploadedBytes)} / ${formatBytes(file.size)}（${Math.round(percent)}%）`}
            />
          )}
          {(phase === "creating" || phase === "completing") && (
            <p className="muted">{phase === "creating" ? "创建上传会话…" : "正在完成上传…"}</p>
          )}
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={!file || busy}>
              {busy ? "上传中，请勿关闭页面…" : "开始上传"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
