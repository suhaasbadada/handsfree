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

test('native roles freeze completion identity without startup cue work; preview auditions completion', () => {
  const source = readFileSync(new URL('../src-tauri/native/Bridge.swift', import.meta.url), 'utf8');
  assert.match(source, /let profile = cueProfile, volume = cueVolume/);
  assert.match(source, /let sessionSounds = soundsEnabled && volume > 0/);
  const admission = source.slice(source.indexOf('let profile = cueProfile'), source.indexOf('r.start(factory: productionAudioFactory'));
  assert.match(admission, /let outputUID = sessionSounds \? \(try\? Microphones.string/);
  assert.doesNotMatch(admission, /Cue.data|SessionCuePCM.decode|SessionCueOutput\(format/);
  assert.doesNotMatch(source, /StartCue.data\(profile: profile\)/);
  assert.match(source, /SessionCueOutput\(format: pcm\.format, volume: volume, frozenUID: outputUID\)/);
  assert.match(source, /let makeOutput:[\s\S]*sounds \? \{[\s\S]*EndCue.data\(profile: profile\)/);
  const preview = source.slice(source.indexOf('@_cdecl("hf_preview_sound")'), source.indexOf('@_cdecl("hf_sounds")'));
  assert.match(preview, /CuePolicy.canPreview/);
  assert.match(preview, /EndCue.data\(profile: cueProfile\)/);
  assert.doesNotMatch(preview, /StartCue.data|AudioCapture/);
  const style = source.slice(source.indexOf('@_cdecl("hf_sound_style")'), source.indexOf('@_cdecl("hf_sound_volume")'));
  assert.doesNotMatch(style, /\.play\(|\.stop\(/);
});

test('session separates explicit input-only and read-only default output topology', () => {
  const source = readFileSync(new URL('../src-tauri/native/AudioCapture.swift', import.meta.url), 'utf8');
  const input = source.slice(source.indexOf('final class AudioCapture'), source.indexOf('final class SessionCueOutput'));
  assert.doesNotMatch(input, /mainMixerNode|outputNode|AVAudioPlayerNode|HFCue/);
  const output = source.slice(source.indexOf('final class SessionCueOutput'), source.indexOf('final class SessionAudioOwner'));
  assert.doesNotMatch(output, /inputNode|AudioUnitSetProperty|AudioObjectSetPropertyData/);
  assert.match(output, /HFCueOutputDevice/);
  assert.match(output, /uid = frozenUID/);
  const owner = source.slice(source.indexOf('final class SessionAudioOwner'));
  assert.ok(owner.indexOf('self.input.prepare()') < owner.indexOf('self.output = try'));
  const preparation = owner.slice(owner.indexOf('.init(prepare:'), owner.indexOf('}, enable:'));
  assert.doesNotMatch(preparation, /makeOutput|self.output|self.cue/);
  assert.doesNotMatch(source, /quiet_tail|after\(0\.18\)|play\(ending: false\)/);
  const shim = readFileSync(new URL('../src-tauri/native/CaptureException.m', import.meta.url), 'utf8');
  assert.match(shim, /AudioUnitGetProperty\(unit, kAudioOutputUnitProperty_CurrentDevice/);
  assert.doesNotMatch(shim, /exception\.reason|exception\.name/);
});

test('native teardown snapshots on AppKit but waits on the FIFO; retirement precedes admission', () => {
  const bridge = readFileSync(new URL('../src-tauri/native/Bridge.swift', import.meta.url), 'utf8');
  const stop = bridge.slice(bridge.indexOf('@_cdecl("hf_stop")'), bridge.indexOf('@_cdecl("hf_cancel_audio")'));
  assert.match(stop, /let session = main \{ recorder \}/);
  assert.match(stop, /session\?\.stop\(\)/);
  assert.match(stop, /let session = main \{ recorder\?\.epoch == epoch \? recorder : nil \}/);
  assert.doesNotMatch(stop, /main \{[^}]*\.(?:stop|finish)\(/s);
  const cleanup = bridge.slice(bridge.indexOf('@_cdecl("hf_cleanup")'));
  assert.doesNotMatch(cleanup, /recorder\?\.stop\(/);
  assert.match(bridge, /if recorder === session/);
  const controller = readFileSync(new URL('../src-tauri/native/AudioCapture.swift', import.meta.url), 'utf8');
  assert.match(controller, /retired\(self\); retirement\.leave\(\)/);
  assert.match(controller, /func stop\(\) \{[\s\S]*retirement\.wait\(\)/);
  const rust = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert.match(rust, /hf_cancel_audio\(\);\s*hf_stop\(\); \/\/ Retirement barrier/);
  const practice = rust.slice(rust.indexOf('async fn practice_status'), rust.indexOf('async fn list_microphones'));
  assert.ok(practice.indexOf('platform::audio_status') < practice.indexOf('let gate = PRACTICE.lock()'));
  assert.match(practice, /audio_ready:[\s\S]*gate\.meter_identity\(token\) == identity/);
});

test('production input notifications wire actual fact certification through final drain, not timing or first PCM', () => {
  const source = readFileSync(new URL('../src-tauri/native/AudioCapture.swift', import.meta.url), 'utf8');
  const bridge = readFileSync(new URL('../src-tauri/native/Bridge.swift', import.meta.url), 'utf8');
  assert.match(bridge, /capture\.validationRequested = \{ \[weak session\] in trace\?\.count\("notifications"\); session\?\.inputConfigurationChanged\(\) \}/);
  assert.match(bridge, /prepareDrainCertificate: \{ try certificate\(true\) \}/);
  assert.match(bridge, /prepareValidationCertificate: \{ try certificate\(false\) \}/);
  assert.match(bridge, /let certify = try final \? capture\.prepareDrainCertificate\(\) : capture\.prepareValidationCertificate\(\)/);
  const notification = source.slice(source.indexOf('private func invalidate()'), source.indexOf('private func check()'));
  assert.match(notification, /configurationRevision &\+= 1/);
  assert.ok(notification.indexOf('routeLock.unlock()') < notification.indexOf('request?()'));
  assert.doesNotMatch(notification, /operations\.(?:validate|format|outputFormat|running)|firstPCM|asyncAfter/);
  const validation = source.slice(source.indexOf('func prepareValidationCertificate(draining:'), source.indexOf('func closeAndDrain()'));
  for (const fact of ['operations.validate()', 'checkFormats(format)', 'operations.running()', 'configurationRevision == revision', '!revoked', '!invalidated']) {
    assert.ok(validation.includes(fact), `missing actual fact: ${fact}`);
  }
  assert.doesNotMatch(validation, /\.enable\(|operations\.(?:start|install|prepare)\(|firstPCM|asyncAfter/);
  const owner = source.slice(source.indexOf('final class SessionAudioOwner'), source.indexOf('enum CaptureEnd'));
  assert.match(owner, /prepareDrainCertificate: self\.input\.prepareDrainCertificate/);
  assert.match(owner, /prepareValidationCertificate: self\.input\.prepareValidationCertificate/);
  const runtime = source.slice(source.indexOf('func inputConfigurationChanged()'), source.indexOf('private func valid()'));
  assert.match(runtime, /input_validation_timeout/);
  assert.match(runtime, /let certified = live && certify\(\)/);
  assert.doesNotMatch(runtime, /\.enable\(|firstPCM|operations\?\.(?:start|prepare)\(/);
  const finish = source.slice(source.lastIndexOf('func finish()'), source.indexOf('func cancel()'));
  assert.ok(finish.includes('certificate = try prepareCertificate()'));
  assert.ok(finish.indexOf('operations?.drain()') < finish.indexOf('certificate = try prepareCertificate()'));
  assert.match(finish, /guard let prepareCertificate = operations\?\.prepareDrainCertificate else/);
  assert.match(finish, /Input drain validator unavailable/);
  assert.match(finish, /certificate\?\(\) \?\? false/);
  assert.ok(finish.indexOf('certificate?()') < finish.indexOf('producerDrained = true'));
  assert.ok(finish.indexOf('producerDrained = true') < finish.indexOf('self.play(ending: true)'));
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
