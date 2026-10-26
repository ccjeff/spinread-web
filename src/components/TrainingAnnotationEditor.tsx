import {useState} from "react";
import type {TrainingAction, TrainingAnnotation} from "../api/annotations";
import {editableTime, parseTime, replaceAnnotationRange} from "../utils/annotationRanges";

export interface AnnotationDraft {start_ms: number; end_ms: number; annotation?: TrainingAnnotation}
interface Props {
  draft: AnnotationDraft;
  segments: TrainingAnnotation[];
  durationMs: number;
  target: TrainingAnnotation["target"];
  currentMs: number;
  onSeek: (seconds: number) => void;
  onRangeChange: (start: number, end: number) => void;
  onSave: (segments: TrainingAnnotation[]) => Promise<void>;
  onClose: () => void;
}
const FEEDING = {RALLY: "连续对打", MULTIBALL: "多球喂球", SERVE_RECEIVE: "发接发", OTHER: "其他"};
const MOVEMENT = {FIXED: "定点", TWO_POINT: "两点", MOVING: "多点／跑位", UNSPECIFIED: "暂不确定"};
const blankAction = (): TrainingAction => ({hand: "UNSPECIFIED", stroke: "", incoming_spin: "UNKNOWN", movement: ""});

export default function TrainingAnnotationEditor({draft, segments, durationMs, target, currentMs, onSeek, onSave, onClose, onRangeChange}: Props) {
  const original = draft.annotation;
  const [start, setStart] = useState(editableTime(draft.start_ms));
  const [end, setEnd] = useState(editableTime(draft.end_ms));
  const [title, setTitle] = useState(original?.title ?? "");
  const [feeding, setFeeding] = useState<TrainingAnnotation["feeding"] | "">(original?.feeding ?? "");
  const [movement, setMovement] = useState<TrainingAnnotation["movement"]>(original?.movement ?? "UNSPECIFIED");
  const [player, setPlayer] = useState(original?.target ?? target);
  const [actions, setActions] = useState<TrainingAction[]>(original?.actions ?? [blankAction()]);
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const startMs = parseTime(start), endMs = parseTime(end);
  const validRange = startMs !== null && endMs !== null && endMs - startMs >= 1000 && endMs <= durationMs;
  const overlaps = validRange ? segments.filter(s => s.id !== original?.id && s.start_ms < endMs! && s.end_ms > startMs!) : [];
  function updateStart(value: string) {
    setStart(value);
    const ms = parseTime(value);
    if (ms !== null && endMs !== null && ms < endMs && endMs <= durationMs) onRangeChange(ms, endMs);
  }
  function updateEnd(value: string) {
    setEnd(value);
    const ms = parseTime(value);
    if (ms !== null && startMs !== null && ms > startMs && ms <= durationMs) onRangeChange(startMs, ms);
  }
  function updateAction(index: number, patch: Partial<TrainingAction>) {
    setActions(values => values.map((action, i) => i === index ? {...action, ...patch} : action));
  }
  async function persist(remove = false) {
    if (saving) return;
    if (!remove && (!validRange || !feeding)) {setError("请选择供球方式，并填写有效区间（至少 1 秒，不超过视频时长）。"); return;}
    setSaving(true); setError("");
    try {
      if (remove && original) await onSave(segments.filter(segment => segment.id !== original.id));
      else {
        const actionTitle = actions.filter(action => action.stroke.trim()).map(action => {
          const hand = {FOREHAND: "正手", BACKHAND: "反手", UNSPECIFIED: ""}[action.hand];
          const spin = {TOPSPIN: "上旋", BACKSPIN: "下旋", SIDESPIN: "侧旋", NO_SPIN: "不转", UNKNOWN: ""}[action.incoming_spin];
          return `${hand}${action.stroke.trim()}${spin ? `（${spin}）` : ""}`;
        }).join(" → ");
        const defaultTitle = [FEEDING[feeding as keyof typeof FEEDING], movement === "UNSPECIFIED" ? "" : MOVEMENT[movement], actionTitle].filter(Boolean).join(" · ");
        const annotation: TrainingAnnotation = {id: original?.id ?? crypto.randomUUID(), start_ms: startMs!, end_ms: endMs!,
          title: title.trim() || defaultTitle.slice(0, 100),
          feeding: feeding as TrainingAnnotation["feeding"], movement, target: player,
          actions: actions.filter(action => action.stroke.trim() || action.hand !== "UNSPECIFIED" || action.incoming_spin !== "UNKNOWN" || action.movement.trim()), notes};
        await onSave(replaceAnnotationRange(segments, annotation, original?.id));
      }
      onClose();
    } catch (reason) {setError(reason instanceof Error ? reason.message : "保存失败，请重试");}
    finally {setSaving(false);}
  }
  return <aside className="event-panel annotation-editor" aria-label="人工训练标注">
    <div className="event-panel-header"><div><span className="eyebrow">TRAINING NOTES</span><h3>{original ? "编辑训练标注" : "合并区间并标注"}</h3></div>
      <button className="btn btn-ghost btn-sm" disabled={saving} onClick={onClose}>取消</button></div>
    <div className="event-scroll">
      <form id="training-annotation-form" onSubmit={event => {event.preventDefault(); void persist();}}>
        <fieldset disabled={saving}>
          <p className="annotation-help">选中范围会成为一个训练段。原回合与击球记录保持不变。</p>
          <div className="annotation-range-fields">
            <label>开始时间<input aria-label="训练段开始时间" value={start} onChange={event => updateStart(event.target.value)} placeholder="38:00.000"/><button type="button" className="btn btn-ghost btn-sm" onClick={() => updateStart(editableTime(currentMs))}>使用当前时间</button></label>
            <label>结束时间<input aria-label="训练段结束时间" value={end} onChange={event => updateEnd(event.target.value)} placeholder="51:27.457"/><button type="button" className="btn btn-ghost btn-sm" onClick={() => updateEnd(editableTime(currentMs))}>使用当前时间</button></label>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={startMs === null || startMs > durationMs} onClick={() => startMs !== null && onSeek(startMs / 1000)}>定位区间起点</button>
          {!validRange && <p className="annotation-error">时间格式为 分:秒，区间至少 1 秒且在视频范围内。</p>}
          {overlaps.length > 0 && <p className="annotation-notice">将覆盖所选范围内的 {overlaps.length} 个人工训练段；范围外的部分保留原标注。</p>}
          <label>训练名称（可选）<input value={title} maxLength={100} placeholder="例如：反手转正手拉上旋" onChange={event => setTitle(event.target.value)}/></label>
          <div className="annotation-range-fields">
            <label>供球方式<select required value={feeding} onChange={event => setFeeding(event.target.value as typeof feeding)}><option value="">请选择</option>{Object.entries(FEEDING).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
            <label>移动方式<select value={movement} onChange={event => setMovement(event.target.value as typeof movement)}>{Object.entries(MOVEMENT).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
          </div>
          <label>本段目标球员<select value={player} onChange={event => setPlayer(event.target.value as typeof player)}>{Object.entries({NEAR: "近端", FAR: "远端", LEFT: "左侧", RIGHT: "右侧", UNSPECIFIED: "暂不指定"}).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
          <div className="annotation-section-title"><h4>动作顺序</h4><span>单项可只填一步</span></div>
          <datalist id="training-strokes">{["攻球", "拉球", "搓球", "推挡", "拧拉", "摆短", "劈长", "发球", "接发球"].map(stroke => <option key={stroke} value={stroke}/>)}</datalist>
          {actions.map((action, index) => <div className="annotation-action" key={index}>
            <div className="annotation-action-heading"><strong>第 {index + 1} 步</strong><div>
              <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} aria-label={`上移第 ${index + 1} 步`} onClick={() => setActions(values => {const next = [...values]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next;})}>↑</button>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={`删除第 ${index + 1} 步`} onClick={() => setActions(values => values.filter((_, i) => i !== index))}>移除</button>
            </div></div>
            <div className="annotation-range-fields">
              <label>正反手<select aria-label={`第 ${index + 1} 步正反手`} value={action.hand} onChange={event => updateAction(index, {hand: event.target.value as TrainingAction["hand"]})}><option value="UNSPECIFIED">暂不指定</option><option value="FOREHAND">正手</option><option value="BACKHAND">反手</option></select></label>
              <label>技术动作<input aria-label={`第 ${index + 1} 步技术动作`} list="training-strokes" value={action.stroke} maxLength={80} placeholder="选择或输入" onChange={event => updateAction(index, {stroke: event.target.value})}/></label>
            </div>
            <label>来球旋转<select aria-label={`第 ${index + 1} 步来球旋转`} value={action.incoming_spin} onChange={event => updateAction(index, {incoming_spin: event.target.value as TrainingAction["incoming_spin"]})}>{Object.entries({UNKNOWN: "不确定／不指定", TOPSPIN: "上旋", BACKSPIN: "下旋", SIDESPIN: "侧旋", NO_SPIN: "不转"}).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
            <label>跑位／衔接说明<input aria-label={`第 ${index + 1} 步跑位说明`} value={action.movement} maxLength={120} placeholder="例如：从反手位跑到正手位" onChange={event => updateAction(index, {movement: event.target.value})}/></label>
          </div>)}
          <button type="button" className="btn btn-ghost" disabled={actions.length >= 20} onClick={() => setActions(values => [...values, blankAction()])}>＋ 添加下一步</button>
          <label>备注<textarea rows={3} maxLength={2000} value={notes} placeholder="例如：两步循环，重点练习衔接" onChange={event => setNotes(event.target.value)}/></label>
          {original && <button type="button" className="btn btn-ghost annotation-remove" onClick={() => void persist(true)}>移除人工标注，恢复自动脉络</button>}
        </fieldset>
      </form>
    </div>
    <div className="annotation-save-area">{error && <p role="alert" className="annotation-error">{error}</p>}<button form="training-annotation-form" type="submit" className="btn btn-primary" disabled={saving || !validRange || !feeding}>{saving ? "保存中…" : original ? "保存标注" : "合并并保存标注"}</button></div>
  </aside>;
}
