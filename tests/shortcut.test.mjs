import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultShortcut, shortcutFromEvent, shortcutLabel, ShortcutRecorder, MAX_CONTROL_TAP_MS } from '../src/shortcut.ts';
const event = (code, mods = {}) => ({code, ctrlKey:false, altKey:false, shiftKey:false, metaKey:false, repeat:false, isComposing:false, ...mods});
test('physical shortcut recorder accepts safe modified keys', () => {
  assert.deepEqual(shortcutFromEvent(event('Space', {altKey:true})), {code:'Space', modifiers:2});
  assert.deepEqual(shortcutFromEvent(event('Space', {ctrlKey:true, shiftKey:true})), {code:'Space', modifiers:5});
  assert.deepEqual(shortcutFromEvent(event('KeyJ', {metaKey:true})), {code:'KeyJ', modifiers:8});
});
test('recorder rejects typing, pure modifiers, reserved bindings, repeats and composition', () => {
  for (const e of [event('KeyJ'), event('KeyJ', {shiftKey:true}), event('AltLeft', {altKey:true}), event('Space', {metaKey:true}), event('Space', {ctrlKey:true}), event('KeyQ', {metaKey:true, shiftKey:true}), event('KeyV', {metaKey:true, altKey:true}), event('Digit3', {metaKey:true, shiftKey:true}), event('KeyJ', {altKey:true, repeat:true}), event('KeyJ', {altKey:true, isComposing:true})]) assert.throws(() => shortcutFromEvent(e));
});
test('Windows defaults and key names are platform driven, without changing Mac defaults', () => {
  assert.deepEqual(defaultShortcut(), { code: 'Fn', modifiers: 0 });
  assert.deepEqual(defaultShortcut('windows'), { code: 'ControlRight', modifiers: 0 });
  assert.equal(shortcutLabel(defaultShortcut('windows'), 'windows'), 'Right Ctrl');
  assert.equal(shortcutLabel({ code: 'KeyJ', modifiers: 15 }, 'windows'), 'Ctrl + Alt + Shift + Win + J');
  assert.equal(shortcutLabel({ code: 'Space', modifiers: 2 }), 'Option + Space');
});
test('Right Ctrl is release-only; modifier-first custom chords remain recordable', () => {
  const recorder = new ShortcutRecorder();
  assert.equal(recorder.key(event('ControlRight', {ctrlKey:true}), true, 'windows', 0), undefined);
  assert.deepEqual(recorder.key(event('ControlRight'), false, 'windows', MAX_CONTROL_TAP_MS), defaultShortcut('windows'));
  assert.equal(recorder.key(event('ControlRight'), false, 'windows', 401), undefined);
  recorder.key(event('ControlRight', {ctrlKey:true}), true, 'windows', 500);
  recorder.key(event('ShiftLeft', {ctrlKey:true, shiftKey:true}), true, 'windows', 510);
  assert.deepEqual(recorder.key(event('Space', {ctrlKey:true, shiftKey:true}), true, 'windows', 520), {code:'Space', modifiers:5});
  assert.equal(recorder.key(event('ControlRight'), false, 'windows', 530), undefined);
  recorder.reset();
  recorder.key(event('AltLeft', {altKey:true}), true);
  assert.deepEqual(recorder.key(event('Space', {altKey:true}), true), {code:'Space', modifiers:2});
});
test('Right Ctrl rejects holds, repeats, chords, AltGr, cancellation and stale releases', () => {
  for (const interrupt of ['hold', 'repeat', 'chord', 'already-held', 'altgr', 'mouse', 'reset', 'composing']) {
    const recorder = new ShortcutRecorder();
    if (interrupt === 'already-held') recorder.key(event('ControlLeft', {ctrlKey:true}), true, 'windows', 0);
    recorder.key(event('ControlRight', {ctrlKey:true, ...(interrupt === 'altgr' ? {getModifierState: () => true} : {}), isComposing:interrupt === 'composing'}), true, 'windows', 10);
    if (interrupt === 'repeat') recorder.key(event('ControlRight', {ctrlKey:true, repeat:true}), true, 'windows', 20);
    if (interrupt === 'chord') recorder.key(event('AltRight', {ctrlKey:true, altKey:true}), true, 'windows', 20);
    if (interrupt === 'mouse') recorder.interrupt();
    if (interrupt === 'reset') recorder.reset();
    assert.equal(recorder.key(event('ControlRight'), false, 'windows', interrupt === 'hold' ? 411 : 30), undefined, interrupt);
    recorder.reset();
    recorder.key(event('ControlRight', {ctrlKey:true}), true, 'windows', 500);
    assert.deepEqual(recorder.key(event('ControlRight'), false, 'windows', 510), defaultShortcut('windows'));
  }
  for (const code of ['ControlLeft', 'Control', 'AltRight']) {
    const recorder = new ShortcutRecorder();
    assert.equal(recorder.key(event(code, {ctrlKey:true}), true, 'windows', 0), undefined);
    assert.equal(recorder.key(event(code), false, 'windows', 10), undefined);
  }
  const mac = new ShortcutRecorder();
  mac.key(event('ControlRight', {ctrlKey:true}), true, 'macos', 0);
  assert.equal(mac.key(event('ControlRight'), false, 'macos', 10), undefined);
});
test('Windows recorder mirrors native physical-key and reserved-binding rules', () => {
  for (const code of ['Fn', 'Delete', 'F4', 'AltLeft', 'Space', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => `Key${c}`), 'Digit1']) {
    for (let modifiers = 0; modifiers < 16; modifiers++) {
      const windowsReserved = (modifiers & 8) && (!(modifiers & 3) || ['Space','KeyL','KeyD','KeyQ','KeyB','KeyR','KeyK'].includes(code));
      const reserved = windowsReserved || (code === 'Space' && [1,2].includes(modifiers)) || ((modifiers & 3) === 1 && ['KeyA','KeyC','KeyV','KeyX','KeyZ','KeyS','KeyW','KeyF','KeyN','KeyO','KeyP'].includes(code));
      const valid = /^(Key[A-Z]|Digit[0-9]|Space)$/.test(code) && !!(modifiers & 11) && !reserved;
      const e = event(code, {ctrlKey:!!(modifiers&1),altKey:!!(modifiers&2),shiftKey:!!(modifiers&4),metaKey:!!(modifiers&8)});
      if (valid) assert.deepEqual(shortcutFromEvent(e, 'windows'), {code, modifiers});
      else assert.throws(() => shortcutFromEvent(e, 'windows'), `${code}, ${modifiers}`);
    }
  }
  for (const mods of [{ctrlKey:true, repeat:true}, {altKey:true, isComposing:true}]) assert.throws(() => shortcutFromEvent(event('KeyJ', mods), 'windows'));
});
