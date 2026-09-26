import test from 'node:test';
import assert from 'node:assert/strict';
import {rallySelection} from '../src/utils/rallySelection.ts';
const items = [
  {item_id:'r1', type:'RALLY', start_ms:1000, end_ms:2000},
  {item_id:'gap', type:'BREAK', start_ms:2000, end_ms:12000},
  {item_id:'r2', type:'RALLY', start_ms:12000, end_ms:14000},
  {item_id:'r3', type:'RALLY', start_ms:20000, end_ms:22000},
];
test('adjacent selection retains the preparation interval, independent of click order', () => {
  const result = rallySelection(items, new Set(['r2','r1']));
  assert.equal(result.adjacent, true);
  assert.equal(result.startMs, 1000);
  assert.equal(result.endMs, 14000);
  assert.deepEqual(result.items.map(item => item.item_id), ['r1','r2']);
});
test('rejects skipped, stale and non-rally selections, permits a single practice clip', () => {
  for (const ids of [[], ['r1','r3'], ['r1','missing'], ['r1','gap']]) assert.equal(rallySelection(items, new Set(ids)).adjacent, false);
  assert.equal(rallySelection(items, new Set(['r2'])).adjacent, true);
});
