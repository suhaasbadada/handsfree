import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('generator reproduces the committed cue byte-exactly', {
  skip: spawnSync('python3', ['-c', 'import numpy'], { stdio: 'ignore' }).status !== 0
    ? 'Python + NumPy are optional generation tools, not runtime/test dependencies' : false,
}, () => {
  execFileSync('python3', [fileURLToPath(new URL('../scripts/generate-listening-cue.py', import.meta.url)), '--check']);
});

test('double-tap with a short chime trail is packaged without playback', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)));
  const source = 'native/assets/sounds/listening.wav';
  assert.equal(config.bundle.resources[source], 'sounds/listening.wav');
  const wav = readFileSync(new URL(`../src-tauri/${source}`, import.meta.url));
  assert.equal(createHash('sha256').update(wav).digest('hex'), '5113c1e4ab2af23dc8dcd2c98e3612b6019d87741675a803142c407ff387750d');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt16LE(20), 1, 'Uncompressed PCM');
  assert.equal(wav.readUInt16LE(22), 1, 'Mono');
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), 15360 * 2);
  assert.equal(wav.length, 44 + 15360 * 2);
  assert.ok(wav.subarray(44, 44 + 960 * 2).every(byte => byte === 0));
  assert.ok(wav.subarray(-960 * 2).every(byte => byte === 0));
});
