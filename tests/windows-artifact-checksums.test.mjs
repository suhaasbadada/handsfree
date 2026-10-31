import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const helper = fileURLToPath(new URL('../scripts/windows-artifact-checksums.py', import.meta.url));
const python = process.platform === 'win32' ? 'python' : 'python3';
const publicFiles = ['HandsFree-0.1.1-windows-x64-setup.exe', 'APP-DEPENDENCIES.json', 'PROVENANCE.txt', 'THIRD_PARTY_SOURCES.tar.gz', 'LICENSE'];
const hiddenNotice = 'THIRD_PARTY_NOTICES/cargo/wry-0.57.1/.license_template';

function fixture(callback) {
  const root = mkdtempSync(join(tmpdir(), 'handsfree-checksums-'));
  try {
    for (const file of publicFiles) writeFileSync(join(root, file), `fixture ${file}`);
    mkdirSync(join(root, 'THIRD_PARTY_NOTICES/cargo/wry-0.57.1'), { recursive: true });
    writeFileSync(join(root, hiddenNotice), 'hidden upstream license bytes');
    const run = () => spawnSync(python, [helper, root], { encoding: 'utf8' });
    callback({ root, run });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function manifest(root, name) {
  return readFileSync(join(root, name), 'utf8').trimEnd().split('\n').map(line => {
    assert.match(line, /^[a-f0-9]{64}  [^\r\n]+$/);
    const relative = line.slice(66);
    assert.equal(relative.includes('\\'), false);
    assert.equal(relative.startsWith('/'), false);
    assert.equal(relative.split('/').includes('..'), false);
    assert.equal(line.slice(0, 64), createHash('sha256').update(readFileSync(join(root, relative))).digest('hex'));
    return relative;
  });
}

test('public manifest covers exactly published assets; build manifest covers full artifact including hidden notices', () => fixture(({ root, run }) => {
  const r = run(); assert.equal(r.status, 0, r.stderr);
  const published = manifest(root, 'SHA256SUMS');
  assert.deepEqual(published, publicFiles);
  assert.equal(new Set(published).size, published.length);
  const built = manifest(root, 'BUILD-SHA256SUMS');
  assert.deepEqual(built, [...publicFiles, hiddenNotice, 'SHA256SUMS'].sort());
  assert.equal(new Set(built).size, built.length);
  assert.equal(built.includes('BUILD-SHA256SUMS'), false);
}));

test('missing public file rejects manifest generation', () => fixture(({ root, run }) => {
  rmSync(join(root, 'LICENSE'));
  const r = run(); assert.equal(r.status, 1); assert.match(r.stderr, /Missing public assets: LICENSE/);
  assert.equal(existsSync(join(root, 'SHA256SUMS')), false);
}));

for (const name of ['SHA256SUMS', 'BUILD-SHA256SUMS']) test(`existing ${name} is preserved and rejected`, () => fixture(({ root, run }) => {
  writeFileSync(join(root, name), 'preserve');
  assert.equal(run().status, 1);
  assert.equal(readFileSync(join(root, name), 'utf8'), 'preserve');
}));

test('symlink escape rejects generation', { skip: process.platform === 'win32' }, () => fixture(({ root, run }) => {
  symlinkSync('../outside-artifact', join(root, 'escape'));
  const r = run(); assert.equal(r.status, 1); assert.match(r.stderr, /Symlinks forbidden/);
  assert.equal(existsSync(join(root, 'SHA256SUMS')), false);
}));

for (const name of ['injected\nchecksum', 'injected\rchecksum', 'injected\tchecksum', 'escape\\file', 'escape:stream']) {
  test(`unsafe checksum filename ${JSON.stringify(name)} rejects generation`, { skip: process.platform === 'win32' }, () => fixture(({ root, run }) => {
    writeFileSync(join(root, name), 'bad path');
    const r = run(); assert.equal(r.status, 1); assert.match(r.stderr, /Unsafe checksum path/);
    assert.equal(existsSync(join(root, 'SHA256SUMS')), false);
  }));
}
