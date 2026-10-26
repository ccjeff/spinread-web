import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestIndex,observedTrail,projectJoint,projectCourt,ballAt,imagePoint,placementWindowCounts,placementEmptyReason,calibrationWindows,upsertCalibration,calibrationRangeIssue,reviewsOutsideCalibrationChanges} from '../src/utils/replay.ts';
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

test('placement counts retain unclassified local candidates and exclude rejected or invalid coordinates',()=>{
  const local={status:'CANDIDATE',phase:'UNKNOWN',table_xy:[.4,.2],depth:'SHORT',lateral:'CENTER',basis:'IMAGE_VERTICAL_REVERSAL_INSIDE_CALIBRATED_TABLE'};
  const counts=placementWindowCounts([local,{...local,status:'REJECTED'},{...local,table_xy:null},{...local,table_xy:[2,.2]},
    {...local,status:'CONFIRMED',phase:'RECEIVE',basis:'PINGPONG3D_MODEL_ESTIMATE'}]);
  assert.deepEqual(counts,{pending:3,unclassified:1,invalid:2,projected:2,local:3,upstream:1});
  assert.equal(local.phase,'UNKNOWN');
});

test('zero placement states distinguish calibration, evidence gaps and missing statistics',()=>{
  const input={sampleCount:0,model:true,phase:'ALL',calibrated:false,calibrationOverlap:true,projected:0,observed:20,unclassified:0,pending:0,invalid:0};
  assert.equal(placementEmptyReason(input),'NEEDS_CALIBRATION');
  assert.equal(placementEmptyReason({...input,calibrated:true,calibrationOverlap:false}),'OUTSIDE_CALIBRATION');
  assert.equal(placementEmptyReason({...input,calibrated:true}),'NO_VALID_LANDING');
  assert.equal(placementEmptyReason({...input,calibrated:true,observed:0}),'NO_BALL_EVIDENCE');
  assert.equal(placementEmptyReason({...input,sampleCount:undefined}),'STATS_UNAVAILABLE');
  assert.equal(placementEmptyReason({...input,sampleCount:3}),null);
});

test('unclassified candidate estimates do not imply confirmed or serve/receive samples',()=>{
  const input={sampleCount:0,model:false,phase:'ALL',calibrated:true,calibrationOverlap:true,projected:2,observed:20,unclassified:2,pending:2,invalid:0};
  assert.equal(placementEmptyReason(input),'UNCONFIRMED');
  assert.equal(placementEmptyReason({...input,phase:'SERVE'}),'UNCLASSIFIED');
  assert.equal(placementEmptyReason({...input,model:true,phase:'RECEIVE'}),'UNCLASSIFIED');
  assert.equal(placementEmptyReason({...input,sampleCount:2,model:true}),null);
});

test('legacy calibration is preserved as a stable window without overriding an explicit empty list',()=>{
  const review={corners:[[0,0],[1,0],[1,1],[0,1]],calibration_start_ms:100,calibration_end_ms:1000};
  assert.deepEqual(calibrationWindows(review),[{id:'legacy',corners:review.corners,start_ms:100,end_ms:1000}]);
  assert.deepEqual(calibrationWindows({...review,calibrations:[]}),[]);
  assert.deepEqual(calibrationWindows(undefined),[]);
});

test('editing one calibration preserves the other saved camera windows and input objects',()=>{
  const corners=[[0,0],[1,0],[1,1],[0,1]],first={id:'a',corners,start_ms:0,end_ms:1000},second={id:'b',corners,start_ms:2000,end_ms:3000};
  const windows=[first,second],draft={...first,end_ms:900};
  assert.deepEqual(upsertCalibration(windows,draft),[draft,second]);
  assert.deepEqual(windows,[first,second]);assert.equal(first.end_ms,1000);
  assert.deepEqual(upsertCalibration(windows,{id:'c',corners,start_ms:1000,end_ms:2000}).map(w=>w.id),['a','c','b']);
});

test('calibration intervals permit touching boundaries but reject overlap and invalid duration',()=>{
  const a={id:'a',corners:[],start_ms:0,end_ms:1000},b={id:'b',corners:[],start_ms:1000,end_ms:2000};
  assert.equal(calibrationRangeIssue([b,a],2000),null);
  assert.match(calibrationRangeIssue([a,{...b,start_ms:999}],2000),/重叠/);
  assert.match(calibrationRangeIssue([a,{...b,end_ms:2001}],2000),/原视频/);
  assert.match(calibrationRangeIssue([a,{...b,id:'a'}],2000),/重复/);
});

test('calibration edits invalidate only old/new affected half-open ranges and keep other reviews',()=>{
  const corners=[[0,0],[1,0],[1,1],[0,1]],a={id:'a',corners,start_ms:100,end_ms:500},b={id:'b',corners,start_ms:700,end_ms:900};
  const reviews=[99,100,499,500,549,550,700,899,900].map(time_ms=>({rally_id:'r',time_ms,status:'CONFIRMED',phase:'RECEIVE'}));
  assert.deepEqual(reviewsOutsideCalibrationChanges([a,b],[a,b],reviews),reviews);
  assert.deepEqual(reviewsOutsideCalibrationChanges([a,b],[{...a,end_ms:550},b],reviews).map(r=>r.time_ms),[99,550,700,899,900]);
  assert.deepEqual(reviewsOutsideCalibrationChanges([a,b],[b],reviews).map(r=>r.time_ms),[99,500,549,550,700,899,900]);
});
