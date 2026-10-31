import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('app and landing brands show a semantic, visible Beta badge', () => {
  for (const path of ['src/main.ts', 'site/index.html']) {
    const source = read(path);
    assert.match(source, /aria-label="HandsFree beta (?:overview|home)"/);
    assert.match(source, /<sup class="beta-badge">BETA<\/sup>/);
    assert.equal([...source.matchAll(/class="beta-badge"/g)].length, 1, 'One unobtrusive badge per surface');
  }
  for (const path of ['src/style.css', 'site/styles.css']) {
    assert.match(read(path), /\.beta-badge\{[^}]*color:#873c38;[^}]*font-size:(?:10|11)px/);
  }
});

test('landing Beta is a small superscript, not a full-size wordmark or pill', () => {
  assert.match(read('site/index.html'), /<sup class="beta-badge">BETA<\/sup>/);
  const rule = read('site/styles.css').match(/\.beta-badge\{([^}]*)\}/)?.[1];
  assert.match(rule, /top:-0\.55em/);
  assert.match(rule, /font-size:10px/);
  assert.doesNotMatch(rule, /border:|padding:|background:/);
});

test('README, release notes, installer guide and filename disclose beta without renaming the app', () => {
  assert.match(read('README.md'), /!\[Mac beta: v0\.1\.1-beta\.2\]\(https:\/\/img.shields.io\/badge\/Mac_beta-v0\.1\.1--beta\.2-a64a45.svg\)/);
  assert.match(read('docs/releases/v0.1.1-beta.2.md'), /# HandsFree v0\.1\.1-beta\.2/);
  assert.match(read('docs/releases/v0.1.1-beta.2.md'), /Prerelease · Beta testing/);
  assert.match(read('docs/INSTALL.md'), /# Install HandsFree \(Mac beta\)/);
  assert.match(read('scripts/package-release.sh'), /NAME=HandsFree-0\.1\.1-beta\.2-macos-arm64/);
  assert.match(read('scripts/package-release.sh'), /-volname 'HandsFree Beta — drag to Applications'/);
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(config.productName, 'HandsFree');
  assert.equal(config.identifier, 'com.handsfree.local');
});

test('beta 2 app, package, release manifest and audit versions stay coordinated', async () => {
  const { release } = await import('../site/release.js');
  const { candidate, tag } = await import('../scripts/check-release.mjs');
  const version = JSON.parse(read('package.json')).version;
  assert.equal(version, '0.1.1');
  assert.equal(JSON.parse(read('package-lock.json')).version, version);
  assert.equal(JSON.parse(read('package-lock.json')).packages[''].version, version);
  assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version, version);
  assert.ok(read('src-tauri/Cargo.toml').includes(`version = "${version}"`));
  assert.ok(read('src-tauri/Cargo.lock').includes(`name = "handsfree"\nversion = "${version}"`));
  assert.equal(release.version, `${version}-beta.2`);
  assert.equal(tag, `v${release.version}`);
  assert.equal(candidate, `HandsFree-${release.version}-macos-arm64.dmg`);
  assert.ok(read('scripts/package-release.sh').includes(`NAME=${candidate.slice(0, -4)}`));
  assert.ok(read('scripts/package-release.sh').includes(`== ${version} ]]`));
  assert.ok(read('src/main.ts').includes(`HandsFree · ${version} beta`));
  assert.ok(read(`docs/releases/${tag}.md`).includes(`Internal app version: **${version}**`));
});
