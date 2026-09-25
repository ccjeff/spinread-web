import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTrainingNavigation, adjacentTrainingEntries, entryTitle} from '../src/utils/trainingTimeline.ts';

function item(id, type, start, end, parent = null, attributes = {}) {
  return Object.freeze({item_id: id, type, start_ms: start, end_ms: end, parent_id: parent, attributes: Object.freeze(attributes)});
}

test('shows a rally once, keeps non-playing segments, and does not infer drill type from activity', () => {
  const items = Object.freeze([
    item('hit', 'HIT_CANDIDATE', 1500, 1500, 'rally'),
    item('rally', 'RALLY', 1000, 4000, 'activity'),
    item('activity', 'RALLY_LIKE', 1000, 4000),
    item('pickup', 'BALL_PICKUP', 4000, 7000),
    item('unclassified', 'UNKNOWN', 0, 1000),
  ]);
  const {entries, chapters} = buildTrainingNavigation(items);
  assert.deepEqual(entries.map(entry => entry.item.item_id), ['unclassified', 'rally', 'pickup']);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].trainingType, 'UNCLASSIFIED');
  assert.equal(entryTitle(entries[2]), '捡球');
  assert.equal(items[1].start_ms, 1000);
  assert.equal(Object.hasOwn(items[1], 'chapterId'), false);
});

test('long non-playing periods separate chapters without creating or changing rallies', () => {
  const {entries, chapters} = buildTrainingNavigation([
    item('a', 'RALLY', 1000, 5000),
    item('b', 'RALLY', 10000, 15000),
    item('gap', 'UNKNOWN', 15000, 45000),
    item('c', 'RALLY', 45000, 50000),
  ]);
  assert.deepEqual(chapters.map(chapter => [chapter.start_ms, chapter.end_ms, chapter.entries.length]), [[1000, 15000, 2], [45000, 50000, 1]]);
  assert.deepEqual(entries.filter(entry => entry.kind === 'training').map(entry => entry.ordinal), [1, 2, 3]);
  assert.equal(entries.find(entry => entry.item.item_id === 'gap').chapterId, null);
});

test('explicit training labels are inherited, overridden and split when the drill changes', () => {
  const {entries, chapters} = buildTrainingNavigation([
    item('parent', 'RALLY_LIKE', 1000, 20000, null, {training_type: 'FIXED_POINT'}),
    item('a', 'RALLY', 1000, 4000, 'parent'),
    item('b', 'RALLY', 5000, 8000, 'parent', {training_type: 'MULTIBALL'}),
    item('c', 'RALLY', 9000, 12000, 'parent', {training_type: 'SERVE_RECEIVE'}),
    item('d', 'RALLY', 13000, 16000, 'parent', {training_type: 'not-a-label'}),
  ]);
  assert.deepEqual(chapters.map(chapter => chapter.trainingType), ['FIXED_POINT', 'MULTIBALL', 'SERVE_RECEIVE', 'UNCLASSIFIED']);
  assert.equal(entries.length, 4);
  assert.equal(new Set(chapters.map(chapter => chapter.id)).size, 4);
});

test('empty timelines and unexpanded activity segments remain usable', () => {
  assert.deepEqual(buildTrainingNavigation([]), {entries: [], chapters: []});
  const {entries, chapters} = buildTrainingNavigation([
    item('activity', 'RALLY_LIKE', 1000, 5000),
    item('zero', 'RALLY', 1000, 1000),
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'training');
  assert.equal(chapters.length, 1);
});

test('previous and next respect the selected clip during pre-roll and the actual playhead otherwise', () => {
  const {entries} = buildTrainingNavigation([
    item('a', 'RALLY', 1000, 4000), item('b', 'RALLY', 6000, 9000), item('c', 'RALLY', 11000, 12000),
  ]);
  const ids = result => [result.previous?.item.item_id, result.next?.item.item_id];
  assert.deepEqual(ids(adjacentTrainingEntries(entries, 5200, 'b')), ['a', 'c']);
  assert.deepEqual(ids(adjacentTrainingEntries(entries, 7500, null)), ['a', 'c']);
  assert.deepEqual(ids(adjacentTrainingEntries(entries, 10000, null)), ['b', 'c']);
  assert.deepEqual(ids(adjacentTrainingEntries(entries, 0, null)), [undefined, 'a']);
  assert.deepEqual(ids(adjacentTrainingEntries(entries, 13000, null)), ['c', undefined]);
  assert.deepEqual(ids(adjacentTrainingEntries([], 0, null)), [undefined, undefined]);
});
