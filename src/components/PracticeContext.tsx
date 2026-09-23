import { useState } from "react";
import type { PracticeContextData, PracticeType, PracticeWindow } from "../api/quiz";
import { PRACTICE_TYPES } from "../api/quiz";
import { formatMs } from "../utils/format";

export default function PracticeContext({data, selectedId, onSelect, onPreview, onReview, busy}: {
  data: PracticeContextData; selectedId: string | null;
  onSelect: (id: string) => void; onPreview: (w: PracticeWindow) => void;
  onReview: (w: PracticeWindow, type: PracticeType | null) => Promise<void>; busy: boolean;
}) {
  const index = Math.max(0, data.windows.findIndex(w => w.id === selectedId));
  const w = data.windows[index];
  const [choice, setChoice] = useState<{key: string; label: PracticeType} | null>(null);
  const key = `${w?.id}:${w?.revision}:${w?.decision.type}`;
  const label = choice?.key === key ? choice.label : w?.label ?? w?.decision.type ?? "UNKNOWN";
  if (!w) return <p className="quiz-note">先生成候选，准备画面与击球节奏特征，再确认练习类型。</p>;
  return <section className="practice-context" aria-label="练习类型分类">
    <h2>先判断练习类型</h2>
    <p className="muted">回看 20 秒上下文，区分连续对练和发接发。混合、遮挡或拿不准时选“不确定”。此分类不代表具体发球位置已确认。</p>
    <label className="field"><span>选择视频区间</span><select value={w.id} onChange={e => onSelect(e.target.value)}>
      {data.windows.map(x => <option key={x.id} value={x.id}>{formatMs(x.start_ms)}–{formatMs(x.end_ms)} · {PRACTICE_TYPES[x.decision.type]}</option>)}
    </select></label>
    <div className="quiz-toolbar">
      <button className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => onSelect(data.windows[index - 1].id)}>上一段</button>
      <button className="btn btn-primary btn-sm" onClick={() => onPreview(w)}>播放上下文</button>
      <button className="btn btn-ghost btn-sm" disabled={index + 1 === data.windows.length} onClick={() => onSelect(data.windows[index + 1].id)}>下一段</button>
    </div>
    <p><strong>{PRACTICE_TYPES[w.decision.type]}</strong> · {w.decision.source === "USER" ? "你已确认" : w.decision.source === "ASSISTANT_REVIEW" ? "初始画面复核 · 可纠正" : "AI 建议 · 待复核"}</p>
    <label className="field"><span>确认或纠正这段练习的类型</span><select value={label} onChange={e => setChoice({key, label: e.target.value as PracticeType})}>
      {Object.entries(PRACTICE_TYPES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select></label>
    <div className="quiz-toolbar"><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void onReview(w, label)}>保存分类</button>
      {w.label !== null && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void onReview(w, null)}>撤回确认，交回 AI 判断</button>}</div>
    <p className="muted">分类器仅使用本视频已复核的例子：对练 {data.model.examples.RALLY}、发接发 {data.model.examples.SERVE_RECEIVE}、其他 {data.model.examples.OTHER}。
      {data.model.ready ? "纠正后会更新其他区间的建议。小样本模型，准确率尚未验证。" : "每类至少确认 3 段后开始自动分类；此前保持不确定。"}</p>
  </section>;
}
