import assert from 'node:assert/strict';
import test from 'node:test';

import { getAssessmentHistoryState, parseAssessmentId } from '../src/assessment-history.js';

test('hides history when there are zero or one assessments', () => {
  assert.deepEqual(
    getAssessmentHistoryState({ storedCount: 0n, activeId: null, requestedId: '0' }),
    { visible: false, position: '', previousId: null, nextId: null, requestedAssessmentId: null },
  );
  assert.equal(
    getAssessmentHistoryState({ storedCount: 1n, activeId: 0n, requestedId: '0' }).visible,
    false,
  );
});

test('enables only the valid direction controls at the first and latest assessment', () => {
  const first = getAssessmentHistoryState({ storedCount: 3n, activeId: 0n, requestedId: '2' });
  assert.equal(first.visible, true);
  assert.equal(first.position, 'Assessment 1 of 3 · ID 0');
  assert.equal(first.previousId, null);
  assert.equal(first.nextId, 1n);
  assert.equal(first.requestedAssessmentId, 2n);

  const latest = getAssessmentHistoryState({ storedCount: 3n, activeId: 2n, requestedId: '2' });
  assert.equal(latest.position, 'Assessment 3 of 3 · ID 2');
  assert.equal(latest.previousId, 1n);
  assert.equal(latest.nextId, null);
});

test('allows direct ID lookup for a stored assessment and trims whitespace', () => {
  assert.equal(parseAssessmentId(' 01 ', 3n), 1n);
});

test('rejects empty, malformed, negative, and out-of-range IDs', () => {
  for (const value of ['', 'abc', '-1', '3', '999999999999999999999999999999999999999999999999999999999999999999999999999999']) {
    assert.equal(parseAssessmentId(value, 3n), null, `expected ${JSON.stringify(value)} to be invalid`);
  }
  assert.equal(parseAssessmentId('0', null), null);
  assert.equal(parseAssessmentId('0', 0n), null);
});

test('rejects a stale active ID instead of enabling navigation outside stored history', () => {
  const state = getAssessmentHistoryState({ storedCount: 2n, activeId: 2n, requestedId: '1' });
  assert.equal(state.position, '2 stored');
  assert.equal(state.previousId, null);
  assert.equal(state.nextId, null);
  assert.equal(state.requestedAssessmentId, 1n);
});
