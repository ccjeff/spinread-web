import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import QuizVideo from "../components/QuizVideo";
import { quizApi, SPINS, LENGTHS, RECEIVES } from "../api/quiz";
import type { QuizAnswer, QuizAttempt, QuizItem } from "../api/quiz";

const emptyAnswer: QuizAnswer = {spin: "UNKNOWN", length: "UNKNOWN", receive: "UNKNOWN", note: ""};

function Exercise({item, onNext, onCompleted}: {item: QuizItem; onNext: () => void; onCompleted: () => void}) {
  const [answer, setAnswer] = useState<QuizAnswer>({...emptyAnswer});
  const [confidence, setConfidence] = useState(3);
  const [watched, setWatched] = useState(false);
  const [result, setResult] = useState<QuizAttempt | null>(null);
  const [history, setHistory] = useState<QuizAttempt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [started] = useState(() => Date.now());
  const [pendingRequest, setPendingRequest] = useState(false);
  // Preserve the exact request on network failures; retries cannot duplicate an attempt.
  const request = useRef<{key: string; body: {item_version: number; answer: QuizAnswer; confidence: number; elapsed_ms: number}} | null>(null);
  useEffect(() => {
    let cancelled = false;
    quizApi.history(item.id).then(rows => {if (!cancelled) setHistory(rows);}).catch(() => {if (!cancelled) setError("历史记录加载失败；可继续练习。");});
    return () => {cancelled = true;};
  }, [item.id]);
  async function submit() {
    setBusy(true); setError("");
    request.current ??= {key: crypto.randomUUID(), body: {item_version: item.version, answer: {...answer}, confidence, elapsed_ms: Math.min(Date.now() - started, 86400000)}};
    setPendingRequest(true);
    try {
      const a = await quizApi.attempt(item.id, request.current.body, request.current.key);
      setResult(a); setHistory(prev => [a, ...prev]); onCompleted();
    } catch (e) {setError(e instanceof Error ? e.message : "提交失败，可重试");} finally {setBusy(false);}
  }
  return <div className="quiz-practice-grid"><section>
    <div className="quiz-step">{result ? "03 / 看后续 · 复盘自己的判断" : watched ? "02 / 做判断 · 选择你的接法" : "01 / 观察发球 · 接球前自动暂停"}</div>
    <QuizVideo key={result ? "continuation" : "prompt"} videoId={item.video_id} startMs={result ? item.pause_ms : item.start_ms} endMs={result ? item.end_ms : item.pause_ms} onBoundary={() => setWatched(true)}/>
    <p className="quiz-note">{result ? "真实接球结果用于对照观察，不代表唯一正确接法。" : "可以重播和慢放。提交判断后才能观看这次接球的后续画面。"}</p>
  </section><section className="card quiz-answer">
    <h2>{result ? "你的观察已记录" : "如果是你，这一球怎么接？"}</h2>
    <p className="muted">私人观察练习 · 参考答案尚未核实 · 不计分</p>
    {error && <p className="banner banner-error" role="alert">{error}</p>}
    {result ? <><p className="quiz-feedback">{result.feedback}</p><dl className="quiz-recap"><dt>旋转判断</dt><dd>{SPINS[result.answer.spin as keyof typeof SPINS]}</dd><dt>长短判断</dt><dd>{LENGTHS[result.answer.length as keyof typeof LENGTHS]}</dd><dt>接法选择</dt><dd>{RECEIVES[result.answer.receive as keyof typeof RECEIVES]}</dd><dt>自信程度</dt><dd>{result.confidence} / 5</dd></dl>{result.answer.note && <blockquote>{result.answer.note}</blockquote>}<button className="btn btn-primary" onClick={onNext}>下一条练习</button></> : <form onSubmit={e => {e.preventDefault(); void submit();}}>
      {([["spin", "你判断的旋转", SPINS], ["length", "来球长短", LENGTHS], ["receive", "你会选择的接法", RECEIVES]] as const).map(([key, label, options]) => <label className="field" key={key}><span>{label}</span><select disabled={busy || pendingRequest} value={answer[key]} onChange={e => setAnswer({...answer, [key]: e.target.value})}>{Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}
      <label className="field"><span>自信程度：{confidence} / 5</span><input type="range" min="1" max="5" value={confidence} disabled={busy || pendingRequest} onChange={e => setConfidence(Number(e.target.value))}/><small className="muted">1 不确定 · 5 很确定</small></label>
      <label className="field"><span>观察依据 / 想和教练讨论的问题</span><textarea maxLength={2000} rows={3} value={answer.note} disabled={busy || pendingRequest} placeholder="例如：触球动作相似，我如何分辨侧上与侧下？" onChange={e => setAnswer({...answer, note: e.target.value})}/></label>
      <button className="btn btn-primary btn-block" disabled={busy || !watched}>{busy ? "正在保存…" : pendingRequest ? "重试提交同一次判断" : "提交判断，观看后续"}</button>{!watched && <p className="muted">先播放发球片段，到暂停点后即可提交。</p>}
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={onNext}>跳过这一条</button>
    </form>}
    {history.length > 0 && <details className="quiz-history"><summary>我的历史判断（{history.length}）</summary>{history.map(a => <div key={a.id}><small>{new Date(a.created_at).toLocaleString()}{a.quiz_item_id !== item.id ? " · 较早题目版本" : ""}</small><p>{SPINS[a.answer.spin as keyof typeof SPINS]} · {LENGTHS[a.answer.length as keyof typeof LENGTHS]} · {RECEIVES[a.answer.receive as keyof typeof RECEIVES]} · 自信 {a.confidence}/5</p>{a.answer.note && <p>{a.answer.note}</p>}</div>)}</details>}
  </section></div>;
}

export default function QuizPracticePage() {
  const [params] = useSearchParams();
  const video = params.get("video") ?? undefined;
  const [items, setItems] = useState<QuizItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(0);
  useEffect(() => {
    let cancelled = false; setItems(null); setIndex(0); setCompleted(0); setError("");
    quizApi.recommended(video).then(data => {
      if (!cancelled) {setItems([...data.items].sort((a, b) => Number(a.attempted) - Number(b.attempted))); setCompleted(data.items.filter(i => i.attempted).length);}
    }).catch(e => {if (!cancelled) setError(e instanceof Error ? e.message : "加载练习失败");});
    return () => {cancelled = true;};
  }, [video, round]);
  const item = items?.[index];
  return <div className="page"><TopBar/><main className="container quiz-container"><div className="page-header"><div><p className="quiz-eyebrow">SPINREAD / 接发球决策练习</p><h1>观察、判断，再看真实后续。</h1><p className="muted">把场上的一瞬间，变成下一次训练可以讨论的具体问题。</p></div><Link className="btn btn-ghost" to={video ? `/videos/${video}/quizzes` : "/"}>选择 / 确认片段</Link></div>
    {error && <div role="alert" className="banner banner-error">{error}<button className="btn btn-ghost" onClick={() => setRound(r => r + 1)}>重试</button></div>}
    {items === null ? !error && <p>正在准备练习…</p> : items.length === 0 ? <div className="card quiz-empty"><h2>还没有确认好的发球片段</h2><p>从训练视频中寻找候选，确认边界后就能开始。没有参考答案也可以练习观察。</p><Link className="btn btn-primary" to={video ? `/videos/${video}/quizzes` : "/"}>去准备片段</Link></div> : !item ? <div className="card quiz-empty"><h2>本轮练习已结束</h2><p>当前题库已有 {completed} / {items.length} 条留下判断记录。跳过的片段可以下次继续；这里不计算正确率。</p><button className="btn btn-primary" onClick={() => setRound(r => r + 1)}>再练一轮</button></div> : <><div className="quiz-toolbar"><span>第 {index + 1} / {items.length} 条</span><span className="muted">{item.attempted ? "再次观察" : "未练习"} · 题目 v{item.version}</span></div><Exercise key={`${item.id}-${round}`} item={item} onNext={() => setIndex(i => i + 1)} onCompleted={() => {if (!item.attempted) {setCompleted(n => n + 1); setItems(prev => prev?.map(i => i.id === item.id ? {...i, attempted: true} : i) ?? null);}}}/></>}
  </main></div>;
}
