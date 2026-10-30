import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseLabel, canCancel } from '../src/presentation.ts';
test('recording and processing are cancellable; model download is not', () => {
  assert.equal(canCancel('recording'), true);
  assert.equal(canCancel('processing'), true);
  for (const phase of ['idle', 'downloading', 'error']) assert.equal(canCancel(phase), false);
});
test('all states have user-facing labels and unknown state is safe', () => {
  assert.equal(phaseLabel('recording'), 'Listening');
  assert.equal(phaseLabel('processing'), 'Finding your words');
  assert.equal(phaseLabel('error'), 'Needs attention');
  assert.equal(phaseLabel('unexpected'), 'Connecting');
});
