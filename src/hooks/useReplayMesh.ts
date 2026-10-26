import {useEffect,useState} from 'react';
import {getToken} from '../api/client';
import type {MeshChunk,ReplayMesh} from '../api/replay';
import {MAX_MESH_CHUNK_BYTES,MeshChunkCache,decodeMeshFaces,decodeMeshVertices,meshAssetPath} from '../utils/replayMesh';

export interface MeshTopology {key:string;faces:Uint16Array|Uint32Array;parts:Uint8Array|null;vertexCount:number}
export const meshChunkKey=(chunk:MeshChunk)=>`${chunk.url}|${chunk.sha256??''}|${chunk.byte_length}`;

async function binary(path:string,signal:AbortSignal,maxBytes:number):Promise<ArrayBuffer> {
  const token=getToken();
  const response=await fetch(meshAssetPath(path),{signal,redirect:'error',headers:token?{Authorization:`Bearer ${token}`}:{}});
  if(!response.ok)throw new Error(response.status===401?'登录已过期，请刷新页面':`网格资源加载失败（${response.status}）`);
  const reader=response.body?.getReader();
  if(!reader)throw new Error('网格资源没有内容');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){
    const {done,value}=await reader.read();if(done)break;
    length+=value.byteLength;
    if(length>maxBytes){await reader.cancel();throw new Error('网格分块超出大小限制');}
    chunks.push(value);
  }
  const bytes=new Uint8Array(length);let offset=0;
  for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
  return bytes.buffer;
}

export function useReplayMesh(mesh:ReplayMesh|null|undefined,timeMs:number,enabled:boolean,retry:number) {
  const [cache]=useState(()=>new MeshChunkCache());
  const [topology,setTopology]=useState<MeshTopology|null>(null);
  const [topologyError,setTopologyError]=useState(''),[chunkError,setChunkError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
  const valid=mesh?.version===1&&mesh.unit==='m'&&mesh.provider==='NLF_SMPL';
  const topologyKey=valid?JSON.stringify([mesh.topology,mesh.vertex_count]):'';
  const wanted=enabled&&valid?mesh.chunks.filter(c=>c.end_ms>timeMs&&c.start_ms<=timeMs+1000).slice(0,4):[];
  const wantedKey=JSON.stringify(wanted);
  const vertexCount=mesh?.vertex_count??0;
  useEffect(()=>()=>cache.clear(),[cache]);
  useEffect(()=>{
    if(!enabled||!topologyKey)return;
    const controller=new AbortController();
    const [info,count]=JSON.parse(topologyKey) as [ReplayMesh['topology'],number];
    setTopologyError('');setTopology(null);
    void Promise.all([binary(info.faces_url,controller.signal,2*1024*1024),info.parts_url?binary(info.parts_url,controller.signal,count):Promise.resolve(null)])
      .then(([faces,parts])=>{
        if(parts&&parts.byteLength!==count)throw new Error('网格部位数与顶点数不一致');
        if(!controller.signal.aborted)setTopology({key:topologyKey,faces:decodeMeshFaces(faces,info.index_type,count),parts:parts?new Uint8Array(parts):null,vertexCount:count});
      }).catch(e=>{if(!controller.signal.aborted)setTopologyError(e instanceof Error?e.message:'网格拓扑加载失败');});
    return()=>controller.abort();
  },[topologyKey,enabled,retry]);
  useEffect(()=>{
    if(!enabled)return;
    const chunks=JSON.parse(wantedKey) as MeshChunk[];
    const missing=chunks.filter(c=>!cache.get(meshChunkKey(c)));
    if(!missing.length){setLoading(false);setChunkError('');return;}
    const controller=new AbortController();setLoading(true);setChunkError('');
    void Promise.allSettled(missing.map(async chunk=>{
      if(chunk.byte_length>MAX_MESH_CHUNK_BYTES||chunk.byte_length<=0)throw new Error('网格分块长度无效');
      const buffer=await binary(chunk.url,controller.signal,Math.min(chunk.byte_length,MAX_MESH_CHUNK_BYTES));
      if(chunk.sha256){
        const digest=await crypto.subtle.digest('SHA-256',buffer);
        const hex=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
        if(hex!==chunk.sha256.toLowerCase())throw new Error('网格分块校验失败，请重新加载');
      }
      const vertices=decodeMeshVertices(buffer,chunk,vertexCount);
      if(!controller.signal.aborted)cache.set(meshChunkKey(chunk),vertices);
    })).then(results=>{
      if(controller.signal.aborted)return;
      const failures=results.filter(result=>result.status==='rejected');
      setChunkError(failures.map(result=>result.reason instanceof Error?result.reason.message:'网格分块加载失败').join('；'));
      setRevision(v=>v+1);setLoading(false);
    });
    return()=>controller.abort();
  },[wantedKey,vertexCount,enabled,cache,retry]);
  return {cache,topology:topology?.key===topologyKey?topology:null,error:[topologyError,chunkError].filter(Boolean).join('；'),loading,revision};
}
