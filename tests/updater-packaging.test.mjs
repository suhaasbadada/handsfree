import test from 'node:test';
import assert from 'node:assert/strict';
import { updaterFeed, buildReviewedSource } from '../scripts/package-updater.mjs';

test('generated updater metadata selects exactly the canonical Apple Silicon release artifact', () => {
  assert.deepEqual(updaterFeed('0.1.1-beta.8', 'signed-value', 'User-visible notes'), {
    version: '0.1.1-beta.8', notes: 'User-visible notes', platforms: {
      'darwin-aarch64': { url: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.8/HandsFree-0.1.1-beta.8-macos-arm64.app.tar.gz', signature: 'signed-value' },
    },
  });
  assert.equal(updaterFeed('1.2.3', 'signature', 'x'.repeat(5000)).notes.length, 4000);
  for (const invalid of ['../escape', 'v0.1.1-beta.8', '0.1.1-windows-beta.3', '0.1.1-beta.01', '0.1.1-beta.8?query', '0.1.1+build']) {
    assert.throws(() => updaterFeed(invalid, 'signature'));
  }
  assert.throws(() => updaterFeed('0.1.1-beta.8', ''));
  assert.throws(() => updaterFeed('0.1.1-beta.8', 'signature\nextra'));
});
test('updater provenance requires a fresh build inside a clean unchanged source boundary', () => {
  const events = [];
  let current = { commit: 'reviewed', status: '' };
  const steps = {
    source: () => current,
    snapshot: () => events.push('snapshot'),
    build: () => events.push('build'),
    restore: () => events.push('restore'),
    cleanup: () => events.push('cleanup'),
  };
  assert.equal(buildReviewedSource(steps), 'reviewed');
  assert.deepEqual(events, ['snapshot', 'build', 'restore', 'cleanup'], 'A cached app alone can never satisfy provenance');
  events.length = 0;
  assert.throws(() => buildReviewedSource({ ...steps, build: () => { events.push('build'); throw new Error('compile failed'); } }), /compile failed/);
  assert.deepEqual(events, ['snapshot', 'build', 'restore', 'cleanup'], 'Failed builds still restore only recognized CLI normalization');
  events.length = 0;
  assert.throws(() => buildReviewedSource({ ...steps, restore: () => { throw new Error('unexpected changes'); } }), /unexpected changes/);
  assert.deepEqual(events, ['snapshot', 'build'], 'An unexpected source change keeps its recovery receipt');
  assert.throws(() => buildReviewedSource({ ...steps, build: () => { current = { commit: 'new-head', status: '' }; } }), /Source changed/);
  current = { commit: 'reviewed', status: '' };
  assert.throws(() => buildReviewedSource({ ...steps, build: () => { current = { commit: 'reviewed', status: ' M src/main.ts' }; } }), /Source changed/);
  events.length = 0;
  assert.throws(() => buildReviewedSource(steps), /Commit reviewed source/);
  assert.deepEqual(events, [], 'Dirty input cannot trigger a build or signing');
});
