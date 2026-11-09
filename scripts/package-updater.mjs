// Explicit maintainer action. Builds and packages a locally-signed app; never
// creates keys, installs, uploads, changes trust, or activates the public feed.
import { execFileSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
export function updaterFeed(version, signature, notes = '') {
  requireThat(/^\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$/.test(version), 'Expected a stable or numbered beta distribution version');
  requireThat(typeof signature === 'string' && signature.length > 0 && !/\s/.test(signature), 'Expected the signature file contents, not a path');
  return { version, notes: notes.slice(0, 4000), platforms: { 'darwin-aarch64': {
    url: `https://github.com/suhaasbadada/handsfree/releases/download/v${version}/HandsFree-${version}-macos-arm64.app.tar.gz`, signature,
  } } };
}
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
// This transaction cannot attest an earlier ignored build cache. It must build
// inside the same verified clean-source boundary used for final provenance.
export function buildReviewedSource({ source, snapshot, build, restore, cleanup }) {
  const before = source();
  requireThat(!before.status.trim(), 'Commit reviewed source before building updater artifacts');
  snapshot();
  let failed;
  try { build(); } catch (error) { failed = error; }
  restore(); // If this refuses, preserve the receipt and all unexpected changes.
  cleanup();
  if (failed) throw failed;
  const after = source();
  requireThat(after.commit === before.commit && !after.status.trim(), 'Source changed while building; updater provenance cannot be established');
  return before.commit;
}
export function main(args = process.argv.slice(2)) {
  requireThat(process.platform === 'darwin' && process.arch === 'arm64', 'Apple Silicon macOS is required');
  requireThat(args.length <= 1, 'Usage: node scripts/package-updater.mjs [output-directory]');
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  requireThat(!status.trim(), 'Commit reviewed source before packaging updater artifacts');
  const distribution = JSON.parse(readFileSync(join(root, 'src-tauri/distribution.json'), 'utf8'));
  requireThat(distribution.schemaVersion === 1, 'Unsupported distribution schema');
  const version = distribution.version;
  updaterFeed(version, 'validation');
  const output = resolve(args[0] ?? join(root, 'release/updater'));
  mkdirSync(output, { recursive: true });
  requireThat(realpathSync(output) === output, 'Refusing a symlinked output directory');
  const name = `HandsFree-${version}-macos-arm64.app.tar.gz`;
  const names = [name, `${name}.sig`, 'macos-arm64.json', 'SHA256SUMS', 'PROVENANCE.txt'];
  requireThat(names.every(name => !existsSync(join(output, name))), 'Updater output already exists; preserve it and choose another output directory');
  const receipt = join(output, '.mac-source-state.json');
  requireThat(!existsSync(receipt), 'A previous source receipt exists; investigate it before another build');
  const source = () => ({
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    status: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }),
  });
  const commit = buildReviewedSource({ source,
    snapshot: () => run('python3', ['scripts/windows-source-state.py', 'snapshot', '--platform', 'macos', '--state', receipt]),
    build: () => run('npm', ['run', 'build:local']),
    restore: () => run('python3', ['scripts/windows-source-state.py', 'restore', '--platform', 'macos', '--state', receipt]),
    cleanup: () => rmSync(receipt),
  });
  const app = join(root, 'src-tauri/target/release/bundle/macos/HandsFree.app');
  const executable = join(app, 'Contents/MacOS/handsfree');
  requireThat(existsSync(executable) && readFileSync(executable).includes(Buffer.from(`"version":"${version}"`)), 'Build the current distribution with npm run build:local first');
  const certificate = join(homedir(), 'Library/Application Support/HandsFree Local Signing/certificate.pem');
  const fingerprint = execFileSync('/usr/bin/openssl', ['x509', '-in', certificate, '-noout', '-fingerprint', '-sha1'], { encoding: 'utf8' }).trim().split('=').at(-1).replaceAll(':', '');
  requireThat(/^[a-fA-F0-9]{40}$/.test(fingerprint), 'Existing app signing certificate is required');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', `-R=identifier "com.handsfree.local" and certificate leaf = H"${fingerprint}"`, app]);
  run(process.execPath, ['scripts/check-macos-assets.mjs', app]);
  const keyDirectory = join(homedir(), 'Library/Application Support/HandsFree Updater Signing');
  const key = join(keyDirectory, 'handsfree-updater.key');
  for (const path of [keyDirectory, key]) {
    const stat = lstatSync(path);
    requireThat(!stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 'Updater signing material must be owned by the current user with no group/other access');
  }
  const config = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.macos.conf.json'), 'utf8'));
  requireThat(readFileSync(`${key}.pub`, 'utf8').trim() === config.plugins.updater.pubkey, 'Updater key differs from the public key embedded in this app; do not replace the key');
  const temporary = mkdtempSync(join(output, '.package-'));
  try {
    // OTA users do not mount the DMG. Carry dependency notices and corresponding
    // source inside the app they receive, then seal those resources with the
    // same macOS identity before creating the updater signature.
    const stagedApp = join(temporary, 'HandsFree.app');
    run('/usr/bin/ditto', [app, stagedApp]);
    const licenses = join(stagedApp, 'Contents/Resources/licenses');
    requireThat(!existsSync(licenses), 'Unexpected existing updater license staging resources');
    run('python3', ['scripts/release-notices.py', licenses]);
    copyFileSync(join(root, 'LICENSE'), join(licenses, 'LICENSE'));
    copyFileSync(join(root, 'docs/UPDATES.md'), join(licenses, 'UPDATES.md'));
    run('bash', ['scripts/local-signing.sh', '--sign', stagedApp]);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', `-R=identifier "com.handsfree.local" and certificate leaf = H"${fingerprint}"`, stagedApp]);
    const archive = join(temporary, name);
    // The app has already received the stable macOS signature. Creating this
    // archive during tauri build would archive the earlier ad-hoc signature.
    run('/usr/bin/tar', ['--no-xattrs', '-czf', archive, '-C', temporary, 'HandsFree.app']);
    const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PATH: key, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' };
    delete env.TAURI_SIGNING_PRIVATE_KEY;
    // The signer may print key-related diagnostics; never forward its output.
    try { run('npm', ['run', 'tauri', 'signer', 'sign', '--', '--app-version', version, archive], { env, stdio: 'pipe' }); }
    catch { throw new Error('Updater signing failed; output withheld to protect signing material. Existing keys were not changed.'); }
    const signature = readFileSync(`${archive}.sig`, 'utf8').trim();
    writeFileSync(join(temporary, 'macos-arm64.json'), JSON.stringify(updaterFeed(version, signature), null, 2) + '\n');
    writeFileSync(join(temporary, 'PROVENANCE.txt'), `Distribution: ${version}\nSource commit: ${commit}\nApp executable SHA-256: ${hash(join(stagedApp, 'Contents/MacOS/handsfree'))}\nPackaged with bundled notices after stable macOS signing; no installation or publication performed.\n`);
    // Exercise the same minisign verifier used by the official plugin, including
    // archive corruption and authenticated-version replay rejection. No install.
    run('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', 'updater::tests::signed_artifact_rejects_tampering_and_version_replay', '--', '--ignored', '--exact'], { env: { ...process.env, HANDSFREE_UPDATER_TEST_ARCHIVE: archive } });
    const covered = names.filter(name => name !== 'SHA256SUMS');
    writeFileSync(join(temporary, 'SHA256SUMS'), covered.map(name => `${hash(join(temporary, name))}  ${name}\n`).join(''));
    const finalSource = source();
    requireThat(finalSource.commit === commit && !finalSource.status.trim(), 'Source changed during updater packaging');
    for (const name of names) copyFileSync(join(temporary, name), join(output, name), constants.COPYFILE_EXCL);
    console.log(`Verified signed updater artifacts: ${output}. Not uploaded, installed, or activated.`);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
