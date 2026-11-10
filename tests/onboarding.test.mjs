import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupChecklist, shortcutTutorial} from '../src/onboarding.ts';

test('setup checks require explicit native Mac proofs, never truthy or unknown observations', () => {
  const ready = {platform:'macos',microphone:true,accessibility:true,input_monitoring:true,hotkey:true,model_ready:true};
  assert.deepEqual(Object.values(setupChecklist()), [false,false,false,false]);
  assert.deepEqual(Object.values(setupChecklist(ready)), [true,true,true,true]);
  for (const platform of [undefined,'windows','future']) assert.ok(Object.values(setupChecklist({...ready,platform})).every(v=>v===false));
  for (const key of ['microphone','accessibility','input_monitoring','hotkey','model_ready']) {
    for (const value of [undefined,null,false,1,'true']) {
      const result = setupChecklist({...ready,[key]:value});
      assert.equal(result[{accessibility:'permissions',input_monitoring:'permissions',hotkey:'shortcut',model_ready:'model'}[key]??key],false);
    }
  }
});
test('tutorial uses actual binding and mode, unknown modes never invent a gesture', () => {
  assert.match(shortcutTutorial('Option + Space','push_to_talk'), /Hold Option \+ Space.*release to finish/);
  assert.match(shortcutTutorial('Fn','toggle'), /Press Fn.*press it again/);
  assert.match(shortcutTutorial('Fn','future'), /Waiting/);
});
