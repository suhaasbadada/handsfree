// Explicit hardware execution (--run) or read-only fail-closed evidence audit.
// No signing, prompts, installation, application data writes or publication.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, readlinkSync, writeFileSync, existsSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
const requireThat = (ok, message) => { if (!ok) throw new Error(`Hardware release gate: ${message}`); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fileHash = path => sha(readFileSync(path));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);

export function bundleHash(app) {
  const entries = [];
  function walk(directory, prefix = '') {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name), relative = `${prefix}${name}`, stat = lstatSync(path);
      if (stat.isSymbolicLink()) entries.push([relative, 'link', readlinkSync(path)]);
      else if (stat.isDirectory()) { entries.push([relative, 'dir', stat.mode & 0o777]); walk(path, `${relative}/`); }
      else { requireThat(stat.isFile(), 'unexpected bundle file type'); entries.push([relative, 'file', stat.mode & 0o777, fileHash(path)]); }
    }
  }
  walk(app);
  return sha(JSON.stringify(entries));
}

// Public behavioral policy seam. Fixtures are normalized real probe output, not
// a separate mock policy. Every acceptance fact is validated, never just passed.
export function validateProbe(probe) {
  requireThat(probe?.schemaVersion === 1 && probe.probe === 'production-audio-v1' && probe.passed === true, 'missing/failed/malformed native probe');
  requireThat(probe.permission === 'authorized', 'microphone permission not already granted');
  requireThat(['built-in', 'bluetooth', 'other'].includes(probe.inputTransport), 'device coverage missing');
  requireThat(same(probe.baselineRunning, [0, 0]), 'device baseline busy/unknown');
  requireThat(typeof probe.savedSounds === 'boolean' && ['clean', 'warm'].includes(probe.soundProfile) &&
    Number.isFinite(probe.soundVolume) && probe.soundVolume >= 0 && probe.soundVolume <= 1 &&
    probe.completionEnabled === (probe.savedSounds && probe.soundVolume > 0), 'saved completion preference snapshot missing');
  requireThat(Array.isArray(probe.attempts) && probe.attempts.length === 4, 'three finishes and one cancellation required');
  for (const [index, attempt] of probe.attempts.entries()) {
    const cancel = index === 3, observation = attempt?.observation, trace = attempt?.trace;
    requireThat(attempt?.passed === true && attempt.kind === (cancel ? 'cancel' : 'finish'), `attempt ${index + 1} failed/wrong order`);
    requireThat(Number.isSafeInteger(attempt.frames) && attempt.frames >= (cancel ? 1 : 16000) && attempt.frames <= 16000 * 18 &&
      Number.isSafeInteger(attempt.packets) && attempt.packets > 0 && attempt.packets <= attempt.frames, 'actual PCM missing/out of bounds');
    requireThat(attempt.failures === 0 && attempt.lateFrames === 0 && attempt.invalidPCM === false, 'failed/late/invalid PCM');
    requireThat(Number.isSafeInteger(attempt.nonzeroSamples) && attempt.nonzeroSamples > 0 && attempt.nonzeroSamples <= attempt.frames, 'only zero/missing microphone samples');
    for (const key of ['retired', 'captureReleased', 'engineReleased', 'frozenUIDMatches', 'unchanged']) requireThat(attempt[key] === true, `${key} not proven`);
    requireThat(same(attempt.afterRunning, probe.baselineRunning), 'devices did not return to baseline');
    requireThat(Number.isFinite(attempt.milliseconds) && attempt.milliseconds > 0 && attempt.milliseconds < 18000, 'attempt deadline exceeded');
    requireThat(trace && trace.cleanupPassed === 1 && !trace.cleanupFailed && !trace.outputCleanupFailed &&
      (!trace.outputCreated || trace.outputCreated === 1 && trace.outputCleanupPassed === 1) &&
      !trace.runtimeRejected && !trace.finalRejected && !trace.routeFailures, 'cleanup/certification failed');
    for (const [key, value] of Object.entries(trace)) requireThat(Number.isSafeInteger(value) && value >= 0, `invalid trace ${key}`);
    requireThat(observation && !observation.failureStage && !observation.failureDomain && observation.audioReady === false, 'native failure/not retired');
    requireThat(observation.formats?.negotiationAttempts === 1 && Number.isFinite(observation.formats.inputRate) && observation.formats.inputRate > 0 &&
      Number.isInteger(observation.formats.inputChannels) && observation.formats.inputChannels > 0 && observation.formats.convertedRate === 16000 &&
      observation.formats.convertedChannels === 1, 'one preparation with actual mono 16k conversion required');
    requireThat(Array.isArray(observation.events) && observation.events.length <= 24, 'native timing missing');
    const firstPCM = observation.events.filter(event => event.name === 'first_accepted_pcm');
    requireThat(firstPCM.length === 1 && firstPCM[0].milliseconds > 0 && firstPCM[0].milliseconds < 12000, 'first actual PCM timing missing');
    requireThat(observation.events.every(event => typeof event.name === 'string' && Number.isFinite(event.milliseconds) && event.milliseconds >= 0 && event.milliseconds < 18000), 'invalid native timing');
    // No notification means no runtime certificate was requested. When present,
    // at least one live certificate must succeed; final always must succeed.
    requireThat(!(trace.notifications > 0) || trace.runtimeCertified > 0 || cancel, 'notification without runtime certification');
    requireThat(cancel ? observation.reason === 'cancelled' && !trace.finalCertified : observation.reason === 'finished' && trace.finalCertified === 1, 'finish/cancel retirement/final certificate missing');
    requireThat(cancel || !probe.completionEnabled ? !trace.outputCreated && observation.outputRate === 0 :
      trace.outputCreated === 1 && trace.outputCleanupPassed === 1 && Number.isFinite(observation.outputRate) && observation.outputRate > 0, 'deferred completion output disposition mismatch');
  }
  return probe;
}

