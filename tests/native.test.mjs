import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function captureShim(root, directory, sdk, testException = false) {
  const object = join(directory, 'CaptureException.o');
  execFileSync('xcrun', ['clang', '-fobjc-arc', '-fblocks', '-fobjc-exceptions', '-target', 'arm64-apple-macosx14.0',
    '-isysroot', sdk, '-c', join(root, 'src-tauri/native/CaptureException.m'), '-o', object]);
  const args = ['-target', 'arm64-apple-macosx14.0', '-import-objc-header', join(root,
    testException ? 'tests/native-capture/ExceptionTests.h' : 'src-tauri/native/CaptureException.h'), object];
  if (testException) {
    const fixture = join(directory, 'ExceptionTests.o');
    execFileSync('xcrun', ['clang', '-fobjc-arc', '-fblocks', '-fobjc-exceptions', '-target', 'arm64-apple-macosx14.0',
      '-isysroot', sdk, '-c', join(root, 'tests/native-capture/ExceptionTests.m'), '-o', fixture]);
    args.push(fixture);
  }
  return args;
}

test('memory capture converter drains hardware-rate stereo and bounds producer backlog without a microphone', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'handsfree-capture-'));
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    const sdk = execFileSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
    const binary = join(directory, 'capture-tests');
    execFileSync('swiftc', ['-O', '-sdk', sdk, '-Xcc', `-I${sdk}/usr/include`, '-swift-version', '5',
      ...captureShim(root, directory, sdk, true), join(root, 'src-tauri/native/AudioCapture.swift'), join(root, 'tests/native-capture/main.swift'), '-o', binary]);
    const output = execFileSync(binary, { encoding: 'utf8', timeout: 10000 });
    assert.match(output, /bounded overload passed without microphone/);
    assert.match(output, /Microphone UID bind-before-format, missing\/bind failure and delayed route revalidation passed without hardware/);
    assert.match(output, /Finish once after drain; cancel\/error\/quit\/pending-start\/mute suppressed without playback/);
    assert.match(output, /Capture startup exception, post-cue format, teardown and stale producer contracts passed without hardware/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('compact capsule, native shortcuts and Clean cue signals with idle-only preview guards', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'handsfree-capsule-'));
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    const sdk = execFileSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
    const binary = join(directory, 'capsule-tests');
    // Optimize the DFT signal checks; -O retains Swift preconditions.
    execFileSync('swiftc', ['-O', '-sdk', sdk, '-Xcc', `-I${sdk}/usr/include`, '-swift-version', '5',
      ...captureShim(root, directory, sdk), join(root, 'src-tauri/native/Bridge.swift'), join(root, 'src-tauri/native/PastePolicy.swift'), join(root, 'src-tauri/native/AudioCapture.swift'),
      join(root, 'tests/native-capsule/main.swift'), '-framework', 'ServiceManagement', '-o', binary]);
    const output = execFileSync(binary, { encoding: 'utf8', timeout: 10000 });
    assert.match(output, /Native capsule geometry, state layout, nonactivation, shortcut matching and Clean cues passed without capture/);
    assert.match(output, /Workflow receipt\/admission\/finish and fake login registration policy passed without capture or registration/);
    assert.match(output, /Production hold event routing: own tray\/menu and cue-wait retained; external clicks, repeats, release and focus watch passed without UI/);
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
    const output = execFileSync(binary, { encoding: 'utf8' });
    assert.match(output, /32 field policy combinations and 17 ABI codes passed/);
    assert.match(output, /Compatibility policy: consent, window, secure input, interruptions and once-only generation guards passed/);
    assert.match(output, /Synthetic compatibility adapter: original AXWindow identity, live proofs, missing-only errors and stale completion passed without AX or events/);
    assert.match(output, /Synthetic focus resolver: bounded fallback, identity conflicts, trust and foreground guards passed without AX/);
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
      ...captureShim(root, directory, sdk), join(root, 'src-tauri/native/Bridge.swift'), join(root, 'src-tauri/native/PastePolicy.swift'), join(root, 'src-tauri/native/AudioCapture.swift'),
      join(root, 'tests/native-delivery/main.swift'), '-framework', 'ServiceManagement', '-o', binary]);
    const output = execFileSync(binary, { encoding: 'utf8', timeout: 10000 });
    assert.match(output, /Native queued-main cancellation boundary passed/);
    assert.match(output, /Native cached focus diagnostic bounded C ABI passed without AX/);
    assert.match(output, /Native lasting fallback copy, sent-paste restoration, stale timer\/quit and empty\/cancel guards passed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
