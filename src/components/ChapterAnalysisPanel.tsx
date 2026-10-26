import {useEffect, useRef, useState} from 'react';
import type {TrainingChapter} from '../utils/trainingTimeline';
import {TRAINING_TYPES} from '../utils/trainingTimeline';
import {chapterAnalysisApi, analysisPending} from '../api/chapterAnalysis';
import type {AnalysisRequest, ChapterAnalysis, ComparisonCandidate} from '../api/chapterAnalysis';
import QuizVideo from './QuizVideo';
import {formatMs} from '../utils/format';

const STATUS = {QUEUED: '等待分析', PREPARING: '准备画面', OVERVIEW: '观察训练', DETAIL: '补充查看', FINALIZING: '整理点评', SUCCEEDED: '分析完成', FAILED: '分析未完成', CANCELLED: '已取消'};
function readableEvidence(text: string, analysis: ChapterAnalysis) {
  return text.replace(/\b[WDP]\d+_\d+\b/g, id => {
    const frame = analysis.manifest.find(item => item.id === id);
    return frame ? formatMs(frame.timestamp_ms) : '所示画面';
  });
}

const DIMENSION: Record<string, string> = {PREPARATION: '准备', MOVEMENT: '移动', SEQUENCE: '动作衔接', RECOVERY: '还原', OTHER: '训练表现'};
interface Props {
  videoId: string; chapter: TrainingChapter; timelineVersion: number; annotationVersion: number;
  defaultTarget: string; onClose: () => void; onEvidence: (startMs: number, endMs: number) => void;
}

