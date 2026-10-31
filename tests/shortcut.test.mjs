import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortcutFromEvent } from '../src/shortcut.ts';
const event = (code, mods = {}) => ({code, ctrlKey:false, altKey:false, shiftKey:false, metaKey:false, repeat:false, isComposing:false, ...mods});
test('physical shortcut recorder accepts safe modified keys', () => {
  assert.deepEqual(shortcutFromEvent(event('Space', {altKey:true})), {code:'Space', modifiers:2});
  assert.deepEqual(shortcutFromEvent(event('Space', {ctrlKey:true, shiftKey:true})), {code:'Space', modifiers:5});
  assert.deepEqual(shortcutFromEvent(event('KeyJ', {metaKey:true})), {code:'KeyJ', modifiers:8});
});
test('recorder rejects typing, pure modifiers, reserved bindings, repeats and composition', () => {
  for (const e of [event('KeyJ'), event('KeyJ', {shiftKey:true}), event('AltLeft', {altKey:true}), event('Space', {metaKey:true}), event('Space', {ctrlKey:true}), event('KeyQ', {metaKey:true, shiftKey:true}), event('KeyV', {metaKey:true, altKey:true}), event('Digit3', {metaKey:true, shiftKey:true}), event('KeyJ', {altKey:true, repeat:true}), event('KeyJ', {altKey:true, isComposing:true})]) assert.throws(() => shortcutFromEvent(e));
});
