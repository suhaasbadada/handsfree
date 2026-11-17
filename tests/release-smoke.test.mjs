import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateProbe, validateReceipt, bundleHash, runNativeProbe } from '../scripts/check-release-smoke.mjs';
import { validateSourceCI } from '../scripts/publish-release.mjs';

// Normalized production Observation/trace shape. These are policy fixtures, NOT
// hardware results or release receipts. They intentionally contain no UID/audio.
const now = Date.parse('2026-11-16T12:00:00Z');
const identity = {
  sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), distribution: '0.1.1-beta.23', executableHash: 'c'.repeat(64), archiveHash: 'd'.repeat(64), bundleHash: 'e'.repeat(64),
  bundleIdentifier: 'com.handsfree.local', signatureAnchor: 'f'.repeat(40), designatedRequirement: 'designated => identifier "com.handsfree.local" and certificate leaf = H"fixture"',
  arch: 'arm64', os: { platform: 'darwin', version: '15.7.2', build: '24G325' }, hardwareModel: 'Mac14,2',
};
function fixture() {
  const normal = {
    kind: 'finish', passed: true, frames: 17600, packets: 11, failures: 0, lateFrames: 0, nonzeroSamples: 17000, invalidPCM: false,
    retired: true, captureReleased: true, engineReleased: true, frozenUIDMatches: true, unchanged: true, afterRunning: [0, 0], milliseconds: 1600,
    trace: { notifications: 1, runtimeCertified: 1, finalCertified: 1, cleanupPassed: 1 },
    observation: { reason: 'finished', audioReady: false, outputRate: 0, formats: { negotiationAttempts: 1, inputRate: 44100, inputChannels: 1, convertedRate: 16000, convertedChannels: 1 },
      events: [{ name: 'route_ready', milliseconds: 12.1 }, { name: 'recording', milliseconds: 14.9 }, { name: 'first_accepted_pcm', milliseconds: 250.1 }, { name: 'draining', milliseconds: 1350.8 }, { name: 'finished', milliseconds: 1400.2 }] },
  };
  const cancel = structuredClone(normal);
  cancel.kind = 'cancel'; cancel.frames = 1600; cancel.nonzeroSamples = 1500; cancel.packets = 1; cancel.milliseconds = 650;
  cancel.trace = { cleanupPassed: 1 }; cancel.observation.reason = 'cancelled';
  cancel.observation.events = normal.observation.events.slice(0, 3).concat({ name: 'cancelled', milliseconds: 300 });
  return { schemaVersion: 1, type: 'signed-candidate-hardware-smoke', startedAt: new Date(now - 60000).toISOString(), finishedAt: new Date(now - 54000).toISOString(),
    before: structuredClone(identity), after: structuredClone(identity),
    probe: { schemaVersion: 1, probe: 'production-audio-v1', passed: true, permission: 'authorized', inputTransport: 'built-in', baselineRunning: [0, 0],
      savedSounds: false, soundProfile: 'clean', soundVolume: 0.5, completionEnabled: false,
      attempts: [structuredClone(normal), structuredClone(normal), structuredClone(normal), cancel] } };
}
test('public receipt policy accepts normalized complete production evidence, not CI-only proof', () => {
  assert.equal(validateReceipt(fixture(), identity, now).probe.attempts.length, 4);
  const f = fixture(); f.probe.inputTransport = 'bluetooth';
  assert.doesNotThrow(() => validateReceipt(f, identity, now));
  f.probe.savedSounds = true; f.probe.completionEnabled = true;
  for (const attempt of f.probe.attempts.slice(0, 3)) {
    attempt.trace.outputCreated = 1; attempt.trace.outputCleanupPassed = 1; attempt.observation.outputRate = 44100;
  }
  assert.doesNotThrow(() => validateReceipt(f, identity, now), 'Actual deferred completion is required only when saved preferences enable it');
});
const reconciliation = { negotiationAttempts: 2, initial_config_change: 1, initialInputRate: 48000,
  firstPreparationRetiredHealthy: 1, sameEnginePreacceptTransaction: 1, secondPreparationSucceeded: 1 };
