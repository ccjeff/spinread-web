import { useEffect, useMemo, useRef, useState } from "react";
import SegmentTree from "./SegmentTree";
import type { SegmentTreeProps } from "./SegmentTree";
import ExportButton from "./ExportButton";
import { TRAINING_TYPES, entryTitle } from "../utils/trainingTimeline";
import type { TrainingChapter, TrainingEntry, TrainingType } from "../utils/trainingTimeline";
import { formatMs } from "../utils/format";

interface Props extends SegmentTreeProps {
  onMergeSelected: () => void;
  onPracticeSelected: () => void;
  selectionAdjacent: boolean;
  selectionBusy: boolean;
  onClearSelection: () => void;
  entries: TrainingEntry[];
  chapters: TrainingChapter[];
  chapterId: string;
  currentMs: number;
  onChapterFilter: (id: string) => void;
}

export default function EventPanel(props: Props) {
  const {entries, chapters, chapterId, currentMs, onChapterFilter, editMode, activeItemId,
    onPlayItem, selected, onToggleSelect, clipByItemId, onExport, onDownload, highlight,
    onCreateHighlight, onDownloadHighlight} = props;
  const [kind, setKind] = useState<"training" | "all">("training");
  const [type, setType] = useState<TrainingType | "all">("all");
  const [locateRequest, setLocateRequest] = useState(0);
  const locateTarget = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const current = entries.find(entry => entry.item.start_ms <= currentMs && currentMs < entry.item.end_ms);
  const currentId = current?.item.item_id ?? activeItemId;
  const visible = useMemo(() => entries.filter(entry =>
    (kind === "all" || entry.kind === "training") &&
    (type === "all" || entry.kind === "training" && entry.trainingType === type) &&
    (chapterId === "all" || entry.chapterId === chapterId || entry.kind === "gap" && (() => {
      const chapter = chapters.find(chapter => chapter.id === chapterId);
      return chapter && entry.item.start_ms >= chapter.start_ms && entry.item.end_ms <= chapter.end_ms;
    })())), [entries, kind, type, chapterId, chapters]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [kind, type, chapterId]);
  useEffect(() => {
    const id = locateTarget.current ?? activeItemId;
    const row = id ? rows.current.get(id) : null;
    const scroller = scrollRef.current;
    if (row && scroller) scroller.scrollTo({top: scroller.scrollTop + row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientHeight / 3, behavior: "smooth"});
    locateTarget.current = null;
  }, [activeItemId, locateRequest, visible]);

  function locateCurrent() {
    locateTarget.current = currentId;
    setKind("all"); setType("all"); onChapterFilter("all");
    setLocateRequest(value => value + 1);
  }

  return <aside className="event-panel" aria-label="视频事件导航">
    <div className="event-panel-header"><div><span className="eyebrow">SESSION INDEX</span><h3>{editMode ? "编辑训练片段" : "回合与关键节点"}</h3></div>
      <button className="btn btn-ghost btn-sm" disabled={!currentId || editMode} onClick={locateCurrent}>定位当前</button></div>
    {!editMode && <>
      <div className="event-filters">
        <div className="event-tabs" aria-label="事件范围"><button aria-pressed={kind === "training"} onClick={() => setKind("training")}>训练回合 <span>{entries.filter(entry => entry.kind === "training").length}</span></button>
          <button aria-pressed={kind === "all"} onClick={() => setKind("all")}>全部节点</button></div>
        <div className="event-selects"><label>训练段<select aria-label="筛选训练段" value={chapterId} onChange={e => onChapterFilter(e.target.value)}><option value="all">整场训练</option>{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{String(chapter.number).padStart(2, "0")} · {formatMs(chapter.start_ms)} · {chapter.annotation ? chapter.annotation.title : `${chapter.entries.length} 回合`}</option>)}</select></label>
          <label>训练类型<select aria-label="筛选训练类型" value={type} onChange={e => setType(e.target.value as TrainingType | "all")}><option value="all">全部类型</option>{Object.entries(TRAINING_TYPES).map(([key, value]) => <option key={key} value={key}>{value.label}（{entries.filter(entry => entry.kind === "training" && entry.trainingType === key).length}）</option>)}</select></label></div>
      </div>
      <div className="event-list-status"><span>{visible.length} 个节点</span><span>点击回放 · 自动停在片段末尾</span></div>
    </>}
    <div className="event-scroll" ref={scrollRef} tabIndex={0} aria-label={editMode ? "可滚动的时间线编辑列表" : "可滚动的事件列表"}>
      {editMode ? <SegmentTree {...props}/> : visible.length === 0 ? <div className="event-empty"><strong>{entries.length ? "暂无符合筛选的节点" : "时间线尚未生成"}</strong><p>{type !== "all" ? "未确定训练类型的回合在「未分类」中。" : "切换训练段，或选择全部节点查看其他片段。"}</p><button className="btn btn-ghost" onClick={() => {setKind("training"); setType("all"); onChapterFilter("all");}}>查看全部回合</button></div> : visible.map(entry => {
        const item = entry.item;
        const isCurrent = current?.item.item_id === item.item_id;
        const hits = typeof item.attributes.hits === "number" ? item.attributes.hits : null;
        return <div key={item.item_id} ref={node => {if (node) rows.current.set(item.item_id, node); else rows.current.delete(item.item_id);}}
          className={`event-card${isCurrent ? " is-current" : ""}${entry.kind === "gap" ? " is-gap" : ""}`}>
          <button className="event-play" aria-current={isCurrent ? "true" : undefined}
            aria-label={`播放${entryTitle(entry)}，${formatMs(item.start_ms)}至${formatMs(item.end_ms)}`}
            onClick={() => {locateTarget.current = null; onPlayItem(item);}}>
            <span className="event-number">{entry.kind === "training" ? String(entry.ordinal).padStart(2, "0") : "·"}</span>
            <span className="event-copy"><span className="event-title">{entryTitle(entry)}{isCurrent && <small>当前</small>}</span>
              <span className="event-range">{formatMs(item.start_ms)}–{formatMs(item.end_ms)} <span>· {formatMs(item.end_ms - item.start_ms)}</span></span></span>
            <span className="event-play-icon" aria-hidden="true">▶</span>
          </button>
          <div className="event-card-footer"><div>{entry.kind === "training" && <><span className="training-type-tag" style={{color: TRAINING_TYPES[entry.trainingType].color}}>{entry.trainingTitle ?? TRAINING_TYPES[entry.trainingType].label}</span>{hits !== null && <span className="event-hits">{item.attributes.hit_count_estimated ? "约 " : ""}{hits} 次击球</span>}</>}</div>
            <div>{item.type === "RALLY" && <input type="checkbox" aria-label={`选择回合 ${entry.ordinal}`} disabled={props.selectionBusy} checked={selected.has(item.item_id)} onChange={() => onToggleSelect(item)}/>}
              <ExportButton entry={clipByItemId[item.item_id] ?? null} onExport={() => onExport(item)} onDownload={exported => onDownload(exported, item)}/></div>
          </div>
        </div>;
      })}
    </div>
    {!editMode && <div className="event-panel-footer"><span>{selected.size > 0 ? `已选 ${selected.size} 个回合` : "勾选相邻回合，可合并或用于练习"}</span>
      {selected.size > 0 && <><button className="btn btn-ghost btn-sm" disabled={props.selectionBusy} onClick={props.onClearSelection}>清空选择</button>
        <button className="btn btn-primary btn-sm" disabled={props.selectionBusy || selected.size < 2 || !props.selectionAdjacent} onClick={props.onMergeSelected}>合并所选片段</button>
        <button className="btn btn-ghost btn-sm" disabled={props.selectionBusy || !props.selectionAdjacent} onClick={props.onPracticeSelected}>用于接发球练习</button>
        {!props.selectionAdjacent && <small>请选择时间线上连续相邻的回合（包括被筛选隐藏的回合）。</small>}</>}
      {highlight?.status === "READY" ? <button className="btn btn-primary btn-sm" onClick={onDownloadHighlight}>下载集锦</button> : <button className="btn btn-ghost btn-sm" disabled={!selected.size || highlight?.status === "RENDERING"} onClick={onCreateHighlight}>{highlight?.status === "RENDERING" ? "渲染中…" : "生成集锦"}</button>}</div>}
  </aside>;
}
