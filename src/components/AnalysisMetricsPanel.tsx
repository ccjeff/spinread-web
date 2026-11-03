import {useEffect,useState} from 'react';
import {apiRequest} from '../api/client';

interface Alarm {code:string;message:string;active:boolean;first_seen_at:string}
interface Execution {execution_id:string;operation:string;engine:string|null;state:string;stage:string|null;
  created_at:string;elapsed_seconds:number|null;worker_seconds:number|null;queue_seconds:number|null;
  estimated_compute_usd:number|null;cost_basis:string;alerts:Alarm[];rate_card:{gpu:string|null}|null}
interface Metrics {executions:Execution[];estimated_compute_usd:number|null;unpriced_executions:number;
  total_cost_alarm:boolean;estimate_notice:string;thresholds:{elapsed_seconds:number;estimated_usd:number;stale_seconds:number}}
const duration=(s:number|null)=>s===null?'尚无计时':`${Math.floor(s/60)} 分 ${Math.floor(s%60)} 秒`;
const money=(n:number|null)=>n===null?'尚无估算':`$${n.toFixed(3)}`;
const states:Record<string,string>={PREPARED:'准备中',SUBMITTING:'提交中',RUNNING:'运行中',RESULT_PENDING:'结果传输中',SUCCEEDED:'计算完成',FAILED:'失败',TIMED_OUT:'超时',CANCELLED:'已取消'};
const stages:Record<string,string>={starting:'启动',downloading:'读取视频',analyzing:'推理',packaging:'打包结果',uploading:'上传结果',finished:'完成',failed:'失败'};

export default function AnalysisMetricsPanel({videoId}:{videoId:string}){
  const [data,setData]=useState<Metrics|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false,timer:ReturnType<typeof setTimeout>;
    async function refresh(){
      try{const value=await apiRequest<Metrics>(`/videos/${videoId}/analysis-metrics`);
        if(!cancelled){setData(value);setError('');}}
      catch{if(!cancelled)setError('分析监控暂时无法刷新；当前状态可能已过期。');}
      finally{if(!cancelled)timer=setTimeout(()=>void refresh(),10000);}
    }
    setData(null);void refresh();return()=>{cancelled=true;clearTimeout(timer);};
  },[videoId]);
  return <section className="nlf-runtime-status" aria-label="分析耗时与成本">
    <div className="replay-toolbar"><strong>分析耗时与成本</strong><span>累计计算费估算 {money(data?.estimated_compute_usd??null)}</span></div>
    {error&&<p role="alert" className="banner banner-warn">{error}</p>}
    {data&&<>
      {data.total_cost_alarm&&<p role="alert" className="banner banner-warn">本视频累计估算计算费已达到 ${data.thresholds.estimated_usd.toFixed(2)} 提醒阈值。</p>}
      {data.executions.length===0&&<p className="replay-note">尚无云端计算记录。导入已有骨架不会产生新的 GPU 推理费用。</p>}
      {data.executions.map((run,index)=><details key={run.execution_id} open={index===0}>
        <summary>{run.rate_card?.gpu??'CPU'} · {run.engine==='local'?'BlurBall 视觉分析':run.engine??run.operation} · {states[run.state]??run.state} · {duration(run.elapsed_seconds)} · {money(run.estimated_compute_usd)}</summary>
        <p className="replay-note">提交于 {new Date(run.created_at).toLocaleString()}。总耗时 {duration(run.elapsed_seconds)}；工作进程 {duration(run.worker_seconds)}；启动等待 {duration(run.queue_seconds)}。{run.stage?`阶段：${stages[run.stage]??run.stage}。`:''}</p>
        <p className="replay-note">{run.cost_basis==='WALL_TIME_ESTIMATE'?'历史任务未记录工作进程计时，费用按提交至完成的总耗时估算，包含排队时间。':run.cost_basis==='UNAVAILABLE'?'缺少计价信息，未记为零费用。':'费用由工作进程时长和固定资源单价估算，最终以供应商账单为准。'}</p>
        {run.alerts.map(alarm=><p key={alarm.code} role={alarm.active?'alert':'status'} className={alarm.active?'banner banner-warn':'replay-note'}>{alarm.active?'告警':'历史告警'}：{alarm.message}</p>)}
      </details>)}
      {!!data.unpriced_executions&&<p className="replay-note">有 {data.unpriced_executions} 个任务缺少费用信息，未计入总额。</p>}
      <p className="replay-note">{data.estimate_notice}</p>
      <p className="replay-note">告警：单次超过 {Math.round(data.thresholds.elapsed_seconds/60)} 分钟、估算费达到 ${data.thresholds.estimated_usd.toFixed(2)}、心跳中断 {Math.round(data.thresholds.stale_seconds/60)} 分钟或任务失败。页面每 10 秒刷新；后台同步记录告警。</p>
    </>}
  </section>;
}
