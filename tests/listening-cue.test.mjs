import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('generator reproduces the committed cue byte-exactly', {
  skip: spawnSync('python3', ['--version'], { stdio: 'ignore' }).status !== 0
    ? 'Python 3 is a generation tool, not a runtime dependency' : false,
}, () => {
  execFileSync('python3', [fileURLToPath(new URL('../scripts/generate-listening-cue.py', import.meta.url)), '--check']);
});

test('native roles snapshot each recording profile and preview only the selected pair', () => {
  const source = readFileSync(new URL('../src-tauri/native/Bridge.swift', import.meta.url), 'utf8');
  assert.match(source, /let profile = ending \? recordingCueProfile : cueProfile/);
  assert.match(source, /recordingCueProfile = cueProfile\s+if soundsEnabled/);
  const preview = source.slice(source.indexOf('@_cdecl("hf_preview_sound")'), source.indexOf('@_cdecl("hf_sounds")'));
  assert.match(preview, /CuePolicy.canPreview/);
  assert.match(preview, /EndCue.data\(profile: cueProfile\)/);
  assert.doesNotMatch(preview, /StartCue.data|AudioCapture/);
  const style = source.slice(source.indexOf('@_cdecl("hf_sound_style")'), source.indexOf('private func makeCue'));
  assert.doesNotMatch(style, /\.play\(|\.stop\(|recordingCueProfile =/);
});

for (const [profile, pairHash, singleHash] of [['clean', 'a1eb8aeadfc425a5a217e3d35732762571c16d7e03969a5f3b0bfe41dbde6856', 'd9164cb188a469059517b60817e5acca1dd5121278c01ebd8193cfc79411e6c8'], ['warm', '0e59d9fd1a43491f6193760ce55eb96807c6b6b08e7549f1e8d3b760eff416b8', 'a8947c7505db50c240aae0fb76cfcd2ce69a3cdaf4b8387dd5e444d675a098ed']]) test(`${profile}: approved double end and identical single start packaged without playback`, () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)));
  const source = `native/assets/sounds/${profile}-end.wav`;
  assert.equal(config.bundle.resources[source], `sounds/${profile}-end.wav`);
  const wav = readFileSync(new URL(`../src-tauri/${source}`, import.meta.url));
  assert.equal(createHash('sha256').update(wav).digest('hex'), pairHash);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt16LE(20), 1, 'Uncompressed PCM');
  assert.equal(wav.readUInt16LE(22), 1, 'Mono');
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), 11520 * 2);
  assert.equal(wav.length, 44 + 11520 * 2);
  assert.ok(wav.subarray(44, 44 + 960 * 2).every(byte => byte === 0));
  assert.ok(wav.subarray(-960 * 2).every(byte => byte === 0));
  const grain = wav.subarray(44 + 960 * 2, 44 + 4800 * 2);
  assert.deepEqual(grain, wav.subarray(44 + 5760 * 2, 44 + 9600 * 2));
  assert.ok(wav.subarray(44 + 4800 * 2, 44 + 5760 * 2).every(byte => byte === 0));
  const endSource = `native/assets/sounds/${profile}-start.wav`;
  assert.equal(config.bundle.resources[endSource], `sounds/${profile}-start.wav`);
  const ending = readFileSync(new URL(`../src-tauri/${endSource}`, import.meta.url));
  assert.equal(createHash('sha256').update(ending).digest('hex'), singleHash);
  assert.equal(ending.length, 44 + 5760 * 2);
  assert.deepEqual(ending.subarray(20, 36), wav.subarray(20, 36), 'Same PCM format');
  assert.deepEqual(ending.subarray(44 + 960 * 2, 44 + 4800 * 2), grain, 'No fresh synthesis or normalization');
  assert.ok(ending.subarray(44, 44 + 960 * 2).every(byte => byte === 0));
  assert.ok(ending.subarray(-960 * 2).every(byte => byte === 0));
  const peak = data => Math.max(...Array.from({length:(data.length-44)/2}, (_,i)=>Math.abs(data.readInt16LE(44+i*2))));
  assert.equal(peak(wav), 10362);
  assert.equal(peak(ending), peak(wav));
});
