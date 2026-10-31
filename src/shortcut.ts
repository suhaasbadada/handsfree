export type Shortcut = { code: string; modifiers: number };
export function defaultShortcut(platform = 'macos'): Shortcut {
  return platform === 'windows' ? { code: 'ControlRight', modifiers: 0 } : { code: 'Fn', modifiers: 0 };
}
export function shortcutLabel(shortcut: Shortcut, platform = 'macos'): string {
  if (shortcut.code === 'Fn') return 'Fn';
  if (shortcut.code === 'ControlRight' && shortcut.modifiers === 0) return 'Right Ctrl';
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

// Same 400 ms release-only semantics as the native recognizer. No timers or
// delayed callbacks: reset/cancel cannot leave a stale gesture queued for save.
export const MAX_CONTROL_TAP_MS = 400;
type RecordedKey = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat' | 'isComposing'> & { getModifierState?: (key: string) => boolean };
export class ShortcutRecorder {
  private held = new Set<string>();
  private start: number | undefined;
  reset() { this.held.clear(); this.start = undefined; }
  interrupt() { this.start = undefined; }
  key(e: RecordedKey, down: boolean, platform = 'macos', now = performance.now()): Shortcut | undefined {
    const repeated = this.held.has(e.code) || e.repeat;
    const altGr = e.getModifierState?.('AltGraph');
    if (down) {
      const alone = this.held.size === 0;
      this.held.add(e.code);
      this.interrupt();
      if (e.isComposing || altGr || repeated) return;
      if (platform === 'windows' && e.code === 'ControlRight' && alone && e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        this.start = now;
        return;
      }
      // Modifier keydowns must remain available for a subsequent chord key.
      if (/^(Control|Alt|Shift|Meta)/.test(e.code)) return;
      return shortcutFromEvent(e, platform);
    }
    this.held.delete(e.code);
    const start = this.start;
    this.interrupt();
    if (platform === 'windows' && e.code === 'ControlRight' && start !== undefined && this.held.size === 0 && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && !e.isComposing && !altGr && now >= start && now - start <= MAX_CONTROL_TAP_MS) return defaultShortcut('windows');
  }
}
