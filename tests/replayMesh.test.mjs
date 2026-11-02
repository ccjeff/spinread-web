import test from 'node:test';
import assert from 'node:assert/strict';
import {meshAssetPath,chunkSpace,poseInSpace,meshScenePoint,decodeMeshVertices,decodeMeshFaces,meshFrameIndex,writeMeshFrame,MeshChunkCache} from '../src/utils/replayMesh.ts';

const chunk=(extra={})=>({id:'c',player_id:'p',start_ms:0,end_ms:100,times_ms:[0,33,66],valid:[true,true,true],url:'/api/videos/test/replay-mesh/assets/c?timeline_version=1&analysis_artifact_id=a',encoding:'int16-mm',byte_length:54,...extra});

test('mesh requests are restricted to same-origin authenticated asset routes',()=>{
  assert.equal(meshAssetPath(chunk().url),chunk().url);
  for(const path of ['https://example.com/a','//example.com/a','/api/videos/test/../secret','/api/videos/%2e%2e/replay-mesh/assets/c','/api/videos/test/replay-mesh/assets/../../x','/api/videos/test/replay-mesh/assets/c#fragment','/api/login'])assert.throws(()=>meshAssetPath(path));
});

test('millimetre meshes decode little-endian source frames without modifying input',()=>{
  const raw=new ArrayBuffer(54),data=new DataView(raw);data.setInt16(0,-1234,true);data.setInt16(2,456,true);
  const result=decodeMeshVertices(raw,chunk(),3);
  assert.ok(result instanceof Int16Array);assert.equal(result[0],-1234);assert.equal(result[1],456);assert.equal(data.getInt16(0,true),-1234);
});

test('float32 meshes and face indices validate actual binary sizes and indices',()=>{
  const raw=new ArrayBuffer(108);new DataView(raw).setFloat32(0,1.25,true);
  assert.equal(decodeMeshVertices(raw,chunk({encoding:'float32-m',byte_length:108}),3)[0],1.25);
  const faces=new Uint16Array([0,1,2]);assert.deepEqual([...decodeMeshFaces(faces.buffer,'uint16',3)],[0,1,2]);
  assert.throws(()=>decodeMeshFaces(new Uint16Array([0,1,3]).buffer,'uint16',3));
  assert.throws(()=>decodeMeshFaces(new ArrayBuffer(5),'uint16',3));
  assert.throws(()=>decodeMeshVertices(raw,chunk(),3));
});

test('mesh chunk bounds, monotonic timestamps and validity mask must match data',()=>{
  const raw=new ArrayBuffer(54);
  assert.throws(()=>decodeMeshVertices(raw,chunk({end_ms:3000}),3));
  assert.throws(()=>decodeMeshVertices(raw,chunk({valid:[true]}),3));
  assert.throws(()=>decodeMeshVertices(raw,chunk({times_ms:[33,0,66]}),3));
  assert.throws(()=>decodeMeshVertices(raw,chunk({times_ms:[0,33,100]}),3));
  assert.throws(()=>decodeMeshVertices(raw,chunk({byte_length:53}),3));
});

test('window clipping retains binary indexing and masks outside frames',()=>{
  const clipped=chunk({start_ms:30,end_ms:70,source_start_ms:0,source_end_ms:100,valid:[false,true,true]});
  assert.equal(decodeMeshVertices(new ArrayBuffer(54),clipped,3).length,27);
  assert.equal(meshFrameIndex(clipped,29,30),-1);
  assert.equal(meshFrameIndex(clipped,34,30),1);
  assert.equal(meshFrameIndex(clipped,70,30),-1);
});

test('missing observations and sparse nonuniform gaps never carry a stale mesh',()=>{
  const missing=chunk({valid:[true,false,true]});
  assert.equal(meshFrameIndex(missing,10,30),0);
  assert.equal(meshFrameIndex(missing,34,30),-1);
  assert.equal(meshFrameIndex(missing,67,30),2);
  const sparse=chunk({end_ms:150,times_ms:[0,100],valid:[true,true],byte_length:36});
  assert.equal(meshFrameIndex(sparse,60,30),-1);
  assert.equal(meshFrameIndex(sparse,101,30),1);
  assert.equal(meshFrameIndex(sparse,140,30),-1);
});

test('table Z-up and camera-relative Y-down transform into separate Three axes',()=>{
  assert.deepEqual(meshScenePoint(1,2,3,'TABLE_METERS_Z_UP'),[1,3,-2]);
  assert.deepEqual(meshScenePoint(1,2,3,'HIP_RELATIVE_MODEL_3D'),[1,-2,-3]);
  const source=new Int16Array(27);source.set([1000,2000,3000]);
  const output=new Float32Array(9);
  assert.equal(writeMeshFrame(source,chunk(),0,3,output,'HIP_RELATIVE_MODEL_3D'),true);
  assert.deepEqual([...output.slice(0,3)],[1,-2,-3]);
  assert.equal(source[0],1000);
});

test('invalid mesh slots and nonfinite vertices cannot be displayed',()=>{
  const target=new Float32Array(9),source=new Float32Array(27);source[0]=NaN;
  assert.equal(writeMeshFrame(source,chunk({encoding:'float32-m'}),0,3,target),false);
  assert.equal(writeMeshFrame(source,chunk({valid:[false,true,true]}),0,3,target),false);
  assert.equal(writeMeshFrame(source,chunk(),3,3,target),false);
});

test('mixed-frame pose and mesh descriptors cannot overlay an uncalibrated person on the court',()=>{
  const frames=[{time_ms:0,coordinate_space:'TABLE_METERS_Z_UP',people:[]},{time_ms:33,coordinate_space:'HIP_RELATIVE_MODEL_3D',people:[]}];
  const pose={coordinate_space:'PER_FRAME',frames};
  assert.deepEqual(poseInSpace(pose,'TABLE_METERS_Z_UP').frames,[frames[0]]);
  assert.deepEqual(poseInSpace(pose,'HIP_RELATIVE_MODEL_3D').frames,[frames[1]]);
  assert.equal(poseInSpace({...pose,frames:[]},'TABLE_METERS_Z_UP'),null);
  assert.equal(chunkSpace({coordinate_space:'PER_CHUNK'},chunk()),null);
  assert.equal(chunkSpace({coordinate_space:'PER_CHUNK'},chunk({coordinate_space:'HIP_RELATIVE_MODEL_3D'})),'HIP_RELATIVE_MODEL_3D');
  assert.equal(pose.frames.length,2);
});

test('mesh cache evicts least recently used chunks within a fixed byte budget',()=>{
  const cache=new MeshChunkCache(12);
  cache.set('a',new Int16Array(3));cache.set('b',new Int16Array(3));cache.get('a');cache.set('c',new Int16Array(3));
  assert.equal(cache.get('b'),undefined);assert.ok(cache.get('a'));assert.ok(cache.get('c'));assert.equal(cache.byteLength,12);
  cache.set('huge',new Int16Array(8));assert.equal(cache.byteLength,12);assert.equal(cache.get('huge'),undefined);
  cache.clear();assert.equal(cache.byteLength,0);
});
