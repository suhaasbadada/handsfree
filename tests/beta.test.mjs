import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('app and landing brands show a semantic, visible Beta badge', () => {
  for (const path of ['src/main.ts', 'site/index.html']) {
    const source = read(path);
    assert.match(source, /aria-label="HandsFree beta (?:overview|home)"/);
    assert.match(source, /<span class="beta-badge">Beta<\/span>/);
    assert.equal([...source.matchAll(/class="beta-badge"/g)].length, 1, 'One unobtrusive badge per surface');
  }
  for (const path of ['src/style.css', 'site/styles.css']) {
    assert.match(read(path), /\.beta-badge\{[^}]*color:#873c38;[^}]*font-size:11px/);
  }
});

test('README, release notes, installer guide and filename disclose beta without renaming the app', () => {
  assert.match(read('README.md'), /!\[Status: Beta\]\(https:\/\/img.shields.io\/badge\/Status-Beta-a64a45.svg\)/);
  assert.match(read('docs/releases/v0.1.0-beta.1.md'), /# HandsFree v0\.1\.0-beta\.1/);
  assert.match(read('docs/releases/v0.1.0-beta.1.md'), /Prerelease · Beta testing/);
  assert.match(read('docs/INSTALL.md'), /# Install HandsFree \(Mac beta\)/);
  assert.match(read('scripts/package-release.sh'), /NAME=HandsFree-0\.1\.0-beta\.1-macos-arm64/);
  assert.match(read('scripts/package-release.sh'), /-volname 'HandsFree Beta — drag to Applications'/);
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(config.productName, 'HandsFree');
  assert.equal(config.identifier, 'com.handsfree.local');
});
