import {forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react';
import Player from './Player';
import PoseReplayView from './PoseReplayView';
import BiomechanicsNotes from './BiomechanicsNotes';
import {Link} from 'react-router-dom';
import {quizApi} from '../api/quiz';
import type {PlayerHandle} from './Player';
import type {ActiveTimeline} from '../api/types';
import {replayApi} from '../api/replay';
import type {Replay, Point2, Phase, Statistics, LandingReview, ReplayAnalysis, AnalysisPlayerInfo} from '../api/replay';
import {nearestIndex, observedTrail, imagePoint} from '../utils/replay';
const formatMs=(ms:number)=>`${Math.floor(ms/60000).toString().padStart(2,'0')}:${((ms%60000)/1000).toFixed(2).padStart(5,'0')}`;

const phaseLabels={SERVE:'发球落点',RECEIVE:'接发落点',RALLY:'相持落点',UNKNOWN:'待确认'};
const cornerNames=['远端左角','远端右角','近端右角','近端左角'];
interface Props {videoId: string; timeline: ActiveTimeline | null; currentMs: number; activeItemId: string | null; onTimeUpdate: (seconds:number)=>void; onSeek:(seconds:number)=>void; readOnly?:boolean}

const AnalysisPlayer=forwardRef<PlayerHandle,Props>(function AnalysisPlayer({videoId,timeline,currentMs,activeItemId,onTimeUpdate,onSeek,readOnly=false},ref){
  const player=useRef<PlayerHandle>(null);
  useImperativeHandle(ref,()=>({seekTo:s=>player.current?.seekTo(s),play:()=>player.current?.play(),pause:()=>player.current?.pause(),currentTime:()=>player.current?.currentTime()??0,setPlaybackRate:r=>player.current?.setPlaybackRate(r)}),[]);
  const rallies=useMemo(()=>timeline?.items.filter(i=>i.type==='RALLY').sort((a,b)=>a.start_ms-b.start_ms)??[],[timeline]);
  const rally=rallies.find(r=>r.start_ms<=currentMs&&currentMs<r.end_ms)??rallies.find(r=>r.item_id===activeItemId)??(currentMs<(rallies[0]?.start_ms??0)?rallies[0]:undefined);
  const start=rally?Math.min(rally.end_ms-1,rally.start_ms+Math.floor(Math.max(0,currentMs-rally.start_ms)/30000)*30000):0;
  const [data,setData]=useState<Replay|null>(null),[stats,setStats]=useState<Statistics|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const [calibrating,setCalibrating]=useState(false),[corners,setCorners]=useState<Point2[]>([]),[fixed,setFixed]=useState(false);
  const [calStart,setCalStart]=useState(0),[calEnd,setCalEnd]=useState(0);
  const [modelStats,setModelStats]=useState(false);
  const [analysis,setAnalysis]=useState<ReplayAnalysis|null>(null),[engine,setEngine]=useState<'local'|'pingpong3d'>('local');
  const [notice,setNotice]=useState('');
  const [players,setPlayers]=useState([{hand:'',kit:''},{hand:'',kit:''}]);
  const playersReady=players.every(p=>p.hand&&p.kit)&&players[0].kit!==players[1].kit;
  const [generating,setGenerating]=useState(false);
  const previousAnalysis=useRef<string|null>(null);
  const [overlay,setOverlay]=useState(true),[phase,setPhase]=useState<'SERVE'|'RECEIVE'|'RALLY'>('SERVE');
  const [rate,setRate]=useState(1);
  const [paired,setPaired]=useState(false);
  const version=timeline?.version;
  const rallyId=rally?.item_id;
  useEffect(()=>{
    let cancelled=false;
    setData(null);setError('');setCalibrating(false);
    if(!rallyId||!version)return;
    replayApi.get(videoId,rallyId,version,start).then(result=>{if(!cancelled)setData(result);}).catch(e=>{if(!cancelled)setError(e.message??'复盘证据加载失败');});
    return()=>{cancelled=true;};
  },[videoId,rallyId,version,start,revision]);
  useEffect(()=>{
    let cancelled=false;setStats(null);
    if(version)replayApi.statistics(videoId,version).then(s=>{if(!cancelled)setStats(s);}).catch(()=>{});
    return()=>{cancelled=true;};
  },[videoId,version,revision]);
  const current=data&&data.rally_id===rallyId&&data.timeline_version===version&&data.start_ms===start?data:null;
  const poseIndex=nearestIndex(current?.pose?.frames.map(f=>f.time_ms)??[],currentMs,current?.pose?600/current.pose.fps:0);
  const people=poseIndex>=0?current?.pose?.frames[poseIndex].people??[]:[];

  const trail=observedTrail(current?.frames??[],currentMs);
  function seek(ms:number){player.current?.pause();onSeek(ms/1000);}
  function beginCalibration(){if(!current)return;player.current?.pause();setCalibrating(true);setCorners([]);setFixed(false);setCalStart(current.review.calibration_start_ms/1000);setCalEnd(current.review.calibration_end_ms/1000);setError('');}
  async function saveReview(reviews:LandingReview[],newCorners?:Point2[]){
    if(!current)return;setBusy(true);setError('');
    try{await replayApi.save(videoId,current.review,newCorners??current.review.corners,reviews,
      newCorners?Math.round(calStart*1000):current.review.calibration_start_ms,
      newCorners?Math.round(calEnd*1000):current.review.calibration_end_ms);setCalibrating(false);setRevision(n=>n+1);}
    catch(e){setError(e instanceof Error?e.message:'保存失败');}
    finally{setBusy(false);}
  }
  function confirm(time:number,phase:Phase,status:'CONFIRMED'|'REJECTED'){
    if(!current)return;
    const reviews=current.review.reviews.filter(r=>!(r.rally_id===current.rally_id&&r.time_ms===time));
    void saveReview([...reviews,{rally_id:current.rally_id,time_ms:time,phase,status}]);
  }
  const selectedStats=stats??current?.statistics;
  const grid=modelStats?selectedStats?.model_estimates?.phases[phase]:selectedStats?.phases[phase];
  const poseView=<PoseReplayView pose={current?.pose??null} ball={current?.ball_3d} timeMs={currentMs}/>;
  const allHits=timeline?.items.filter(i=>i.type==='HIT_CANDIDATE'&&i.parent_id===rallyId).map(i=>i.start_ms).sort((a,b)=>a-b)??[];
  const previousHit=allHits.filter(t=>t<currentMs-40).at(-1),nextHit=allHits.find(t=>t>currentMs+40);
  const analysisActive=analysis?.state==='QUEUED'||analysis?.state==='RUNNING';
  useEffect(()=>{
    if(!version)return;
    let cancelled=false;
    const update=()=>replayApi.analysis(videoId,version).then(s=>{
      if(cancelled)return;
      const key=`${s.id}:${s.state}`;
      if(previousAnalysis.current!==null&&previousAnalysis.current!==key&&['READY','PARTIAL_READY'].includes(s.state))setRevision(n=>n+1);
      previousAnalysis.current=key;setAnalysis(s);
      if(s.available_engines.length===1)setEngine(s.available_engines[0]);
    }).catch(()=>{if(!cancelled)setAnalysis(null);});
    void update();
    const timer=analysisActive?setInterval(()=>void update(),2500):null;
    return()=>{cancelled=true;if(timer)clearInterval(timer);};
  },[videoId,version,analysisActive]);
  async function analyze(){
    if(!version)return;setBusy(true);setError('');
    try{setAnalysis(await replayApi.analyze(videoId,version,engine,engine==='pingpong3d'?players as AnalysisPlayerInfo[]:undefined));setNotice('正在补充复盘证据，原时间线和训练记录保持可用。');}
    catch(e){setError(e instanceof Error?e.message:'启动分析失败');}finally{setBusy(false);}
  }
  async function generateQuiz(){
    if(!version||!rallyId)return;setGenerating(true);setError('');
    try{const result=await quizApi.fromReplay(videoId,version,[rallyId]);setNotice(`已准备 ${result.items.length} 条待确认练习。请核对发球、暂停点和后续边界。`);}
    catch(e){setError(e instanceof Error?e.message:'生成练习失败');}finally{setGenerating(false);}
  }
  return <section className="analysis-player" aria-label="逐拍、落点与三维动作复盘">
    <div className={`replay-media-pair${paired&&current?' is-paired':''}`}>
    <Player ref={player} videoId={videoId} onTimeUpdate={onTimeUpdate} overlay={(w,h)=><svg
      className={`replay-overlay${calibrating?' is-calibrating':''}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet"
      aria-label={calibrating?`点击${cornerNames[corners.length]??'完成四角标定'}`:'视频同步球路与骨架'}
      onClick={event=>{if(!calibrating||corners.length>=4)return;const matrix=event.currentTarget.getScreenCTM();if(!matrix)return;
        const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
        const x=point.x/w,y=point.y/h;if(x>=0&&x<=1&&y>=0&&y<=1)setCorners(p=>[...p,[x,y]]);}}>
      {overlay&&!calibrating&&<>
        <polyline points={trail.map(p=>`${p[0]*w},${p[1]*h}`).join(' ')} fill="none" stroke="#8fffe0" strokeWidth={w/250}/>
        {trail.length>0&&<circle cx={trail.at(-1)![0]*w} cy={trail.at(-1)![1]*h} r={w/125} fill="#fff49b"/>}
        {people.map((p,k)=><g key={k} stroke={k?'#f5c784':'#9bbfff'} strokeWidth={w/350}>{current?.pose?.bones.map(([a,b])=>{
          const a2=p.image[a],b2=p.image[b];const a3=a2?imagePoint(a2,w,h,current?.pose?.image_space):null,b3=b2?imagePoint(b2,w,h,current?.pose?.image_space):null;return a3&&b3?<line key={`${a}-${b}`} x1={a3[0]} y1={a3[1]} x2={b3[0]} y2={b3[1]}/>:null;
        })}</g>)}
      </>}
      {calibrating&&<><polyline points={corners.map(p=>`${p[0]*w},${p[1]*h}`).join(' ')} fill="none" stroke="#f5c784" strokeWidth={w/300}/>{corners.map((p,i)=><g key={i}><circle cx={p[0]*w} cy={p[1]*h} r={w/80} fill="#f5c784"/><text x={p[0]*w} y={p[1]*h} fontSize={w/50} textAnchor="middle" fill="#111">{i+1}</text></g>)}</>}
    </svg>}/>
    {paired&&current&&poseView}
    </div>
    <div className="replay-toolbar">
      <button className="btn btn-ghost btn-sm" onClick={()=>seek(Math.max(0,currentMs-1000/30))}>‹ 一帧</button>
      <button className="btn btn-ghost btn-sm" onClick={()=>seek(Math.max(0,Math.min((timeline?.video_duration_ms??0)-1,currentMs+1000/30)))}>一帧 ›</button>
      <label>速度 <select value={rate} onChange={e=>{const r=Number(e.target.value);setRate(r);player.current?.setPlaybackRate(r);}}>{[.25,.5,1].map(r=><option key={r} value={r}>{r}×</option>)}</select></label>
      <label><input type="checkbox" checked={overlay} onChange={e=>setOverlay(e.target.checked)}/>球路与骨架</label>
      <label><input type="checkbox" checked={paired} onChange={e=>setPaired(e.target.checked)}/>并排对照 3D</label>
      <span className="muted">{formatMs(currentMs)} · 播放代理 30 fps</span>
    </div>
    <div className="replay-heading"><div><span className="eyebrow">EVIDENCE REPLAY</span><h3>每一拍，都能回看依据</h3></div>
      {!readOnly&&<button className="btn btn-ghost btn-sm" disabled={!current||busy} onClick={beginCalibration}>{current?.review.corners?'重新标定球台':'标定球台'}</button>}</div>
    {analysis&&<div className="replay-toolbar"><span role="status">复盘分析：{{NONE:'尚未补充',QUEUED:'排队中',RUNNING:'分析中',READY:'已完成',PARTIAL_READY:'部分能力可用',FAILED:'分析失败',STALE:'时间线已更新'}[analysis.state]}</span>
      {!readOnly&&<>{analysis.available_engines.length>1&&<label>分析引擎<select value={engine} disabled={busy||analysisActive} onChange={e=>setEngine(e.target.value as typeof engine)}>{analysis.available_engines.map(e=><option key={e} value={e}>{e==='pingpong3d'?'Pingpong3D · 球台与人体':'本地视觉分析'}</option>)}</select></label>}<button className="btn btn-primary btn-sm" disabled={busy||analysisActive||!analysis.available_engines.length||!version||(engine==='pingpong3d'&&!playersReady)} onClick={()=>void analyze()}>{analysisActive?'正在分析…':'补充／更新复盘分析'}</button>{!analysis.available_engines.length&&<span className="muted">分析模型尚未配置</span>}</>}
      {analysis.error_code&&<span className="muted">{({GPU_NOT_CONFIGURED:'三维分析服务尚未配置',TABLE_CALIBRATION_REQUIRED:'需要先核对球台标定',NO_USABLE_EVIDENCE:'此视频尚未获得可用的视觉证据',ANALYSIS_TIMEOUT:'分析超时，可以重试',PINGPONG3D_ANALYSIS_FAILED:'三维分析失败，可以重试',POSE_UNAVAILABLE:'本次动作骨架不可用，已保留其他可用证据',PLACEMENTS_UNAVAILABLE:'本次落点估计不可用，已保留其他可用证据',BALL_3D_UNAVAILABLE:'本次三维球路不可用，已保留其他可用证据',POSE_NO_DETECTIONS:'本次未检测到可用的人体动作，请检查原片中的球员是否清晰可见'} as Record<string,string>)[analysis.error_code]??'本次分析未完成，请检查分析服务后重试'}</span>}
    </div>}
    {!readOnly&&engine==='pingpong3d'&&analysis?.available_engines.includes('pingpong3d')&&<fieldset className="analysis-player-fields"><legend>本段视频的两位球员</legend>{players.map((p,i)=><div className="replay-toolbar" key={i}><span>球员 {i+1}</span><label>持拍手<select aria-label={`球员 ${i+1} 持拍手`} value={p.hand} disabled={analysisActive||busy} onChange={e=>setPlayers(old=>old.map((v,k)=>k===i?{...v,hand:e.target.value}:v))}><option value="">请选择</option><option value="right">右手</option><option value="left">左手</option></select></label><label>球衣主色<select aria-label={`球员 ${i+1} 球衣主色`} value={p.kit} disabled={analysisActive||busy} onChange={e=>setPlayers(old=>old.map((v,k)=>k===i?{...v,kit:e.target.value}:v))}><option value="">请选择</option>{Object.entries({red:'红',green:'绿',blue:'蓝',yellow:'黄',white:'白',black:'黑'}).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>)}<p className="muted replay-note">两人的球衣主色需要可区分；持拍手用于解释落点和动作，不自动猜测。</p></fieldset>}
    {notice&&<p role="status" className="banner">{notice} {!readOnly&&<Link to={`/videos/${videoId}/quizzes`}>查看练习片段</Link>}</p>}
    {error&&<div className="banner banner-error" role="alert">{error} <button className="btn btn-ghost btn-sm" onClick={()=>setRevision(n=>n+1)}>刷新复盘</button></div>}
    {!rally&&<p className="muted">点击右侧回合，查看逐拍证据、落点和同步动作。</p>}
    {rally&&!current&&!error&&<p role="status" className="muted">正在加载本回合复盘…</p>}
    {current&&!current.evidence_available&&<p className="banner banner-warn">此回合尚无视觉复盘证据。可使用补充复盘分析生成；现有触球时间仍可回看。</p>}
    {!readOnly&&calibrating&&<div className="calibration-editor">
      <h4>在视频上依次点击：远左 → 远右 → 近右 → 近左</h4><p>只在镜头固定、球台四角清楚的区间标定。重新标定会清除旧的落点确认。</p>
      <div className="calibration-fields">{cornerNames.map((name,i)=><label key={name}>{i+1}. {name}<span>{['x','y'].map((axis,j)=><input key={axis} type="number" min="0" max="1" step=".001" aria-label={`${name} ${axis}`} value={corners[i]?.[j]??''} onChange={e=>{const n=Number(e.target.value);setCorners(prev=>{const next=[...prev];while(next.length<=i)next.push([0,0]);next[i]=[...next[i]];next[i][j]=n;return next;});}}/>)}</span></label>)}</div>
      <div className="replay-toolbar"><label>起点（秒）<input type="number" value={calStart} min="0" onChange={e=>setCalStart(Number(e.target.value))}/></label><label>终点（秒）<input type="number" value={calEnd} min="0" onChange={e=>setCalEnd(Number(e.target.value))}/></label></div>
      <label><input type="checkbox" checked={fixed} onChange={e=>setFixed(e.target.checked)}/>已检查这个区间内机位和球台四角保持一致</label>
      <div className="replay-toolbar"><button className="btn btn-primary" disabled={busy||!fixed||corners.length!==4||calEnd<=calStart} onClick={()=>void saveReview([],corners)}>保存标定</button><button className="btn btn-ghost" onClick={()=>setCorners([])}>重新选四角</button><button className="btn btn-ghost" onClick={()=>setCalibrating(false)}>取消</button></div>
    </div>}
    {current&&<>
      <div className="replay-toolbar"><button className="btn btn-ghost btn-sm" disabled={previousHit===undefined} onClick={()=>seek(previousHit!)}>上一拍</button><button className="btn btn-ghost btn-sm" disabled={nextHit===undefined} onClick={()=>seek(nextHit!)}>下一拍</button>{!readOnly&&<button className="btn btn-ghost btn-sm" disabled={generating||allHits.length<2} onClick={()=>void generateQuiz()}>{generating?'正在准备…':'从本回合生成接发练习'}</button>}</div>
      <div className="contact-strip" aria-label="逐拍触球候选">{current.contacts.map(c=><button key={c.time_ms} className={`contact-button${Math.abs(currentMs-c.time_ms)<130?' is-current':''}`} onClick={()=>seek(c.time_ms)}><strong>第 {c.ordinal} 拍</strong><span>{formatMs(c.time_ms)}</span><small>{c.visual_supported?(c.audio_supported?'视觉＋声音':'视觉候选'):'时间线候选'}</small></button>)}{!current.contacts.length&&<p className="muted">这个区间暂无触球候选。</p>}</div>
      {(current.next_start_ms!==null||current.start_ms>current.rally_start_ms)&&<div className="replay-toolbar"><button className="btn btn-ghost btn-sm" disabled={current.start_ms<=current.rally_start_ms} onClick={()=>seek(Math.max(current.rally_start_ms,current.start_ms-30000))}>上一段</button><span>长回合按 30 秒加载</span><button className="btn btn-ghost btn-sm" disabled={current.next_start_ms===null} onClick={()=>seek(current.next_start_ms!)}>下一段</button></div>}
      <div className={`replay-grid${paired?' is-paired':''}`}>
        {!paired&&poseView}
        <div className="replay-pane"><div className="replay-pane-title"><h4>落点与发接发</h4><span>{current.placements.some(p=>p.basis==='PINGPONG3D_MODEL_ESTIMATE')?'模型标定 · 待复核':current.review.corners?'已标定球台':'等待球台标定'}</span></div>
          <svg className="placement-table" viewBox="0 0 200 320" aria-label="落点分布，空心为待确认，实心为已确认">
            <rect x="15" y="20" width="170" height="280" rx="2" fill="#1c514b" stroke="#c1dcd5"/>
            <path d="M 100 20 V 300 M 15 160 H 185" stroke="#e1ece8" strokeWidth="2"/>
            <text x="100" y="13" textAnchor="middle" fill="#a4aebb" fontSize="10">远端</text><text x="100" y="315" textAnchor="middle" fill="#a4aebb" fontSize="10">近端</text>
            {current.placements.filter(p=>p.status!=='REJECTED'&&p.table_xy!==null).map(p=><circle key={p.time_ms} cx={15+p.table_xy![0]*170} cy={20+p.table_xy![1]*280} r="6" fill={p.status==='CONFIRMED'?'#f5c784':'transparent'} stroke="#f5c784"><title>{formatMs(p.time_ms)} · {phaseLabels[p.phase]}</title></circle>)}
          </svg>
          <div className="replay-toolbar">{(['SERVE','RECEIVE','RALLY'] as const).map(p=><button key={p} className="btn btn-ghost btn-sm" aria-pressed={phase===p} onClick={()=>setPhase(p)}>{phaseLabels[p]}</button>)}</div>
          <div className="replay-toolbar"><button className="btn btn-ghost btn-sm" aria-pressed={!modelStats} onClick={()=>setModelStats(false)}>人工确认</button><button className="btn btn-ghost btn-sm" aria-pressed={modelStats} onClick={()=>setModelStats(true)}>自动估计</button></div><p className="replay-note">{stats?'全片':'本回合'}{modelStats?'自动估计':'已确认'}样本：{grid?.sample_count??0}。{modelStats?'只统计坐标与分区均可用的模型候选，与人工确认分开计数。':'空心落点为待复核候选，不进入已确认统计。'}</p>
          <p className="muted replay-note">{modelStats?`另有 ${selectedStats?.model_estimates?.unknown_count??selectedStats?.model_estimates?.excluded_count??0} 个候选因坐标或分区不明而不计入分布。`:null}</p><table className="placement-grid"><thead><tr><th>距球网</th><th>左</th><th>中</th><th>右</th></tr></thead><tbody>{['短区','中区','长区'].map((label,i)=><tr key={label}><th>{label}</th>{[0,1,2].map(j=><td key={j}>{grid?.grid[i][j]??0}</td>)}</tr>)}</tbody></table>
          <p className="muted replay-note">{selectedStats?.coordinate_note??'左右按球台标定方向，区域长短不等于球的第二落点。'} 尚不自动推断旋转或得失分。</p>
        </div>
      </div>
      <BiomechanicsNotes items={current.biomechanics??[]} timeMs={currentMs} onSeek={seek}/>
      {current.review.stale&&<p className="banner banner-warn">时间线已更新，旧落点确认已退出统计，请重新复核。</p>}
      {!readOnly&&(current.review.corners||current.placements.some(p=>p.basis==='PINGPONG3D_MODEL_ESTIMATE'))&&<details className="landing-reviews"><summary>复核本回合落点（{current.placements.length} 个候选）</summary>
        {!current.placements.length&&<p className="muted">未找到符合条件的落台候选。可检查标定范围和原片，不会补造落点。</p>}
        {current.placements.map(p=><div key={p.time_ms} className="landing-row"><button className="btn btn-ghost btn-sm" onClick={()=>seek(p.time_ms)}>{formatMs(p.time_ms)} ↗</button><span>{p.status==='CANDIDATE'?'待复核':p.status==='REJECTED'?'已排除':`已确认 · ${phaseLabels[p.phase]}`}</span><select aria-label={`${formatMs(p.time_ms)} 落点确认`} value={p.status==='CONFIRMED'?p.phase:p.status==='REJECTED'?'REJECTED':''} disabled={busy} onChange={e=>{if(e.target.value)confirm(p.time_ms,e.target.value==='REJECTED'?'UNKNOWN':e.target.value as Phase,e.target.value==='REJECTED'?'REJECTED':'CONFIRMED');}}><option value="">回看后选择</option><option value="SERVE">确认发球到对方台面</option><option value="RECEIVE">确认接发到对方台面</option><option value="RALLY">确认一般落台</option><option value="REJECTED">排除：不是落台</option></select></div>)}
      </details>}
      {!!current.limitations?.length&&<details className="replay-limitations"><summary>数据来源与限制</summary><ul>{current.limitations.map((s,i)=><li key={i}>{s}</li>)}</ul>{current.pose?.limitations?.map((s,i)=><p key={i}>{s}</p>)}</details>}
      <p className="muted replay-note">本窗口检测到球 {current.observed_count}/{current.sample_count} 帧{current.coverage===null?'':`（${(current.coverage*100).toFixed(1)}%）`}。覆盖率不代表识别正确率，触球与落点需结合原片复核。</p>
    </>}
  </section>;
});
export default AnalysisPlayer;
