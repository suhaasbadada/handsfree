import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Updates initially focuses its heading without suppressing interactive keyboard focus', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(source, /<h2 id="updates-title" tabindex="-1" autofocus>App updates<\/h2>/);
  assert.match(source, /<h2 id="update-confirm-title" tabindex="-1" autofocus>Update HandsFree\?<\/h2>/);
  assert.match(css, /#updates-title:focus, #update-confirm-title:focus\s*\{\s*outline: none;\s*\}/);
  assert.match(css, /:where\(button, a, input, select, \[tabindex\]\):focus-visible\s*\{ outline: 3px solid/);
  assert.match(source, /id="update-keep">Not now/,'Install confirmation does not preselect a button');
});