export function validateReceipt(receipt, identity, now = Date.now()) {
  requireThat(receipt?.schemaVersion === 1 && receipt.type === 'signed-candidate-hardware-smoke', 'receipt missing/malformed');
  requireThat(identity && hex(identity.sourceCommit, 40) && hex(identity.sourceTree, 40) && hex(identity.executableHash, 64) &&
    hex(identity.archiveHash, 64) && hex(identity.bundleHash, 64) && hex(identity.signatureAnchor, 40), 'invalid exact-candidate identity');
  requireThat(identity.bundleIdentifier === 'com.handsfree.local' && identity.arch === 'arm64' && /^0\.1\.1-beta\.\d+$/.test(identity.distribution) &&
    identity.os?.platform === 'darwin' && Number(identity.os.version?.split('.')[0]) >= 14 && typeof identity.os.build === 'string' && identity.os.build.length > 0 &&
    typeof identity.hardwareModel === 'string' && identity.hardwareModel.length > 0 && typeof identity.designatedRequirement === 'string' && identity.designatedRequirement.length > 0, 'unsupported/missing version/OS/signature identity');
  requireThat(same(receipt.before, identity) && same(receipt.after, identity), 'source/version/executable/archive/bundle/signature/OS identity changed');
  const start = Date.parse(receipt.startedAt), finish = Date.parse(receipt.finishedAt);
  requireThat(Number.isFinite(start) && Number.isFinite(finish) && new Date(start).toISOString() === receipt.startedAt &&
    new Date(finish).toISOString() === receipt.finishedAt && finish >= start && finish - start < 80000 && finish <= now && start <= now &&
    now - start <= 24 * 60 * 60 * 1000, 'receipt stale/future/invalid duration (maximum age 24h)');
  validateProbe(receipt.probe);
  return receipt;
}

