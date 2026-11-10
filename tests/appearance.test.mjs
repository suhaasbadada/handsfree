import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('native window configuration inherits system appearance rather than forcing Aqua', () => {
  // Tauri's window-config contract: an omitted/null theme inherits the system;
  // an explicit Light value overrides AppKit even when CSS supports dark mode.
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.ok(config.app.windows.some(window => window.label === 'main'));
  for (const window of config.app.windows) {
    assert.equal(window.theme ?? null, null, `${window.label} must inherit system appearance`);
    assert.equal(window.backgroundColor ?? null, null, `${window.label} must not force a light native background`);
  }
});
