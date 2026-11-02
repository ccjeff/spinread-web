import {useEffect, useState} from "react";
import {api} from "../api/client";
import type {ActiveTimeline} from "../api/types";
import {useTrainingAnnotations} from "../hooks/useTrainingAnnotations";
import {rallySelection} from "../utils/rallySelection";
import {formatMs} from "../utils/format";

export default function PracticeSourcePicker({videoId, version, busy, onChoose, onPreview}: {
  videoId: string; version: number; busy: boolean;
  onChoose: (start: number, end: number) => void;
  onPreview: (start: number, end: number) => void;
}) {
  const [timeline, setTimeline] = useState<ActiveTimeline | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [scope, setScope] = useState("serve");
  const annotations = useTrainingAnnotations(videoId);
  useEffect(() => {
    let cancelled = false;
    setTimeline(null); setSelected(new Set()); setError("");
    api.getActiveTimeline(videoId).then(value => {if (!cancelled) setTimeline(value);})
      .catch(reason => {if (!cancelled) setError(reason instanceof Error ? reason.message : "加载回合失败");});
    return () => {cancelled = true;};
  }, [videoId, version]);
  const ranges = annotations.document?.segments.filter(segment => segment.feeding === "SERVE_RECEIVE") ?? [];
  const rallies = (timeline?.items ?? []).filter(item => item.type === "RALLY").sort((a, b) => a.start_ms - b.start_ms);
  const rows = rallies.map((item, index) => ({item, ordinal: index + 1})).filter(({item}) => scope === "all" || ranges.some(range => item.start_ms < range.end_ms && item.end_ms > range.start_ms));
  const selection = rallySelection(timeline?.items ?? [], selected);
  const stale = timeline !== null && timeline.version !== version;
  return <section className="card" style={{padding: 16}} aria-label="从训练回合选片">
    <h2>从训练回合选片</h2>
    <p className="muted">优先显示人工标记的发接发训练。准备动作被拆开时，可多选相邻回合，连同中间的时间一起带入编辑器。</p>
    {(error || annotations.error) && <p role="alert">{error || annotations.error}</p>}
    {stale && <p role="alert">时间线已更新，请刷新页面后重新选片。</p>}
    <label className="field"><span>选片范围</span><select value={scope} onChange={event => {setScope(event.target.value); setSelected(new Set());}}>
      <option value="serve">人工标记的发接发 · {ranges.map(range => `${formatMs(range.start_ms)}–${formatMs(range.end_ms)}`).join("、") || "暂无"}</option>
      <option value="all">全部训练回合</option>
    </select></label>
    <div className="practice-source-list">{rows.map(({item, ordinal}) => <div className="practice-source-row" key={item.item_id}>
      <input type="checkbox" aria-label={`选择练习片段 ${ordinal}`} disabled={busy || stale} checked={selected.has(item.item_id)} onChange={() => setSelected(previous => {const next = new Set(previous); if (next.has(item.item_id)) next.delete(item.item_id); else next.add(item.item_id); return next;})}/>
      <button className="btn btn-ghost" onClick={() => onPreview(item.start_ms, item.end_ms)}>回合 {ordinal} · {formatMs(item.start_ms)}–{formatMs(item.end_ms)} ▶</button>
    </div>)}{timeline && !rows.length && <p>暂无符合范围的回合。可切换全部训练回合，或手动圈定片段。</p>}</div>
    <div className="quiz-toolbar"><span>已选 {selected.size} 段{selected.size > 0 && ` · ${formatMs(selection.startMs)}–${formatMs(selection.endMs)}`}</span>
      <button className="btn btn-primary" disabled={busy || stale || !selection.adjacent} onClick={() => onChoose(selection.startMs, selection.endMs)}>使用所选区间</button>
      <button className="btn btn-ghost" disabled={!selected.size} onClick={() => setSelected(new Set())}>清空</button></div>
    {selected.size > 0 && !selection.adjacent && <p role="alert">请选择连续相邻的回合，不能跳过中间的回合。</p>}
  </section>;
}
