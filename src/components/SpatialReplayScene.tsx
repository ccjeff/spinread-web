import {useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {Ball3D,MeshCoordinateSpace,Pose,ReplayMesh} from '../api/replay';
import {ballAt,nearestIndex} from '../utils/replay';
import {chunkSpace,meshFrameIndex,meshScenePoint,writeMeshFrame} from '../utils/replayMesh';
import {meshChunkKey,useReplayMesh} from '../hooks/useReplayMesh';
import SkeletonReplayView from './SkeletonReplayView';

type Body=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
interface SceneRuntime {scene:THREE.Scene;render:()=>void;look:(preset:string)=>void;bodies:Map<string,Body>;bones:Map<string,THREE.LineSegments>;ball:THREE.Mesh;trail:THREE.Line;topologyKey:string|null}
interface Props {pose:Pose|null;ball?:Ball3D|null;mesh?:ReplayMesh|null;timeMs:number;space:MeshCoordinateSpace}
const colours=['#9bbfff','#f5c784','#9fe3c3','#e5a5de'];
function colourFor(id:string){let hash=0;for(const c of id)hash=(hash+c.charCodeAt(0))%colours.length;return colours[hash];}
const world=(p:number[])=>new THREE.Vector3(p[0],p[2],-p[1]);
const numeric=(value:unknown,digits=2)=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(digits):'—';

export default function SpatialReplayScene({pose,ball,mesh,timeMs,space}:Props){
  const host=useRef<HTMLDivElement>(null),runtime=useRef<SceneRuntime|null>(null);
  const [webglError,setWebglError]=useState(''),[showMesh,setShowMesh]=useState(true),[showBones,setShowBones]=useState(true),[showBall,setShowBall]=useState(true);
  const [chosen,setChosen]=useState('ALL'),[retry,setRetry]=useState(0),[visibleMeshes,setVisibleMeshes]=useState(0);
  const filteredMesh=useMemo(()=>mesh?{...mesh,chunks:mesh.chunks.filter(c=>chunkSpace(mesh,c)===space)}:null,[mesh,space]);
  const loaded=useReplayMesh(filteredMesh,timeMs,showMesh,retry);
  const table=space==='TABLE_METERS_Z_UP';
  const compatiblePose=pose&&(table?pose.coordinate_space==='TABLE_METERS_Z_UP':pose.coordinate_space!=='TABLE_METERS_Z_UP')?pose:null;
  const ids=useMemo(()=>[...new Set([...(filteredMesh?.chunks.map(c=>c.player_id)??[]),...(compatiblePose?.frames.flatMap(f=>f.people.map((p,k)=>p.player_id??`${p.position}-${k}`))??[])])],[filteredMesh,compatiblePose]);
  useEffect(()=>{
    if(!host.current)return;
    const element=host.current;let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{setWebglError('当前浏览器无法创建 WebGL 2 场景；保留骨架示意，SMPL 网格尚未显示。');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.setClearColor('#111820');element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label',table?'可拖动旋转的 SMPL 人体、球台与三维球路':'独立身体坐标的 SMPL 网格与骨架');
    renderer.domElement.setAttribute('role','img');
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.03,60);
    const controls=new OrbitControls(camera,renderer.domElement);controls.minDistance=1;controls.maxDistance=18;controls.maxPolarAngle=Math.PI*.49;
    const render=()=>renderer.render(scene,camera);
    const look=(preset:string)=>{
      const target=table?new THREE.Vector3(0,.8,0):new THREE.Vector3(0,.1,0);
      controls.target.copy(target);
      camera.position.copy(preset==='top'?target.clone().add(new THREE.Vector3(.001,table?8:4,0)):preset==='side'?target.clone().add(new THREE.Vector3(0,1,table?6:3.5)):target.clone().add(new THREE.Vector3(table?5:2.5,table?3:1.4,table?4:2.5)));
      controls.update();render();
    };
    scene.add(new THREE.HemisphereLight('#e7efff','#374047',2));
    const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(3,7,4);scene.add(light);
    const grid=new THREE.GridHelper(table?9:4,table?18:8,'#3b586b','#27343d');grid.position.y=table?0:-1;scene.add(grid);
    if(table){
      const tableMesh=new THREE.Mesh(new THREE.BoxGeometry(2.74,.04,1.525),new THREE.MeshStandardMaterial({color:'#215e58',roughness:.85}));tableMesh.position.y=.74;scene.add(tableMesh);
      const outline=new THREE.Line(new THREE.BufferGeometry().setFromPoints([[-1.37,-.7625,.762],[-1.37,.7625,.762],[1.37,.7625,.762],[1.37,-.7625,.762],[-1.37,-.7625,.762]].map(world)),new THREE.LineBasicMaterial({color:'#dce8e4'}));scene.add(outline);
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([world([-1.37,0,.763]),world([1.37,0,.763])]),new THREE.LineBasicMaterial({color:'#dce8e4'})));
      const net=new THREE.Mesh(new THREE.PlaneGeometry(1.525,.1525),new THREE.MeshBasicMaterial({color:'#c3d4e9',transparent:true,opacity:.3,side:THREE.DoubleSide}));net.rotation.y=Math.PI/2;net.position.y=.83625;scene.add(net);
      for(const x of [-1.05,1.05])for(const z of [-.55,.55]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.035,.72,.035),new THREE.MeshStandardMaterial({color:'#80939d'}));leg.position.set(x,.36,z);scene.add(leg);}
    }
    const ballMesh=new THREE.Mesh(new THREE.SphereGeometry(.022,16,12),new THREE.MeshStandardMaterial({color:'#fff2a1',emissive:'#6e5700'}));ballMesh.visible=false;scene.add(ballMesh);
    const trail=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#8fffe0',dashSize:.07,gapSize:.04}));trail.visible=false;scene.add(trail);
    const state:SceneRuntime={scene,render,look,bodies:new Map(),bones:new Map(),ball:ballMesh,trail,topologyKey:null};runtime.current=state;
    const resize=()=>{const width=element.clientWidth,height=element.clientHeight;if(width&&height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();}};
    const observer=new ResizeObserver(resize);observer.observe(element);controls.addEventListener('change',render);look('default');resize();
    const contextLost=(event:Event)=>{event.preventDefault();setWebglError('三维绘图上下文已中断，请刷新页面恢复网格显示。');};renderer.domElement.addEventListener('webglcontextlost',contextLost);
    return()=>{
      observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('webglcontextlost',contextLost);
      scene.traverse(object=>{const item=object as THREE.Mesh;if(item.geometry)item.geometry.dispose();if(item.material){for(const material of Array.isArray(item.material)?item.material:[item.material])material.dispose();}});
      renderer.dispose();renderer.domElement.remove();runtime.current=null;
    };
  },[space,table]);
  useEffect(()=>{
    const state=runtime.current;if(!state)return;
    const windowIds=new Set(ids);
    for(const [id,body] of state.bodies)if(!windowIds.has(id)){state.scene.remove(body);body.geometry.dispose();body.material.dispose();state.bodies.delete(id);}
    for(const [id,bones] of state.bones)if(!windowIds.has(id)){state.scene.remove(bones);bones.geometry.dispose();for(const material of Array.isArray(bones.material)?bones.material:[bones.material])material.dispose();state.bones.delete(id);}
    if(state.topologyKey!==(loaded.topology?.key??null)){
      for(const body of state.bodies.values()){state.scene.remove(body);body.geometry.dispose();body.material.dispose();}state.bodies.clear();state.topologyKey=loaded.topology?.key??null;
    }
    for(const body of state.bodies.values())body.visible=false;
    for(const bones of state.bones.values())bones.visible=false;
    let count=0;
    if(showMesh&&filteredMesh&&loaded.topology){
      for(const chunk of filteredMesh.chunks){
        if(chosen!=='ALL'&&chosen!==chunk.player_id)continue;
        const index=meshFrameIndex(chunk,timeMs,filteredMesh.fps),vertices=loaded.cache.get(meshChunkKey(chunk));if(index<0||!vertices)continue;
        let body=state.bodies.get(chunk.player_id);
        if(!body){
          const geometry=new THREE.BufferGeometry(),n=loaded.topology.vertexCount;
          geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(new THREE.BufferAttribute(loaded.topology.faces,1));
          const palette=['#c8957a',colourFor(chunk.player_id),'#34475a','#29252a','#dfe5ee','#cbd3df'].map(c=>new THREE.Color(c)),colors=new Float32Array(n*3);
          for(let i=0;i<n;i++){const colour=loaded.topology.parts?palette[loaded.topology.parts[i]]??palette[0]:palette[1];colour.toArray(colors,i*3);}
          geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
          body=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,side:THREE.DoubleSide}));body.frustumCulled=false;state.scene.add(body);state.bodies.set(chunk.player_id,body);
        }
        const key=`${meshChunkKey(chunk)}:${index}`;
        if(body.userData.frameKey!==key){
          const attribute=body.geometry.getAttribute('position') as THREE.BufferAttribute;
          if(!writeMeshFrame(vertices,chunk,index,loaded.topology.vertexCount,attribute.array as Float32Array,space))continue;
          attribute.needsUpdate=true;body.geometry.computeVertexNormals();body.userData.frameKey=key;
        }
        body.visible=true;count++;
      }
    }
    setVisibleMeshes(value=>value===count?value:count);
    const index=nearestIndex(compatiblePose?.frames.map(f=>f.time_ms)??[],timeMs,compatiblePose?.fps?Math.min(100,600/compatiblePose.fps):0);
    if(showBones&&compatiblePose&&index>=0)for(const [k,person] of compatiblePose.frames[index].people.entries()){
      const id=person.player_id??`${person.position}-${k}`;if(chosen!=='ALL'&&chosen!==id)continue;
      const positions:number[]=[];
      for(const [a,b] of compatiblePose.bones){const first=person.world[a],last=person.world[b];if(!first||!last)continue;positions.push(...meshScenePoint(...first,space),...meshScenePoint(...last,space));}
      if(!positions.length)continue;
      let lines=state.bones.get(id);
      if(!lines){lines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:colourFor(id),transparent:true,opacity:.9,depthTest:false}));lines.renderOrder=3;state.scene.add(lines);state.bones.set(id,lines);}
      lines.geometry.dispose();lines.geometry=new THREE.BufferGeometry();lines.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));lines.visible=true;
      (lines.material as THREE.LineBasicMaterial).opacity=person.quality?.hidden ? .45 : .9;
    }
    const flight=table&&showBall?ballAt(ball,timeMs):null;
    state.ball.visible=state.trail.visible=!!flight;
    if(flight){state.ball.position.copy(world(flight.point));state.trail.geometry.dispose();state.trail.geometry=new THREE.BufferGeometry().setFromPoints(flight.trail.map(world));state.trail.computeLineDistances();}
    state.render();
  },[timeMs,filteredMesh,compatiblePose,ball,chosen,space,table,showMesh,showBones,showBall,loaded.topology,loaded.cache,loaded.revision,ids]);
  const currentFlight=table?ballAt(ball,timeMs):null;
  const gap=ball?.gaps.find(g=>timeMs>=g.start_ms&&timeMs<g.end_ms);
  const experimental=ball?.provider==='SPINREAD_BALLISTIC_EXPERIMENTAL';
  const quality=currentFlight?ball?.segments.find(segment=>timeMs>=segment.start_ms&&timeMs<=segment.end_ms)?.quality:null;
  const reprojection=quality?.reprojection_px as {median?:number;p90?:number;max?:number}|undefined;
  return <div className="replay-pane">
    <div className="replay-pane-title"><h4>{table?'球台 3D 复盘':'身体相对 3D 复盘'}</h4><span>{table?'统一球台坐标 · 米':'独立身体坐标 · 米'}</span></div>
    <div ref={host} className="mesh-scene" hidden={!!webglError}/>
    {webglError&&<><p role="alert" className="banner banner-warn">{webglError}</p><SkeletonReplayView pose={compatiblePose} ball={table?ball:null} timeMs={timeMs}/></>}
    <div className="replay-toolbar"><label><input type="checkbox" checked={showMesh} disabled={!filteredMesh?.chunks.length} onChange={e=>setShowMesh(e.target.checked)}/>SMPL 网格</label><label><input type="checkbox" checked={showBones} onChange={e=>setShowBones(e.target.checked)}/>骨架</label>{table&&<label><input type="checkbox" checked={showBall} onChange={e=>setShowBall(e.target.checked)}/>3D 球路</label>}
      {ids.length>1&&<label>人物<select value={chosen} onChange={e=>setChosen(e.target.value)}><option value="ALL">全部</option>{ids.map(id=><option key={id} value={id}>{id}</option>)}</select></label>}
    </div>
    <div className="replay-toolbar">{[['default','斜视'],['side','侧视'],['top','俯视']].map(([key,label])=><button className="btn btn-ghost btn-sm" key={key} onClick={()=>runtime.current?.look(key)}>{label}</button>)}<span className="muted">拖动旋转 · 滚轮缩放 · 右键平移</span></div>
    <p className="replay-note">{filteredMesh?.chunks.length?`人体来源：NLF / SMPL · ${filteredMesh.fps} fps；此刻显示 ${visibleMeshes} 个网格。按原片时间加载两秒分块，缺失帧留空。`:`尚无 NLF / SMPL 网格结果。${compatiblePose?`当前仅有 ${compatiblePose.joint_schema??'未知来源'} 骨架。`:'此坐标系尚无人体数据。'}`}</p>
    {!table&&<p className="muted replay-note">各人物以自身髋部为原点，不代表球台中的绝对位置。选择单个人物可查看其动作；球台球路另行展示。</p>}
    {loaded.loading&&showMesh&&<p role="status" className="muted replay-note">正在加载当前时刻的网格分块…</p>}
    {loaded.error&&showMesh&&<p role="alert" className="banner banner-error">{loaded.error} <button className="btn btn-ghost btn-sm" onClick={()=>setRetry(v=>v+1)}>重试网格加载</button></p>}
    {table&&<p className="muted replay-note">{experimental?'来源：实验性单目物理估计，仅有限区间可用，尚无独立三维真值验证。 ':''}{currentFlight?`球路：${experimental?'分段落台抛物线':currentFlight.fit??'单目模型'}拟合估计，虚线为显示插值。`:gap?`当前是球路缺口${gap.reason?`（${gap.reason==='NO_ACCEPTED_PHYSICAL_FIT'?'未通过物理拟合门限':gap.reason}）`:''}，不跨缺口连线。`:'这一刻没有可用 3D 球路。'}</p>}
    {table&&ball?.summary&&<p className="muted replay-note">该分析产物全片可用球路 {numeric(ball.summary.reconstructed_ms/1000,1)} 秒 / {numeric(ball.summary.recording_duration_ms/1000,1)} 秒{ball.summary.recording_duration_ms>0?`（${numeric(ball.summary.reconstructed_ms/ball.summary.recording_duration_ms*100)}%）`:''}。覆盖率不代表准确率。</p>}
    {table&&quality&&<details><summary>此段球路诊断（模型内部估计）</summary><p className="replay-note">重投影误差：中位 {numeric(reprojection?.median)} px，P90 {numeric(reprojection?.p90)} px，最大 {numeric(reprojection?.max)} px。条件位置偏差 {numeric(quality.conditional_position_sigma_m,3)} m；重力参数敏感性 {numeric(quality.gravity_20pct_sensitivity_m,3)} m；球台角点敏感性 {numeric(quality.camera_corner_sensitivity_m,3)} m。这些指标不等于真实三维精度。</p></details>}
    {!!mesh?.limitations?.length&&<details><summary>网格数据来源与限制</summary>{mesh.limitations.map((text,i)=><p className="replay-note" key={i}>{text}</p>)}</details>}
    {!!ball?.limitations?.length&&table&&<details><summary>球路质量与限制</summary>{ball.limitations.map((text,i)=><p className="replay-note" key={i}>{text}</p>)}</details>}
  </div>;
}
