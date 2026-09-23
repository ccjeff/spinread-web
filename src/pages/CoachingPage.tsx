import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { api } from "../api/client";
import { loopApi, REVIEW_STATUS } from "../api/loop";
import type { CoachGrant, Consent, Review } from "../api/loop";
import type { User, VideoSummary } from "../api/types";
import { formatDateTime } from "../utils/format";

export default function CoachingPage() {
  const [params] = useSearchParams();
  const [me, setMe] = useState<User | null>(null); const [grants, setGrants] = useState<CoachGrant[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]); const [queue, setQueue] = useState<Review[]>([]);
  const [videos, setVideos] = useState<VideoSummary[]>([]); const [videoId, setVideoId] = useState(params.get("video") ?? "");
  const [consents, setConsents] = useState<Consent[]>([]); const [coachId, setCoachId] = useState("");
  const [email, setEmail] = useState(""); const [question, setQuestion] = useState(""); const [allow, setAllow] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [user, gs, rs, vs] = await Promise.all([loopApi.me(), loopApi.grants(), loopApi.reviews(), api.listVideos()]);
    setMe(user); setGrants(gs.items); setReviews(rs.items); setVideos(vs);
    if (user.role === "COACH") setQueue((await loopApi.queue(user.id)).items);
    if (videoId) setConsents((await loopApi.consents(videoId)).items);
  }, [videoId]);
  useEffect(() => {void refresh().catch(e => setError(e.message));}, [refresh]);
  const activeGrants = grants.filter(g => g.player_id === me?.id && g.status === "ACTIVE");
  const activeConsent = consents.find(c => c.video_id === videoId && c.granted_to === coachId && c.state === "ACTIVE");
  async function run(action: () => Promise<unknown>, message: string) {setBusy(true); setError(""); setNotice(""); try {await action(); await refresh(); setNotice(message);} catch(e) {setError(e instanceof Error ? e.message : "操作失败");} finally {setBusy(false);}}
  return <div className="page"><TopBar/><main className="container loop-container"><div className="page-header"><div><h1>教练协作</h1><p className="muted">你决定分享哪段视频、向谁提问。教练结合 AI 整理的证据给出指导。</p></div><button className="btn btn-ghost" disabled={busy} onClick={() => void refresh().catch(e => setError(e.message))}>刷新</button></div>
    {error && <div className="banner banner-error" role="alert">{error}</div>}{notice && <p role="status">{notice}</p>}
    {me?.role === "COACH" && <section className="card loop-card"><h2>待我评审</h2><p className="muted">只展示仍获得球员授权的视频。</p><ReviewList reviews={queue}/></section>}
    <section className="card loop-card"><h2>我的教练</h2><form className="video-list-toolbar" onSubmit={e => {e.preventDefault(); void run(() => loopApi.grant(email.trim()), "教练关系已建立。还需选择视频并单独授权。");}}><label className="field"><span>已注册教练的邮箱</span><input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)}/></label><button className="btn btn-primary" disabled={busy}>添加教练</button></form><p className="muted">教练可在登录页注册教练身份。建立关系后还不能查看你的视频；你需要逐个授权。</p>
      {grants.filter(g => g.player_id === me?.id).map(g => <div className="grant-row" key={g.id}><span><strong>{g.coach_name}</strong> · {g.coach_email} · {g.status === "ACTIVE" ? "关系有效" : "已撤销"}</span>{g.status === "ACTIVE" && <button className="btn btn-ghost btn-danger" disabled={busy} onClick={() => void run(() => loopApi.revokeGrant(g), "已撤销教练关系及其全部视频许可，未完成的评审已取消。")}>撤销关系及全部视频访问</button>}</div>)}
    </section>
    <section className="card loop-card"><h2>选择视频并邀请评审</h2><div className="loop-fields"><label className="field"><span>分享的视频</span><select value={videoId} onChange={e => {setVideoId(e.target.value); setConsents([]); setAllow(false);}}><option value="">选择视频</option>{videos.map(v => <option key={v.id} value={v.id}>{v.filename}</option>)}</select></label><label className="field"><span>教练</span><select value={coachId} onChange={e => {setCoachId(e.target.value); setAllow(false);}}><option value="">选择教练</option>{activeGrants.map(g => <option key={g.id} value={g.coach_id}>{g.coach_name}</option>)}</select></label></div>
      {videoId && coachId && (activeConsent ? <div className="video-list-toolbar"><span>这位教练已获准访问此视频</span><button className="btn btn-ghost btn-danger" disabled={busy} onClick={() => void run(() => loopApi.revokeConsent(activeConsent), "已收回此视频的教练访问许可，未完成的评审已取消。")}>收回本视频访问</button></div> : <><label className="quiz-confirm"><input type="checkbox" checked={allow} onChange={e => setAllow(e.target.checked)}/>允许这位教练查看本视频、报告、练习记录和关联训练任务，并提供反馈、修订训练计划。</label><button className="btn btn-primary" disabled={busy || !allow} onClick={() => void run(() => loopApi.consent(videoId, coachId), "视频许可已保存。现在可以提交评审问题。")}>授权这位教练访问此视频</button></>)}
      <label className="field"><span>这次希望教练重点指导什么？</span><textarea maxLength={4000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="例如：请看看我在短球接发球时的准备动作，并帮我安排下一阶段练习。"/></label><button className="btn btn-primary" disabled={busy || !videoId || !coachId || !activeConsent} onClick={() => void run(() => loopApi.requestReview(videoId, coachId, question), "评审请求已进入教练的工作台。")}>提交评审请求</button>
    </section><section className="card loop-card"><h2>我提交的评审</h2><ReviewList reviews={reviews}/></section>
  </main></div>;
}

function ReviewList({reviews}: {reviews: Review[]}) {
  return reviews.length ? <div className="review-list">{reviews.map(r => <Link className="review-row" key={r.id} to={`/reviews/${r.id}`}><strong>{r.filename}</strong><span>{r.player_name} → {r.coach_name} · {REVIEW_STATUS[r.status]} · {formatDateTime(r.created_at)}</span><span>{r.question || "查看视频并提供指导"}</span></Link>)}</div> : <p className="muted">暂无评审请求。</p>;
}
