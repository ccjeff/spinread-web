import {forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react';
import Player from './Player';
import PoseReplayView from './PoseReplayView';
import BiomechanicsNotes from './BiomechanicsNotes';
import {Link} from 'react-router-dom';
import {quizApi} from '../api/quiz';
import type {PlayerHandle} from './Player';
import type {ActiveTimeline} from '../api/types';
import {replayApi} from '../api/replay';
import type {Replay, Point2, Phase, Statistics, LandingReview, ReplayAnalysis, ReplayEngine, AnalysisPlayerInfo} from '../api/replay';
import {nearestIndex, observedTrail, imagePoint, placementWindowCounts, placementEmptyReason, calibrationWindows, upsertCalibration, calibrationRangeIssue, reviewsOutsideCalibrationChanges, ballSegmentSeekTime} from '../utils/replay';
const formatMs=(ms:number)=>`${Math.floor(ms/60000).toString().padStart(2,'0')}:${((ms%60000)/1000).toFixed(2).padStart(5,'0')}`;

const phaseLabels={SERVE:'发球落点',RECEIVE:'接发落点',RALLY:'相持落点',UNKNOWN:'待确认'};
const cornerNames=['远端左角','远端右角','近端右角','近端左角'];
const engineNames={local:'本地视觉分析',pingpong3d:'Pingpong3D · 球台与人体',nlf:'NLF / SMPL · 人体网格'};
const nlfMissing:Record<string,string>={NLF_WEIGHTS_MISSING:'缺少 NLF 模型权重',SMPL_FACES_MISSING:'缺少 SMPL 网格拓扑',CUDA_UNAVAILABLE:'没有可用的 CUDA GPU',TORCH_MISSING:'尚未安装 PyTorch',TORCH_UNAVAILABLE:'PyTorch 无法加载',TORCHVISION_MISSING:'尚未安装 TorchVision',TORCHVISION_UNAVAILABLE:'TorchVision 无法加载',NLF_RUNTIME_MISSING:'NLF 运行环境尚未配置'};
interface Props {videoId: string; timeline: ActiveTimeline | null; currentMs: number; activeItemId: string | null; onTimeUpdate: (seconds:number)=>void; onSeek:(seconds:number)=>void; readOnly?:boolean}

const AnalysisPlayer=forwardRef<PlayerHandle,Props>(function AnalysisPlayer({videoId,timeline,currentMs,activeItemId,onTimeUpdate,onSeek,readOnly=false},ref){
  const player=useRef<PlayerHandle>(null);
  const calibrationAnchor=useRef<HTMLDivElement>(null),calibrationEditor=useRef<HTMLDivElement>(null),landingReviews=useRef<HTMLDetailsElement>(null);
  useImperativeHandle(ref,()=>({seekTo:s=>player.current?.seekTo(s),play:()=>player.current?.play(),pause:()=>player.current?.pause(),currentTime:()=>player.current?.currentTime()??0,setPlaybackRate:r=>player.current?.setPlaybackRate(r)}),[]);
  const rallies=useMemo(()=>timeline?.items.filter(i=>i.type==='RALLY').sort((a,b)=>a.start_ms-b.start_ms)??[],[timeline]);
  const rally=rallies.find(r=>r.start_ms<=currentMs&&currentMs<r.end_ms)??rallies.find(r=>r.item_id===activeItemId)??(currentMs<(rallies[0]?.start_ms??0)?rallies[0]:undefined);
  const start=rally?Math.min(rally.end_ms-1,rally.start_ms+Math.floor(Math.max(0,currentMs-rally.start_ms)/30000)*30000):0;
  const [data,setData]=useState<Replay|null>(null),[stats,setStats]=useState<Statistics|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const [calibrating,setCalibrating]=useState(false),[corners,setCorners]=useState<Point2[]>([]),[fixed,setFixed]=useState(false);
  const [calStart,setCalStart]=useState(0),[calEnd,setCalEnd]=useState(0);
  const [calibrationId,setCalibrationId]=useState('');
  const [modelStats,setModelStats]=useState(true);
  const [analysis,setAnalysis]=useState<ReplayAnalysis|null>(null),[engine,setEngine]=useState<ReplayEngine>('local');
  const [notice,setNotice]=useState('');
  const [players,setPlayers]=useState([{hand:'',kit:''},{hand:'',kit:''}]);
  const playersReady=players.every(p=>p.hand&&p.kit)&&players[0].kit!==players[1].kit;
  const [generating,setGenerating]=useState(false);
  const previousAnalysis=useRef<string|null>(null);
  const [overlay,setOverlay]=useState(true),[phase,setPhase]=useState<'ALL'|'SERVE'|'RECEIVE'|'RALLY'>('ALL');
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
  const calibrations=calibrationWindows(current?.review);
  const activeCalibration=calibrations.find(w=>w.start_ms<=currentMs&&currentMs<w.end_ms);
  const calibrationDraft={id:calibrationId,corners,start_ms:Math.round(calStart*1000),end_ms:Math.round(calEnd*1000)};
  const proposedCalibrations=upsertCalibration(calibrations,calibrationDraft);
  const calibrationIssue=calibrating?calibrationRangeIssue(proposedCalibrations,timeline?.video_duration_ms??0):null;
  const calibrationIsNew=!calibrations.some(w=>w.id===calibrationId);
  const poseIndex=nearestIndex(current?.pose?.frames.map(f=>f.time_ms)??[],currentMs,current?.pose?600/current.pose.fps:0);
  const people=poseIndex>=0?current?.pose?.frames[poseIndex].people??[]:[];

  const trail=observedTrail(current?.frames??[],currentMs);
  function seek(ms:number){player.current?.pause();onSeek(ms/1000);}
  function beginCalibration(addNew=false){
    if(!current)return;
    const existing=addNew?undefined:activeCalibration;
    player.current?.pause();setPaired(false);setCalibrating(true);setCalibrationId(existing?.id??crypto.randomUUID());
    setCorners(existing?.corners.map(p=>[...p] as Point2)??[]);setFixed(false);
    setCalStart((existing?.start_ms??current.rally_start_ms)/1000);setCalEnd((existing?.end_ms??current.rally_end_ms)/1000);
    setError('');requestAnimationFrame(()=>calibrationAnchor.current?.scrollIntoView({behavior:'smooth',block:'start'}));
  }
  function openLandingReviews(){if(landingReviews.current){landingReviews.current.open=true;landingReviews.current.scrollIntoView({behavior:'smooth',block:'start'});}}
  async function saveReview(reviews:LandingReview[],saveCalibration=false){
    if(!current)return;setBusy(true);setError('');
    try{await replayApi.save(videoId,current.review,saveCalibration?proposedCalibrations:calibrations,
      saveCalibration?reviewsOutsideCalibrationChanges(calibrations,proposedCalibrations,current.review.reviews):reviews);
      setCalibrating(false);setRevision(n=>n+1);}
    catch(e){setError(e instanceof Error?e.message:'保存失败');}
    finally{setBusy(false);}
  }
  function confirm(time:number,phase:Phase,status:'CONFIRMED'|'REJECTED'){
    if(!current)return;
    const reviews=current.review.reviews.filter(r=>!(r.rally_id===current.rally_id&&r.time_ms===time));
    void saveReview([...reviews,{rally_id:current.rally_id,time_ms:time,phase,status}]);
  }
  const selectedStats=stats??current?.statistics;
  const grid=phase==='ALL'?(modelStats?selectedStats?.model_estimates?.all_placements:selectedStats?.all_placements)
    :(modelStats?selectedStats?.model_estimates?.phases[phase]:selectedStats?.phases[phase]);
  const placementCounts=placementWindowCounts(current?.placements??[]);
  const unclassified=selectedStats?.unclassified_count??placementCounts.unclassified;
  const zeroReason=current?placementEmptyReason({sampleCount:grid?.sample_count,model:modelStats,phase,
    calibrated:calibrations.length>0,calibrationOverlap:calibrations.some(w=>current.start_ms<w.end_ms&&current.end_ms>w.start_ms),
    projected:placementCounts.projected,observed:current.observed_count,unclassified,pending:selectedStats?.candidate_count??placementCounts.pending,
    invalid:selectedStats?.unknown_count??placementCounts.invalid}):null;
  const zeroMessages={STATS_UNAVAILABLE:'统计尚未加载，暂不把缺失数据显示为 0。',NEEDS_CALIBRATION:'尚未标定球台。本地球路还无法换算成台面落点；先标定视频中的四角，再查看候选估计。',
    OUTSIDE_CALIBRATION:'当前窗口超出标定有效区间，本地落点不会计入。请定位到有效区间，或核对机位后调整标定范围。',
    UNCLASSIFIED:`有 ${unclassified} 个有效落点候选尚未区分发球、接发或相持。它们计入“全部落点”的候选估计；回看并归类确认后，才进入对应的人工确认统计。`,
    UNCONFIRMED:'已有落点候选，但还没有足够的人工确认记录。空心点不会自动计入已确认样本；请回看候选并选择所属阶段。',
    INCOMPLETE:'候选缺少可用的台面坐标或区域信息，暂不计入分布。请核对原片和标定，不能用缺失坐标补成落点。',
    NO_BALL_EVIDENCE:'当前窗口没有可用于落点计算的球路观测。可先补充复盘分析；人体骨架可用并不代表球路已检测到。',
    NO_VALID_LANDING:'当前窗口尚未检测到符合条件的落台候选。标定只建立球台坐标，仍需连续球路证据；可检查原片、标定区间或其他回合。',
    NO_PHASE_ESTIMATE:'该阶段暂时没有自动归类的落点估计。本地视觉候选默认“阶段待归类”，可在“全部落点”查看并人工确认。',
    NO_CONFIRMED_PHASE:'当前筛选尚无人工确认的落点。请在候选列表回看并确认所属阶段。'};
  const poseView=<PoseReplayView pose={current?.pose??null} ball={current?.ball_3d} mesh={current?.mesh} timeMs={currentMs}/>;
  const allHits=timeline?.items.filter(i=>i.type==='HIT_CANDIDATE'&&i.parent_id===rallyId).map(i=>i.start_ms).sort((a,b)=>a-b)??[];
  const previousHit=allHits.filter(t=>t<currentMs-40).at(-1),nextHit=allHits.find(t=>t>currentMs+40);
  const nextBall=current?.ball_3d?.segments.find(segment=>segment.start_ms>currentMs+2&&ballSegmentSeekTime(segment)!==null);
  const nextBallTarget=nextBall?ballSegmentSeekTime(nextBall):null;
  const analysisActive=analysis?.state==='QUEUED'||analysis?.state==='RUNNING';
  useEffect(()=>{
    if(!version)return;
    let cancelled=false;
    const update=()=>replayApi.analysis(videoId,version).then(s=>{
      if(cancelled)return;
      const key=`${s.id}:${s.state}`;
      if(previousAnalysis.current!==null&&previousAnalysis.current!==key&&['READY','PARTIAL_READY'].includes(s.state))setRevision(n=>n+1);
      previousAnalysis.current=key;setAnalysis(s);
      setEngine(previous=>s.available_engines.includes(previous)?previous:s.available_engines[0]??'local');
    }).catch(()=>{if(!cancelled)setAnalysis(null);});
    void update();
    const timer=analysisActive?setInterval(()=>void update(),2500):null;
    return()=>{cancelled=true;if(timer)clearInterval(timer);};
  },[videoId,version,analysisActive]);
  async function analyze(selected:ReplayEngine=engine){
    if(!version||!analysis?.available_engines.includes(selected)||(selected==='nlf'&&!analysis.nlf?.available))return;setBusy(true);setError('');
    try{setAnalysis(await replayApi.analyze(videoId,version,selected,selected==='pingpong3d'?players as AnalysisPlayerInfo[]:undefined));setNotice('正在补充复盘证据，原时间线和训练记录保持可用。');}
    catch(e){setError(e instanceof Error?e.message:'启动分析失败');}finally{setBusy(false);}
  }
  async function generateQuiz(){
    if(!version||!rallyId)return;setGenerating(true);setError('');
    try{const result=await quizApi.fromReplay(videoId,version,[rallyId]);setNotice(`已准备 ${result.items.length} 条待确认练习。请核对发球、暂停点和后续边界。`);}
    catch(e){setError(e instanceof Error?e.message:'生成练习失败');}finally{setGenerating(false);}
  }
  return <section className="analysis-player" aria-label="逐拍、落点与三维动作复盘">
    <div ref={calibrationAnchor} className="replay-calibration-anchor">
      {calibrating&&<div className="calibration-guide" role="status"><strong>{corners.length<4?`球台标定：请点击第 ${corners.length+1} 个角（${cornerNames[corners.length]}）`:'四角已选，请核对有效区间并保存'}</strong><p>按视频画面中的远左 → 远右 → 近右 → 近左依次点击。只适用于机位与球台位置不变的区间。</p><div className="replay-toolbar"><span>当前设置：{formatMs(calStart*1000)}–{formatMs(calEnd*1000)}</span><button className="btn btn-ghost btn-sm" onClick={()=>calibrationEditor.current?.scrollIntoView({behavior:'smooth',block:'start'})}>查看范围与保存</button><button className="btn btn-ghost btn-sm" onClick={()=>setCalibrating(false)}>取消标定</button></div></div>}
    </div>
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
      {!readOnly&&<button className="btn btn-ghost btn-sm" disabled={!current||busy} onClick={()=>beginCalibration()}>{activeCalibration?'调整当前标定':'标定当前机位'}</button>}</div>
    {analysis&&<div className="replay-toolbar"><span role="status">复盘分析：{{NONE:'尚未补充',QUEUED:'排队中',RUNNING:'分析中',READY:'已完成',PARTIAL_READY:'部分能力可用',FAILED:'分析失败',STALE:'时间线已更新'}[analysis.state]}</span>
      {!readOnly&&<>{analysis.available_engines.length>1&&<label>分析引擎<select value={engine} disabled={busy||analysisActive} onChange={e=>setEngine(e.target.value as ReplayEngine)}>{analysis.available_engines.map(e=><option key={e} value={e}>{engineNames[e]}</option>)}</select></label>}<button className="btn btn-primary btn-sm" disabled={busy||analysisActive||!analysis.available_engines.includes(engine)||!version||(engine==='pingpong3d'&&!playersReady)||(engine==='nlf'&&!analysis.nlf?.available)} onClick={()=>void analyze()}>{analysisActive?'正在分析…':'补充／更新复盘分析'}</button>{!analysis.available_engines.length&&<span className="muted">分析模型尚未配置</span>}</>}
      {analysis.error_code&&<span className="muted">{({NLF_RUNTIME_UNAVAILABLE:'NLF 模型或 CUDA 环境尚未就绪',NLF_ANALYSIS_FAILED:'NLF 人体网格分析失败，可以在检查运行环境后重试',BALL_3D_PARTIAL_COVERAGE:'三维球路仅在有限区间可用，未通过质量门限的区间保留缺口',GPU_NOT_CONFIGURED:'三维分析服务尚未配置',TABLE_CALIBRATION_REQUIRED:'需要先核对球台标定',NO_USABLE_EVIDENCE:'此视频尚未获得可用的视觉证据',ANALYSIS_TIMEOUT:'分析超时，可以重试',PINGPONG3D_ANALYSIS_FAILED:'三维分析失败，可以重试',POSE_UNAVAILABLE:'本次动作骨架不可用，已保留其他可用证据',PLACEMENTS_UNAVAILABLE:'本次落点估计不可用，已保留其他可用证据',BALL_3D_UNAVAILABLE:'本次三维球路不可用，已保留其他可用证据',POSE_NO_DETECTIONS:'本次未检测到可用的人体动作，请检查原片中的球员是否清晰可见'} as Record<string,string>)[analysis.error_code]??'本次分析未完成，请检查分析服务后重试'}</span>}
    </div>}
    {analysis?.nlf&&<div className="nlf-runtime-status"><div className="replay-toolbar"><strong>NLF / SMPL 人体网格</strong><span>{analysis.nlf.available?'运行环境已就绪':'本机运行环境未就绪'}</span>{!readOnly&&<button className="btn btn-ghost btn-sm" disabled={busy||analysisActive||!version||!analysis.nlf.available||!analysis.available_engines.includes('nlf')} onClick={()=>void analyze('nlf')}>运行 NLF / SMPL</button>}</div><p className="replay-note">{analysis.nlf.available?'可按原片时间生成真实模型网格；已有视频、骨架和训练记录保留。':`缺少条件：${analysis.nlf.missing.map(code=>nlfMissing[code]??code).join('、')||'请检查 NLF 模型与 GPU 配置'}。当前已有的 MediaPipe 骨架与球路仍可独立查看。`}</p></div>}
    {!readOnly&&engine==='pingpong3d'&&analysis?.available_engines.includes('pingpong3d')&&<fieldset className="analysis-player-fields"><legend>本段视频的两位球员</legend>{players.map((p,i)=><div className="replay-toolbar" key={i}><span>球员 {i+1}</span><label>持拍手<select aria-label={`球员 ${i+1} 持拍手`} value={p.hand} disabled={analysisActive||busy} onChange={e=>setPlayers(old=>old.map((v,k)=>k===i?{...v,hand:e.target.value}:v))}><option value="">请选择</option><option value="right">右手</option><option value="left">左手</option></select></label><label>球衣主色<select aria-label={`球员 ${i+1} 球衣主色`} value={p.kit} disabled={analysisActive||busy} onChange={e=>setPlayers(old=>old.map((v,k)=>k===i?{...v,kit:e.target.value}:v))}><option value="">请选择</option>{Object.entries({red:'红',green:'绿',blue:'蓝',yellow:'黄',white:'白',black:'黑'}).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>)}<p className="muted replay-note">两人的球衣主色需要可区分；持拍手用于解释落点和动作，不自动猜测。</p></fieldset>}
    {notice&&<p role="status" className="banner">{notice} {!readOnly&&<Link to={`/videos/${videoId}/quizzes`}>查看练习片段</Link>}</p>}
    {error&&<div className="banner banner-error" role="alert">{error} <button className="btn btn-ghost btn-sm" onClick={()=>setRevision(n=>n+1)}>刷新复盘</button></div>}
    {!rally&&<p className="muted">点击右侧回合，查看逐拍证据、落点和同步动作。</p>}
    {rally&&!current&&!error&&<p role="status" className="muted">正在加载本回合复盘…</p>}
    {current&&!current.evidence_available&&<p className="banner banner-warn">此回合尚无视觉复盘证据。可使用补充复盘分析生成；现有触球时间仍可回看。</p>}
    {!readOnly&&calibrating&&<div className="calibration-editor" ref={calibrationEditor}>
      <h4>{calibrationIsNew?'新增机位标定':'调整当前标定'}：有效区间与保存</h4><p>在视频画面依次点击：远左 → 远右 → 近右 → 近左。只在镜头固定、球台四角清楚的区间生效。更改标定只清除受影响区间内的旧落点确认，其余机位和记录保留。</p>
      <div className="calibration-fields">{cornerNames.map((name,i)=><label key={name}>{i+1}. {name}<span>{['x','y'].map((axis,j)=><input key={axis} type="number" min="0" max="1" step=".001" aria-label={`${name} ${axis}`} value={corners[i]?.[j]??''} onChange={e=>{const n=Number(e.target.value);setCorners(prev=>{const next=[...prev];while(next.length<=i)next.push([0,0]);next[i]=[...next[i]];next[i][j]=n;return next;});}}/>)}</span></label>)}</div>
      <div className="replay-toolbar"><label>有效起点（原片秒数）<input type="number" value={calStart} min="0" max={(timeline?.video_duration_ms??0)/1000} step=".001" onChange={e=>setCalStart(Number(e.target.value))}/></label><label>有效终点（原片秒数）<input type="number" value={calEnd} min="0" max={(timeline?.video_duration_ms??0)/1000} step=".001" onChange={e=>setCalEnd(Number(e.target.value))}/></label></div>
      <p className="muted replay-note">当前设置 {formatMs(calStart*1000)}–{formatMs(calEnd*1000)}，起点含、终点不含。新增默认当前回合，可扩展到已核对的固定机位区间；不得与其他已保存区间重叠。</p>
      {calibrationIssue&&<p className="banner banner-warn" role="status">{calibrationIssue}</p>}
      <label><input type="checkbox" checked={fixed} onChange={e=>setFixed(e.target.checked)}/>已检查这个区间内机位和球台四角保持一致</label>
      <div className="replay-toolbar"><button className="btn btn-primary" disabled={busy||!fixed||corners.length!==4||!!calibrationIssue} onClick={()=>void saveReview(current?.review.reviews??[],true)}>保存此区间标定</button><button className="btn btn-ghost" onClick={()=>{setCorners([]);calibrationAnchor.current?.scrollIntoView({behavior:'smooth',block:'start'});}}>重新选四角</button><button className="btn btn-ghost" onClick={()=>setCalibrating(false)}>取消</button></div>
    </div>}
    {current&&<>
      <div className="replay-toolbar"><button className="btn btn-ghost btn-sm" disabled={previousHit===undefined} onClick={()=>seek(previousHit!)}>上一拍</button><button className="btn btn-ghost btn-sm" disabled={nextHit===undefined} onClick={()=>seek(nextHit!)}>下一拍</button>{!readOnly&&<button className="btn btn-ghost btn-sm" disabled={generating||allHits.length<2} onClick={()=>void generateQuiz()}>{generating?'正在准备…':'从本回合生成接发练习'}</button>}</div>
      <div className="replay-toolbar">{current.ball_3d&&<><button className="btn btn-ghost btn-sm" disabled={nextBallTarget===null} onClick={()=>{if(nextBallTarget===null)return;seek(nextBallTarget);requestAnimationFrame(()=>calibrationAnchor.current?.scrollIntoView({behavior:'smooth',block:'start'}));}}>下一段可用 3D 球路（本窗口）</button><span className="muted">{current.ball_3d.segments.length?`本窗口有 ${current.ball_3d.segments.length} 段拟合球路`:'本窗口没有通过质量门限的 3D 球路'}</span></>}</div>
      <div className="contact-strip" aria-label="逐拍触球候选">{current.contacts.map(c=><button key={c.time_ms} className={`contact-button${Math.abs(currentMs-c.time_ms)<130?' is-current':''}`} onClick={()=>seek(c.time_ms)}><strong>第 {c.ordinal} 拍</strong><span>{formatMs(c.time_ms)}</span><small>{c.visual_supported?(c.audio_supported?'视觉＋声音':'视觉候选'):'时间线候选'}</small></button>)}{!current.contacts.length&&<p className="muted">这个区间暂无触球候选。</p>}</div>
      {(current.next_start_ms!==null||current.start_ms>current.rally_start_ms)&&<div className="replay-toolbar"><button className="btn btn-ghost btn-sm" disabled={current.start_ms<=current.rally_start_ms} onClick={()=>seek(Math.max(current.rally_start_ms,current.start_ms-30000))}>上一段</button><span>长回合按 30 秒加载</span><button className="btn btn-ghost btn-sm" disabled={current.next_start_ms===null} onClick={()=>seek(current.next_start_ms!)}>下一段</button></div>}
      <div className={`replay-grid${paired?' is-paired':''}`}>
        {!paired&&poseView}
        <div className="replay-pane"><div className="replay-pane-title"><h4>落点与发接发</h4><span>{current.placements.some(p=>p.basis==='PINGPONG3D_MODEL_ESTIMATE')?'模型标定 · 待复核':activeCalibration?'当前机位已标定':'当前画面未标定'}</span></div>
          <div className="replay-toolbar">{!readOnly&&<><button className={`btn ${activeCalibration?'btn-ghost':'btn-primary'} btn-sm`} disabled={busy} onClick={()=>beginCalibration()}>{activeCalibration?'调整当前标定':'标定当前机位并计算落点'}</button>{!!calibrations.length&&<button className="btn btn-ghost btn-sm" disabled={busy||calibrations.length>=100} onClick={()=>beginCalibration(true)}>新增标定区间</button>}</>}{activeCalibration?<span className="muted">当前生效：{formatMs(activeCalibration.start_ms)}–{formatMs(activeCalibration.end_ms)}</span>:<span className="muted">当前播放位置不在已保存的标定区间内。本地落点需要先标定视频中的球台四角。</span>}</div>
          {!!calibrations.length&&<details className="calibration-windows"><summary>已保存的机位标定（{calibrations.length} 个区间）</summary><p className="muted replay-note">定位到对应区间后可调整其标定。起点含、终点不含；区间互不重叠。</p><div className="replay-toolbar">{calibrations.map((w,i)=><button key={w.id} className="btn btn-ghost btn-sm" aria-pressed={w.id===activeCalibration?.id} onClick={()=>seek(w.start_ms)}>{i+1}. {formatMs(w.start_ms)}–{formatMs(w.end_ms)}{w.id===activeCalibration?.id?' · 当前生效':' · 定位'}</button>)}</div></details>}
          <svg className="placement-table" viewBox="0 0 200 320" aria-label="落点分布，空心为待确认，实心为已确认">
            <rect x="15" y="20" width="170" height="280" rx="2" fill="#1c514b" stroke="#c1dcd5"/>
            <path d="M 100 20 V 300 M 15 160 H 185" stroke="#e1ece8" strokeWidth="2"/>
            <text x="100" y="13" textAnchor="middle" fill="#a4aebb" fontSize="10">远端</text><text x="100" y="315" textAnchor="middle" fill="#a4aebb" fontSize="10">近端</text>
            {current.placements.filter(p=>p.status!=='REJECTED'&&p.table_xy!==null).map(p=><circle key={p.time_ms} cx={15+p.table_xy![0]*170} cy={20+p.table_xy![1]*280} r="6" fill={p.status==='CONFIRMED'?'#f5c784':'transparent'} stroke="#f5c784"><title>{formatMs(p.time_ms)} · {phaseLabels[p.phase]}</title></circle>)}
          </svg>
          <div className="replay-toolbar">{(['ALL','SERVE','RECEIVE','RALLY'] as const).map(p=><button key={p} className="btn btn-ghost btn-sm" aria-pressed={phase===p} onClick={()=>setPhase(p)}>{p==='ALL'?'全部落点':phaseLabels[p]}</button>)}</div>
          <div className="replay-toolbar"><button className="btn btn-ghost btn-sm" aria-pressed={modelStats} onClick={()=>setModelStats(true)}>候选估计</button><button className="btn btn-ghost btn-sm" aria-pressed={!modelStats} onClick={()=>setModelStats(false)}>人工确认</button></div>
          <p className="replay-note">{stats?'全片':'本回合'}{modelStats?'候选估计':'已确认'}样本：{grid?.sample_count??'—'}。{modelStats?'统计坐标与分区均可用、且未被排除的候选；人工确认单独计数。':'空心落点为待复核候选，不进入已确认统计。'}</p>
          {zeroReason&&<div className="placement-help" role="status"><p>{zeroMessages[zeroReason]}</p>{!readOnly&&placementCounts.pending>0&&<button className="btn btn-ghost btn-sm" onClick={openLandingReviews}>回看并归类候选</button>}</div>}
          <p className="muted replay-note">{stats?'全片':'本回合'}阶段待归类：{unclassified}。本地视觉不会自动猜测发球、接发或相持。</p>
          <p className="muted replay-note">当前窗口 {formatMs(current.start_ms)}–{formatMs(current.end_ms)}：{placementCounts.pending} 个待复核，{placementCounts.invalid} 个坐标或分区不完整。图中只展示本窗口；表格{stats?'统计全片':'统计本回合'}。</p>
          {modelStats&&<p className="muted replay-note">候选来源：本地标定球路及已导入的 Pingpong3D 估计。{(selectedStats?.model_estimates?.unknown_count??selectedStats?.model_estimates?.excluded_count??0)>0?`另有 ${selectedStats?.model_estimates?.unknown_count??selectedStats?.model_estimates?.excluded_count} 个候选因坐标或分区不明而不计入分布。`:''}</p>}
          <table className="placement-grid"><thead><tr><th>距球网</th><th>左</th><th>中</th><th>右</th></tr></thead><tbody>{['短区','中区','长区'].map((label,i)=><tr key={label}><th>{label}</th>{[0,1,2].map(j=><td key={j}>{grid?.grid[i][j]??'—'}</td>)}</tr>)}</tbody></table>
          <p className="muted replay-note">{selectedStats?.coordinate_note??'左右按球台标定方向，区域长短不等于球的第二落点。'} 尚不自动推断旋转或得失分。</p>
        </div>
      </div>
      <BiomechanicsNotes items={current.biomechanics??[]} timeMs={currentMs} onSeek={seek}/>
      {current.review.stale&&<p className="banner banner-warn">时间线已更新，旧落点确认已退出统计，请重新复核。</p>}
      {!readOnly&&(calibrations.length>0||current.placements.some(p=>p.basis==='PINGPONG3D_MODEL_ESTIMATE'))&&<details className="landing-reviews" ref={landingReviews}><summary>复核当前窗口落点（{current.placements.length} 个候选）</summary>
        {!current.placements.length&&<p className="muted">未找到符合条件的落台候选。可检查标定范围和原片，不会补造落点。</p>}
        {current.placements.map(p=><div key={p.time_ms} className="landing-row"><button className="btn btn-ghost btn-sm" onClick={()=>seek(p.time_ms)}>{formatMs(p.time_ms)} ↗</button><span>{p.status==='CANDIDATE'?`待复核 · ${p.phase==='UNKNOWN'?'阶段待归类':phaseLabels[p.phase]}`:p.status==='REJECTED'?'已排除':`已确认 · ${phaseLabels[p.phase]}`}</span><select aria-label={`${formatMs(p.time_ms)} 落点确认`} value={p.status==='CONFIRMED'?p.phase:p.status==='REJECTED'?'REJECTED':''} disabled={busy} onChange={e=>{if(e.target.value)confirm(p.time_ms,e.target.value==='REJECTED'?'UNKNOWN':e.target.value as Phase,e.target.value==='REJECTED'?'REJECTED':'CONFIRMED');}}><option value="">回看后选择</option><option value="SERVE">确认发球到对方台面</option><option value="RECEIVE">确认接发到对方台面</option><option value="RALLY">确认一般落台</option><option value="REJECTED">排除：不是落台</option></select></div>)}
      </details>}
      {!!current.limitations?.length&&<details className="replay-limitations"><summary>数据来源与限制</summary><ul>{current.limitations.map((s,i)=><li key={i}>{s}</li>)}</ul>{current.pose?.limitations?.map((s,i)=><p key={i}>{s}</p>)}</details>}
      <p className="muted replay-note">本窗口检测到球 {current.observed_count}/{current.sample_count} 帧{current.coverage===null?'':`（${(current.coverage*100).toFixed(1)}%）`}。覆盖率不代表识别正确率，触球与落点需结合原片复核。</p>
    </>}
  </section>;
});
export default AnalysisPlayer;
