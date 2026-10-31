export type Shortcut = { code: string; modifiers: number };
export function shortcutFromEvent(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat' | 'isComposing'>): Shortcut {
  if (e.repeat || e.isComposing) throw new Error('Release the keys and try again.');
  const modifiers = Number(e.ctrlKey) | Number(e.altKey) << 1 | Number(e.shiftKey) << 2 | Number(e.metaKey) << 3;
  if (!/^(Key[A-Z]|Digit[0-9]|Space)$/.test(e.code) || !(modifiers & 11)) throw new Error('Use Control, Option or Command with a letter, number or Space.');
  if ((e.metaKey && /^(Key[ACVXZQWHMNOPSFT]|Space)$/.test(e.code)) || (e.code === 'Space' && modifiers === 1) || (e.metaKey && e.shiftKey && e.code.startsWith('Digit'))) throw new Error('That shortcut is reserved. Try Option + Space or Control + Shift + Space.');
  return { code: e.code, modifiers };
}
