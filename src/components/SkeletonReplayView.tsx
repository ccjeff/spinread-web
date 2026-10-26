import {useMemo,useState} from 'react';
import type {Ball3D, Point3, Pose} from '../api/replay';
import {ballAt, nearestIndex, projectCourt, projectJoint} from '../utils/replay';

const angleLabels:Record<string,string>={left_elbow:'左肘',right_elbow:'右肘',left_knee:'左膝',right_knee:'右膝'};

export default function SkeletonReplayView({pose,ball,timeMs}:{pose:Pose|null;ball?:Ball3D|null;timeMs:number}){
  const [yaw,setYaw]=useState(0),[chosen,setChosen]=useState('ALL');
  const court=pose?.coordinate_space==='TABLE_METERS_Z_UP'||!!ball;
  const i=nearestIndex(pose?.frames.map(f=>f.time_ms)??[],timeMs,pose?.fps?Math.min(120,600/pose.fps):0);
  const people=i>=0?pose?.frames[i].people??[]:[];
  const compatible=court?pose?.coordinate_space==='TABLE_METERS_Z_UP':true;
  const selected=!compatible?[]:chosen==='ALL'?people:people.filter((p,k)=>(p.player_id??`${p.position}-${k}`)===chosen);
  const project=court?projectCourt:projectJoint;
  const trail=ballAt(ball,timeMs);
  const ballPoint=trail?projectCourt(trail.point,yaw):null;
  const table:Point3[]=[[-1.37,-.7625,.76],[-1.37,.7625,.76],[1.37,.7625,.76],[1.37,-.7625,.76]];
  const path=(points:Point3[])=>points.map(p=>projectCourt(p,yaw).join(',')).join(' ');
  // Fit a whole loaded window, not each frame, so playback never changes scale.
  const viewBox=useMemo(()=>{
    if(!court)return '0 0 320 320';
    let left=90,right=230,top=90,bottom=270;
    const include=(p:Point3)=>{const [x,y]=projectCourt(p,yaw);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);};
    if(pose?.coordinate_space==='TABLE_METERS_Z_UP')for(const f of pose.frames)for(const p of f.people)for(const j of p.world)if(j)include(j);
    return `${left-18} ${top-18} ${right-left+36} ${bottom-top+36}`;
  },[court,pose,yaw]);
  return <div className="replay-pane">
    <div className="replay-pane-title"><h4>3D 动作与球路</h4><span>{court?'球台世界坐标 · 米':'髋部相对坐标'}</span></div>
    <svg viewBox={viewBox} className="pose-scene" role="img" aria-label={court?'可旋转的球台、人体骨架与拟合球路':'可旋转的单目模型骨架'}>
      {court?<>
        <polygon points={path(table)} fill="#214e4e" stroke="#c1dcd5" strokeWidth="1.5"/>
        <polyline points={path([[0,-.7625,.76],[0,-.7625,.9125],[0,.7625,.9125],[0,.7625,.76]])} stroke="#a8c8ff" strokeWidth="1.5" fill="none"/>
        <polyline points={path([[-1.37,0,.76],[1.37,0,.76]])} stroke="#c1dcd5" fill="none"/>
        {table.map((p,k)=><polyline key={k} points={path([p,[p[0],p[1],0]])} stroke="#657c85" strokeWidth="2"/>)}
      </>:<path d="M 15 280 H 305 M 35 300 H 285 M 65 260 H 255 M 100 250 L 50 310 M 160 250 V 310 M 220 250 L 270 310" stroke="#354256" fill="none"/>}
      {selected.map((person,k)=>{
        const points=person.world.map(p=>p?project(p,yaw):null),color=k%2?'#f5c784':'#a8c8ff';
        return <g key={person.player_id??k} opacity={person.quality?.hidden?0.45:1}>
          {pose?.bones.map(([a,b])=>points[a]&&points[b]?<line key={`${a}-${b}`} x1={points[a]![0]} y1={points[a]![1]} x2={points[b]![0]} y2={points[b]![1]} stroke={color} strokeWidth={court?2.5:4} strokeLinecap="round"/>:null)}
          {points.map((p,j)=>p?<circle key={j} cx={p[0]} cy={p[1]} r={court?1.5:3} fill={color}/>:null)}
        </g>;
      })}
      {trail&&<polyline points={path(trail.trail)} fill="none" stroke="#8fffe0" strokeWidth="2" strokeDasharray="4 3"/>}
      {ballPoint&&<circle cx={ballPoint[0]} cy={ballPoint[1]} r="4" fill="#fff49b"/>}
      {!selected.length&&<text x="160" y={court?95:150} textAnchor="middle" fill="#a4aebb" fontSize="12">{pose?'此刻没有可用人体观测':'尚无人体姿态数据'}</text>}
    </svg>
    <div className="replay-toolbar">
      <label>旋转视角<input aria-label="3D 视角" type="range" min="-180" max="180" value={yaw} onChange={e=>setYaw(Number(e.target.value))}/></label>
      {people.length>1&&<label>人物<select aria-label="3D 人物" value={chosen} onChange={e=>setChosen(e.target.value)}><option value="ALL">全部</option>{people.map((p,k)=><option key={p.player_id??k} value={p.player_id??`${p.position}-${k}`}>{p.player_id??(p.position==='NEAR'?'近端':p.position==='FAR'?'远端':`人物 ${k+1}`)}</option>)}</select></label>}
    </div>
    <p className="muted replay-note">{pose?`${pose.joint_schema??'MediaPipe'} · ${pose.fps} fps · 单目模型估计，缺失关节留空。`:'人体分析尚不可用，原片和已有训练记录仍可查看。'}{court?' 球台、人体和球路使用相同时间与坐标。':' 各人物分别以髋部为原点，不代表球台中的绝对站位。'}</p>
    {court&&<p className="replay-note">{trail?`球路为 ${trail.fit??''} 物理拟合，虚线为显示插值。`:'这一刻没有可用的 3D 球路；缺口不会补画。'}</p>}
    {selected.length===1&&<div className="pose-angles">{Object.entries(selected[0].angles).map(([key,v])=><span key={key}>{angleLabels[key]??key} {v===null?'—':`${v.toFixed(0)}°`}</span>)}</div>}
  </div>;
}
