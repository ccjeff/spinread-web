import {useRef, useState} from "react";
import type {PointerEvent} from "react";
import type {AnnotationDraft} from "./TrainingAnnotationEditor";
import type { TrainingChapter, TrainingEntry } from "../utils/trainingTimeline";
import { TRAINING_TYPES, adjacentTrainingEntries } from "../utils/trainingTimeline";
import { formatMs } from "../utils/format";

interface Props {
  chapters: TrainingChapter[];
  entries: TrainingEntry[];
  durationMs: number;
  currentMs: number;
  chapterId: string;
  activeItemId: string | null;
  annotationEnabled: boolean;
  draftRange: AnnotationDraft | null;
  onAnnotate: (draft: AnnotationDraft) => void;
  onPlayAll: () => void;
  onChapter: (chapter: TrainingChapter) => void;
  onSeek: (seconds: number) => void;
  onPlay: (entry: TrainingEntry) => void;
}

export default function SessionTimeline({chapters, entries, durationMs, currentMs, chapterId, activeItemId, onChapter, onSeek, onPlay, onPlayAll, annotationEnabled, onAnnotate, draftRange}: Props) {
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<{start: number; end: number} | null>(null);
  const anchor = useRef<number | null>(null);
  const highlighted = selection ?? (draftRange ? {start: draftRange.start_ms, end: draftRange.end_ms} : null);
  const chosen = chapters.find(chapter => chapter.id === chapterId);
  function pointerTime(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * durationMs);
  }
  function finishSelection(event: PointerEvent<HTMLDivElement>) {
    if (anchor.current === null) return;
    const end = pointerTime(event), start = anchor.current;
    anchor.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setSelection(null);
    if (Math.abs(end - start) >= 1000) {
      setSelecting(false);
      onAnnotate({start_ms: Math.min(start, end), end_ms: Math.max(start, end)});
    }
  }
  const {previous, next} = adjacentTrainingEntries(entries, currentMs, activeItemId);
  const current = chapters.find(chapter => chapter.start_ms <= currentMs && currentMs < chapter.end_ms);
  const fraction = durationMs > 0 ? Math.min(1, Math.max(0, currentMs / durationMs)) : 0;
  return <section className="session-timeline" aria-label="训练关键节点时间线">
    <div className="session-timeline-heading">
      <div><h3>训练脉络</h3><p>{chapters.length} 个训练段 · 点击色块，查看对应回合</p></div>
      <span className="timeline-clock">{formatMs(currentMs)} <span>/ {formatMs(durationMs)}</span></span>
    </div>
    <div className="annotation-toolbar">
      <button className="btn btn-ghost btn-sm" disabled={!annotationEnabled || !chosen} onClick={() => chosen && onAnnotate({start_ms: chosen.start_ms, end_ms: chosen.end_ms, annotation: chosen.annotation})}>{chosen?.annotation ? "编辑本段标注" : "标注选中训练段"}</button>
      <button className="btn btn-ghost btn-sm" aria-pressed={selecting} disabled={!annotationEnabled || !durationMs} onClick={() => {setSelecting(value => !value); setSelection(null);}}>拉选合并</button>
      <button className="btn btn-ghost btn-sm" disabled={!annotationEnabled || durationMs < 1000} onClick={() => onAnnotate({start_ms: Math.min(currentMs, durationMs - 1000), end_ms: Math.min(durationMs, currentMs + 30000)})}>输入区间</button>
    </div>
    {selecting && <p className="annotation-help" role="status">在下方色块区域按住并横向拖动，可跨训练段和空白选择。至少选择 1 秒；Esc 取消。</p>}
    <div className="training-legend" aria-label="训练类型图例">
      {Object.entries(TRAINING_TYPES).map(([key, value]) => <span key={key}><i style={{background: value.color}}/>{value.label}</span>)}
      <span className="timeline-unmarked">空白为未标记区间</span>
    </div>
    <div className={`chapter-track${selecting ? " is-selecting" : ""}`} tabIndex={selecting ? 0 : undefined}
      aria-label={selecting ? "拖动选择训练区间" : "训练段导航"}
      onKeyDown={event => {if (event.key === "Escape") {anchor.current = null; setSelection(null); setSelecting(false);}}}
      onPointerDown={event => {
        if (!selecting || !annotationEnabled || event.button !== 0) return;
        event.preventDefault(); event.currentTarget.focus();
        anchor.current = pointerTime(event); setSelection({start: anchor.current, end: anchor.current});
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {if (anchor.current !== null) setSelection({start: anchor.current, end: pointerTime(event)});}}
      onPointerUp={finishSelection}
      onPointerCancel={() => {anchor.current = null; setSelection(null);}}
      onLostPointerCapture={() => {anchor.current = null; setSelection(null);}}>

      {durationMs > 0 && chapters.map(chapter => <button key={chapter.id} type="button"
        className={`chapter-block${chapterId === chapter.id ? " selected" : ""}`}
        style={{left: `${chapter.start_ms / durationMs * 100}%`, width: `${(chapter.end_ms - chapter.start_ms) / durationMs * 100}%`, background: TRAINING_TYPES[chapter.trainingType].color}}
        aria-pressed={chapterId === chapter.id}
        aria-label={`训练段 ${chapter.number}，${formatMs(chapter.start_ms)}，${chapter.annotation?.title ?? TRAINING_TYPES[chapter.trainingType].label}，${chapter.entries.length} 个回合`}
        title={`${chapter.annotation?.title ?? `训练段 ${chapter.number}`} · ${formatMs(chapter.start_ms)}–${formatMs(chapter.end_ms)} · ${chapter.entries.length} 回合`}
        onClick={() => {if (!selecting) onChapter(chapter);}}><span>{chapter.annotation ? chapter.annotation.title : chapter.number}</span></button>)}
      {highlighted && <div className="annotation-selection" style={{left: `${Math.min(highlighted.start, highlighted.end) / durationMs * 100}%`, width: `${Math.abs(highlighted.end - highlighted.start) / durationMs * 100}%`}}/>}
      <span className="timeline-playhead" style={{left: `${fraction * 100}%`}} aria-hidden="true"/>
    </div>
    {selection && <p className="annotation-help" role="status">{formatMs(Math.min(selection.start, selection.end))}–{formatMs(Math.max(selection.start, selection.end))}</p>}
    {chosen?.annotation && <div className="annotation-summary"><strong>{chosen.annotation.title}</strong><span>人工标注 · {formatMs(chosen.start_ms)}–{formatMs(chosen.end_ms)}</span></div>}
    <input className="session-scrubber" type="range" min={0} max={Math.max(durationMs, 1)} step={100}
      value={Math.min(currentMs, durationMs)} aria-label="定位视频时间" aria-valuetext={formatMs(currentMs)}
      onChange={event => onSeek(Number(event.target.value) / 1000)}/>
    <div className="timeline-scale" aria-hidden="true">{[0, .25, .5, .75, 1].map(f => <span key={f}>{formatMs(durationMs * f)}</span>)}</div>
    <div className="timeline-navigation">
      <span>{current ? `训练段 ${current.number} · ${current.annotation?.title ?? TRAINING_TYPES[current.trainingType].label}` : "未标记区间"}</span>
      <div><button className="btn btn-ghost btn-sm" onClick={onPlayAll}>连续播放</button>
        <button className="btn btn-ghost btn-sm" disabled={!previous} onClick={() => previous && onPlay(previous)}>← 上一回合</button>
        <button className="btn btn-ghost btn-sm" disabled={!next} onClick={() => next && onPlay(next)}>下一回合 →</button></div>
    </div>
  </section>;
}
