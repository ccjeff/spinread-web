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
  onPlayAll: () => void;
  onChapter: (chapter: TrainingChapter) => void;
  onSeek: (seconds: number) => void;
  onPlay: (entry: TrainingEntry) => void;
}

export default function SessionTimeline({chapters, entries, durationMs, currentMs, chapterId, activeItemId, onChapter, onSeek, onPlay, onPlayAll}: Props) {
  const {previous, next} = adjacentTrainingEntries(entries, currentMs, activeItemId);
  const current = chapters.find(chapter => chapter.start_ms <= currentMs && currentMs < chapter.end_ms);
  const fraction = durationMs > 0 ? Math.min(1, Math.max(0, currentMs / durationMs)) : 0;
  return <section className="session-timeline" aria-label="训练关键节点时间线">
    <div className="session-timeline-heading">
      <div><h3>训练脉络</h3><p>{chapters.length} 个训练段 · 点击色块，查看对应回合</p></div>
      <span className="timeline-clock">{formatMs(currentMs)} <span>/ {formatMs(durationMs)}</span></span>
    </div>
    <div className="training-legend" aria-label="训练类型图例">
      {Object.entries(TRAINING_TYPES).map(([key, value]) => <span key={key}><i style={{background: value.color}}/>{value.label}</span>)}
      <span className="timeline-unmarked">空白为未标记区间</span>
    </div>
    <div className="chapter-track">
      {durationMs > 0 && chapters.map(chapter => <button key={chapter.id} type="button"
        className={`chapter-block${chapterId === chapter.id ? " selected" : ""}`}
        style={{left: `${chapter.start_ms / durationMs * 100}%`, width: `${(chapter.end_ms - chapter.start_ms) / durationMs * 100}%`, background: TRAINING_TYPES[chapter.trainingType].color}}
        aria-pressed={chapterId === chapter.id}
        aria-label={`训练段 ${chapter.number}，${formatMs(chapter.start_ms)}，${TRAINING_TYPES[chapter.trainingType].label}，${chapter.entries.length} 个回合`}
        title={`训练段 ${chapter.number} · ${formatMs(chapter.start_ms)}–${formatMs(chapter.end_ms)} · ${chapter.entries.length} 回合`}
        onClick={() => onChapter(chapter)}><span>{chapter.number}</span></button>)}
      <span className="timeline-playhead" style={{left: `${fraction * 100}%`}} aria-hidden="true"/>
    </div>
    <input className="session-scrubber" type="range" min={0} max={Math.max(durationMs, 1)} step={100}
      value={Math.min(currentMs, durationMs)} aria-label="定位视频时间" aria-valuetext={formatMs(currentMs)}
      onChange={event => onSeek(Number(event.target.value) / 1000)}/>
    <div className="timeline-scale" aria-hidden="true">{[0, .25, .5, .75, 1].map(f => <span key={f}>{formatMs(durationMs * f)}</span>)}</div>
    <div className="timeline-navigation">
      <span>{current ? `训练段 ${current.number} · ${TRAINING_TYPES[current.trainingType].label}` : "未标记区间"}</span>
      <div><button className="btn btn-ghost btn-sm" onClick={onPlayAll}>连续播放</button>
        <button className="btn btn-ghost btn-sm" disabled={!previous} onClick={() => previous && onPlay(previous)}>← 上一回合</button>
        <button className="btn btn-ghost btn-sm" disabled={!next} onClick={() => next && onPlay(next)}>下一回合 →</button></div>
    </div>
  </section>;
}
