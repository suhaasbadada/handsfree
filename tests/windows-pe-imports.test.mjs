import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const helper = fileURLToPath(new URL('../scripts/windows-pe-imports.py', import.meta.url));
const python = process.platform === 'win32' ? 'python' : 'python3';

// Minimal file-backed AMD64 PE32+ with separate normal and delay descriptors.
function pe(normal = ['KERNEL32.dll'], delay = []) {
  const b = Buffer.alloc(0x1200);
  b.write('MZ'); b.writeUInt32LE(0x80, 0x3c); b.write('PE\0\0', 0x80);
  b.writeUInt16LE(0x8664, 0x84); b.writeUInt16LE(1, 0x86);
  b.writeUInt16LE(240, 0x94); b.writeUInt16LE(0x20b, 0x98);
  b.writeUInt32LE(0x200, 0x98 + 60); b.writeUInt32LE(16, 0x98 + 108);
  const section = 0x188;
  b.write('.rdata', section); b.writeUInt32LE(0x1000, section + 8);
  b.writeUInt32LE(0x1000, section + 12); b.writeUInt32LE(0x1000, section + 16);
  b.writeUInt32LE(0x200, section + 20);
  let nameOffset = 0x800;
  for (const [names, index, base, width] of [[normal, 1, 0x200, 20], [delay, 13, 0x400, 32]]) {
    if (!names.length) continue;
    const dir = 0x98 + 112 + index * 8;
    b.writeUInt32LE(base + 0xe00, dir); b.writeUInt32LE((names.length + 1) * width, dir + 4);
    names.forEach((name, i) => {
      const offset = base + i * width;
      if (index === 13) b.writeUInt32LE(1, offset);
      b.writeUInt32LE(nameOffset + 0xe00, offset + (index === 13 ? 4 : 12));
      b.write(name, nameOffset, 'ascii'); nameOffset += Buffer.byteLength(name) + 1;
    });
  }
  return b;
}

