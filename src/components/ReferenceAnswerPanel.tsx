import {useState} from 'react';
import {Link} from 'react-router-dom';
import {SPINS,LENGTHS,RECEIVES} from '../api/quiz';
import type {ReferenceAnswer} from '../api/quiz';
import type {PracticeNote,ReviewDetail} from '../api/loop';
import {loopApi} from '../api/loop';
import {ApiError} from '../api/client';

export const DIAGNOSES={UNKNOWN:'尚不确定',READING:'来球判断',EXECUTION:'动作执行',MIXED:'判断与执行'};

export function ReferenceSummary({reference}:{reference:ReferenceAnswer}){
  return <div className="reference-summary"><p>教练参考 v{reference.version} · {DIAGNOSES[reference.diagnosis]}</p><p>{SPINS[reference.answer.spin as keyof typeof SPINS]??'不确定'} / {LENGTHS[reference.answer.length as keyof typeof LENGTHS]??'不确定'} · 可接受处理：{reference.answer.acceptable_receives.map(v=>RECEIVES[v as keyof typeof RECEIVES]??v).join('、')}</p><p className="preserve-lines">{reference.answer.note}</p></div>;
}

export default function ReferenceAnswerPanel({review,note,contacts,editable,onSaved}:{review:ReviewDetail;note:PracticeNote;contacts:number[];editable:boolean;onSaved:(r:ReviewDetail)=>void}){
  const references=(review.reference_answers??[]).filter(r=>r.quiz_item_id===note.quiz_item_id).sort((a,b)=>b.version-a.version);
  const latest=references[0];
  const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [answer,setAnswer]=useState<ReferenceAnswer['answer']>(latest?.answer??{spin:'UNKNOWN',length:'UNKNOWN',acceptable_receives:[],note:''});
  const [diagnosis,setDiagnosis]=useState<ReferenceAnswer['diagnosis']>(latest?.diagnosis??'UNKNOWN');
  const [contact,setContact]=useState<number|null>(null);
  const selectedContact=contact??(note.contact_ms!==undefined&&contacts.includes(note.contact_ms)?note.contact_ms:contacts[0]);
  const canWrite=editable&&!review.stale&&!note.stale&&!!note.quiz_item_id&&!!note.item_version&&!!note.rally_id&&contacts.includes(selectedContact);
  async function save(){setBusy(true);setError('');try{onSaved(await loopApi.referenceAnswer(review,{...note,contact_ms:selectedContact},answer,diagnosis));setEditing(false);}catch(e){setError(e instanceof ApiError&&e.code==='REPLAY_EVIDENCE_CONFLICT'?'复盘证据已更新，本次参考答案尚未保存。请刷新页面，重新核对逐拍证据后再保存。':e instanceof Error?e.message:'参考答案保存失败');}finally{setBusy(false);}}
  return <div className="reference-answer-panel">
    {latest?<><ReferenceSummary reference={latest}/><Link className="btn btn-ghost btn-sm" to={`/training?video=${review.video_id}&player=${review.player_id}&reference=${latest.id}`}>据此制定训练任务</Link></>:<p className="muted">尚无教练参考答案；这次判断保留为球员观察记录。</p>}
    {references.length>1&&<details><summary>较早的参考版本（{references.length-1}）</summary>{references.slice(1).map(r=><ReferenceSummary key={r.id} reference={r}/>)}</details>}
    {canWrite&&<button className="btn btn-ghost btn-sm" disabled={busy} onClick={()=>setEditing(!editing)}>{editing?'收起':latest?'修订教练参考答案':'添加教练参考答案'}</button>}
    {editable&&!canWrite&&<p className="muted replay-note">需要当前时间线中的题目和触球证据，才能保存结构化参考答案。</p>}
    {editing&&canWrite&&<form className="reference-answer-form" onSubmit={e=>{e.preventDefault();void save();}}>
      <p className="muted">参考答案对应同一拍证据，可以接受多种接法；没有依据的旋转保留“不确定”。</p>
      <label className="field"><span>关联的逐拍证据</span><select value={selectedContact} onChange={e=>setContact(Number(e.target.value))}>{contacts.map(t=><option key={t} value={t}>{(t/1000).toFixed(2)} 秒</option>)}</select></label>
      <div className="loop-fields"><label className="field"><span>旋转</span><select value={answer.spin} onChange={e=>setAnswer({...answer,spin:e.target.value})}>{Object.entries(SPINS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field"><span>长短</span><select value={answer.length} onChange={e=>setAnswer({...answer,length:e.target.value})}>{Object.entries(LENGTHS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>
      <fieldset><legend>可接受的处理（可多选）</legend><div className="replay-toolbar">{Object.entries(RECEIVES).filter(([v])=>v!=='UNKNOWN').map(([v,l])=><label key={v}><input type="checkbox" checked={answer.acceptable_receives.includes(v)} onChange={e=>setAnswer({...answer,acceptable_receives:e.target.checked?[...answer.acceptable_receives,v]:answer.acceptable_receives.filter(x=>x!==v)})}/>{l}</label>)}</div></fieldset>
      <label className="field"><span>主要需要改进的环节</span><select value={diagnosis} onChange={e=>setDiagnosis(e.target.value as typeof diagnosis)}>{Object.entries(DIAGNOSES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="field"><span>证据与指导依据</span><textarea required maxLength={2000} value={answer.note} onChange={e=>setAnswer({...answer,note:e.target.value})}/></label>
      {error&&<p role="alert" className="banner banner-error">{error}</p>}<button className="btn btn-primary" disabled={busy||!answer.acceptable_receives.length||!answer.note.trim()}>保存参考版本</button>
    </form>}
  </div>;
}
