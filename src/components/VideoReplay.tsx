import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import AnalysisPlayer from './AnalysisPlayer';
import type {PlayerHandle} from './Player';
import {api,ApiError} from '../api/client';
import type {ActiveTimeline} from '../api/types';

/** Shared viewer for coach and player routes. Permissions remain server enforced. */
const VideoReplay=forwardRef<PlayerHandle,{videoId:string;readOnly?:boolean}>(function VideoReplay({videoId,readOnly=true},ref){
  const inner=useRef<PlayerHandle>(null);
  const [timeline,setTimeline]=useState<ActiveTimeline|null>(null),[ms,setMs]=useState(0),[error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;setTimeline(null);setMs(0);setError('');
    api.getActiveTimeline(videoId).then(v=>{if(!cancelled)setTimeline(v);}).catch(e=>{if(!cancelled&&!(e instanceof ApiError&&e.status===404))setError(e.message??'时间线加载失败');});
    return()=>{cancelled=true;};
  },[videoId]);
  function seek(seconds:number){inner.current?.seekTo(seconds);setMs(Math.round(seconds*1000));}
  useImperativeHandle(ref,()=>({seekTo:seek,play:()=>inner.current?.play(),pause:()=>inner.current?.pause(),currentTime:()=>inner.current?.currentTime()??0,setPlaybackRate:r=>inner.current?.setPlaybackRate(r)}),[]);
  return <>{error&&<p className="banner banner-error" role="alert">{error}</p>}<AnalysisPlayer ref={inner} videoId={videoId} timeline={timeline} currentMs={ms} activeItemId={null} onSeek={seek} onTimeUpdate={s=>setMs(Math.round(s*1000))} readOnly={readOnly}/>
    {!!timeline?.items.some(i=>i.type==='RALLY')&&<div className="replay-toolbar"><label>选择回合<select aria-label="选择复盘回合" value={timeline.items.find(i=>i.type==='RALLY'&&i.start_ms<=ms&&ms<i.end_ms)?.item_id??''} onChange={e=>{const r=timeline.items.find(i=>i.item_id===e.target.value);if(r)seek(r.start_ms/1000);}}><option value="">选择回合</option>{timeline.items.filter(i=>i.type==='RALLY').map((r,i)=><option key={r.item_id} value={r.item_id}>回合 {i+1} · {(r.start_ms/1000).toFixed(1)} 秒</option>)}</select></label></div>}
  </>;
});
export default VideoReplay;
