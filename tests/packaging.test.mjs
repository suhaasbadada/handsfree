import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, rmSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const posixTest = process.platform === 'win32' ? test.skip : test;

function sandbox(callback) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'handsfree-package-test-')));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'bin'));
    copyFileSync(new URL('../scripts/package-release.sh', import.meta.url), join(root, 'scripts/package-release.sh'));
    // Source guard has its own real-Git fixture tests; this sandbox isolates shell cleanup.
    const stub = (name, body) => writeFileSync(join(root, 'bin', name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
    stub('uname', 'if [[ "$1" == -s ]]; then echo Darwin; else echo arm64; fi');
    stub('git', 'if [[ "$1" == rev-parse ]]; then printf "%040d\\n" 1; fi');
    // The updater helper owns source guarding/building; isolate that boundary,
    // not npm, so failure must propagate before any DMG command can execute.
    stub('node', '[[ "$1" == scripts/package-updater.mjs && "$2" == */release/updater ]] || exit 99; echo "mock updater preparation failed" >&2; exit 42');
    stub('python3', 'if [[ "$2" == snapshot ]]; then touch "$6"; fi; exit 0');
    const run = (...args) => spawnSync('/bin/bash', [join(root, 'scripts/package-release.sh'), ...args], {
      encoding: 'utf8', env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}` },
    });
    callback({ root, stub, run });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

posixTest('packaging rejects arguments before creating output or invoking build', () => sandbox(({ root, run }) => {
  const result = run('--publish');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
  assert.ok(!readdirSync(root).includes('release'));
}));

posixTest('packaging rejects unsupported hosts before build', () => sandbox(({ root, stub, run }) => {
  stub('uname', 'echo Linux');
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Apple Silicon macOS required/);
  assert.ok(!readdirSync(root).includes('release'));
}));

for (const existing of ['HandsFree-0.1.6-macos-arm64.dmg', 'SHA256SUMS', 'PROVENANCE.txt', 'HandsFree-0.1.6-macos-arm64.app.tar.gz', 'HandsFree-0.1.6-macos-arm64.app.tar.gz.sig', 'UPDATER-PROVENANCE.txt', 'macos-arm64.json']) {
  posixTest(`packaging refuses to overwrite ${existing}`, () => sandbox(({ root, run }) => {
    mkdirSync(join(root, 'release'));
    writeFileSync(join(root, 'release', existing), 'preserve me');
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Candidate output exists/);
    assert.equal(readFileSync(join(root, 'release', existing), 'utf8'), 'preserve me');
    assert.deepEqual(readdirSync(join(root, 'release')), [existing]);
  }));
}

posixTest('build failure propagates its status and cleans only the run staging directory', () => sandbox(({ root, run }) => {
  mkdirSync(join(root, 'release'));
  writeFileSync(join(root, 'release', 'unrelated.txt'), 'keep');
  const result = run();
  assert.equal(result.status, 42);
  assert.match(result.stderr, /mock updater preparation failed/);
  assert.deepEqual(readdirSync(join(root, 'release')), ['unrelated.txt']);
}));
