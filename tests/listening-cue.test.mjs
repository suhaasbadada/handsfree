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

test('exact approved Clean pair and identical single finish tap are packaged without playback', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)));
  const source = 'native/assets/sounds/listening.wav';
  assert.equal(config.bundle.resources[source], 'sounds/listening.wav');
  const wav = readFileSync(new URL(`../src-tauri/${source}`, import.meta.url));
  assert.equal(createHash('sha256').update(wav).digest('hex'), 'a1eb8aeadfc425a5a217e3d35732762571c16d7e03969a5f3b0bfe41dbde6856');
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
  const endSource = 'native/assets/sounds/ending.wav';
  assert.equal(config.bundle.resources[endSource], 'sounds/ending.wav');
  const ending = readFileSync(new URL(`../src-tauri/${endSource}`, import.meta.url));
  assert.equal(createHash('sha256').update(ending).digest('hex'), 'd9164cb188a469059517b60817e5acca1dd5121278c01ebd8193cfc79411e6c8');
  assert.equal(ending.length, 44 + 5760 * 2);
  assert.deepEqual(ending.subarray(20, 36), wav.subarray(20, 36), 'Same PCM format');
  assert.deepEqual(ending.subarray(44 + 960 * 2, 44 + 4800 * 2), grain, 'No fresh synthesis or normalization');
  assert.ok(ending.subarray(44, 44 + 960 * 2).every(byte => byte === 0));
  assert.ok(ending.subarray(-960 * 2).every(byte => byte === 0));
  const peak = data => Math.max(...Array.from({length:(data.length-44)/2}, (_,i)=>Math.abs(data.readInt16LE(44+i*2))));
  assert.equal(peak(wav), 10362);
  assert.equal(peak(ending), peak(wav));
});
