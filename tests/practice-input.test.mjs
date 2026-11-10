import test from 'node:test';
import assert from 'node:assert/strict';
import {Practice} from '../src/practice.ts';
import {PracticeInputs} from '../src/practice-input.ts';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fixture() {
  const calls=[], responses={};let allowed=true,generation=0;
  const p=new Practice(async(command,args)=>{calls.push({command,args});return responses[command]!==undefined?await responses[command]:command==='practice_start'?++generation:undefined;},()=>{},()=>allowed);
  const inputs=new PracticeInputs(p,()=>allowed);
  const send=(action,token=1,source=1)=>inputs.receive({context:10,action,source,token,receipt:123});
  return {p,inputs,calls,responses,send,blur:()=>{allowed=false;inputs.reset();return p.clear();}};
}
test('dashboard tap starts/finishes practice and never dispatches normal dictation or clipboard commands',async()=>{
  const {p,calls,send,responses}=fixture();
  await send('toggle');assert.equal(p.view.phase,'recording');
  assert.equal(calls[0].args.shortcutReceipt,123);
  await send('toggle');assert.equal(p.view.phase,'processing');
  responses.practice_status={generation:1,phase:'complete',text:'A little more thinking.'};await p.poll();
  assert.equal(p.view.text,'A little more thinking.');
  await send('toggle');assert.equal(p.view.phase,'recording');
  assert.ok(calls.every(c=>c.command.startsWith('practice_')));
});
test('shortcut starts without a valid receipt fail closed; button start omits receipt',async()=>{
 const {p,inputs,calls}=fixture();
 for(const receipt of [undefined,0,-1,NaN,1.5]) await inputs.receive({context:10,action:'press',source:1,token:1,receipt});
 assert.equal(calls.length,0);await inputs.start();assert.equal(p.view.phase,'recording');assert.deepEqual(Object.keys(calls[0].args),['token']);
});
test('early hold release waits for the actual start acknowledgement then finishes once',async()=>{
  const {p,send,responses,calls}=fixture(), ack=deferred();responses.practice_start=ack.promise;
  const pressing=send('press');await send('release');assert.equal(p.view.phase,'starting');
  ack.resolve(4);await pressing;
  assert.equal(p.view.phase,'processing');
  assert.deepEqual(calls.filter(c=>c.command==='practice_finish').map(c=>c.args.generation),[4]);
  await send('release');assert.equal(calls.filter(c=>c.command==='practice_finish').length,1);
});
test('wrong physical release cannot finish another hold and repeats cannot restart it',async()=>{
  const {p,send,calls}=fixture();await send('press',1);await send('press',1);await send('release',2);await send('release',1,2);
  assert.equal(p.view.phase,'recording');assert.equal(calls.filter(c=>c.command==='practice_start').length,1);
  await send('release',1);assert.equal(p.view.phase,'processing');
});
test('cancel/focus loss during pending start cannot rearm or publish a late result',async()=>{
  for(const cancel of ['gesture','blur']) {
    const f=fixture(),ack=deferred();f.responses.practice_start=ack.promise;
    const pressing=f.send('press');if(cancel==='gesture')await f.send('cancel');else await f.blur();
    ack.resolve(8);await pressing;await f.send('release');
    assert.equal(f.p.view.phase,'idle');assert.equal(f.p.view.text,'');
    assert.equal(f.calls.some(c=>c.command==='practice_finish'),false);
  }
});
test('release survives clearing a previous completed test; stale clear cannot start after blur',async()=>{
  for(const blur of [false,true]) {
    const f=fixture();await f.send('toggle');await f.send('toggle');
    f.responses.practice_status={generation:1,phase:'complete',text:'old'};await f.p.poll();
    const ack=deferred();f.responses.practice_cancel=ack.promise;
    const pressing=f.send('press',2);await f.send('release',2);
    if(blur){f.inputs.reset();const clearing=f.blur();ack.resolve();await clearing;}else ack.resolve();
    await pressing;
    assert.equal(f.calls.filter(c=>c.command==='practice_start').length,blur?1:2);
    if(!blur)assert.equal(f.p.view.phase,'processing');
  }
});
