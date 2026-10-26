import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceAnnotationRange, parseTime} from '../src/utils/annotationRanges.ts';
import {buildTrainingNavigation} from '../src/utils/trainingTimeline.ts';
const a = (id, start_ms, end_ms, title=id) => ({id,start_ms,end_ms,title,feeding:'RALLY',movement:'FIXED',target:'NEAR',actions:[],notes:''});
const r = (id,start,end) => ({item_id:id,parent_id:null,type:'RALLY',start_ms:start,end_ms:end,attributes:{hits:3}});

test('merging across annotations preserves both outside fragments, labels and source objects',()=>{
 const old=[a('one',0,10000),a('two',12000,20000)]; const before=JSON.stringify(old);
 const next=replaceAnnotationRange(old,a('new',4000,15000));
 assert.deepEqual(next.map(x=>[x.start_ms,x.end_ms,x.title]),[[0,4000,'one'],[4000,15000,'new'],[15000,20000,'two']]);
 assert.equal(new Set(next.map(x=>x.id)).size,3);assert.equal(JSON.stringify(old),before);
});
test('editing an existing range moves it without leaving its old range behind',()=>{
 const next=replaceAnnotationRange([a('one',0,10000)],a('one',2000,7000),'one');
 assert.equal(next.length,1);assert.equal(next[0].start_ms,2000);
});
test('a manual chapter can cover unrecognized video and survive different automatic rally IDs',()=>{
 const annotation={...a('serve',38000,100000,'发接发'),feeding:'SERVE_RECEIVE',movement:'UNSPECIFIED'};
 const empty=buildTrainingNavigation([], [annotation]);
 assert.equal(empty.chapters.length,1);assert.equal(empty.chapters[0].entries.length,0);
 for (const id of ['v6','v7']) {
   const nav=buildTrainingNavigation([r(id,50000,51000)], [annotation]);
   assert.equal(nav.chapters.length,1);assert.equal(nav.chapters[0].id,'serve');
   assert.equal(nav.entries[0].trainingType,'SERVE_RECEIVE');assert.equal(nav.entries[0].trainingTitle,'发接发');
 }
});
test('overlay splits only navigation, assigns a crossing rally once and preserves hit boundaries',()=>{
 const items=[r('r1',0,10000),r('r2',12000,20000)];const original=JSON.stringify(items);
 const nav=buildTrainingNavigation(items,[a('middle',4000,15000)]);
 assert.deepEqual(nav.chapters.map(c=>[c.start_ms,c.end_ms]),[[0,4000],[4000,15000],[15000,20000]]);
 assert.equal(nav.chapters.reduce((sum,c)=>sum+c.entries.length,0),2);
 assert.equal(JSON.stringify(items),original);
});
test('time input supports precise boundaries and rejects ambiguous or invalid values',()=>{
 assert.equal(parseTime('38:00'),2280000);assert.equal(parseTime('51:27.457'),3087457);
 for(const value of ['-1:00','38:60','38','1:2','1:00.0001','abc'])assert.equal(parseTime(value),null);
});
