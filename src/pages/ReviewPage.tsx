import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import Player from "../components/Player";
import type { PlayerHandle } from "../components/Player";
import ReportPanel from "../components/ReportPanel";
import { loopApi, REVIEW_STATUS } from "../api/loop";
import type { ReviewDetail } from "../api/loop";
import { api } from "../api/client";
import type { User, AnalysisReport } from "../api/types";
import { formatDateTime, formatMs } from "../utils/format";
import { SPINS, LENGTHS, RECEIVES } from "../api/quiz";

export default function ReviewPage() {
  const {id = ""} = useParams(); const player = useRef<PlayerHandle>(null);
  const [me, setMe] = useState<User | null>(null); const [review, setReview] = useState<ReviewDetail | null>(null); const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [body, setBody] = useState("");
  const [timed, setTimed] = useState(false); const [start, setStart] = useState(0); const [end, setEnd] = useState(5);
  const refresh = useCallback(async () => {const [user, r] = await Promise.all([loopApi.me(), loopApi.review(id)]); setMe(user); setReview(r); try {setReport(await api.getActiveReport(r.video_id));} catch {setReport(null);}}, [id]);
  useEffect(() => {void refresh().catch(e => setError(e.message));}, [refresh]);
  const coaching = me?.id === review?.coach_id && me?.role === "COACH";
  const open = review && ["OPEN", "CLAIMED"].includes(review.status);
  async function feedback(complete: boolean) {if (!review) return; setBusy(true); setError(""); try {setReview(await loopApi.feedback(review, body.trim(), complete, timed ? {start_ms:Math.round(start*1000),end_ms:Math.round(end*1000)} : undefined)); setBody("");} catch(e) {setError(e instanceof Error ? e.message : "保存失败");} finally {setBusy(false);}}
  return <div className="page"><TopBar/><main className="container loop-container"><Link to="/coaching">← 教练协作</Link>{error && <p role="alert" className="banner banner-error">{error}</p>}{review ? <><div className="page-header"><div><h1>{review.filename}</h1><p>{review.player_name} → {review.coach_name} · {REVIEW_STATUS[review.status]}</p></div><Link className="btn btn-primary" to={`/training?video=${review.video_id}&player=${review.player_id}`}>查看与制定训练计划</Link></div>
    <p className="quiz-note preserve-lines">球员的问题：{review.question || "请根据视频提供指导"}</p>{review.stale && <p className="banner banner-warn">本次评审基于时间线 v{review.timeline_version}，当前时间线已更新。已有批注仍保留原始版本引用。</p>}
    <Player ref={player} videoId={review.video_id}/><ReportPanel playerId={review.player_id} report={report} unavailable={!report} stale={false} onSeek={seconds => player.current?.seekTo(seconds)}/>
    <section className="card loop-card"><h2>教练反馈与批注</h2>{review.feedback.length ? review.feedback.map(f => <article className="retest-result" key={f.id}><p className="muted">教练反馈 · {formatDateTime(f.created_at)}</p><p className="preserve-lines">{f.body}</p>{f.start_ms !== null && <button className="btn btn-ghost" onClick={() => player.current?.seekTo(f.start_ms! / 1000)}>{formatMs(f.start_ms)}–{formatMs(f.end_ms!)} · 回看</button>}</article>) : <p className="muted">还没有教练反馈。</p>}
      {coaching && open && <><label className="field"><span>指导意见</span><textarea maxLength={8000} value={body} onChange={e => setBody(e.target.value)}/></label><label><input type="checkbox" checked={timed} onChange={e => setTimed(e.target.checked)}/>关联视频时间段</label>{timed && <div className="loop-fields"><label className="field"><span>开始（秒）</span><input type="number" min={0} step={.01} value={start} onChange={e => setStart(+e.target.value)}/><button className="btn btn-ghost" onClick={() => setStart(player.current?.currentTime() ?? 0)}>取当前时间</button></label><label className="field"><span>结束（秒）</span><input type="number" min={0} step={.01} value={end} onChange={e => setEnd(+e.target.value)}/><button className="btn btn-ghost" onClick={() => setEnd(player.current?.currentTime() ?? 0)}>取当前时间</button></label></div>}<div className="video-list-toolbar"><button className="btn btn-ghost" disabled={busy || !body.trim() || (timed && end <= start)} onClick={() => void feedback(false)}>保存批注，继续评审</button><button className="btn btn-primary" disabled={busy || !body.trim() || (timed && end <= start)} onClick={() => void feedback(true)}>提交反馈并完成评审</button></div></>}
      {!coaching && open && <button className="btn btn-ghost" disabled={busy} onClick={async () => {setBusy(true); try {await loopApi.cancelReview(review); await refresh();} catch(e) {setError(e instanceof Error ? e.message : "取消失败");} finally {setBusy(false);}}}>取消本次评审请求</button>}
    </section><section className="card loop-card"><h2>球员的接发球练习记录</h2><p className="muted">这些是球员的判断与疑问，尚不是经过确认的标准答案。</p>{review.practice_notes.length ? review.practice_notes.map((n,i) => <article key={`${n.created_at}:${i}`} className="retest-result"><button className="btn btn-ghost" onClick={() => player.current?.seekTo(n.start_ms/1000)}>{formatMs(n.start_ms)} · 回看</button><p>{SPINS[n.answer.spin as keyof typeof SPINS]} / {LENGTHS[n.answer.length as keyof typeof LENGTHS]} / {RECEIVES[n.answer.receive as keyof typeof RECEIVES]} · 自信程度 {n.confidence}/5</p><p className="preserve-lines">{n.answer.note || "无备注"}</p></article>) : <p className="muted">此视频暂无练习记录。</p>}</section>
  </> : !error && <p>正在加载评审…</p>}</main></div>;
}
