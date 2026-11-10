// Read-only candidate audit. Never uploads, publishes, installs, or changes trust.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyCompiledAssets } from './check-macos-assets.mjs';
import { updaterFeed } from './package-updater.mjs';

export const candidate = 'HandsFree-0.1.1-beta.11-macos-arm64.dmg';
export const tag = 'v0.1.1-beta.11';
export const archiveName = 'HandsFree-0.1.1-beta.11-macos-arm64.app.tar.gz';
export const payloadNames = [candidate, 'PROVENANCE.txt', archiveName, `${archiveName}.sig`, 'UPDATER-PROVENANCE.txt', 'macos-arm64.json'];
export const names = [...payloadNames, 'SHA256SUMS'];
const repo = 'suhaasbadada/handsfree';
function requireThat(condition, message) { if (!condition) throw new Error(message); }

export function validateMetadata({ provenance, checksums, hashes, commit, tree, status }) {
  requireThat(/^[a-f0-9]{40}$/.test(commit) && /^[a-f0-9]{40}$/.test(tree), 'Full source commit/tree SHAs required');
  requireThat(!status.trim(), 'Current working tree is dirty; commit/rebuild before final audit');
  requireThat(provenance.startsWith(`Candidate: ${candidate}\nSource commit: ${commit}\nSource tree: ${tree}\n`), 'Candidate/source commit/tree mismatch');
  requireThat(provenance.includes('Working tree status at packaging (empty means clean):\n\nWorking tree status after packaging (empty means clean):\n\nBuilt on: '), 'Dirty or missing packaging provenance; rebuild from a clean commit');
  const lines = checksums.trim().split('\n');
  requireThat(lines.length === payloadNames.length, 'Checksum manifest must cover exactly the six public payload files');
  const seen = new Set();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([^/\\]+)$/.exec(line);
    requireThat(match && payloadNames.includes(match[2]) && !seen.has(match[2]), 'Invalid checksum filename, duplicate, or format');
    seen.add(match[2]);
    requireThat(hashes[match[2]] === match[1], `SHA-256 mismatch: ${match[2]}`);
  }
  return commit;
}

export function validateUpdaterMetadata(feed, signature, provenance, commit, executableHash) {
  const expected = updaterFeed(tag.slice(1), signature);
  requireThat(feed.version === expected.version && Object.keys(feed.platforms ?? {}).length === 1 &&
    feed.platforms?.['darwin-aarch64']?.url === expected.platforms['darwin-aarch64'].url &&
    feed.platforms['darwin-aarch64'].signature === signature, 'Updater feed version/target/canonical URL/signature mismatch');
  requireThat(provenance.startsWith(`Distribution: ${tag.slice(1)}\nSource commit: ${commit}\nApp executable SHA-256: ${executableHash}\n`), 'Updater source/version/executable provenance mismatch');
}

export function validateDraft(draft, commit, sizes) {
  requireThat(draft.draft === true && draft.prerelease === true && draft.tag_name === tag, 'Expected the versioned draft prerelease, not a public release');
  validateAssets(draft, commit, sizes);
}

export function validatePublic(release, commit, sizes) {
  requireThat(release.draft === false && release.prerelease === true && release.tag_name === tag, 'Expected the versioned public prerelease');
  validateAssets(release, commit, sizes);
}

function validateAssets(draft, commit, sizes) {
  requireThat(draft.target_commitish === commit, 'Draft target must be the exact full provenance commit SHA (not a branch or older commit)');
  const assets = draft.assets ?? [];
  for (const name of names) {
    const matches = assets.filter(asset => asset.name === name);
    requireThat(matches.length === 1 && matches[0].state === 'uploaded' && matches[0].size === sizes[name], `Missing/incomplete/wrong-size draft asset: ${name}`);
  }
  requireThat(!assets.some(asset => /\.(dmg|zip)$/i.test(asset.name) && asset.name !== candidate), 'Remove superseded installer assets from the draft');
  requireThat(assets.length === names.length && assets.every(asset => names.includes(asset.name)), 'Expected exactly seven versioned public assets');
}

