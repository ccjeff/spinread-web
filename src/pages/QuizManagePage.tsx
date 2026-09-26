import PracticeSourcePicker from "../components/PracticeSourcePicker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import Player from "../components/Player";
import type { PlayerHandle } from "../components/Player";
import PracticeContext from "../components/PracticeContext";
import { quizApi, PRACTICE_TYPES } from "../api/quiz";
import type { QuizCollection, QuizEdit, QuizItem, PracticeType, PracticeWindow } from "../api/quiz";
import { formatMs } from "../utils/format";

const EDGES = {start_ms: "开始", contact_ms: "发球触球", pause_ms: "接球前暂停", end_ms: "结束"} as const;
type Edge = keyof typeof EDGES;

export default function QuizManagePage() {
  const {id = ""} = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<QuizCollection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<QuizItem | null>(null);
  const [draft, setDraft] = useState<QuizEdit | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [filter, setFilter] = useState("DRAFT");
  const [practiceFilter, setPracticeFilter] = useState("SERVE_RECEIVE");
  const [windowId, setWindowId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const player = useRef<PlayerHandle>(null);
  const stopAt = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    try {setData(await quizApi.list(id)); setError("");} catch (e) {setError(e instanceof Error ? e.message : "加载失败");}
  }, [id]);
  useEffect(() => {void refresh();}, [refresh]);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);
  const status = data?.generation?.status;
  useEffect(() => {
    if (status !== "QUEUED" && status !== "RUNNING") return;
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [status, refresh]);

  function chooseRange(start: number, end: number) {
    if (!data || busy) return;
    if (draft && !window.confirm("放弃当前未保存的片段调整？")) return;
    player.current?.pause(); stopAt.current = null; setSelected(null); setConfirmed(false);
    setDraft({timeline_version: data.timeline_version, start_ms: start, end_ms: end,
      contact_ms: start + Math.round((end - start) / 3), pause_ms: start + Math.round((end - start) * 2 / 3), approval: "DRAFT"});
    player.current?.seekTo(start / 1000);
  }

  useEffect(() => {
    if (!data || !searchParams.has("start")) return;
    const start = Number(searchParams.get("start")), end = Number(searchParams.get("end"));
    const version = Number(searchParams.get("version"));
    if (version !== data.timeline_version) setError("所选片段的时间线已更新，请重新选择回合。");
    else if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= data.duration_ms) {
      setSelected(null); setConfirmed(false);
      setDraft({timeline_version: version, start_ms: start, end_ms: end,
        contact_ms: start + Math.round((end - start) / 3), pause_ms: start + Math.round((end - start) * 2 / 3), approval: "DRAFT"});
      player.current?.seekTo(start / 1000);
    } else setError("所选时间范围无效，请重新选择。");
    setSearchParams({}, {replace: true});
  }, [data, searchParams, setSearchParams]);

  function edit(item: QuizItem | null) {
    if (!data) return;
    if (draft && !window.confirm("放弃当前未保存的片段调整？")) return;
    player.current?.pause(); stopAt.current = null; setSelected(item); setConfirmed(false);
    setDraft({timeline_version: data.timeline_version, base_version: item?.version,
      start_ms: item?.start_ms ?? 0, contact_ms: item?.contact_ms ?? 1500,
      pause_ms: item?.pause_ms ?? 2300, end_ms: item?.end_ms ?? Math.min(data.duration_ms, 6000), approval: "DRAFT"});
    if (item) {player.current?.seekTo(item.start_ms / 1000); setWindowId(item.practice?.id ?? null);}
  }
  async function generate() {
    setBusy(true); setError("");
    try {await quizApi.generate(id); await refresh();} catch (e) {setError(e instanceof Error ? e.message : "生成失败");} finally {setBusy(false);}
  }
  async function save(approval: QuizItem["approval"]) {
    if (!draft) return;
    setBusy(true); setError("");
    try {
      await quizApi.save(id, {...draft, approval}, selected?.id);
      setDraft(null); setSelected(null); setConfirmed(false); player.current?.pause();
      setFilter(approval); setPracticeFilter("ALL"); setPage(0); setShowSaved(true);
      setSavedMessage(approval === "APPROVED" ? "已加入练习，可以点击上方开始练习。" : approval === "DRAFT" ? "已保存待确认，可在右侧已保存片段中继续编辑。" : "已排除此片段。");
      await refresh();
    } catch (e) {setError(e instanceof Error ? e.message : "保存失败");} finally {setBusy(false);}
  }
  async function reviewPractice(w: PracticeWindow, label: PracticeType | null) {
    if (!data) return;
    setBusy(true); setError("");
    try {await quizApi.reviewPractice(id, w, data.timeline_version, label); await refresh(); setPage(0);}
    catch (e) {setError(e instanceof Error ? e.message : "保存分类失败");} finally {setBusy(false);}
  }
  function practiceType(i: QuizItem): PracticeType {return i.approval === "APPROVED" ? "SERVE_RECEIVE" : i.practice?.decision.type ?? "UNKNOWN";}
  const available = data?.items.filter(i => !i.stale && i.approval === "APPROVED").length ?? 0;
  const statusItems = data?.items.filter(i => filter === "ALL" || (filter === "STALE" ? i.stale : !i.stale && i.approval === filter)) ?? [];
  const items = statusItems.filter(i => practiceFilter === "ALL" || practiceType(i) === practiceFilter);
  const valid = !!draft && !!data && [draft.start_ms, draft.contact_ms, draft.pause_ms, draft.end_ms].every(Number.isFinite)
    && draft.start_ms >= 0 && draft.start_ms < draft.contact_ms && draft.contact_ms < draft.pause_ms && draft.pause_ms < draft.end_ms
    && draft.end_ms <= data.duration_ms && draft.end_ms - draft.start_ms <= 30000;
  return <div className="page"><TopBar /><main className="container quiz-container">
    <Link to={`/videos/${id}`}>← 返回视频复盘</Link>
    <div className="page-header"><div><p className="quiz-eyebrow">发球练习 · 私人片段库</p><h1>{data?.filename ?? "准备发球练习"}</h1><p className="muted">从标记的发接发训练选择片段，确认触球与暂停位置，再开始观察练习。</p></div>
      {available > 0 && <Link className="btn btn-primary" to={`/practice?video=${id}`}>开始练习 · {available} 条</Link>}</div>
    {savedMessage && <p role="status" className="banner">{savedMessage}</p>}
    {error && <div role="alert" className="banner banner-error">{error} <button className="btn btn-ghost" onClick={() => void refresh()}>刷新列表</button></div>}
    {!data ? <p>正在加载片段…</p> : <>
      <div className="quiz-toolbar"><button className="btn btn-primary" disabled={busy || status === "QUEUED" || status === "RUNNING" || status === "READY"} onClick={() => void generate()}>{status === "QUEUED" || status === "RUNNING" ? "正在寻找候选片段…" : status === "READY" ? "候选已生成" : status === "FAILED" ? "重试生成候选" : "寻找发球候选"}</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => edit(null)}>手动圈定片段</button><span className="muted">{available} 条可练习 · {data.items.filter(i => !i.stale && i.approval === "DRAFT").length} 条待确认</span></div>
      {data.generation?.error && <p className="banner banner-error">{data.generation.error}</p>}
      <p className="quiz-note">可从右侧训练回合直接选片，无需等待自动候选。确认片段不代表确认旋转答案，练习暂不计分。</p>

      <div className="quiz-workspace"><section className="quiz-editor card">
        <Player ref={player} videoId={id} onTimeUpdate={seconds => {if (stopAt.current !== null && seconds >= stopAt.current) {player.current?.pause(); stopAt.current = null;}}}/>
        <details className="quiz-history"><summary>辅助分类（可选）</summary><PracticeContext data={data.practice} selectedId={windowId} onSelect={setWindowId} busy={busy} onReview={reviewPractice} onPreview={w => {player.current?.pause(); stopAt.current = w.end_ms / 1000; player.current?.seekTo(w.start_ms / 1000); player.current?.play();}} /></details>
        {draft ? <><h2>{selected ? "确认候选片段" : "圈定新的发球"}</h2><p className="muted">回看完整动作，依次设置四个时间点（秒）。新片段的触球和暂停位置只是占位，请按画面调整。暂停点应在对手接球前；超过 30 秒请先缩短范围。</p>
          <div className="quiz-edges">{Object.entries(EDGES).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input type="number" step="0.01" min="0" max={data.duration_ms / 1000} value={draft[key as Edge] / 1000} onChange={e => {setDraft({...draft, [key]: Math.round(Number(e.target.value) * 1000)}); setConfirmed(false);}}/><button className="btn btn-ghost btn-sm" onClick={() => {setDraft({...draft, [key]: Math.round((player.current?.currentTime() ?? 0) * 1000)}); setConfirmed(false);}}>取当前播放位置</button><button className="btn btn-ghost btn-sm" onClick={() => {stopAt.current = null; player.current?.pause(); player.current?.seekTo(draft[key as Edge] / 1000);}}>定位到此处</button></label>)}</div>
          {!valid && <p role="alert" className="banner banner-warn">请确保 开始 &lt; 发球触球 &lt; 暂停 &lt; 结束，且总长不超过 30 秒。</p>}
          <div className="quiz-toolbar"><button className="btn btn-ghost" disabled={!valid} onClick={() => {stopAt.current = draft.pause_ms / 1000; player.current?.seekTo(draft.start_ms / 1000); player.current?.play();}}>预览答题前片段</button><button className="btn btn-ghost" disabled={!valid} onClick={() => {stopAt.current = draft.end_ms / 1000; player.current?.seekTo(draft.pause_ms / 1000); player.current?.play();}}>预览真实后续</button></div>
          <label className="quiz-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>我已确认这是发球，准备动作可见，暂停点在接球前，后续画面完整。</label>
          <div className="quiz-toolbar"><button className="btn btn-primary" disabled={busy || !valid || !confirmed} onClick={() => void save("APPROVED")}>确认并加入练习</button><button className="btn btn-ghost" disabled={busy || !valid} onClick={() => void save("DRAFT")}>保存待确认</button>{selected && <button className="btn btn-ghost" disabled={busy || !valid} onClick={() => void save("WITHDRAWN")}>排除此片段</button>}<button className="btn btn-ghost" disabled={busy} onClick={() => {setDraft(null); setSelected(null);}}>取消</button></div>
        </> : <p className="quiz-empty">选择右侧候选开始确认，或手动圈定发球片段。</p>}
      </section><aside className="card quiz-candidates"><PracticeSourcePicker videoId={id} version={data.timeline_version} busy={busy} onChoose={chooseRange} onPreview={(start, end) => {player.current?.pause(); stopAt.current = end / 1000; player.current?.seekTo(start / 1000); player.current?.play();}}/>
        <details open={showSaved} onToggle={event => setShowSaved(event.currentTarget.open)}><summary>自动候选与已保存片段（{data.items.length}）</summary><h2>片段列表</h2><label className="field"><span>筛选</span><select value={filter} onChange={e => {setFilter(e.target.value); setPage(0);}}><option value="DRAFT">待确认</option><option value="APPROVED">可练习</option><option value="STALE">时间线已更新 · 待复核</option><option value="WITHDRAWN">已排除</option><option value="ALL">全部</option></select></label>
        <label className="field"><span>练习类型</span><select value={practiceFilter} onChange={e => {setPracticeFilter(e.target.value); setPage(0);}}>
          <option value="ALL">全部类型 · {statusItems.length}</option>{Object.entries(PRACTICE_TYPES).map(([type, label]) => <option value={type} key={type}>{label} · {statusItems.filter(i => practiceType(i) === type).length}</option>)}
        </select></label>
        {items.length === 0 && <p className="quiz-empty">此分类暂无片段。可切换到“不确定”复核，或手动补充。</p>}
        {items.slice(page * 12, page * 12 + 12).map(i => <button key={i.id} className={`quiz-candidate ${selected?.id === i.id ? "selected" : ""}`} onClick={() => edit(i)} disabled={busy}><strong>{formatMs(i.start_ms)}–{formatMs(i.end_ms)}</strong><span>{i.stale ? "时间线已更新，需重新确认" : i.approval === "APPROVED" ? "边界已确认 · 观察练习" : i.approval === "WITHDRAWN" ? "已排除" : practiceType(i) === "SERVE_RECEIVE" ? "疑似发球 · 待确认" : practiceType(i) === "UNKNOWN" ? "类型不确定 · 待复核" : "击球片段 · 非发接发建议"}</span><small>{PRACTICE_TYPES[practiceType(i)]} · {i.practice?.decision.source === "USER" ? "已复核" : i.practice?.decision.source === "ASSISTANT_REVIEW" ? "初始复核" : "待复核"}</small><small>暂停 {(i.pause_ms / 1000).toFixed(2)}s · v{i.version}{i.attempted ? " · 已练习" : ""}</small></button>)}
        <div className="quiz-toolbar"><button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button><span>{page + 1} / {Math.max(1, Math.ceil(items.length / 12))}</span><button className="btn btn-ghost" disabled={(page + 1) * 12 >= items.length} onClick={() => setPage(page + 1)}>下一页</button></div>
      </details></aside></div>
    </>}
  </main></div>;
}
