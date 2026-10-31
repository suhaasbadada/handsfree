import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('compact capsule, native shortcuts and original cue profiles with idle-only preview guards', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'handsfree-capsule-'));
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    const sdk = execFileSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
    const binary = join(directory, 'capsule-tests');
    execFileSync('swiftc', ['-sdk', sdk, '-Xcc', `-I${sdk}/usr/include`, '-swift-version', '5',
      join(root, 'src-tauri/native/Bridge.swift'), join(root, 'src-tauri/native/PastePolicy.swift'),
      join(root, 'tests/native-capsule/main.swift'), '-o', binary]);
    assert.match(execFileSync(binary, { encoding: 'utf8', timeout: 10000 }), /Native capsule geometry, state layout, nonactivation, shortcut matching and cue profiles passed without capture/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('native paste policy rejects secure/read-only targets and supports writable custom editors', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'handsfree-policy-'));
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    const sdk = execFileSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
    const binary = join(directory, 'policy-tests');
    execFileSync('swiftc', ['-sdk', sdk, '-Xcc', `-I${sdk}/usr/include`, '-swift-version', '5',
      join(root, 'src-tauri/native/PastePolicy.swift'), join(root, 'tests/native/main.swift'), '-o', binary]);
    assert.match(execFileSync(binary, { encoding: 'utf8' }), /32 field policy combinations and 17 ABI codes passed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('native paste/copy guard cancellation; fallback survives restore timers and quit', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'handsfree-delivery-'));
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    const sdk = execFileSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
    const binary = join(directory, 'delivery-tests');
    execFileSync('swiftc', ['-sdk', sdk, '-Xcc', `-I${sdk}/usr/include`, '-swift-version', '5',
      join(root, 'src-tauri/native/Bridge.swift'), join(root, 'src-tauri/native/PastePolicy.swift'),
      join(root, 'tests/native-delivery/main.swift'), '-o', binary]);
    const output = execFileSync(binary, { encoding: 'utf8', timeout: 10000 });
    assert.match(output, /Native queued-main cancellation boundary passed/);
    assert.match(output, /Native lasting fallback copy, sent-paste restoration, stale timer\/quit and empty\/cancel guards passed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