test('validateProbe accepts certified bounded Bluetooth reconciliation, including first-PCM cancellation', () => {
  const f = fixture(); f.probe.inputTransport = 'bluetooth';
  for (const attempt of f.probe.attempts) Object.assign(attempt.observation.formats, reconciliation, { inputRate: 24000 });
  assert.doesNotThrow(() => validateProbe(f.probe));
  f.probe.attempts[0].observation.formats.initialInputRate = 0;
  assert.doesNotThrow(() => validateProbe(f.probe), 'Notification may precede the first format read');
});
for (const key of Object.keys(reconciliation)) {
  for (const value of [undefined, -1, NaN, Infinity, '1', true, null]) {
    test(`validateProbe rejects invalid reconciliation ${key}=${String(value)}`, () => {
      const f = fixture(), formats = f.probe.attempts[0].observation.formats;
      Object.assign(formats, reconciliation);
      if (value === undefined) delete formats[key]; else formats[key] = value;
      assert.throws(() => validateProbe(f.probe));
    });
  }
  if (key !== 'negotiationAttempts') test(`validateProbe rejects contradictory single-attempt ${key}`, () => {
    const f = fixture(); f.probe.attempts[0].observation.formats[key] = reconciliation[key];
    assert.throws(() => validateProbe(f.probe));
  });
}
for (const key of ['initial_config_change', 'firstPreparationRetiredHealthy', 'sameEnginePreacceptTransaction', 'secondPreparationSucceeded']) {
  for (const value of [0, 2]) test(`validateProbe rejects non-certificate ${key}=${value}`, () => {
    const f = fixture(); Object.assign(f.probe.attempts[0].observation.formats, reconciliation, { [key]: value });
    assert.throws(() => validateProbe(f.probe));
  });
}
for (const count of [0, 1.5, 3, 4]) test(`validateProbe rejects reconciliation attempt count ${count}`, () => {
  const f = fixture(); Object.assign(f.probe.attempts[0].observation.formats, reconciliation, { negotiationAttempts: count });
  assert.throws(() => validateProbe(f.probe));
});
for (const [label, mutate] of [
  ['missing receipt', () => null], ['malformed receipt', () => ({ passed: true })],
  ['failed probe', f => { f.probe.passed = false; }], ['permission blocked', f => { f.probe.permission = 'denied'; }],
  ['missing attempt', f => { f.probe.attempts.pop(); }], ['one failed attempt', f => { f.probe.attempts[1].passed = false; }],
  ['no PCM', f => { f.probe.attempts[0].frames = 0; }], ['insufficient PCM', f => { f.probe.attempts[0].frames = 15999; }],
  ['all-zero PCM', f => { f.probe.attempts[0].nonzeroSamples = 0; }],
  ['missing first PCM timing', f => { f.probe.attempts[0].observation.events = []; }],
  ['cancel before first PCM', f => { f.probe.attempts[3].frames = 0; }],
  ['cancel not retired', f => { f.probe.attempts[3].observation.reason = 'finished'; }],
  ['cancel retirement failure', f => { f.probe.attempts[3].retired = false; }],
  ['cancel allocated output', f => { f.probe.attempts[3].trace.outputCreated = 1; f.probe.attempts[3].trace.outputCleanupPassed = 1; }],
  ['enabled completion missing', f => { f.probe.savedSounds = true; f.probe.completionEnabled = true; }],
  ['late PCM', f => { f.probe.attempts[0].lateFrames = 1; }], ['invalid PCM', f => { f.probe.attempts[0].invalidPCM = true; }],
  ['capture failure', f => { f.probe.attempts[0].failures = 1; }], ['cleanup failure', f => { f.probe.attempts[0].trace.cleanupFailed = 1; }],
  ['output cleanup failure', f => { f.probe.attempts[0].trace.outputCleanupFailed = 1; }],
  ['output not retired', f => { f.probe.attempts[0].trace.outputCreated = 1; }],
  ['cleanup absent', f => { delete f.probe.attempts[0].trace.cleanupPassed; }],
  ['capture leak', f => { f.probe.attempts[0].captureReleased = false; }], ['engine leak', f => { f.probe.attempts[0].engineReleased = false; }],
  ['device still running', f => { f.probe.attempts[0].afterRunning = [1, 0]; }], ['busy baseline', f => { f.probe.baselineRunning = [1, 0]; }],
  ['selected UID changed', f => { f.probe.attempts[0].frozenUIDMatches = false; }], ['settings or default changed', f => { f.probe.attempts[0].unchanged = false; }],
  ['missing final certificate', f => { delete f.probe.attempts[0].trace.finalCertified; }], ['runtime rejected', f => { f.probe.attempts[0].trace.runtimeRejected = 1; }],
  ['notification uncertified', f => { delete f.probe.attempts[0].trace.runtimeCertified; }],
  ['failure stage', f => { f.probe.attempts[0].observation.failureStage = 'input_configuration'; }],
  ['extra preparation', f => { f.probe.attempts[0].observation.formats.negotiationAttempts = 2; }],
  ['not mono', f => { f.probe.attempts[0].observation.formats.convertedChannels = 2; }],
  ['not 16k', f => { f.probe.attempts[0].observation.formats.convertedRate = 44100; }],
  ['attempt timeout', f => { f.probe.attempts[0].milliseconds = 18000; }],
  ['stale receipt', f => { f.startedAt = new Date(now - 86400001).toISOString(); f.finishedAt = new Date(now - 86400000).toISOString(); }],
  ['future receipt', f => { f.finishedAt = new Date(now + 1).toISOString(); }], ['unbounded receipt', f => { f.startedAt = new Date(now - 200000).toISOString(); }],
  ...['sourceCommit', 'sourceTree', 'distribution', 'executableHash', 'archiveHash', 'bundleHash', 'bundleIdentifier', 'signatureAnchor', 'designatedRequirement', 'arch', 'hardwareModel'].map(key =>
    [`different ${key}`, f => { f.before[key] = 'changed'; }]),
  ['different OS identity', f => { f.before.os.build = 'other'; }], ['candidate changed after run', f => { f.after.bundleHash = '0'.repeat(64); }],
]) test(`hardware release policy rejects ${label}`, () => {
  const f = fixture(); const replacement = mutate(f);
  assert.throws(() => validateReceipt(replacement === undefined ? f : replacement, identity, now));
});
test('JSON roundtrip and boundary freshness are executable policy, no source-text assertion', () => {
  const f = fixture(); f.startedAt = new Date(now - 86400000).toISOString(); f.finishedAt = new Date(now - 86400000 + 6000).toISOString();
  assert.doesNotThrow(() => validateReceipt(JSON.parse(JSON.stringify(f)), identity, now));
  assert.throws(() => validateReceipt(f, identity, now + 1));
  assert.throws(() => validateProbe({ passed: true }));
});
test('bundle snapshot detects resources, executable, permissions and links, not just executable hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'handsfree-seal-policy-'));
  try {
    mkdirSync(join(dir, 'Contents')); writeFileSync(join(dir, 'Contents', 'resource'), 'one');
    const baseline = bundleHash(dir); writeFileSync(join(dir, 'Contents', 'resource'), 'two');
    assert.notEqual(bundleHash(dir), baseline);
    const changed = bundleHash(dir); symlinkSync('resource', join(dir, 'Contents', 'link'));
    assert.notEqual(bundleHash(dir), changed);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('public hardware CLI and every audit mode fail without receipt; no skip switch exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'handsfree-missing-smoke-'));
  try {
    for (const [script, args] of [
      ['check-release-smoke.mjs', [dir]], ['check-release-smoke.mjs', ['--skip', dir]],
      ['check-release.mjs', ['--local', dir]], ['check-release.mjs', [dir]], ['check-release.mjs', ['--public', dir]],
      ['publish-release.mjs', ['--check', dir]], ['publish-release.mjs', ['--skip', dir]],
    ]) {
      const result = spawnSync(process.execPath, [resolve('scripts', script), ...args], { encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 1, `${script} ${args}`);
      assert.match(result.stderr, /missing|usage|Usage|Apple Silicon/);
    }
    writeFileSync(join(dir, 'release-smoke.json'), '{malformed');
    assert.equal(spawnSync(process.execPath, ['scripts/check-release-smoke.mjs', dir]).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('publication requires latest exact-source canonical Checks workflow, not another green run', () => {
  const run = { id: 44004684790, head_sha: identity.sourceCommit, path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success', html_url: 'https://github.com/suhaasbadada/handsfree/actions/runs/44004684790' };
  assert.equal(validateSourceCI([run], identity.sourceCommit).id, run.id);
  for (const change of [{ head_sha: '1'.repeat(40) }, { path: '.github/workflows/pages.yml' }, { status: 'in_progress' }, { conclusion: 'failure' }, { conclusion: 'cancelled' }]) {
    assert.throws(() => validateSourceCI([{ ...run, ...change }], identity.sourceCommit));
  }
  assert.throws(() => validateSourceCI([run, { ...run, id: run.id + 1, status: 'in_progress', conclusion: null }], identity.sourceCommit));
  assert.throws(() => validateSourceCI([], identity.sourceCommit));
});

test('native probe uses Launch Services with exact bundle/arguments and fresh bounded output', () => {
  const bundle = '/candidate with spaces/HandsFree.app';
  const document = JSON.stringify(fixture().probe);
  let lastOutput;
  const launch = (command, args, options) => {
    assert.equal(command, '/usr/bin/open');
    assert.deepEqual(args.slice(0, 3), ['-n', '-W', '--stdout']);
    assert.equal(args[4], '--stderr');
    assert.deepEqual(args.slice(6), [bundle, '--args', '--release-smoke']);
    assert.equal(options.timeout, 85000);
    assert.notEqual(args[3], lastOutput, 'A previous success cannot be reused');
    lastOutput = args[3];
    writeFileSync(args[3], document, { flag: 'wx' });
    return { status: 0, signal: null };
  };
  assert.equal(runNativeProbe(bundle, { launch }).stdout, document);
  assert.equal(runNativeProbe(bundle, { launch }).stdout, document);
  const absent = runNativeProbe(bundle, { launch: () => ({ status: 0, signal: null }) });
  assert.equal(absent.stdout, '', 'Launcher success alone is not native success');
  assert.throws(() => validateProbe(JSON.parse(absent.stdout)));
  assert.throws(() => runNativeProbe(bundle, { launch: (_, args) => {
    writeFileSync(args[3], 'x'.repeat(128 * 1024 + 1)); return { status: 0 };
  } }), /oversized/);
});
