import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {quizApi} from '../api/quiz';
import type {QuizEvidence,QuizItem} from '../api/quiz';
import QuizVideo from './QuizVideo';
import PoseReplayView from './PoseReplayView';
import BiomechanicsNotes from './BiomechanicsNotes';
import {ReferenceSummary} from './ReferenceAnswerPanel';

/** Mounted only after a successful attempt; server also enforces this gate. */
export default function QuizEvidenceReplay({item}:{item:QuizItem}){
  const [data,setData]=useState<QuizEvidence|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [ms,setMs]=useState(item.pause_ms),[seek,setSeek]=useState({ms:item.start_ms,sequence:0});
  useEffect(()=>{
    let cancelled=false;setData(null);setError('');
    quizApi.evidence(item.id).then(e=>{if(!cancelled)setData(e);}).catch(e=>{if(!cancelled)setError(e.message??'复盘依据加载失败');});
    return()=>{cancelled=true;};
  },[item.id,retry]);
  const replay=data?.replay;
  const latest=new Map<string,NonNullable<QuizEvidence['reference_answers']>[number]>();
  for(const r of data?.reference_answers??[]){const old=latest.get(r.coach_id);if(!old||old.version<r.version)latest.set(r.coach_id,r);}
  return <div className="quiz-evidence-replay">
    <QuizVideo videoId={item.video_id} startMs={item.start_ms} endMs={item.end_ms} onTimeUpdate={setMs} seekMs={seek.ms} seekSequence={seek.sequence}/>
    {error&&<p role="alert" className="banner banner-error">{error} <button className="btn btn-ghost btn-sm" onClick={()=>setRetry(n=>n+1)}>重试加载证据</button></p>}
    {replay?<>
      <div className="replay-toolbar">{replay.contacts.map(c=><button className="btn btn-ghost btn-sm" key={c.time_ms} onClick={()=>setSeek(s=>({ms:c.time_ms,sequence:s.sequence+1}))}>第 {c.ordinal} 拍 · {(c.time_ms/1000).toFixed(2)} 秒</button>)}</div>
      <PoseReplayView pose={replay.pose??null} ball={replay.ball_3d} timeMs={ms}/><BiomechanicsNotes items={replay.biomechanics??[]} timeMs={ms} onSeek={ms=>setSeek(s=>({ms,sequence:s.sequence+1}))}/>
      <p className="muted replay-note">{replay.placements?.filter(p=>p.table_xy!==null&&p.status!=='REJECTED').length??0} 个可定位落点 · 模型估计与教练确认分开保留。旋转未知时不计算正确率。</p>
    </>:data&&<p className="muted">这道题尚无对应的视觉复盘依据，原片与作答记录仍保留。</p>}
    {latest.size>0?<section className="quiz-reference-answers"><h3>教练参考答案</h3>{[...latest.values()].map(r=><ReferenceSummary key={r.id} reference={r}/>)}</section>:data&&<p className="muted">尚无教练确认的参考答案，可以把这次判断提交给教练讨论。</p>}
    <div className="replay-toolbar"><Link className="btn btn-ghost btn-sm" to={`/videos/${item.video_id}`}>查看完整复盘</Link><Link className="btn btn-ghost btn-sm" to={`/coaching?video=${item.video_id}`}>与教练讨论</Link></div>
  </div>;
}
