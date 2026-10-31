export type Shortcut = { code: string; modifiers: number };
export function defaultShortcut(platform = 'macos'): Shortcut {
  return platform === 'windows' ? { code: 'Space', modifiers: 5 } : { code: 'Fn', modifiers: 0 };
}
export function shortcutLabel(shortcut: Shortcut, platform = 'macos'): string {
  if (shortcut.code === 'Fn') return 'Fn';
  const names = platform === 'windows' ? ['Ctrl', 'Alt', 'Shift', 'Win'] : ['Control', 'Option', 'Shift', 'Command'];
  return [...names.filter((_, i) => shortcut.modifiers & (1 << i)), shortcut.code.replace(/^(Key|Digit)/, '')].join(' + ');
}
export function shortcutFromEvent(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat' | 'isComposing'>, platform = 'macos'): Shortcut {
  if (e.repeat || e.isComposing) throw new Error('Release the keys and try again.');
  const modifiers = Number(e.ctrlKey) | Number(e.altKey) << 1 | Number(e.shiftKey) << 2 | Number(e.metaKey) << 3;
  if (platform === 'windows') {
    if (!/^(Key[A-Z]|Digit[0-9]|Space)$/.test(e.code) || !(modifiers & 11)) throw new Error('Use Ctrl, Alt or Win with a letter, number or Space.');
    // Match native validation; registration remains authoritative for collisions.
    const windowsReserved = e.metaKey && (!(modifiers & 3) || /^(Space|Key[LDQBRK])$/.test(e.code));
    if (windowsReserved || (e.code === 'Space' && [1, 2].includes(modifiers)) || ((modifiers & 3) === 1 && /^Key[ACVXZSWFNOP]$/.test(e.code))) throw new Error('That shortcut is reserved for Windows or common app actions. Try Ctrl + Shift + Space.');
    return { code: e.code, modifiers };
  }
  if (!/^(Key[A-Z]|Digit[0-9]|Space)$/.test(e.code) || !(modifiers & 11)) throw new Error('Use Control, Option or Command with a letter, number or Space.');
  if ((e.metaKey && /^(Key[ACVXZQWHMNOPSFT]|Space)$/.test(e.code)) || (e.code === 'Space' && modifiers === 1) || (e.metaKey && e.shiftKey && e.code.startsWith('Digit'))) throw new Error('That shortcut is reserved. Try Option + Space or Control + Shift + Space.');
  return { code: e.code, modifiers };
}
