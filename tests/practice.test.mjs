import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Practice } from '../src/practice.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function harness() {
  const calls = [], responses = {}, views = [];
  let focused = true;
  const practice = new Practice(async (command, args) => {
    calls.push({ command, args });
    if (responses[command] instanceof Error) throw responses[command];
    if (responses[command] !== undefined) return await responses[command];
    return command === 'practice_start' ? 4 : undefined;
  }, view => views.push(structuredClone(view)), () => focused);
  return { practice, calls, responses, views, blur: () => { focused = false; } };
}
test('explicit start and generation-scoped finish are idempotent; completion renders only once', async () => {
  const {practice:p,calls,responses} = harness();
  const start = p.start(); await p.start(); await start;
  assert.equal(calls.length, 1);
  const finish = p.finish(); await p.finish(); await finish;
  assert.equal(calls.filter(c=>c.command==='practice_finish').length, 1);
  assert.equal(calls[1].args.generation, 4);
  responses.practice_status = {generation:4,phase:'complete',text:'<script>bad()</script> & hello'};
  await p.poll(); assert.equal(p.view.text, responses.practice_status.text);
  p.edit('My edit'); await p.poll(); assert.equal(p.view.text, 'My edit');
  await p.clear(); await p.poll(); assert.equal(p.view.text, '');
  await p.start(); assert.equal(p.view.phase, 'recording');
  assert.ok(calls.at(-1).args.token > calls[0].args.token);
});
test('late start acknowledgement after navigation cannot re-arm recording', async () => {
  const {practice:p,responses,calls} = harness(), delayed = deferred();
  responses.practice_start = delayed.promise;
  const start = p.start(); const token = calls[0].args.token;
  await p.clear(); delayed.resolve(4); await start;
  assert.equal(p.view.phase, 'idle'); assert.equal(p.view.text, '');
  assert.equal(calls.filter(c=>c.command==='practice_cancel').every(c=>c.args.token===token), true);
  await p.finish(); assert.equal(calls.some(c=>c.command==='practice_finish'), false);
});
test('stale polls cannot restore cleared text or overwrite a newer session', async () => {
  const {practice:p,responses} = harness(), delayed = deferred();
  await p.start(); responses.practice_status = delayed.promise;
  const poll = p.poll(); await p.clear(); await p.start();
  delayed.resolve({generation:4,phase:'complete',text:'private stale'}); await poll;
  assert.equal(p.view.text, ''); assert.equal(p.view.phase, 'recording');
});
test('user editing during transcription is preserved; mismatched result is ignored', async () => {
  const {practice:p,responses} = harness(); await p.start(); await p.finish();
  responses.practice_status = {generation:3,phase:'complete',text:'wrong session'};
  await p.poll(); assert.equal(p.view.text, '');
  p.edit('typed while processing');
  responses.practice_status = {generation:4,phase:'complete',text:'spoken'};
  await p.poll(); assert.equal(p.view.text, 'typed while processing');
});
test('rejected starts, finish errors, empty speech, native cancellation and poll failures stay local', async () => {
  const h = harness(), p = h.practice;
  h.responses.practice_start = new Error('busy'); await p.start();
  assert.equal(p.view.phase,'error'); assert.equal(p.view.text,'');
  delete h.responses.practice_start; await p.start();
  h.responses.practice_finish = new Error('stale'); await p.finish();
  assert.equal(p.view.phase,'error'); assert.equal(p.view.text,'');
  delete h.responses.practice_finish; await p.start();
  h.responses.practice_status = {generation:4,phase:'empty',text:''}; await p.poll();
  assert.equal(p.view.phase,'empty'); await p.clear(); await p.start();
  h.responses.practice_status = {generation:null,phase:'cancelled',text:'must not render'}; await p.poll();
  assert.equal(p.view.phase,'idle'); assert.equal(p.view.text,'');
  await p.start(); h.responses.practice_status = new Error('offline'); await p.poll();
  assert.equal(p.view.phase,'error'); assert.equal(p.view.text,'');
  assert.equal(h.calls.every(c=>c.command.startsWith('practice_')),true);
});
test('focus loss rejects late results and failed cancellation must be retried before restarting', async () => {
  const h = harness(), p = h.practice; await p.start(); h.blur();
  h.responses.practice_status = {generation:4,phase:'complete',text:'not visible'}; await p.poll();
  assert.equal(p.view.text,''); await p.start(); assert.equal(p.view.phase,'idle');
  const h2 = harness(); await h2.practice.start();
  h2.responses.practice_cancel = new Error('offline'); await h2.practice.clear();
  await h2.practice.start(); assert.equal(h2.calls.filter(c=>c.command==='practice_start').length,1);
  delete h2.responses.practice_cancel; await h2.practice.clear(); await h2.practice.start();
  assert.equal(h2.calls.filter(c=>c.command==='practice_start').length,2);
});
test('practice is in-memory only; native destination branches before every normal delivery and persistence path', () => {
  const ts = readFileSync(new URL('../src/practice.ts',import.meta.url),'utf8');
  assert.doesNotMatch(ts,/localStorage|sessionStorage|navigator\.clipboard|console\./);
  const ui = readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
  assert.match(ui,/practiceField\.value = view\.text/);
  assert.doesNotMatch(ui,/current\.transcript|status\.transcript/);
  const rust = readFileSync(new URL('../src-tauri/src/main.rs',import.meta.url),'utf8');
  const branch = rust.slice(rust.indexOf('if let Some(token) = inner.practice.take()'),rust.indexOf('match result {',rust.indexOf('if let Some(token) = inner.practice.take()')));
  assert.match(branch,/gate\.complete/); assert.match(branch,/return;/);
  assert.doesNotMatch(branch,/hf_paste|hf_copy|status\.transcript|stats\.record|storage::save/);
});
for (const failure of ['practice_finish', 'practice_status']) test(`${failure}: a delayed error cleanup cannot replace a newer recording`, async () => {
  const first = deferred(), second = deferred(), entered = deferred();
  let cancellations = 0, generation = 0;
  const p = new Practice(async command => {
    if (command === 'practice_start') return ++generation;
    if (command === failure) throw new Error('old failure');
    if (command === 'practice_cancel') {
      const pending = ++cancellations === 1 ? first : second;
      entered.resolve();
      await pending.promise;
    }
  }, () => {}, () => true);
  await p.start();
  const failing = failure === 'practice_finish' ? p.finish() : p.poll();
  await entered.promise;
  const manualClear = p.clear();
  second.resolve(); await manualClear;
  await p.start();
  assert.equal(p.view.phase, 'recording');
  first.resolve(); await failing;
  assert.equal(p.view.phase, 'recording', 'Old error must not disable Finish/Cancel for new capture');
});