export function validateAvailability(release, publicMode = false) {
  requireThat((publicMode || release.publicAvailable === false) && release.version === tag.slice(1) && release.dmgUrl === `https://github.com/${repo}/releases/download/${tag}/${candidate}`, 'Keep the matching website manifest disabled until a public asset is actually verified');
}

export function auditOptions(args) {
  const mode = ['--local', '--public'].includes(args[0]) ? args[0] : '--draft';
  if (mode !== '--draft') args = args.slice(1);
  requireThat(args.length <= 1 && !args.some(arg => arg.startsWith('-')), 'Usage: node scripts/check-release.mjs [--local | --public] [candidate-directory]');
  return { local: mode === '--local', publicMode: mode === '--public', directory: args[0] };
}

async function hash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();

function verifyApp(app, fingerprint, expectedVersion = '0.1.1') {
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', `-R=identifier "com.handsfree.local" and certificate leaf = H"${fingerprint}"`, app]);
  const plist = key => run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(app, 'Contents/Info.plist')]);
  requireThat(plist('CFBundleIdentifier') === 'com.handsfree.local' && (!expectedVersion || plist('CFBundleShortVersionString') === expectedVersion) && plist('LSMinimumSystemVersion') === '14.0', 'Unexpected bundle ID/version/minimum macOS');
  requireThat(run('/usr/bin/lipo', ['-archs', join(app, 'Contents/MacOS', plist('CFBundleExecutable'))]) === 'arm64', 'Expected Apple Silicon executable');
}

