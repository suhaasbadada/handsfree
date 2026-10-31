import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function sandbox(callback) {
  const root = mkdtempSync(join(tmpdir(), 'handsfree-package-test-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'bin'));
    copyFileSync(new URL('../scripts/package-release.sh', import.meta.url), join(root, 'scripts/package-release.sh'));
    const stub = (name, body) => writeFileSync(join(root, 'bin', name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
    stub('uname', 'if [[ "$1" == -s ]]; then echo Darwin; else echo arm64; fi');
    stub('git', 'if [[ "$1" == rev-parse ]]; then printf "%040d\\n" 1; fi');
    stub('npm', 'echo "mock build failed" >&2; exit 42');
    const run = (...args) => spawnSync('/bin/bash', [join(root, 'scripts/package-release.sh'), ...args], {
      encoding: 'utf8', env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}` },
    });
    callback({ root, stub, run });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('packaging rejects arguments before creating output or invoking build', () => sandbox(({ root, run }) => {
  const result = run('--publish');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
  assert.ok(!readdirSync(root).includes('release'));
}));

test('packaging rejects unsupported hosts before build', () => sandbox(({ root, stub, run }) => {
  stub('uname', 'echo Linux');
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Apple Silicon macOS required/);
  assert.ok(!readdirSync(root).includes('release'));
}));

for (const existing of ['HandsFree-0.1.0-beta.1-macos-arm64.dmg', 'SHA256SUMS', 'PROVENANCE.txt']) {
  test(`packaging refuses to overwrite ${existing}`, () => sandbox(({ root, run }) => {
    mkdirSync(join(root, 'release'));
    writeFileSync(join(root, 'release', existing), 'preserve me');
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Candidate output exists/);
    assert.equal(readFileSync(join(root, 'release', existing), 'utf8'), 'preserve me');
    assert.deepEqual(readdirSync(join(root, 'release')), [existing]);
  }));
}

test('build failure propagates its status and cleans only the run staging directory', () => sandbox(({ root, run }) => {
  mkdirSync(join(root, 'release'));
  writeFileSync(join(root, 'release', 'unrelated.txt'), 'keep');
  const result = run();
  assert.equal(result.status, 42);
  assert.match(result.stderr, /mock build failed/);
  assert.deepEqual(readdirSync(join(root, 'release')), ['unrelated.txt']);
}));

test('DMG script uses stable signing, read-only validation, scoped cleanup and no installer ZIP', () => {
  const script = readFileSync(new URL('../scripts/package-release.sh', import.meta.url), 'utf8');
  assert.match(script, /npm run build:local/);
  assert.match(script, /local-signing.sh --sign-dmg/);
  assert.match(script, /hdiutil verify/);
  assert.match(script, /hdiutil attach -readonly -nobrowse -noautoopen -mountpoint/);
  assert.match(script, /verify_app "\$MOUNT\/HandsFree.app"/);
  assert.match(script, /trap cleanup EXIT/);
  assert.match(script, /preserving staging directory/);
  assert.doesNotMatch(script, /--init|\.zip|osascript|\/Applications\/HandsFree\.app/);
});

test('disk-image root is install-focused while complete notices and source remain included', () => {
  const script = readFileSync(new URL('../scripts/package-release.sh', import.meta.url), 'utf8');
  assert.match(script, /cp docs\/INSTALL.md "\$PAYLOAD\/Install HandsFree.txt"/);
  assert.match(script, /cp LICENSE "\$PAYLOAD\/Licenses\/LICENSE"/);
  assert.match(script, /release-notices.py "\$PAYLOAD\/Licenses"/);
  assert.match(script, /Licenses\/THIRD_PARTY_SOURCES.tar.gz/);
  assert.match(script, /Licenses\/PUBLICATION-NOTES.txt/);
  assert.match(script, /Source tree: %s/);
  assert.match(script, /HEAD changed during packaging/);
  assert.match(script, /Working tree status after packaging/);
  assert.match(script, /shasum -a 256 "\$NAME.dmg" PROVENANCE.txt/);
});
