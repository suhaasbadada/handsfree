import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('approved double-tap PCM is packaged at the native resource path without playback', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)));
  const source = 'native/assets/sounds/listening.wav';
  assert.equal(config.bundle.resources[source], 'sounds/listening.wav');
  const wav = readFileSync(new URL(`../src-tauri/${source}`, import.meta.url));
  assert.equal(createHash('sha256').update(wav).digest('hex'), 'cffe6987c8e47927640ecb625fcd185396a8edae347c10a55dad21cc53b243e3');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt16LE(20), 1, 'Uncompressed PCM');
  assert.equal(wav.readUInt16LE(22), 1, 'Mono');
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), 9600 * 2);
  assert.equal(wav.length, 44 + 9600 * 2);
  assert.ok(wav.subarray(44, 44 + 960 * 2).every(byte => byte === 0));
  assert.ok(wav.subarray(-960 * 2).every(byte => byte === 0));
});
