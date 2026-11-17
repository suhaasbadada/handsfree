import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Updates stays inline while real dialogs retain accessible focus and confirmation', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /id="(?:updates-dialog|update-confirm-dialog)"/);
  assert.match(source, /<h2 id="health-title" tabindex="-1" autofocus>Product status<\/h2>/);
  assert.match(css, /:where\(button, a, input, textarea, select, \[tabindex\]\):focus-visible\s*\{ outline: 3px solid/);
  assert.match(source, /id="keep-stats" autofocus>Keep totals/,'Destructive reset retains explicit confirmation');
  assert.match(source, /event\.repeat/,'Holding Enter must not repeat activation when a check becomes a download offer');
});
