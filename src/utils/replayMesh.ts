import type {MeshChunk,MeshCoordinateSpace,ReplayMesh,Pose} from '../api/replay.ts';

export const MAX_MESH_CHUNK_BYTES=32*1024*1024;
export type MeshVertices=Int16Array|Float32Array;

export function meshAssetPath(path:string):string {
  if(!/^\/api\/videos\/[A-Za-z0-9_-]+\/replay-mesh\/assets\/[A-Za-z0-9_-]{1,128}(?:\?[^#\\]*)?$/.test(path))throw new Error('网格资源地址无效');
  return path;
}

export function chunkSpace(mesh:ReplayMesh,chunk:MeshChunk):MeshCoordinateSpace|null {
  const space=chunk.coordinate_space??mesh.coordinate_space;
  return space==='TABLE_METERS_Z_UP'||space==='HIP_RELATIVE_MODEL_3D'?space:null;
}

export function poseInSpace(pose:Pose|null|undefined,space:MeshCoordinateSpace):Pose|null {
  if(!pose)return null;
  const frames=pose.frames.filter(frame=>(frame.coordinate_space??pose.coordinate_space??'HIP_RELATIVE_MODEL_3D')===space);
  return frames.length?{...pose,coordinate_space:space,frames}:null;
}

export function meshScenePoint(x:number,y:number,z:number,space:MeshCoordinateSpace):[number,number,number] {
  return space==='TABLE_METERS_Z_UP'?[x,z,-y]:[x,-y,-z];
}

export function decodeMeshVertices(buffer:ArrayBuffer,chunk:MeshChunk,vertexCount:number):MeshVertices {
  const bytes=chunk.encoding==='int16-mm'?2:chunk.encoding==='float32-m'?4:0;
  if(!bytes||!Number.isInteger(vertexCount)||vertexCount<3||vertexCount>20000)throw new Error('网格顶点格式无效');
  const expected=chunk.times_ms.length*vertexCount*3*bytes;
  if(!expected||expected>MAX_MESH_CHUNK_BYTES||expected!==buffer.byteLength||expected!==chunk.byte_length||chunk.valid.length!==chunk.times_ms.length)throw new Error('网格分块长度与元数据不一致');
  const start=chunk.source_start_ms??chunk.start_ms,end=chunk.source_end_ms??chunk.end_ms;
  if(end<=start||end-start>2100||chunk.start_ms<start||chunk.end_ms>end)throw new Error('网格分块超出两秒范围');
  if(chunk.times_ms.some((t,i)=>!Number.isFinite(t)||t<start||t>=end||(i>0&&t<=chunk.times_ms[i-1])))throw new Error('网格时间戳无效');
  const data=new DataView(buffer),out=bytes===2?new Int16Array(expected/bytes):new Float32Array(expected/bytes);
  for(let i=0;i<out.length;i++)out[i]=bytes===2?data.getInt16(i*2,true):data.getFloat32(i*4,true);
  return out;
}

export function decodeMeshFaces(buffer:ArrayBuffer,indexType:'uint16'|'uint32',vertexCount:number):Uint16Array|Uint32Array {
  const bytes=indexType==='uint16'?2:4;
  if(!buffer.byteLength||buffer.byteLength>2*1024*1024||buffer.byteLength%(bytes*3))throw new Error('网格面片格式无效');
  const data=new DataView(buffer),out=bytes===2?new Uint16Array(buffer.byteLength/bytes):new Uint32Array(buffer.byteLength/bytes);
  for(let i=0;i<out.length;i++){
    out[i]=bytes===2?data.getUint16(i*2,true):data.getUint32(i*4,true);
    if(out[i]>=vertexCount)throw new Error('网格面片引用了不存在的顶点');
  }
  return out;
}

/** Hold only the actual current source frame; never interpolate across missing observations. */
export function meshFrameIndex(chunk:MeshChunk,timeMs:number,fps:number):number {
  if(timeMs<chunk.start_ms||timeMs>=chunk.end_ms||!Number.isFinite(fps)||fps<=0)return -1;
  let lo=0,hi=chunk.times_ms.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(chunk.times_ms[mid]<=timeMs+0.5)lo=mid+1;else hi=mid;}
  const i=lo-1;
  return i>=0&&chunk.valid[i]&&timeMs-chunk.times_ms[i]<=Math.min(120,1000/fps+2)?i:-1;
}

/** Table Z-up and raw camera-relative X-right/Y-down/Z-forward are distinct frames. */
export function writeMeshFrame(vertices:MeshVertices,chunk:MeshChunk,index:number,vertexCount:number,target:Float32Array,space:MeshCoordinateSpace='TABLE_METERS_Z_UP'):boolean {
  if(index<0||index>=chunk.times_ms.length||!chunk.valid[index]||target.length!==vertexCount*3)return false;
  const offset=index*vertexCount*3,scale=chunk.encoding==='int16-mm'?.001:1;
  for(let i=0;i<vertexCount;i++){
    const x=vertices[offset+i*3]*scale,y=vertices[offset+i*3+1]*scale,z=vertices[offset+i*3+2]*scale;
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))return false;
    const point=meshScenePoint(x,y,z,space);target[i*3]=point[0];target[i*3+1]=point[1];target[i*3+2]=point[2];
  }
  return true;
}

export class MeshChunkCache {
  private entries=new Map<string,MeshVertices>();
  private bytes=0;
  private limit:number;
  constructor(limit=64*1024*1024){this.limit=limit;}
  get(key:string):MeshVertices|undefined {
    const value=this.entries.get(key);
    if(value){this.entries.delete(key);this.entries.set(key,value);}
    return value;
  }
  set(key:string,value:MeshVertices):void {
    const old=this.entries.get(key);if(old){this.bytes-=old.byteLength;this.entries.delete(key);}
    if(value.byteLength>this.limit)return;
    this.entries.set(key,value);this.bytes+=value.byteLength;
    while(this.bytes>this.limit){const first=this.entries.keys().next().value!;this.bytes-=this.entries.get(first)!.byteLength;this.entries.delete(first);}
  }
  clear():void{this.entries.clear();this.bytes=0;}
  get byteLength():number{return this.bytes;}
}