export default function ChapterAnalysisPanel({videoId, chapter, timelineVersion, annotationVersion, defaultTarget, onClose, onEvidence}: Props) {
  const initialTarget = chapter.annotation?.target === 'UNSPECIFIED' ? defaultTarget : chapter.annotation?.target ?? defaultTarget;
  const [target, setTarget] = useState(initialTarget === 'NEAR' || initialTarget === 'FAR' ? initialTarget : '');
  const [focus, setFocus] = useState('');
  const [candidateResponse, setCandidateResponse] = useState<{key: string; items: ComparisonCandidate[]; reason: string} | null>(null);
  const [candidateKey, setCandidateKey] = useState('');
  const [previousEvidence, setPreviousEvidence] = useState<{videoId: string; startMs: number; endMs: number} | null>(null);
  const [items, setItems] = useState<ChapterAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true);
  const submission = useRef<{body: string; id: string} | null>(null);
  const title = chapter.annotation?.title ?? `训练段 ${chapter.number} · ${TRAINING_TYPES[chapter.trainingType].label}`;
  const selected = items.find(item => item.id === selectedId) ?? items[0];
  const busy = submitting || items.some(item => analysisPending(item.status));
  const candidateRequestKey = JSON.stringify([videoId, chapter.annotation?.id, annotationVersion, target, refresh]);
  const currentCandidates = candidateResponse?.key === candidateRequestKey ? candidateResponse : null;
  const candidates = currentCandidates?.items ?? [];
  const candidateLoading = !currentCandidates;
  const candidateReason = currentCandidates?.reason ?? '';
  const comparisonCandidate = candidates.find(item => `${item.video_id}:${item.annotation_id}` === candidateKey);

  useEffect(() => {
    let cancelled = false;
    chapterAnalysisApi.candidates(videoId, chapter.annotation?.id ?? '', target).then(response => {
      if (!cancelled) setCandidateResponse({key: candidateRequestKey, ...response});
    }).catch(() => {if (!cancelled) setCandidateResponse({key: candidateRequestKey, items: [], reason: '暂时无法读取历史训练，可先分析本段或刷新重试。'});});
    return () => {cancelled = true;};
  }, [videoId, chapter.annotation?.id, candidateRequestKey, target]);


  function evidenceButtons(ids: string[]) {
    if (!selected) return null;
    const frames = selected.manifest.filter(frame => ids.includes(frame.id)).sort((a, b) => a.timestamp_ms - b.timestamp_ms);
    const groups: (typeof frames)[] = [];
    for (const frame of frames) {
      const group = groups.at(-1);
      const last = group?.at(-1);
      if (last && last.role === frame.role && last.video_id === frame.video_id && frame.timestamp_ms - last.timestamp_ms <= 1000) group!.push(frame);
      else groups.push([frame]);
    }
    return groups.map(group => {
      const frame = group[0];
      const previous = frame.role === 'PREVIOUS';
      const scope = previous ? selected.comparison_source : selected;
      if (!scope) return null;
      const start = Math.max(scope.start_ms, frame.timestamp_ms - 1000);
      const end = Math.min(scope.end_ms, group[group.length - 1].timestamp_ms + 2000);
      return <button key={frame.id} className="btn btn-ghost btn-sm" onClick={() => {
        if (previous) setPreviousEvidence({videoId: scope.video_id, startMs: start, endMs: end});
        else {setPreviousEvidence(null); onEvidence(start, end);}
      }}>▶ {previous ? '历史 ' : '本次 '}{formatMs(start)}–{formatMs(end)}</button>;
    });
  }

  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await chapterAnalysisApi.list(videoId);
        if (cancelled) return;
        setItems(response.items.filter(item => item.chapter_id === chapter.id || item.start_ms === chapter.start_ms && item.end_ms === chapter.end_ms));
        setLoading(false);
        if (response.items.some(item => analysisPending(item.status))) timer = setTimeout(poll, 2000);
      } catch (e) {
        if (!cancelled) {setError(e instanceof Error ? e.message : '读取分析失败'); setLoading(false);}
      }
    }
    void poll();
    return () => {cancelled = true; clearTimeout(timer);};
  }, [videoId, chapter.id, chapter.start_ms, chapter.end_ms, refresh]);

  async function start(force: boolean) {
    if (target !== 'NEAR' && target !== 'FAR') return;
    const body: AnalysisRequest = {chapter_id: chapter.id, title, start_ms: chapter.start_ms, end_ms: chapter.end_ms,
      timeline_version: timelineVersion, annotation_version: annotationVersion, annotation_id: chapter.annotation?.id ?? null,
      target, focus, force, comparison: comparisonCandidate ? {video_id: comparisonCandidate.video_id,
        annotation_id: comparisonCandidate.annotation_id, annotation_version: comparisonCandidate.annotation_version, same_player: true} : null};
    const serialized = JSON.stringify(body);
    if (!submission.current || submission.current.body !== serialized) submission.current = {body: serialized, id: crypto.randomUUID()};
    setSubmitting(true); setError('');
    try {
      const result = await chapterAnalysisApi.create(videoId, body, submission.current.id);
      submission.current = null;
      if (!mounted.current) return;
      setItems(old => [result, ...old.filter(item => item.id !== result.id)]);
      setSelectedId(result.id); setPreviousEvidence(null); setRefresh(n => n + 1);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : '发起分析失败');
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  async function cancel() {
    if (!selected) return;
    setError('');
    try {await chapterAnalysisApi.cancel(videoId, selected.id); if (mounted.current) setRefresh(n => n + 1);}
    catch (e) {if (mounted.current) setError(e instanceof Error ? e.message : '取消失败');}
  }

  return <section className="chapter-analysis-panel" aria-label="本段 AI 分析">
    <header className="analysis-heading"><div><span className="analysis-eyebrow">训练复盘</span><h3>分析本段</h3></div><button className="btn btn-ghost btn-sm" onClick={onClose}>返回回合</button></header>
    <div className="analysis-scroll">
      <div className="analysis-scope"><strong>{title}</strong><span>{formatMs(chapter.start_ms)}–{formatMs(chapter.end_ms)}</span><p>回顾动作表现，找到下一次训练的练习重点。</p></div>
      {error && <div role="alert" className="banner banner-warn">{error} <button className="btn btn-ghost btn-sm" onClick={() => {setError(''); setRefresh(n => n + 1);}}>刷新状态</button></div>}
      {loading && <p role="status" className="muted">读取分析记录…</p>}
      {items.length > 0 && <label className="field">分析记录<select value={selected?.id ?? ''} onChange={e => {setSelectedId(e.target.value); setPreviousEvidence(null);}}>{items.map(item => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString()} · {STATUS[item.status]}</option>)}</select></label>}
      {selected && <div className="analysis-result">
        <div className="analysis-status" role="status"><strong>{STATUS[selected.status]}</strong>{analysisPending(selected.status) && <button className="btn btn-ghost btn-sm" onClick={() => void cancel()}>取消</button>}</div>
        <p className="muted">{selected.snapshot.target === 'NEAR' ? '近端球员' : '远端球员'} · {formatMs(selected.start_ms)}–{formatMs(selected.end_ms)}{selected.snapshot.focus && ` · ${selected.snapshot.focus}`}</p>
        {selected.stale && <div className="banner banner-warn">本报告基于旧版训练标注或时间线，保留供回顾。</div>}
        {analysisPending(selected.status) && <p className="muted">可继续播放视频或离开此面板，完成后可在分析记录中查看。</p>}
        {selected.error && <p role="alert" className="banner banner-warn">{selected.error.message}</p>}
        {selected.result && <>
          <span className="analysis-draft">AI 观察 · 待教练复核</span>
          <p className="analysis-summary">{readableEvidence(selected.result.summary, selected)}</p>
          {selected.result.assessability === 'PARTIAL' && <p className="muted">部分动作看不清，建议结合回放与教练一起确认。</p>}
          {selected.result.assessability === 'NOT_ASSESSABLE' && <p className="muted">当前画面不足以形成可靠点评。</p>}
          {selected.result.observations.map((observation, index) => <article className={`analysis-observation ${observation.kind.toLowerCase()}`} key={index}>
            <div><span>{observation.kind === 'STRENGTH' ? '做得好的地方' : observation.kind === 'IMPROVEMENT' ? '可以改进' : '观察'}</span><small>{DIMENSION[observation.dimension] ?? observation.dimension}</small></div>
            <p>{readableEvidence(observation.observation, selected)}</p>
            <div className="analysis-evidence">{evidenceButtons(observation.evidence_ids)}</div>
            {!selected.result?.practice_plan?.length && observation.suggestion && <p className="analysis-suggestion"><strong>下一步：</strong>{readableEvidence(observation.suggestion, selected)}</p>}
          </article>)}
          {!!selected.result.practice_plan?.length && <section className="analysis-practice"><h4>下一次怎么练</h4>
            <p className="muted">练习量可结合当天状态与教练建议调整。</p>
            {selected.result.practice_plan.map((plan, i) => <article className="analysis-observation" key={i}>
              <h4>{i + 1}. {plan.goal}</h4><p><strong>{plan.drill}</strong></p>
              <ol>{plan.steps.map((step, j) => <li key={j}>{step}</li>)}</ol>
              <p><strong>建议训练量：</strong>{plan.dosage}</p><p><strong>动作口令：</strong>{plan.cue}</p>
              <p><strong>达标标准：</strong>{plan.success_criteria}</p><p><strong>下次复测：</strong>{plan.retest}</p>
              <div className="analysis-evidence">{evidenceButtons(plan.evidence_ids)}</div>
            </article>)}
          </section>}
          {selected.result.comparison && selected.comparison_source && <section className="analysis-comparison"><h4>与历史训练对比</h4>
            <p className="muted">{selected.comparison_source.filename} · {selected.comparison_source.title}</p>
            <p>{selected.result.comparison.summary}</p>
            {selected.result.comparison.changes.map((change, i) => <article className="analysis-observation" key={i}>
              <strong>{{IMPROVED: '有改善', UNCHANGED: '表现相近', NEEDS_WORK: '仍需练习', UNCERTAIN: '尚不能确定'}[change.change]} · {DIMENSION[change.dimension]}</strong>
              <p>{change.observation}</p><div className="analysis-evidence">{evidenceButtons(change.current_evidence_ids)}{evidenceButtons(change.previous_evidence_ids)}</div>
            </article>)}
            {selected.result.comparison.limitations.map((item, i) => <p className="muted" key={i}>{item}</p>)}
            {previousEvidence && <div className="analysis-history-player"><button className="btn btn-ghost btn-sm" onClick={() => setPreviousEvidence(null)}>收起历史回放</button>
              <QuizVideo {...previousEvidence}/>
            </div>}
          </section>}
        </>}
      </div>}
      {!busy && <details className="analysis-setup" open={!selected || selected.status === 'FAILED' || selected.status === 'CANCELLED'}>
        <summary>{selected ? '重新分析 / 调整关注点' : '分析设置'}</summary>
        <form onSubmit={e => {e.preventDefault(); void start(!!selected);}}>
          <label className="field">分析哪位球员<select value={target} required onChange={e => {setTarget(e.target.value); setCandidateKey('');}}><option value="">请选择目标球员</option><option value="NEAR">近端球员</option><option value="FAR">远端球员</option></select></label>
          <label className="field">本次关注点（可选）<textarea value={focus} maxLength={500} onChange={e => setFocus(e.target.value)} placeholder="例如：反手转正手时的移动和还原" rows={2}/></label>
          <label className="field">对比同一球员的历史训练（可选）<select value={candidateKey} disabled={candidateLoading} onChange={e => setCandidateKey(e.target.value)}>
            <option value="">{candidateLoading ? '读取历史训练…' : '仅分析本段'}</option>
            {candidates.map(item => <option key={`${item.video_id}:${item.annotation_id}`} value={`${item.video_id}:${item.annotation_id}`}>
              {item.filename} · {item.title} · {formatMs(item.start_ms)}–{formatMs(item.end_ms)} · {item.target === 'FAR' ? '远端球员' : '近端球员'}
            </option>)}
          </select></label>
          {candidateKey ? <p className="muted">请确认所选片段的目标球员与本次是同一人；分析会比较两次的动作表现。</p> : candidateReason && <p className="muted">{candidateReason}</p>}
          <button className="btn btn-primary" disabled={loading || candidateLoading || !target || submitting}>{submitting ? '提交中…' : selected ? '重新分析本段' : '开始分析本段'}</button>
        </form>
      </details>}
    </div>
  </section>;
}
