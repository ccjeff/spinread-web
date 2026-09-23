import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import ContextEditor from "../components/ContextEditor";
import { api, ApiError } from "../api/client";
import { loopApi, METRICS, SOURCES, comparisonReason } from "../api/loop";
import type { Plan, PlanItem, Criteria, Drill, Retest } from "../api/loop";
import type { User, VideoSummary, AnalysisReport } from "../api/types";
import { formatDateTime } from "../utils/format";

const DEFAULT_CRITERIA: Criteria = {context: "", metric: "active_fraction", minimum_samples: 10, direction: "increase", relative_threshold: .2};
const DEFAULT_DRILL: Drill = {description: "", target_repetitions: 50, sessions: 3};

export default function TrainingPage() {
  const [params] = useSearchParams();
  const [me, setMe] = useState<User | null>(null); const [plan, setPlan] = useState<Plan | null>(null);
  const [videos, setVideos] = useState<VideoSummary[]>([]); const [videoId, setVideoId] = useState(params.get("video") ?? "");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const [creating, setCreating] = useState(false);
  const playerId = params.get("player") ?? me?.id;
  const coaching = !!me && !!playerId && playerId !== me.id;
  const refresh = useCallback(async () => {if (!playerId) return; setError(""); setPlan((await loopApi.plan(playerId)).plan);}, [playerId]);
  useEffect(() => {let alive = true; Promise.all([loopApi.me(), api.listVideos()]).then(async ([user, list]) => {
    const requested = params.get("video"); if (requested && !list.some(v => v.id === requested)) list = [await api.getVideo(requested), ...list];
    if (params.get("player") && params.get("player") !== user.id) list = list.filter(v => v.id === requested);
    if (alive) {setMe(user); setVideos(list); setVideoId(old => old || list.find(v => v.state === "READY" || v.state === "PARTIAL_READY")?.id || "");}
  }).catch(e => {if(alive) setError(e.message);}); return () => {alive = false;};}, [params]);
  useEffect(() => {void refresh().catch(e => setError(e.message));}, [refresh]);
  useEffect(() => {let alive = true; setReport(null); if (videoId) api.getActiveReport(videoId).then(r => {if(alive) setReport(r);}).catch(e => {if(alive && !(e instanceof ApiError && e.status === 404)) setError(e.message);}); return () => {alive=false;};}, [videoId]);
  async function run(action: () => Promise<unknown>, message: string) {setBusy(true); setError(""); try {const result = await action(); await refresh(); setNotice(typeof result === "string" ? result : message);} catch(e) {setError(e instanceof Error ? e.message : "操作失败");} finally {setBusy(false);}}
  return <div className="page"><TopBar/><main className="container loop-container"><div className="page-header"><div><h1>{coaching ? "球员训练计划" : "我的训练计划"}</h1><p className="muted">系统整理证据，球员记录练习，教练指导与修订，再用相同条件的视频复测。</p></div><Link to={coaching ? "/coach" : "/coaching"}>{coaching ? "教练工作台 →" : "教练协作 →"}</Link></div>
    {error && <div role="alert" className="banner banner-error">{error}<button className="btn btn-ghost" onClick={() => void refresh().catch(e => setError(e.message))}>刷新</button></div>}{notice && <p role="status">{notice}</p>}
    <section className="card loop-card"><h2>从报告开始</h2><label className="field"><span>来源视频</span><select value={videoId} onChange={e => {setVideoId(e.target.value); setCreating(false);}}><option value="">选择视频</option>{videos.map(v => <option key={v.id} value={v.id}>{v.filename}</option>)}</select></label>
      {videoId && <ContextEditor key={videoId} videoId={videoId} readOnly={coaching}/>}
      <div className="video-list-toolbar">{!coaching && <button className="btn btn-primary" disabled={busy || !report} onClick={() => void run(async () => {const r = await loopApi.generate(report!.report_id); if (!r.added) return "没有新增的可用发现；可手动创建任务。";}, "报告建议已加入计划；已有任务和教练锁定内容保留。")}>从报告生成建议（最多 3 项）</button>}
        <button className="btn btn-ghost" disabled={busy || !report} onClick={() => setCreating(!creating)}>手动创建训练任务</button>{videoId && <Link to={coaching ? `/coach/videos/${videoId}` : `/videos/${videoId}`}>回看报告与视频</Link>}</div>
      {!report && <p className="muted">请选择已生成报告的视频。</p>}
      {creating && report && <ItemEditor key={report.report_id} busy={busy} onSave={values => run(async () => {await loopApi.createItem({report_id: report.report_id, title: values.title, priority: values.priority, drill: values.drill, retest: values.retest}); setCreating(false);}, "训练任务已创建")}/>}
    </section>
    {!plan?.items.length ? <p className="quiz-empty">还没有训练任务。可从报告生成建议，或和教练一起制定任务。</p> : plan.items.map(item => <TrainingCard key={`${item.id}:${item.version}`} item={item} coaching={coaching} videos={videos} busy={busy} onEdit={changes => run(() => loopApi.editItem(item, changes), "训练任务已保存")}/>)}
  </main></div>;
}