export function candidateIdentity(directory) {
  requireThat(process.platform === 'darwin' && process.arch === 'arm64', 'Apple Silicon macOS required');
  const git = (...args) => run('git', args, { cwd: root });
  requireThat(!git('status', '--short', '--untracked-files=normal'), 'source dirty; commit and rebuild before hardware execution');
  const sourceCommit = git('rev-parse', 'HEAD'), sourceTree = git('rev-parse', 'HEAD^{tree}');
  const distribution = JSON.parse(readFileSync(join(root, 'src-tauri/distribution.json'), 'utf8')).version;
  const app = join(directory, 'updater/HandsFree.app'), executable = join(app, 'Contents/MacOS/handsfree');
  const archive = join(directory, `HandsFree-${distribution}-macos-arm64.app.tar.gz`);
  const signatureAnchor = run('/usr/bin/openssl', ['x509', '-in', join(homedir(), 'Library/Application Support/HandsFree Local Signing/certificate.pem'), '-noout', '-fingerprint', '-sha1']).split('=').at(-1).replaceAll(':', '').toLowerCase();
  requireThat(hex(signatureAnchor, 40), 'existing signer unavailable');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', `-R=identifier "com.handsfree.local" and certificate leaf = H"${signatureAnchor}"`, app]);
  const plist = key => run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(app, 'Contents/Info.plist')]);
  const details = spawnSync('/usr/bin/codesign', ['-d', '-r-', app], { encoding: 'utf8' });
  requireThat(details.status === 0, 'cannot read designated requirement');
  const designatedRequirement = `${details.stdout}${details.stderr}`.split('\n').find(line => line.startsWith('designated => '));
  const identity = { sourceCommit, sourceTree, distribution, executableHash: fileHash(executable), archiveHash: fileHash(archive), bundleHash: bundleHash(app),
    bundleIdentifier: plist('CFBundleIdentifier'), signatureAnchor, designatedRequirement,
    arch: run('/usr/bin/lipo', ['-archs', executable]), os: { platform: process.platform, version: run('/usr/bin/sw_vers', ['-productVersion']), build: run('/usr/bin/sw_vers', ['-buildVersion']) },
    hardwareModel: run('/usr/sbin/sysctl', ['-n', 'hw.model']) };
  requireThat(plist('CFBundleExecutable') === 'handsfree' && plist('CFBundleShortVersionString') === '0.1.1' && plist('LSMinimumSystemVersion') === '14.0', 'unexpected app version/executable/minimum OS');
  requireThat(readFileSync(join(directory, 'UPDATER-PROVENANCE.txt'), 'utf8').startsWith(`Distribution: ${distribution}\nSource commit: ${sourceCommit}\nApp executable SHA-256: ${identity.executableHash}\n`), 'updater provenance mismatch');
  requireThat(readFileSync(join(directory, 'PROVENANCE.txt'), 'utf8').startsWith(`Candidate: HandsFree-${distribution}-macos-arm64.dmg\nSource commit: ${sourceCommit}\nSource tree: ${sourceTree}\n`), 'packaging provenance mismatch');
  // Confirm the executable's embedded distribution is exactly the source's.
  requireThat(readFileSync(executable).includes(Buffer.from(distribution)), 'distribution not embedded in executable');
  const archivedExecutable = execFileSync('/usr/bin/tar', ['-xOf', archive, 'HandsFree.app/Contents/MacOS/handsfree'], { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  requireThat(sha(archivedExecutable) === identity.executableHash, 'prepared executable differs from exact updater archive');
  return identity;
}

export function verifyHardwareEvidence(directory) {
  const path = join(directory, 'release-smoke.json');
  requireThat(existsSync(path), `missing ${path}; run the explicit exact-candidate hardware smoke`);
  requireThat(lstatSync(path).size < 128 * 1024, 'oversized receipt');
  return validateReceipt(JSON.parse(readFileSync(path, 'utf8')), candidateIdentity(directory));
}

// Launch Services preserves the signed application's TCC identity. Directly
// spawning its executable attributes permission to the invoking terminal instead.
// open -W reports launcher status, not the child's exit code: the fresh, complete
// native passed/probe document below remains mandatory evidence of child success.
export function runNativeProbe(app, { launch = spawnSync } = {}) {
  const temporary = mkdtempSync(join(tmpdir(), 'handsfree-candidate-probe-'));
  const output = join(temporary, 'probe.json'), errors = join(temporary, 'native.log');
  try {
    const result = launch('/usr/bin/open', ['-n', '-W', '--stdout', output, '--stderr', errors, app, '--args', '--release-smoke'], {
      encoding: 'utf8', timeout: 85000, maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe'], killSignal: 'SIGKILL',
    });
    requireThat(!existsSync(output) || lstatSync(output).isFile() && lstatSync(output).size <= 128 * 1024, 'oversized/non-file native probe output');
    return { status: result.status, signal: result.signal, error: result.error,
      stdout: existsSync(output) ? readFileSync(output, 'utf8') : '' };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

export async function main(args = process.argv.slice(2)) {
  const execute = args[0] === '--run';
  if (execute) args = args.slice(1);
  requireThat(args.length <= 1 && !args.some(arg => arg.startsWith('-')), 'usage: node scripts/check-release-smoke.mjs [--run] [candidate-directory]');
  const directory = resolve(args[0] ?? join(root, 'release'));
  if (!execute) { verifyHardwareEvidence(directory); console.log('PASS: fresh exact-candidate real microphone/finish/cancel/cleanup evidence.'); return; }
  // Retire old success before a new run. A failing/hung run cannot leave reusable
  // success behind. Only this ignored artifact is removed, never app/user data.
  const receiptPath = join(directory, 'release-smoke.json');
  if (existsSync(receiptPath)) unlinkSync(receiptPath);
  const before = candidateIdentity(directory), startedAt = new Date().toISOString();
  const result = runNativeProbe(join(directory, 'updater/HandsFree.app'));
  let probe;
  try { probe = JSON.parse(result.stdout?.trim()); } catch { /* Failure/timeout may have no stdout. Never print native stderr/device IDs. */ }
  if (probe?.schemaVersion === 1 && probe.probe === 'production-audio-v1') console.log(JSON.stringify(probe));
  requireThat(!result.error && result.status === 0 && !result.signal, `native probe failed (exit ${result.status ?? result.signal ?? 'timeout'}); no valid receipt written`);
  requireThat(probe, 'malformed/extra native stdout; no receipt written');
  const after = candidateIdentity(directory), finishedAt = new Date().toISOString();
  const receipt = { schemaVersion: 1, type: 'signed-candidate-hardware-smoke', startedAt, finishedAt, before, after, probe };
  validateReceipt(receipt, after);
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(`PASS: 3 real captures/finishes + first-PCM cancellation; exact candidate unchanged. Receipt: ${receiptPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
