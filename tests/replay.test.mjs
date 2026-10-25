import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestIndex,observedTrail,projectJoint,projectCourt,ballAt,imagePoint} from '../src/utils/replay.ts';
test('replay does not bridge missing frames or stale timestamps',()=>{
  const frames=[[0,.1,.2],[33,.2,.3],[66,null,null],[99,.3,.4],[132,.4,.5]];
  assert.deepEqual(observedTrail(frames,66),[]);
  assert.deepEqual(observedTrail(frames,132),[[.3,.4],[.4,.5]]);
  assert.deepEqual(observedTrail(frames,500),[]);
  assert.equal(nearestIndex([],0,60),-1);
  assert.equal(nearestIndex([0,33,66],34,20),1);
});
test('3D view rotates depth into screen position without changing model data',()=>{
  const joint=[1,0,0];assert.deepEqual(projectJoint(joint,0),[320,160]);
  assert.ok(Math.abs(projectJoint(joint,90)[0]-160)<1e-8);assert.deepEqual(joint,[1,0,0]);
});


test('court coordinates preserve height and use metres independently of image aspect ratio',()=>{
  const floor=projectCourt([1,0,0],0), raised=projectCourt([1,0,1],0);
  assert.equal(floor[0],raised[0]);assert.equal(floor[1]-raised[1],64);
  assert.deepEqual(imagePoint([.5,.5],1920,1080,'NORMALIZED_IMAGE'),[960,540]);
  assert.deepEqual(imagePoint([0,0],1920,1080),[0,-420]);
  assert.ok(Math.abs(projectCourt([1,0,0],90)[0]-121)<1e-8);
});

test('3D ball interpolation is limited to fitted segments and explicit gaps stay empty',()=>{
  const evidence={coordinate_space:'TABLE_METERS_Z_UP',unit:'m',segments:[{start_ms:100,end_ms:160,frames:[[100,0,0,1],[120,1,0,1],[140,2,0,1],[160,3,0,1]],status:'MODEL_ESTIMATE',fit:'H'},{start_ms:300,end_ms:340,frames:[[300,4,0,1],[340,5,0,1]],status:'MODEL_ESTIMATE'}],gaps:[]};
  assert.deepEqual(ballAt(evidence,110).point,[.5,0,1]);
  assert.equal(ballAt(evidence,200),null);assert.equal(ballAt(evidence,90),null);assert.equal(ballAt(evidence,400),null);
  assert.equal(ballAt({...evidence,gaps:[{start_ms:125,end_ms:150}]},130),null);
  const after=ballAt(evidence,320);assert.deepEqual(after.trail,[[4,0,1],[4.5,0,1]]);
  assert.equal(ballAt({...evidence,unit:'mm'},110),null);
});
