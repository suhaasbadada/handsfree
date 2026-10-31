import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseLabel, canCancel, formatTime, readiness, readinessDetail } from '../src/presentation.ts';
test('recording and processing are cancellable; model download is not', () => {
  assert.equal(canCancel('recording'), true);
  assert.equal(canCancel('processing'), true);
  for (const phase of ['idle', 'not_pasted', 'downloading', 'error']) assert.equal(canCancel(phase), false);
});
test('usage times are honest and safe at formatting boundaries', () => {
  assert.equal(formatTime(0), '0 sec');
  assert.equal(formatTime(-10), '0 sec');
  assert.equal(formatTime(NaN), '0 sec');
  assert.equal(formatTime(59.9), '59 sec');
  assert.equal(formatTime(60), '1 min');
  assert.equal(formatTime(5400), '1.5 hr');
});
test('readiness requires model, all permissions, and a connected shortcut', () => {
  const ready = { model_ready: true, microphone: true, accessibility: true, input_monitoring: true, hotkey: true };
  assert.equal(readiness(ready), true);
  for (const key of Object.keys(ready)) assert.equal(readiness({ ...ready, [key]: false }), false);
});
test('Fn readiness explains actual missing access and stale hooks separately', () => {
  const ready = { model_ready: true, microphone: true, accessibility: true, input_monitoring: true, hotkey: true };
  assert.match(readinessDetail({ ...ready, input_monitoring: false }), /Input Monitoring/);
  assert.match(readinessDetail({ ...ready, hotkey: false }), /Quit and reopen.*reconnect/);
  assert.match(readinessDetail({ ...ready, accessibility: false }), /Allow Accessibility in Settings/);
  assert.match(readinessDetail({ ...ready, microphone: false }), /Allow Microphone in Settings/);
  assert.equal(readinessDetail({ ...ready, microphone: false, accessibility: false, input_monitoring: false }), 'Allow Microphone, Accessibility, Input Monitoring in Settings.');
  assert.match(readinessDetail({ ...ready, model_ready: false }), /Download the English model/);
  assert.equal(readinessDetail(ready), 'Ready to dictate.');
});
test('all states have user-facing labels and unknown state is safe', () => {
  assert.equal(phaseLabel('idle'), 'Ready');
  assert.equal(phaseLabel('recording'), 'Listening');
  assert.equal(phaseLabel('processing'), 'Finding your words');
  assert.equal(phaseLabel('error'), 'Needs attention');
  assert.equal(phaseLabel('setup_required'), 'Setup needs attention');
  assert.equal(phaseLabel('not_pasted'), 'Not pasted · transcript saved');
  assert.equal(phaseLabel('copied'), 'Copied');
  assert.equal(canCancel('copied'), false);
  assert.equal(phaseLabel('unexpected'), 'Connecting');
});
