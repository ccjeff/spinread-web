import {useCallback, useEffect, useState} from "react";
import {apiRequest, ApiError} from "../api/client";
import type {TrainingAnnotation, TrainingAnnotations} from "../api/annotations";

export function useTrainingAnnotations(videoId?: string) {
  const [document, setDocument] = useState<TrainingAnnotations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const current = document?.video_id === videoId ? document : null;
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    apiRequest<TrainingAnnotations>(`/videos/${videoId}/training-annotations`)
      .then(value => {if (!cancelled) {setDocument(value); setError(null);}})
      .catch(reason => {if (!cancelled) setError(reason instanceof Error ? reason.message : "人工标注加载失败");});
    return () => {cancelled = true;};
  }, [videoId, retry]);
  const save = useCallback(async (segments: TrainingAnnotation[]) => {
    if (!videoId || !current) throw new Error("人工标注尚未加载，请稍后重试");
    try {
      const value = await apiRequest<TrainingAnnotations>(`/videos/${videoId}/training-annotations`, {
        method: "PUT", body: {base_version: current.version, segments},
      });
      setDocument(previous => previous?.video_id === videoId ? value : previous);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        const latest = await apiRequest<TrainingAnnotations>(`/videos/${videoId}/training-annotations`);
        setDocument(previous => previous?.video_id === videoId ? latest : previous);
      }
      throw reason;
    }
  }, [videoId, current]);
  return {document: current, error, save, reload: () => setRetry(value => value + 1)};
}
