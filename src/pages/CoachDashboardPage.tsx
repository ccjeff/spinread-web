import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import { useAuth } from "../auth/AuthContext";
import { loopApi, REVIEW_STATUS } from "../api/loop";
import type { CoachDashboard } from "../api/loop";
import { formatDateTime } from "../utils/format";

const TASK_STATUS: Record<string, string> = {ACTIVE: "进行中", DONE: "已完成", DROPPED: "已暂停"};
export default function CoachDashboardPage() {
  const {user} = useAuth();
  const [data, setData] = useState<CoachDashboard | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState("PENDING");
  const refresh = useCallback(async () => {
    if (user?.role !== "COACH") return;
    setLoading(true); setError("");
    try {setData(await loopApi.dashboard(user.id));} catch(e) {setData(null); setError(e instanceof Error ? e.message : "加载失败");} finally {setLoading(false);}
  }, [user]);
  useEffect(() => {void refresh(); const onFocus = () => void refresh(); window.addEventListener("focus", onFocus); return () => window.removeEventListener("focus", onFocus);}, [refresh]);
  if (user?.role !== "COACH") return <Navigate to="/coaching" replace/>;
  const players = data?.players.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) ?? [];
  const current = data?.players.find(p => p.id === selected);
  const reviews = data?.reviews.filter(r => (!selected || r.player_id === selected) && (filter === "ALL" || (filter === "PENDING" ? ["OPEN", "CLAIMED"].includes(r.status) : r.status === filter))) ?? [];
  return <div className="page"><TopBar/><main className="container coach-dashboard">
    <div className="page-header"><div><p className="muted">COACH WORKSPACE</p><h1>教练工作台</h1><p className="muted">{user.display_name}，从球员的问题开始，让 AI 证据转化为具体指导。</p></div><button className="btn btn-ghost" disabled={loading} onClick={() => void refresh()}>{loading ? "加载中…" : "刷新工作台"}</button></div>
    {error && <p role="alert" className="banner banner-error">{error}</p>}
    {data && <><div className="coach-stats">{[["我的球员",data.summary.players],["待办评审",data.summary.pending_reviews],["进行中任务",data.summary.active_tasks],["复测记录",data.summary.retests]].map(([label,value]) => <section className="card" key={label}><span className="muted">{label}</span><strong>{value}</strong></section>)}</div>
    <p className="muted">统计仅包含当前获准查看的内容；任务完成数反映练习记录，不代表技术能力评分。</p>
    {!data.players.length && <section className="card loop-card"><h2>等待第一位球员加入</h2><p>请球员在「教练协作」中添加你的注册邮箱 <strong>{user.email}</strong>，再选择视频授权并提交评审问题。</p><p className="muted">建立关系后，球员会出现在这里；视频和训练内容需要单独授权。</p></section>}
    <div className="coach-columns"><aside className="card loop-card"><h2>我的球员</h2><label className="field"><span>查找球员</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="按姓名搜索"/></label><button className="btn btn-ghost" aria-pressed={!selected} onClick={() => setSelected("")}>全部球员</button>
      {players.map(p => <button className={`coach-player ${selected === p.id ? "selected" : ""}`} key={p.id} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}><strong>{p.name}</strong><span>{p.videos.length} 段授权视频 · {p.pending_reviews} 项待评审</span><span>{p.progress.DONE} 项已完成 / {p.tasks.length} 项训练任务</span></button>)}{!players.length && !!data.players.length && <p className="muted">没有匹配的球员。</p>}
    </aside><div className="coach-main">
      <section className="card loop-card"><div className="page-header"><h2>{current ? `${current.name}的评审` : "评审待办"}</h2><label className="field"><span>评审状态</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="PENDING">待处理与评审中</option><option value="DONE">已完成</option><option value="CANCELLED">已取消</option><option value="ALL">全部</option></select></label></div><p className="muted">按提交时间从早到晚排列。</p>
      {reviews.length ? reviews.map(r => <Link className="review-row" key={r.id} to={`/reviews/${r.id}`}><strong>{r.player_name} · {r.filename}</strong><span>{REVIEW_STATUS[r.status]} · {formatDateTime(r.created_at)}</span><span>{r.question || "请根据视频提供指导"}</span>{r.stale && <span>源时间线已更新，请复核证据</span>}</Link>) : <p className="quiz-empty">当前没有这类评审请求。</p>}</section>
      {current ? <><section className="card loop-card"><h2>{current.name} · 授权视频</h2>{current.videos.length ? current.videos.map(v => <article className="retest-result" key={v.id}><strong>{v.filename}</strong><p className="muted">{formatDateTime(v.created_at)}</p><div className="video-list-toolbar"><Link to={`/coach/videos/${v.id}`}>查看视频与报告</Link><Link to={`/training?player=${current.id}&video=${v.id}`}>查看 / 制定训练计划</Link></div></article>) : <p className="muted">已建立关系，尚无可查看的视频。请球员在「教练协作」中逐视频授权。</p>}</section>
      <section className="card loop-card"><h2>训练进展</h2><p>进行中 {current.progress.ACTIVE} · 已完成 {current.progress.DONE} · 已暂停 {current.progress.DROPPED}</p>{current.tasks.length ? current.tasks.map(t => <article className="retest-result" key={t.id}><Link to={`/training?player=${current.id}&video=${t.video_id}`}>{t.title}</Link><p className="muted">{TASK_STATUS[t.status]} · 更新于 {formatDateTime(t.updated_at)}</p><p className="preserve-lines">球员反馈：{t.player_note || "尚未填写"}</p>{current.retests.filter(r => r.task_id === t.id).map(r => <p key={r.id}>复测 · {formatDateTime(r.created_at)} · {r.comparable ? r.success ? "达到任务阈值" : "未达到任务阈值" : "条件不满足，暂不可比较"}</p>)}</article>) : <p className="muted">还没有可查看的训练任务，可从授权视频报告开始制定。</p>}</section></> : <section className="card loop-card"><h2>查看球员训练进展</h2><p className="muted">选择一位球员，查看授权视频、训练任务、球员反馈和复测记录。</p></section>}
    </div></div></>}
  </main></div>;
}