interface ItemValues {title: string; priority: number; drill: Drill; retest: Criteria; locked_by_coach: boolean}
function ItemEditor({item, busy, coaching = false, onSave}: {item?: PlanItem; busy: boolean; coaching?: boolean; onSave: (v: ItemValues) => Promise<void>}) {
  const [values, setValues] = useState<ItemValues>({title: item?.title ?? "", priority: item?.priority ?? 1, drill: item?.drill ?? DEFAULT_DRILL, retest: item?.retest ?? DEFAULT_CRITERIA, locked_by_coach: item?.locked_by_coach ?? false});
  return <form className="loop-form" onSubmit={e => {e.preventDefault(); void onSave(values);}}><label className="field"><span>任务名称</span><input required maxLength={200} value={values.title} onChange={e => setValues({...values, title: e.target.value})}/></label>
    <label className="field"><span>练习方法 / 复核步骤</span><textarea required maxLength={3000} value={values.drill.description} onChange={e => setValues({...values, drill: {...values.drill, description: e.target.value}})}/></label>
    <div className="loop-fields"><label className="field"><span>每次目标次数</span><input type="number" required min={1} max={10000} value={values.drill.target_repetitions} onChange={e => setValues({...values, drill: {...values.drill, target_repetitions: +e.target.value}})}/></label><label className="field"><span>计划次数</span><input type="number" required min={1} max={100} value={values.drill.sessions} onChange={e => setValues({...values, drill: {...values.drill, sessions: +e.target.value}})}/></label><label className="field"><span>优先级（1 最高）</span><input type="number" min={1} max={100} required value={values.priority} onChange={e => setValues({...values, priority: +e.target.value})}/></label></div>
    <h3>复测标准</h3><label className="field"><span>训练场景（与视频的录制场景一致）</span><input required maxLength={120} value={values.retest.context} onChange={e => setValues({...values, retest: {...values.retest, context: e.target.value}})}/></label>
    <div className="loop-fields"><label className="field"><span>比较指标</span><select value={values.retest.metric} onChange={e => setValues({...values, retest: {...values.retest, metric: e.target.value}})}>{Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="field"><span>最少样本数</span><input required type="number" min={4} max={10000} value={values.retest.minimum_samples} onChange={e => setValues({...values, retest: {...values.retest, minimum_samples: +e.target.value}})}/></label><label className="field"><span>变化方向</span><select value={values.retest.direction} onChange={e => setValues({...values, retest: {...values.retest, direction: e.target.value as Criteria["direction"]}})}><option value="increase">增加</option><option value="decrease">减少</option></select></label><label className="field"><span>相对变化目标（%）</span><input required type="number" min={0} max={500} value={values.retest.relative_threshold * 100} onChange={e => setValues({...values, retest: {...values.retest, relative_threshold: +e.target.value / 100}})}/></label></div>
    {coaching && <label><input type="checkbox" checked={values.locked_by_coach} onChange={e => setValues({...values, locked_by_coach: e.target.checked})}/>锁定训练内容；球员仍可记录进度和感受</label>}
    <button className="btn btn-primary" disabled={busy} type="submit">保存训练任务</button></form>;
}

function TrainingCard({item, coaching, videos, busy, onEdit}: {item: PlanItem; coaching: boolean; videos: VideoSummary[]; busy: boolean; onEdit: (v: Record<string,unknown>) => Promise<void>}) {
  const [editing, setEditing] = useState(false); const [note, setNote] = useState(item.player_note); const [videoId, setVideoId] = useState("");
  const [results, setResults] = useState<Retest[]>([]); const [error, setError] = useState(""); const [comparing, setComparing] = useState(false);
  useEffect(() => {loopApi.retests(item).then(r => setResults(r.items)).catch(e => setError(e.message));}, [item]);
  async function retest() {setComparing(true); setError(""); try {await loopApi.retest(item, videoId); setResults((await loopApi.retests(item)).items);} catch(e) {setError(e instanceof Error ? e.message : "复测失败");} finally {setComparing(false);}}
  return <section className="card loop-card"><div className="page-header"><h2>{item.priority}. {item.title}</h2><span>{({ACTIVE:"进行中",DONE:"已完成",DROPPED:"已暂停"} as Record<string,string>)[item.status]} · v{item.version}</span></div><p className="muted">{SOURCES[item.source]}{item.locked_by_coach ? " · 教练已锁定" : ""}</p>
    {item.baseline_stale && <p className="banner banner-warn">来源时间线或报告已更新。此任务保留历史，但复测不能直接使用旧基线。</p>}
    <p className="preserve-lines">{item.drill.description}</p><p>每次 {item.drill.target_repetitions} 次 · 共 {item.drill.sessions} 次训练</p><p>复测：{item.retest.context} · {METRICS[item.retest.metric as keyof typeof METRICS]} · 至少 {item.retest.minimum_samples} 个样本 · {item.retest.direction === "increase" ? "增加" : "减少"} {(item.retest.relative_threshold * 100).toFixed(0)}%</p>
    <div className="video-list-toolbar"><Link to={coaching ? `/coach/videos/${item.video_id}` : `/videos/${item.video_id}`}>查看来源证据</Link>{(!item.locked_by_coach || coaching) && <button className="btn btn-ghost" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "收起编辑" : "修改训练任务"}</button>}</div>
    {editing && <ItemEditor item={item} busy={busy} coaching={coaching} onSave={async v => {const changes = {title: v.title, priority: v.priority, drill: v.drill, retest: v.retest}; await onEdit(coaching ? v : changes);}}/>}
    {!coaching ? <><label className="field"><span>我的训练记录 / 给教练的问题</span><textarea value={note} maxLength={4000} onChange={e => setNote(e.target.value)}/></label><div className="video-list-toolbar"><button className="btn btn-ghost" disabled={busy} onClick={() => void onEdit({player_note:note})}>保存记录</button>{["ACTIVE","DONE","DROPPED"].map(status => <button className="btn btn-ghost" key={status} disabled={busy || status === item.status} onClick={() => void onEdit({status, player_note:note})}>{({ACTIVE:"继续训练",DONE:"标记完成",DROPPED:"暂停任务"} as Record<string,string>)[status]}</button>)}</div>
      <h3>提交复测视频</h3><label className="field"><span>另一次训练的视频</span><select value={videoId} onChange={e => setVideoId(e.target.value)}><option value="">选择已完成分析的视频</option>{videos.filter(v => v.id !== item.video_id && ["READY","PARTIAL_READY"].includes(v.state)).map(v => <option value={v.id} key={v.id}>{v.filename}</option>)}</select></label>{videoId && <ContextEditor key={videoId} videoId={videoId}/>}<button className="btn btn-primary" disabled={busy || comparing || !videoId} onClick={() => void retest()}>{comparing ? "检查可比性…" : "检查并保存复测结果"}</button></> : item.player_note && <p className="quiz-note preserve-lines">球员记录：{item.player_note}</p>}
    {error && <p role="alert" className="banner banner-error">{error}</p>}
    {results.map(r => <div className="retest-result" key={r.id}><strong>{formatDateTime(r.created_at)} · 任务 v{r.plan_item_version}</strong>{r.result.comparable ? <p>相对变化 {((r.result.relative_change ?? 0)*100).toFixed(1)}% · {r.result.success ? "达到本任务的复测目标" : "尚未达到本任务的复测目标"}</p> : <><p>本次不能直接比较</p><ul>{r.result.reasons.map(reason => <li key={reason}>{comparisonReason(reason)}</li>)}</ul></>}<p className="muted">{r.result.limitations.join(" ")} 此记录保留提交时的场景与指标快照。</p></div>)}
    {!!item.history.length && <details><summary>修改历史（{item.history.length}）</summary>{item.history.map(h => <p key={h.version}>v{h.version} · {h.title} · {SOURCES[h.source]} · {formatDateTime(h.changed_at)}</p>)}</details>}
  </section>;
}
