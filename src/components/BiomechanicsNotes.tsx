import type {Biomechanics} from '../api/replay';

export default function BiomechanicsNotes({items,timeMs,onSeek}:{items:Biomechanics[];timeMs:number;onSeek:(ms:number)=>void}){
  const current=items.filter(i=>i.start_ms<=timeMs&&timeMs<i.end_ms);
  if(!items.length)return null;
  return <section className="biomechanics-notes"><h4>动作阶段 · 待教练复核</h4>{current.length?current.map(i=><article key={`${i.stroke_id}:${i.player_id}`}>
    <p>{i.summary}</p><div className="replay-toolbar">{i.phases.map((p,k)=><button className="btn btn-ghost btn-sm" key={k} onClick={()=>onSeek(p.keyframe_ms)}>{p.label}</button>)}</div>
    {i.phases.filter(p=>p.start_ms<=timeMs&&timeMs<p.end_ms).map((p,k)=><p className="preserve-lines" key={k}>{p.cue}</p>)}
    <p className="muted replay-note">{i.quality.effective_fps} fps 有效观测 · {i.quality.order_reliable?'时序可供核对':'发力先后暂不判断'} · {i.quality.energy_reliable?'能量分解为模型估计':'能量占比暂不判断'}。不作为肌肉激活测量或技术能力评分。</p>
  </article>):<p className="muted">移动到有动作分析的拍次，查看对应阶段。</p>}</section>;
}
