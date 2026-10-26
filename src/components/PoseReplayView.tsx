import {lazy,Suspense,useMemo} from 'react';
import type {Ball3D,Pose,ReplayMesh} from '../api/replay';
import {chunkSpace,poseInSpace} from '../utils/replayMesh';
import SkeletonReplayView from './SkeletonReplayView';

const SpatialReplayScene=lazy(()=>import('./SpatialReplayScene'));

export default function PoseReplayView({pose,ball,mesh,timeMs}:{pose:Pose|null;ball?:Ball3D|null;mesh?:ReplayMesh|null;timeMs:number}){
  const tablePose=useMemo(()=>poseInSpace(pose,'TABLE_METERS_Z_UP'),[pose]);
  const bodyPose=useMemo(()=>poseInSpace(pose,'HIP_RELATIVE_MODEL_3D'),[pose]);
  const tableMesh=!!mesh?.chunks.some(c=>chunkSpace(mesh,c)==='TABLE_METERS_Z_UP');
  const bodyMesh=!!mesh?.chunks.some(c=>chunkSpace(mesh,c)==='HIP_RELATIVE_MODEL_3D');
  const table=!!ball||!!tablePose||tableMesh;
  const body=bodyMesh||bodyPose?.joint_schema==='NLF41'
    ?<SpatialReplayScene pose={bodyPose} mesh={mesh} timeMs={timeMs} space="HIP_RELATIVE_MODEL_3D"/>
    :<><SkeletonReplayView pose={bodyPose??(!table?pose:null)} timeMs={timeMs}/><p className="muted replay-note">{bodyPose||pose?`当前人体来源：${bodyPose?.joint_schema??pose?.joint_schema??'旧版姿态'}。`:'尚无人体姿态数据。'}尚无 NLF / SMPL 网格结果。</p></>;
  return <div className="pose-replay"><Suspense fallback={<div className="replay-pane" role="status">正在加载三维查看器…</div>}>
    {table&&<SpatialReplayScene pose={tablePose} ball={ball} mesh={mesh} timeMs={timeMs} space="TABLE_METERS_Z_UP"/>}
    {table&&(bodyPose||bodyMesh)?<details className="body-coordinate-replay"><summary>身体相对坐标复盘（与球台分开展示）</summary>{body}</details>:!table?body:null}
  </Suspense></div>;
}
