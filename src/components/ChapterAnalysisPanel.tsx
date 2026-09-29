import {useEffect, useRef, useState} from 'react';
import type {TrainingChapter} from '../utils/trainingTimeline';
import {TRAINING_TYPES} from '../utils/trainingTimeline';
import {chapterAnalysisApi, analysisPending} from '../api/chapterAnalysis';
import type {AnalysisRequest, ChapterAnalysis} from '../api/chapterAnalysis';
import {formatMs} from '../utils/format';

const STATUS = {QUEUED: '等待分析', PREPARING: '准备画面', OVERVIEW: '观察训练', DETAIL: '补充查看', FINALIZING: '整理点评', SUCCEEDED: '分析完成', FAILED: '分析未完成', CANCELLED: '已取消'};
function readableEvidence(text: string, analysis: ChapterAnalysis) {
  return text.replace(/\b[WD]\d+_\d+\b/g, id => {
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
  const [apiKey, setApiKey] = useState('');
  const [consent, setConsent] = useState(false);
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
      target, focus, budget_micro_usd: 150000, consent: true, force};
    const serialized = JSON.stringify(body);
    if (!submission.current || submission.current.body !== serialized) submission.current = {body: serialized, id: crypto.randomUUID()};
    setSubmitting(true); setError('');
    try {
      const result = await chapterAnalysisApi.create(videoId, body, apiKey.trim(), submission.current.id);
      submission.current = null;
      if (!mounted.current) return;
      setItems(old => [result, ...old.filter(item => item.id !== result.id)]);
      setSelectedId(result.id); setRefresh(n => n + 1);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : '发起分析失败');
    } finally {
      if (mounted.current) {setSubmitting(false); setApiKey('');}
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
      <div className="analysis-scope"><strong>{title}</strong><span>{formatMs(chapter.start_ms)}–{formatMs(chapter.end_ms)}</span><p>先观察本段的连续画面，再按需补看，整理可回放核对的点评。</p></div>
      {error && <div role="alert" className="banner banner-warn">{error} <button className="btn btn-ghost btn-sm" onClick={() => {setError(''); setRefresh(n => n + 1);}}>刷新状态</button></div>}
      {loading && <p role="status" className="muted">读取分析记录…</p>}
      {items.length > 0 && <label className="field">分析记录<select value={selected?.id ?? ''} onChange={e => setSelectedId(e.target.value)}>{items.map(item => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString()} · {STATUS[item.status]}</option>)}</select></label>}
      {selected && <div className="analysis-result">
        <div className="analysis-status" role="status"><strong>{STATUS[selected.status]}</strong>{analysisPending(selected.status) && <button className="btn btn-ghost btn-sm" onClick={() => void cancel()}>取消</button>}</div>
        <p className="muted">{selected.snapshot.target === 'NEAR' ? '近端球员' : '远端球员'} · {formatMs(selected.start_ms)}–{formatMs(selected.end_ms)}{selected.snapshot.focus && ` · ${selected.snapshot.focus}`}</p>
        {selected.stale && <div className="banner banner-warn">本报告基于旧版训练标注或时间线，保留供回顾。</div>}
        {analysisPending(selected.status) && <p className="muted">可继续播放视频或离开此面板，分析记录会保存。取消会停止后续步骤，已发出的请求可能仍产生费用。</p>}
        {selected.error && <p role="alert" className="banner banner-warn">{selected.error.message}</p>}
        {selected.result && <>
          <span className="analysis-draft">AI 观察 · 待教练复核</span>
          <p className="analysis-sample-note">以下为本段抽样画面的观察。</p>
          <p className="analysis-summary">{readableEvidence(selected.result.summary, selected)}</p>
          {selected.result.assessability === 'NOT_ASSESSABLE' && <p className="muted">当前画面不足以形成可靠点评。</p>}
          {selected.result.observations.map((observation, index) => <article className={`analysis-observation ${observation.kind.toLowerCase()}`} key={index}>
            <div><span>{observation.kind === 'STRENGTH' ? '做得好的地方' : observation.kind === 'IMPROVEMENT' ? '可以改进' : '观察'}</span><small>{DIMENSION[observation.dimension] ?? observation.dimension}</small></div>
            <p>{readableEvidence(observation.observation, selected)}</p>
            <div className="analysis-evidence">{observation.evidence_ids.map(frameId => {
              const frame = selected.manifest.find(f => f.id === frameId);
              if (!frame) return null;
              return <button key={frameId} className="btn btn-ghost btn-sm" onClick={() => onEvidence(Math.max(selected.start_ms, frame.timestamp_ms - 1000), Math.min(selected.end_ms, frame.timestamp_ms + 2000))}>▶ {formatMs(frame.timestamp_ms)}</button>;
            })}</div>
            {observation.suggestion && <p className="analysis-suggestion"><strong>下一步：</strong>{readableEvidence(observation.suggestion, selected)}</p>}
          </article>)}
          {selected.result.limitations.length > 0 && <div className="analysis-limits"><strong>本次无法确定的部分</strong><ul>{selected.result.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
        </>}
        <details className="analysis-details"><summary>查看分析范围与用量</summary>
          <p>仅观察下列抽样区间，未逐帧分析整段训练。</p>
          {selected.coverage.map((sample, i) => <button key={i} className="btn btn-ghost btn-sm" onClick={() => onEvidence(sample.start_ms, sample.end_ms)}>{sample.kind === 'DETAIL' ? '补看' : '概览'} {formatMs(sample.start_ms)}–{formatMs(sample.end_ms)}</button>)}
          <p>{selected.snapshot.model} · {selected.snapshot.strategy_version}</p>
          <p>已记录 {selected.usage.length} 次调用 · 输入 {selected.usage.reduce((n, u) => n + u.input_tokens, 0).toLocaleString()} tokens · 输出 {selected.usage.reduce((n, u) => n + u.output_tokens, 0).toLocaleString()} tokens</p>
          <p>按标准价格估算 ${(selected.usage.reduce((n, u) => n + u.cost_micro_usd, 0) / 1e6).toFixed(4)} USD；以提供商账单为准。请求中断时用量可能尚未返回。</p>
        </details>
      </div>}
      {!busy && <details className="analysis-setup" open={!selected || selected.status === 'FAILED' || selected.status === 'CANCELLED'}>
        <summary>{selected ? '重新分析 / 调整关注点' : '分析设置'}</summary>
        <form onSubmit={e => {e.preventDefault(); void start(!!selected);}}>
          <label className="field">分析哪位球员<select value={target} required onChange={e => setTarget(e.target.value)}><option value="">请选择目标球员</option><option value="NEAR">近端球员</option><option value="FAR">远端球员</option></select></label>
          <label className="field">本次关注点（可选）<textarea value={focus} maxLength={500} onChange={e => setFocus(e.target.value)} placeholder="例如：反手转正手时的移动和还原" rows={2}/></label>
          <label className="field">OpenAI API key<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} required placeholder="仅用于本次分析，不保存"/></label>
          <p className="muted">GPT-4.1 mini · 最多两次调用 · 本次预算上限 $0.15 USD。使用你的 OpenAI API 额度。</p>
          <label className="analysis-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>允许将本段抽样画面和训练标注发送至 OpenAI，用于本次分析。</label>
          <button className="btn btn-primary" disabled={loading || !target || !apiKey.trim() || !consent || submitting}>{submitting ? '提交中…' : selected ? '重新分析本段' : '开始分析本段'}</button>
        </form>
      </details>}
    </div>
  </section>;
}
