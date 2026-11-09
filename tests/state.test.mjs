import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictationPhases, practicePhases, updatePhases, phasePolicy, isUpdatePhase, updatePhaseBusy, updateInstalling, acceptsUpdateProgress } from '../src/state.ts';
import { phaseLabel, canCancel } from '../src/presentation.ts';

const rows = JSON.parse(readFileSync(new URL('./fixtures/action-policy.json', import.meta.url)));
test('every dictation phase has an exhaustive action policy shared with Rust', () => {
  assert.deepEqual(rows.map(r => r.phase).filter(p => p !== 'unknown'), [...dictationPhases]);
  for (const {phase, ...expected} of rows) {
    assert.deepEqual(phasePolicy(phase), expected, phase);
    assert.equal(canCancel(phase), expected.cancel);
    if (phase !== 'unknown') assert.notEqual(phaseLabel(phase), 'Connecting');
  }
  for (const unknown of [undefined, null, '', 'new_phase', '__proto__', 'constructor', 1, {}]) {
    assert.deepEqual(phasePolicy(unknown), phasePolicy('unknown'));
    if (typeof unknown === 'string') assert.equal(phaseLabel(unknown), 'Connecting');
  }
  assert.ok(Object.isFrozen(phasePolicy('idle')), 'A caller cannot mutate shared eligibility');
});
test('each domain keeps its own phase space; downloading is not a global phase', () => {
  for (const phases of [dictationPhases, practicePhases, updatePhases]) assert.ok(Object.isFrozen(phases));
  assert.equal(new Set(practicePhases).size, practicePhases.length);
  assert.equal(new Set(updatePhases).size, updatePhases.length);
  assert.equal(phasePolicy('downloading').installUpdate, false, 'Model download blocks installation');
  for (const phase of updatePhases) {
    assert.equal(isUpdatePhase(phase), true);
    assert.equal(updateInstalling(phase), ['downloading','installing'].includes(phase));
    assert.equal(updatePhaseBusy(phase), ['checking','downloading','installing'].includes(phase));
  }
  assert.equal(isUpdatePhase('recording'), false);
});
test('progress snapshots cannot regress installation or report terminal success', () => {
  for (const current of updatePhases) for (const reported of [...updatePhases, undefined, 'new_phase']) {
    const expected = current === 'downloading' && ['downloading','installing'].includes(reported) || current === 'installing' && reported === 'installing';
    assert.equal(acceptsUpdateProgress(current, reported), expected, `${current} -> ${reported}`);
  }
});
