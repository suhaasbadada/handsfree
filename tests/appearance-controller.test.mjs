import test from 'node:test';
import assert from 'node:assert/strict';
import { AppearancePreference } from '../src/appearance.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; };
test('appearance observes saved restart defaults and rejects stale/pending polls and duplicate changes', async () => {
  const write = deferred(); const calls = [];
  const preference = new AppearancePreference(async (command,args) => { calls.push({command,args}); return write.promise; },()=>{});
  preference.observe('light',0);
  const old = preference.revision;
  const change = preference.change('dark');
  assert.equal(preference.value,'light'); assert.equal(preference.selection,'dark');
  preference.observe('system',old);
  await preference.change('system');
  assert.equal(calls.length,1); assert.equal(preference.selection,'dark');
  write.resolve({appearance:'dark'}); await change;
  preference.observe('system',old);
  assert.equal(preference.value,'dark'); assert.equal(preference.pending,false);
  const restarted = new AppearancePreference(async()=>{},()=>{});
  restarted.observe(preference.value,0); assert.equal(restarted.value,'dark');
  restarted.observe(undefined,0); assert.equal(restarted.value,'system');
  restarted.observe('unknown',0); assert.equal(restarted.value,'system');
  await preference.change('dark'); assert.equal(calls.length,1);
});
test('appearance failure restores observed selection, including post-rename reconciliation', async () => {
  for (const actual of ['light','dark','system']) {
    const calls=[];
    const preference = new AppearancePreference(async command => { calls.push(command); if(command==='set_appearance') throw Error('save failed'); return {appearance:actual}; },()=>{});
    preference.observe('light',0);
    await preference.change('dark');
    assert.deepEqual(calls,['set_appearance','status']);
    assert.equal(preference.value,actual); assert.equal(preference.selection,actual);
    assert.match(preference.error,/save failed/); assert.equal(preference.pending,false);
  }
});
test('disconnected reconciliation keeps last actual saved preference without touching capture or usage', async () => {
  const calls=[];
  const preference = new AppearancePreference(async command=>{calls.push(command);throw Error('offline');},()=>{});
  preference.observe('dark',0); await preference.change('system');
  assert.equal(preference.value,'dark'); assert.equal(preference.selection,'dark');
  assert.deepEqual(calls,['set_appearance','status']);
});
