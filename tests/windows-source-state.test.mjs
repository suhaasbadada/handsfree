import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const helper = fileURLToPath(new URL('../scripts/windows-source-state.py', import.meta.url));
const original = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url));
const python = process.platform === 'win32' ? 'python' : 'python3';
const normalized = () => original.toString().replace('features = ["macos-private-api"]', 'features = []');

function fixture(callback, platform = 'windows') {
  const root = mkdtempSync(join(tmpdir(), 'handsfree-source-state-'));
  const manifest = join(root, 'src-tauri/Cargo.toml');
  const state = join(root, 'src-tauri/target/source.json');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const run = operation => spawnSync(python, [helper, operation, '--root', root, '--state', state, '--platform', platform], { encoding: 'utf8' });
  try {
    mkdirSync(join(root, 'src-tauri'));
    writeFileSync(manifest, original);
    writeFileSync(join(root, '.gitignore'), 'src-tauri/target/\n');
    git('init', '--quiet');
    git('config', 'user.name', 'Source Guard Test');
    git('config', 'user.email', 'source-guard@example.invalid');
    git('config', 'core.autocrlf', 'false');
    git('config', 'commit.gpgsign', 'false');
    git('add', '.');
    git('commit', '--quiet', '-m', 'Fixture');
    callback({ root, manifest, state, git, run });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('source guard captures clean source and accepts unchanged manifest', () => fixture(({ manifest, state, git, run }) => {
  assert.equal(run('snapshot').status, 0);
  const receipt = JSON.parse(readFileSync(state));
  assert.equal(receipt.manifest_sha256, createHash('sha256').update(original).digest('hex'));
  assert.equal(receipt.commit, git('rev-parse', 'HEAD').trim());
  assert.equal(receipt.tree, git('rev-parse', 'HEAD^{tree}').trim());
  assert.deepEqual(Buffer.from(receipt.manifest_base64, 'base64'), original);
  const result = run('restore');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /None \(Cargo.toml unchanged\)/);
  assert.deepEqual(readFileSync(manifest), original);
  assert.equal(git('status', '--porcelain'), '');
}));

test('only known inactive Mac normalization is byte-restored, including formatting changes', () => fixture(({ manifest, git, run }) => {
  assert.equal(run('snapshot').status, 0);
  writeFileSync(manifest, `# Tauri may serialize with different formatting\r\n${normalized().replaceAll('\n', '\r\n')}`);
  const result = run('restore');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /removed only inactive cfg\(macos\)/);
  assert.match(result.stdout, /Windows-resolved dependencies unchanged/);
  assert.deepEqual(readFileSync(manifest), original);
  assert.equal(git('status', '--porcelain'), '');
}));

for (const dirty of ['tracked', 'staged', 'untracked']) {
  test(`pre-existing ${dirty} changes reject snapshot`, () => fixture(({ root, manifest, state, git, run }) => {
    if (dirty === 'untracked') writeFileSync(join(root, 'unexpected.txt'), 'preserve');
    else {
      writeFileSync(manifest, normalized());
      if (dirty === 'staged') git('add', 'src-tauri/Cargo.toml');
    }
    const before = readFileSync(manifest);
    const result = run('snapshot');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /clean worktree/);
    assert.equal(existsSync(state), false);
    assert.deepEqual(readFileSync(manifest), before);
  }));
}

for (const [name, mutate] of [
  ['common private API addition', text => text.replace('"tray-icon", "image-png"', '"tray-icon", "image-png", "macos-private-api"')],
  ['Windows dependency version', text => text.replace('cpal = "0.16"', 'cpal = "0.17"')],
  ['package version', text => text.replace('version = "0.1.1"', 'version = "9.9.9"')],
  ['other Mac dependency change', text => text.replace('features = ["metal"]', 'features = []')],
  ['unrecognized Mac features', text => text.replace('tauri = { version = "2", features = [] }', 'tauri = { version = "2", features = ["tray-icon"] }')],
  ['invalid TOML', text => `${text}\n[invalid`],
]) {
  test(`rejects ${name} and never overwrites changed source`, () => fixture(({ manifest, state, run }) => {
    assert.equal(run('snapshot').status, 0);
    const unexpected = mutate(normalized());
    assert.notEqual(unexpected, normalized(), 'Mutation must exercise a real change');
    writeFileSync(manifest, unexpected);
    const result = run('restore');
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(readFileSync(manifest), Buffer.from(unexpected));
    assert.equal(existsSync(state), true, 'Original snapshot is retained for investigation');
  }));
}

test('other files changed alongside known rewrite are preserved and rejected', () => fixture(({ root, manifest, run }) => {
  assert.equal(run('snapshot').status, 0);
  writeFileSync(manifest, normalized());
  writeFileSync(join(root, '.gitignore'), 'changed\n');
  const result = run('restore');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unexpected build changes/);
  assert.equal(readFileSync(manifest, 'utf8'), normalized());
  assert.equal(readFileSync(join(root, '.gitignore'), 'utf8'), 'changed\n');
}));

test('changed source revision is rejected without restoring the manifest', () => fixture(({ manifest, git, run }) => {
  assert.equal(run('snapshot').status, 0);
  git('commit', '--allow-empty', '--quiet', '-m', 'Unexpected source revision');
  writeFileSync(manifest, normalized());
  const result = run('restore');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Source revision changed/);
  assert.equal(readFileSync(manifest, 'utf8'), normalized());
}));

const macNormalized = () => original.toString().replace('"tray-icon", "image-png"', '"tray-icon", "image-png", "macos-private-api"');
test('Mac CLI common-feature addition is byte-restored while original Mac target feature remains', () => fixture(({ manifest, git, run }) => {
  assert.equal(run('snapshot').status, 0);
  writeFileSync(manifest, macNormalized());
  const result = run('restore');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Mac-resolved dependencies unchanged/);
  assert.deepEqual(readFileSync(manifest), original);
  assert.equal(git('status', '--porcelain'), '');
}, 'macos'));

for (const [name, mutate] of [
  ['Mac target feature removed', text => text.replace('features = ["macos-private-api"]', 'features = []')],
  ['Windows version changed', text => text.replace('cpal = "0.16"', 'cpal = "0.17"')],
  ['another common feature added', text => text.replace('"image-png",', '"image-png", "test",')],
]) test(`Mac guard rejects ${name} without overwriting source`, () => fixture(({ manifest, run }) => {
  assert.equal(run('snapshot').status, 0);
  const changed = mutate(macNormalized());
  writeFileSync(manifest, changed);
  assert.equal(run('restore').status, 1);
  assert.equal(readFileSync(manifest, 'utf8'), changed);
}, 'macos'));

test('corrupted snapshot cannot overwrite a changed manifest', () => fixture(({ manifest, state, run }) => {
  assert.equal(run('snapshot').status, 0);
  const receipt = JSON.parse(readFileSync(state));
  receipt.manifest_base64 = Buffer.from('unexpected bytes').toString('base64');
  writeFileSync(state, JSON.stringify(receipt));
  writeFileSync(manifest, normalized());
  const result = run('restore');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /snapshot checksum mismatch/);
  assert.equal(readFileSync(manifest, 'utf8'), normalized());
}));
