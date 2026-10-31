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

test('exact approved Bright glass double-tap is packaged without playback', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)));
  const source = 'native/assets/sounds/listening.wav';
  assert.equal(config.bundle.resources[source], 'sounds/listening.wav');
  const wav = readFileSync(new URL(`../src-tauri/${source}`, import.meta.url));
  assert.equal(createHash('sha256').update(wav).digest('hex'), '909f8fe9f672f201f9040321a319e5a4351a105a70ead33a57b107a5cfe81462');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt16LE(20), 1, 'Uncompressed PCM');
  assert.equal(wav.readUInt16LE(22), 1, 'Mono');
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), 14400 * 2);
  assert.equal(wav.length, 44 + 14400 * 2);
  assert.ok(wav.subarray(44, 44 + 960 * 2).every(byte => byte === 0));
  assert.ok(wav.subarray(-960 * 2).every(byte => byte === 0));
});