// Explicit lifecycle seam: importing this module installs no process handlers.
// Only the CLI supplies process.exit; library callers retain control of exit.
export function createAuditScope(temporary, { detach = mount => run('/usr/bin/hdiutil', ['detach', mount]), onInterrupt } = {}) {
  const mount = join(temporary, 'mounted');
  let attached = false, cleaned = false, failure, interrupted;
  const handlers = new Map();
  function detachMount() {
    if (failure) throw failure;
    if (!attached) return;
    try { detach(mount); attached = false; }
    catch (error) {
      failure = new Error(`Detach failed for ${mount}; preserved audit directory: ${temporary}. Unmount this exact mount before cleanup.`, { cause: error });
      console.error(failure.message);
      throw failure;
    }
  }
  function cleanup() {
    if (cleaned) { if (failure) throw failure; return; }
    cleaned = true;
    try {
      detachMount();
      rmSync(temporary, { recursive: true, force: true });
    } catch (error) {
      if (!failure) {
        failure = new Error(`Audit cleanup failed; preserved audit directory: ${temporary}`, { cause: error });
        console.error(failure.message);
      }
      throw failure;
    } finally {
      for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    }
  }
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const handler = () => {
      interrupted = code;
      try { cleanup(); }
      catch { /* cleanup already reported the preserved exact mount/directory */ }
      onInterrupt?.(code);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  return {
    mount, cleanup, detach: detachMount,
    markAttached() { requireThat(!cleaned, 'Audit scope already cleaned'); attached = true; },
    assertActive() { requireThat(!interrupted, `Release audit interrupted (${interrupted})`); },
  };
}

export async function main(args = process.argv.slice(2), { onInterrupt } = {}) {
  const { local, publicMode, directory: inputDirectory } = auditOptions(args);
  requireThat(process.platform === 'darwin' && process.arch === 'arm64', 'Apple Silicon macOS required for signature/payload audit');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const directory = resolve(inputDirectory ?? join(root, 'release'));
  validateAvailability((await import(pathToFileURL(join(root, 'site/release.js')).href)).candidateRelease, publicMode);
  const git = (...args) => run('git', args, { cwd: root });
  const commit = git('rev-parse', 'HEAD');
  const hashes = Object.fromEntries(await Promise.all(names.map(async name => [name, await hash(join(directory, name))])));
  validateMetadata({ provenance: readFileSync(join(directory, 'PROVENANCE.txt'), 'utf8'), checksums: readFileSync(join(directory, 'SHA256SUMS'), 'utf8'), hashes, commit, tree: git('rev-parse', 'HEAD^{tree}'), status: git('status', '--short', '--untracked-files=normal') });
  const temporary = mkdtempSync(join(tmpdir(), 'handsfree-release-audit-'));
  const scope = createAuditScope(temporary, { onInterrupt });
  const { mount } = scope;
  try {
    const cert = join(homedir(), 'Library/Application Support/HandsFree Local Signing/certificate.pem');
    const fingerprint = run('/usr/bin/openssl', ['x509', '-in', cert, '-noout', '-fingerprint', '-sha1']).split('=').at(-1).replaceAll(':', '');
    requireThat(/^[A-Fa-f0-9]{40}$/.test(fingerprint), 'Existing signing certificate fingerprint unavailable');
    if (existsSync('/Applications/HandsFree.app')) {
      // An installed older release need not have the candidate's version.
      // Still pin its identity, architecture and minimum OS; never replace it.
      verifyApp('/Applications/HandsFree.app', fingerprint, null);
      console.log('Existing Applications copy: signature, architecture and minimum OS verified (not installed or replaced by this audit).');
    }
    const dmg = join(directory, candidate);
    run('/usr/bin/codesign', ['--verify', '--strict', `-R=identifier "com.handsfree.local.disk-image" and certificate leaf = H"${fingerprint}"`, dmg]);
    run('/usr/bin/hdiutil', ['verify', dmg]);
    // Attempt detach even after a partial attach; never use force/global detach.
    mkdirSync(mount);
    scope.markAttached();
    run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, dmg]);
    verifyApp(join(mount, 'HandsFree.app'), fingerprint);
    verifyCompiledAssets(root, join(mount, 'HandsFree.app'));
    run('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', 'updater::tests::signed_artifact_rejects_tampering_and_version_replay', '--', '--ignored', '--exact'],
      { cwd: root, env: { ...process.env, HANDSFREE_UPDATER_TEST_ARCHIVE: join(directory, archiveName) } });
    const extracted = join(temporary, 'updater');
    run('python3', [join(root, 'scripts/check-updater-archive.py'), join(directory, archiveName), extracted]);
    const archivedApp = join(extracted, 'HandsFree.app');
    const preparedApp = join(directory, 'updater/HandsFree.app');
    const executableHash = await hash(join(archivedApp, 'Contents/MacOS/handsfree'));
    for (const app of [archivedApp, preparedApp]) {
      verifyApp(app, fingerprint);
      verifyCompiledAssets(root, app);
      for (const name of ['LICENSE', 'UPDATES.md', 'THIRD_PARTY_NOTICES/inventory.json', 'THIRD_PARTY_SOURCES.tar.gz']) {
        requireThat(statSync(join(app, 'Contents/Resources/licenses', name)).size > 0, `Missing bundled updater notice: ${name}`);
      }
      // Compare the entire sealed bundle, not only a shared executable version.
      run('/usr/bin/diff', ['-qr', join(mount, 'HandsFree.app'), app]);
      requireThat(await hash(join(app, 'Contents/MacOS/handsfree')) === executableHash, 'Updater/DMG/prepared executable mismatch');
    }
    requireThat(await hash(join(mount, 'HandsFree.app/Contents/MacOS/handsfree')) === executableHash, 'DMG executable mismatch');
    validateUpdaterMetadata(JSON.parse(readFileSync(join(directory, 'macos-arm64.json'), 'utf8')),
      readFileSync(join(directory, `${archiveName}.sig`), 'utf8').trim(),
      readFileSync(join(directory, 'UPDATER-PROVENANCE.txt'), 'utf8'), commit, executableHash);
    requireThat(readlinkSync(join(mount, 'Applications')) === '/Applications', 'Applications shortcut missing');
    const visible = readdirSync(mount).filter(name => !name.startsWith('.')).sort();
    requireThat(JSON.stringify(visible) === JSON.stringify(['Applications', 'HandsFree.app', 'Install HandsFree.txt', 'Licenses']), 'Unexpected visible disk-image root');
    for (const name of ['LICENSE', 'PUBLICATION-NOTES.txt', 'THIRD_PARTY_NOTICES/inventory.json', 'THIRD_PARTY_SOURCES.tar.gz', 'Documentation/README.md', 'Documentation/RELEASING.md', 'Documentation/release-readiness.md', 'Documentation/practice.md', 'Documentation/COMPATIBILITY-PASTE.md', `Documentation/releases/${tag}.md`]) {
      requireThat(statSync(join(mount, 'Licenses', name)).size > 0, `Missing license/documentation: ${name}`);
    }
    requireThat(readFileSync(join(mount, 'Install HandsFree.txt'), 'utf8').includes('Experimental beta — self-signed and not notarized'), 'Install guide must disclose experimental signing status');
    scope.detach();
    if (!local) {
      const api = path => JSON.parse(run('gh', ['api', `repos/${repo}/${path}`]));
      // GitHub's by-tag endpoint excludes drafts; enumerate authenticated releases
      // instead, including later pages, then pin the exact release ID.
      const releases = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${repo}/releases`])).flat();
      const matches = releases.filter(release => release.tag_name === tag);
      requireThat(matches.length === 1, 'Expected exactly one accessible versioned release');
      const draft = matches[0];
      const sizes = Object.fromEntries(names.map(name => [name, statSync(join(directory, name)).size]));
      const validateRelease = publicMode ? validatePublic : validateDraft;
      validateRelease(draft, commit, sizes);
      const refs = api(`git/matching-refs/tags/${tag}`).filter(ref => ref.ref === `refs/tags/${tag}`);
      requireThat(refs.length <= 1, 'Ambiguous release tag');
      if (publicMode) requireThat(refs.length === 1, 'Public release requires an existing remote source tag');
      if (refs.length) {
        let object = refs[0].object;
        for (let depth = 0; object.type === 'tag' && depth < 5; depth++) object = api(`git/tags/${object.sha}`).object;
        requireThat(object.type === 'commit' && object.sha === commit, 'Existing remote tag points at different source code');
      }
      // Size/metadata alone cannot prove bytes: download all seven assets.
      if (publicMode) {
        // No gh/token/header/cookie credentials: independently prove anonymous
        // public GET access and compare all downloaded bytes, not only HEAD/size.
        for (const name of names) run('/usr/bin/curl', ['--disable', '--fail', '--location', '--silent', '--show-error', '--proto', '=https', '--proto-redir', '=https', '--output', join(temporary, name), `https://github.com/${repo}/releases/download/${tag}/${name}`]);
      } else run('gh', ['release', 'download', tag, '--repo', repo, '--dir', temporary, ...names.flatMap(name => ['--pattern', name])]);
      for (const name of names) requireThat(await hash(join(temporary, name)) === hashes[name], `Draft bytes differ from local candidate: ${name}`);
      validateRelease(api(`releases/${draft.id}`), commit, sizes);
    }
    scope.assertActive();
    requireThat(git('rev-parse', 'HEAD') === commit && !git('status', '--short', '--untracked-files=normal'), 'Source changed during release audit');
    console.log(`PASS: ${commit} — checksums, clean provenance, stable signatures, arm64/macOS 14 bundle and DMG contents.${local ? '\nLOCAL ONLY: release target/tag/assets were NOT checked.' : publicMode ? '\nPublic prerelease target/tag and anonymous GET asset bytes match exactly.' : '\nDraft target/tag and downloaded asset bytes match exactly.'}\nArtifact audit only: no legal certification, Apple approval, or separate-Mac QA is implied.`);
  } finally {
    scope.cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2), { onInterrupt: code => process.exit(code) }).catch(error => { console.error(`Release audit failed: ${error.message}`); process.exitCode = 1; });
}
