import test from 'node:test';
import assert from 'node:assert/strict';
import { brotliCompressSync } from 'node:zlib';
import { verifyEmbeddedFrontend, verifyCompiledAssets } from '../scripts/check-macos-assets.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const assets = [
  { name: 'current.js', bytes: Buffer.from('<h1>All-time activity</h1>Recording mode <option value="toggle">Toggle</option><option value="push_to_talk">Push to talk</option> set_recording_mode Compatibility paste compatibility-paste set_compatibility_paste compatibility_paste the exact field cannot be verified Try your voice nav-practice-page practice-page-title Start test Practice dictation No clipboard. No usage counted. practice-input practice_context practice_start practice_finish practice_cancel practice_status') },
  { name: 'current.css', bytes: Buffer.from('.metrics { display: grid; }') },
];
const cached = assets.map(asset => brotliCompressSync(asset.bytes));
const backendMarker = 'Keep the HandsFree window visible and focused to practice.';
const executable = Buffer.concat([Buffer.from(`Mach-O fixture _hf_gesture_complete ${backendMarker}`), ...cached]);
for (const marker of ['Try your voice', 'nav-practice-page', 'practice-page-title', 'Start test', 'Practice dictation', 'No clipboard. No usage counted.', 'practice-input', 'practice_context', 'practice_start', 'practice_finish', 'practice_cancel', 'practice_status']) {
  test(`compiled practice audit rejects missing ${marker} even when stale bytes are embedded`, () => {
    const stale = [{ ...assets[0], bytes: Buffer.from(assets[0].bytes.toString().replaceAll(marker, 'old')) }, assets[1]];
    const cache = stale.map(asset => brotliCompressSync(asset.bytes));
    assert.throws(() => verifyEmbeddedFrontend(Buffer.concat(cache), stale, cache), /Missing compiled practice UI/);
  });
}
test('pre-practice Compatibility paste frontend cannot pass merely because it is embedded', () => {
  const stale = [{ ...assets[0], bytes: Buffer.from(assets[0].bytes.toString().split(' Try your voice')[0]) }, assets[1]];
  const cache = stale.map(asset => brotliCompressSync(asset.bytes));
  assert.throws(() => verifyEmbeddedFrontend(Buffer.concat(cache), stale, cache), /Missing compiled practice UI/);
});
for (const marker of ['Compatibility paste', 'compatibility-paste', 'set_compatibility_paste', 'compatibility_paste', 'the exact field cannot be verified']) {
  test(`compiled Compatibility paste audit rejects missing ${marker} even when stale bytes are embedded`, () => {
    const stale = [{ ...assets[0], bytes: Buffer.from(assets[0].bytes.toString().replaceAll(marker, 'old')) }, assets[1]];
    const cache = stale.map(asset => brotliCompressSync(asset.bytes));
    assert.throws(() => verifyEmbeddedFrontend(Buffer.concat(cache), stale, cache), /Missing compiled Compatibility paste UI/);
  });
}
test('pre-feature stats/push-to-talk frontend cannot pass merely because it is embedded', () => {
  const stale = [{ ...assets[0], bytes: Buffer.from(assets[0].bytes.toString().split(' Compatibility paste')[0]) }, assets[1]];
  const cache = stale.map(asset => brotliCompressSync(asset.bytes));
  assert.throws(() => verifyEmbeddedFrontend(Buffer.concat(cache), stale, cache), /Missing compiled Compatibility paste UI/);
});
test('asset audit proves exact compiled frontend bytes are in the executable', () => {
  assert.doesNotThrow(() => verifyEmbeddedFrontend(executable, assets, cached));
});
test('fresh dist and cache beside stale executable cannot pass', () => {
  assert.throws(() => verifyEmbeddedFrontend(Buffer.from('old executable'), assets, cached), /not embedded/);
});
test('a stale frontend cache cannot pass against fresh dist', () => {
  assert.throws(() => verifyEmbeddedFrontend(executable, assets, [Buffer.from('old cache')]), /not embedded/);
});
for (const marker of ['Recording mode', 'value="toggle"', 'value="push_to_talk"', 'Push to talk', 'set_recording_mode']) {
  test(`compiled push-to-talk audit rejects missing ${marker}`, () => {
    const stale = [{ ...assets[0], bytes: Buffer.from(assets[0].bytes.toString().replace(marker, 'old')) }, assets[1]];
    const cache = stale.map(asset => brotliCompressSync(asset.bytes));
    assert.throws(() => verifyEmbeddedFrontend(Buffer.concat(cache), stale, cache), /Missing compiled push-to-talk UI/);
  });
}
for (const text of ['Last transcript', 'Your activity Last transcript', 'Your activity <details>', 'Your activity <summary>']) {
  test(`stale dashboard is rejected: ${text}`, () => {
    const stale = [{ name: 'old.js', bytes: Buffer.from(text) }, assets[1]];
    const cache = stale.map(asset => brotliCompressSync(asset.bytes));
    assert.throws(() => verifyEmbeddedFrontend(Buffer.concat(cache), stale, cache), /Stale dashboard/);
  });
}

test('packaged app audit rejects old cue bytes or icon even with a fresh executable', () => {
  const root = mkdtempSync(join(tmpdir(), 'handsfree-assets-'));
  const app = join(root, 'HandsFree.app');
  const put = (name, bytes) => { const parts = name.split('/'); parts.pop(); mkdirSync(join(root, ...parts), { recursive: true }); writeFileSync(join(root, name), bytes); };
  try {
    for (const [index, asset] of assets.entries()) {
      put(`dist/assets/${asset.name}`, asset.bytes);
      put(`src-tauri/target/release/build/handsfree-test/out/tauri-codegen-assets/${asset.name}`, cached[index]);
    }
    put('HandsFree.app/Contents/MacOS/handsfree', executable);
    for (const profile of ['clean', 'warm']) for (const role of ['start', 'end']) {
      put(`src-tauri/native/assets/sounds/${profile}-${role}.wav`, `${profile}-${role}-current`);
      put(`HandsFree.app/Contents/Resources/sounds/${profile}-${role}.wav`, `${profile}-${role}-current`);
    }
    put('src-tauri/icons/icon.icns', 'current-icon');
    put('HandsFree.app/Contents/Resources/icon.icns', 'current-icon');
    assert.doesNotThrow(() => verifyCompiledAssets(root, app));
    put('HandsFree.app/Contents/MacOS/handsfree', Buffer.concat(cached));
    assert.throws(() => verifyCompiledAssets(root, app), /Missing native push-to-talk completion ABI symbol/);
    put('HandsFree.app/Contents/MacOS/handsfree', Buffer.concat([Buffer.from('Mach-O fixture _hf_gesture_complete'), ...cached]));
    assert.throws(() => verifyCompiledAssets(root, app), /Missing compiled practice backend/);
    put('HandsFree.app/Contents/MacOS/handsfree', executable);
    put('HandsFree.app/Contents/Resources/sounds/clean-start.wav', 'old-cue');
    assert.throws(() => verifyCompiledAssets(root, app), /Stale bundled cue: clean-start.wav/);
    put('HandsFree.app/Contents/Resources/sounds/clean-start.wav', 'clean-start-current');
    put('HandsFree.app/Contents/Resources/icon.icns', 'old-icon');
    assert.throws(() => verifyCompiledAssets(root, app), /Stale or missing bundled app icon/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
