import { useEffect, useState } from "react";
import { loopApi } from "../api/loop";
import type { Context, ContextData } from "../api/loop";
const FIELDS = {practice_context: "训练场景（如：短球接发球）", target_identity: "目标球员（同一人使用相同名称）", camera_setup: "录制机位（如：球台侧面固定机位）", opponent_or_feeder: "对手 / 喂球方式（单人练习请注明）"};
export default function ContextEditor({videoId, readOnly = false}: {videoId: string; readOnly?: boolean}) {
  const [data, setData] = useState<ContextData | null>(null);
  const [form, setForm] = useState<Context>({practice_context: "", target_identity: "", camera_setup: "", opponent_or_feeder: ""});
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {let alive = true; loopApi.context(videoId).then(x => {if (alive) {setData(x); setForm({practice_context: "", target_identity: "", camera_setup: "", opponent_or_feeder: "", ...x.context});}}).catch(e => {if(alive) setMessage(e.message);}); return () => {alive = false;};}, [videoId]);
  async function save() {if (!data) return; setBusy(true); try {setData(await loopApi.saveContext(videoId, data.version, form)); setMessage("录制场景已保存");} catch (e) {setMessage(e instanceof Error ? e.message : "保存失败");} finally {setBusy(false);}}
  return <details className="context-editor"><summary>录制场景 · 用于复测可比性检查</summary><p className="muted">按实际录制情况填写。相同条件使用相同名称；未知条件不要猜测。</p><div className="loop-fields">{Object.entries(FIELDS).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input maxLength={120} disabled={readOnly || busy} value={form[key as keyof Context]} onChange={e => setForm({...form, [key]: e.target.value})}/></label>)}</div>{!readOnly && <button className="btn btn-ghost" disabled={busy || !data || Object.values(form).some(x => !x.trim())} onClick={() => void save()}>保存录制场景</button>}{message && <p role="status">{message}</p>}</details>;
}