function inspect(bytes, callback) {
  const root = mkdtempSync(join(tmpdir(), 'handsfree-pe-'));
  try {
    const exe = join(root, 'handsfree.exe'), output = join(root, 'report.json');
    writeFileSync(exe, bytes);
    const result = spawnSync(python, [helper, exe, '--output', output], { encoding: 'utf8' });
    callback(result, existsSync(output) ? JSON.parse(readFileSync(output)) : null);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('static app imports accept OS DLL casing, API sets, delay imports and record exact hash', () => {
  const bytes = pe(['KERNEL32.dll', 'uCrTbAsE.DLL', 'api-ms-win-core-synch-l1-2-0.dll'], ['USER32.dll', 'ext-ms-win-ntuser-window-l1-1-0.dll']);
  inspect(bytes, (r, report) => {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(report.result, 'pass'); assert.equal(report.architecture, 'AMD64');
    assert.equal(report.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(report.normal_imports, ['api-ms-win-core-synch-l1-2-0.dll', 'kernel32.dll', 'ucrtbase.dll']);
    assert.deepEqual(report.delay_imports, ['ext-ms-win-ntuser-window-l1-1-0.dll', 'user32.dll']);
  });
});

for (const name of ['MSVCP140.dll', 'MSVCP140_1.dll', 'VCRUNTIME140.dll', 'VCRUNTIME140_1.dll', 'CONCRT140.dll', 'VCOMP140.dll', 'MSVCR120.dll']) {
  for (const delay of [false, true]) test(`reject ${name} ${delay ? 'delay' : 'normal'} CRT import`, () => {
    inspect(delay ? pe(['kernel32.dll'], [name]) : pe([name]), (r, report) => {
      assert.equal(r.status, 1); assert.match(r.stderr, /CRT imports forbidden/); assert.equal(report, null);
    });
  });
}

for (const name of ['vendor.dll', 'WebView2Loader.dll', 'api-ms-other-vendor.dll', '../kernel32.dll', 'C:\\Windows\\kernel32.dll', '/kernel32.dll', 'api-ms-win-core/evil.dll']) {
  test(`reject unknown/path DLL ${name}`, () => inspect(pe([name]), (r, report) => {
    assert.equal(r.status, 1); assert.equal(report, null);
  }));
}

for (const [name, mutate] of [
  ['non-PE', b => b.fill(0, 0, 2)],
  ['PE offset outside file', b => b.writeUInt32LE(0xfffffff0, 0x3c)],
  ['invalid PE signature', b => b.write('NOPE', 0x80)],
  ['PE32', b => b.writeUInt16LE(0x10b, 0x98)],
  ['ARM64', b => b.writeUInt16LE(0xaa64, 0x84)],
  ['truncated optional header', b => b.writeUInt16LE(2, 0x94)],
  ['unbacked import RVA', b => b.writeUInt32LE(0x4000, 0x110)],
  ['overflowing import size', b => b.writeUInt32LE(0xffffffff, 0x114)],
  ['unbacked name RVA', b => b.writeUInt32LE(0xfffffff0, 0x20c)],
  ['unterminated DLL name', b => { b.writeUInt32LE(0x1fff, 0x20c); b[0x11ff] = 65; }],
  ['unterminated directory', b => b.writeUInt32LE(20, 0x114)],
  ['oversized directory count', b => b.writeUInt32LE(100, 0x104)],
  ['raw data outside file', b => b.writeUInt32LE(0xfffffff0, 0x19c)],
  ['headers outside file', b => b.writeUInt32LE(0xfffffff0, 0xd4)],
  ['missing normal imports', b => b.fill(0, 0x110, 0x118)],
  ['VA-based delay descriptor', b => b.writeUInt32LE(0, 0x400)],
]) test(`malformed ${name} is fail-closed`, () => {
  const bytes = pe(['kernel32.dll'], ['user32.dll']); mutate(bytes);
  inspect(bytes, (r, report) => { assert.equal(r.status, 1, r.stdout); assert.equal(report, null); });
});

test('truncated file rejected', () => inspect(pe().subarray(0, 100), (r, report) => {
  assert.equal(r.status, 1); assert.equal(report, null);
}));

test('Windows-only build environment and candidate gate stay wired without changing source guard', () => {
  const env = readFileSync(new URL('../scripts/windows-env.ps1', import.meta.url), 'utf8');
  const pkg = readFileSync(new URL('../scripts/windows-package.ps1', import.meta.url), 'utf8');
  assert.match(env, /CMAKE_MSVC_RUNTIME_LIBRARY = 'MultiThreaded'/);
  assert.match(env, /CMAKE_POLICY_DEFAULT_CMP0091 = 'NEW'/);
  assert.match(env, /target-feature=\+crt-static/);
  assert.match(env, /CARGO_ENCODED_RUSTFLAGS/);
  assert.ok(pkg.indexOf("'restore', '--state'") < pkg.indexOf("'scripts/windows-pe-imports.py'"));
  assert.ok(pkg.indexOf("'scripts/windows-pe-imports.py'") < pkg.indexOf('Copy-Item $installers'));
  assert.match(pkg, /APP-DEPENDENCIES.json/);
  assert.match(pkg, /Get-ChildItem \$output -File -Recurse/);
});

test('Windows environment preserves flags, is idempotent, and rejects conflicts', { skip: process.platform !== 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'handsfree-env-'));
  const envHelper = fileURLToPath(new URL('../scripts/windows-env.ps1', import.meta.url)).replaceAll("'", "''");
  try {
    writeFileSync(join(root, 'libclang.dll'), 'test placeholder; no compiler invoked');
    const run = (flags, targetFlags = '', encoded = '') => spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', `
      $ErrorActionPreference = 'Stop'
      . '${envHelper}'
      $first = $env:RUSTFLAGS
      . '${envHelper}'
      if ($first -ne $env:RUSTFLAGS) { throw 'Not idempotent' }
      if ($env:CMAKE_MSVC_RUNTIME_LIBRARY -ne 'MultiThreaded') { throw 'Incorrect CRT' }
      Write-Output $env:RUSTFLAGS
    `], { encoding: 'utf8', env: { ...process.env, LIBCLANG_PATH: root, RUSTFLAGS: flags,
      CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS: targetFlags, CARGO_ENCODED_RUSTFLAGS: encoded } });
    for (const [flags, targetFlags, expected] of [
      ['', '', '-C target-feature=+crt-static'],
      ['-C debuginfo=1', '', '-C debuginfo=1 -C target-feature=+crt-static'],
      ['', '-C debuginfo=1', '-C debuginfo=1 -C target-feature=+crt-static'],
      ['-C target-feature=+sse2,+crt-static', '', '-C target-feature=+sse2,+crt-static'],
    ]) {
      const r = run(flags, targetFlags); assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), expected);
    }
    assert.notEqual(run('-C target-feature=-crt-static').status, 0);
    assert.notEqual(run('-C target-feature=+crt-static,-crt-static').status, 0);
    assert.notEqual(run('', '', '-C\x1fdebuginfo=1').status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
