import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { candidate, tag, archiveName, payloadNames, names, validateUpdaterMetadata, validateMetadata, validateDraft, validatePublic, validateAvailability, auditOptions } from '../scripts/check-release.mjs';
import { updaterFeed } from '../scripts/package-updater.mjs';
import { candidateRelease as release, release as publishedRelease } from '../site/release.js';

const commit = 'a'.repeat(40), tree = 'b'.repeat(40);
const digest = text => createHash('sha256').update(text).digest('hex');
function fixture() {
  const provenance = `Candidate: ${candidate}\nSource commit: ${commit}\nSource tree: ${tree}\nWorking tree status at packaging (empty means clean):\n\nWorking tree status after packaging (empty means clean):\n\nBuilt on: 15.0\n`;
  const hashes = Object.fromEntries(payloadNames.map(name => [name, digest(name === 'PROVENANCE.txt' ? provenance : `payload ${name}`)]));
  return { provenance, hashes, checksums: Object.entries(hashes).map(([name, hash]) => `${hash}  ${name}\n`).join(''), commit, tree, status: '' };
}
test('clean candidate has exact source commit/tree and six verified payload checksums', () => {
  assert.deepEqual(payloadNames, ['HandsFree-0.1.1-beta.12-macos-arm64.dmg', 'PROVENANCE.txt', 'HandsFree-0.1.1-beta.12-macos-arm64.app.tar.gz', 'HandsFree-0.1.1-beta.12-macos-arm64.app.tar.gz.sig', 'UPDATER-PROVENANCE.txt', 'macos-arm64.json']);
  assert.equal(validateMetadata(fixture()), commit);
});
for (const name of payloadNames) test(`manifest rejects altered ${name} bytes`, () => {
  const f = fixture();
  f.hashes[name] = digest('altered');
  assert.throws(() => validateMetadata(f), /SHA-256 mismatch/);
});
test('updater feed and provenance bind exact target, source, signature and executable', () => {
  assert.equal(archiveName, 'HandsFree-0.1.1-beta.12-macos-arm64.app.tar.gz');
  const signature = 'uploaded-signature';
  const executableHash = digest('sealed executable');
  const provenance = `Distribution: 0.1.1-beta.12\nSource commit: ${commit}\nApp executable SHA-256: ${executableHash}\n`;
  const verify = feed => validateUpdaterMetadata(feed, signature, provenance, commit, executableHash);
  const fresh = () => updaterFeed('0.1.1-beta.12', signature);
  assert.doesNotThrow(() => verify(fresh()));
  for (const mutate of [
    f => { f.version = '0.1.1-beta.6'; },
    f => { f.platforms['darwin-x86_64'] = f.platforms['darwin-aarch64']; },
    f => { f.platforms['darwin-aarch64'].url += '?download'; },
    f => { f.platforms['darwin-aarch64'].url = f.platforms['darwin-aarch64'].url.replace('.app.tar.gz', '.dmg'); },
    f => { f.platforms['darwin-aarch64'].signature = 'other'; },
  ]) { const feed = fresh(); mutate(feed); assert.throws(() => verify(feed), /feed/); }
  assert.throws(() => validateUpdaterMetadata(fresh(), signature, provenance, 'c'.repeat(40), executableHash), /provenance/);
  assert.throws(() => validateUpdaterMetadata(fresh(), signature, provenance, commit, digest('earlier app')), /provenance/);
});
for (const [label, mutate, message] of [
  ['dirty current tree', f => { f.status = ' M src/main.ts'; }, /working tree is dirty/],
  ['dirty start provenance', f => { f.provenance = f.provenance.replace('clean):\n\nWorking', 'clean):\n M src/main.ts\n\nWorking'); }, /Dirty or missing/],
  ['dirty end provenance', f => { f.provenance = f.provenance.replace('clean):\n\nBuilt', 'clean):\n?? new-file\n\nBuilt'); }, /Dirty or missing/],
  ['different source commit', f => { f.commit = 'c'.repeat(40); }, /commit\/tree mismatch/],
  ['different source tree', f => { f.tree = 'c'.repeat(40); }, /commit\/tree mismatch/],
  ['abbreviated SHA', f => { f.commit = 'abcdef0'; }, /Full source/],
  ['ZIP candidate', f => { f.provenance = f.provenance.replace('.dmg', '.zip'); }, /mismatch/],
  ['bad DMG bytes', f => { f.hashes[candidate] = digest('other image'); }, /SHA-256 mismatch/],
  ['bad provenance bytes', f => { f.hashes['PROVENANCE.txt'] = digest('other provenance'); }, /SHA-256 mismatch/],
  ['missing provenance checksum', f => { f.checksums = f.checksums.split('\n')[0]; }, /exactly/],
  ['duplicate checksum', f => { f.checksums = `${f.checksums.split('\n')[0]}\n`.repeat(6); }, /duplicate/],
  ['path traversal', f => { f.checksums = f.checksums.replace('PROVENANCE.txt', '../PROVENANCE.txt'); }, /Invalid checksum/],
  ['extra checksum', f => { f.checksums += `${digest('x')}  other.dmg\n`; }, /exactly/],
]) test(`release audit rejects ${label}`, () => { const f = fixture(); mutate(f); assert.throws(() => validateMetadata(f), message); });

const sizes = Object.fromEntries(names.map((name, index) => [name, 123 + index]));
test('draft audit requires the matching website manifest to remain unavailable', () => {
  assert.equal(tag, 'v0.1.1-beta.12');
  assert.equal(candidate, 'HandsFree-0.1.1-beta.12-macos-arm64.dmg');
  assert.equal(release.publicAvailable, false);
  assert.throws(() => validateAvailability(publishedRelease), /manifest disabled/);
  assert.doesNotThrow(() => validateAvailability(release, true), 'Public mode accepts matching beta 12 candidate coordinates without activating downloads');
  assert.doesNotThrow(() => validateAvailability(publishedRelease, true), 'Public mode accepts the now-verified matching active coordinates; default draft mode still rejects them');
  for (const version of ['beta.5', 'beta.6', 'beta.7', 'beta.8', 'beta.9', 'beta.10', 'beta.11']) {
    const historical = { ...release, version: `0.1.1-${version}`, dmgUrl: release.dmgUrl.replaceAll('beta.12', version) };
    for (const publicMode of [false, true]) {
      assert.throws(() => validateAvailability(historical, publicMode), /manifest disabled/, 'Earlier versions cannot substitute for the beta 12 artifact');
    }
  }
  assert.doesNotThrow(() => validateAvailability({ ...release, publicAvailable: false }));
  for (const change of [{ publicAvailable: true }, { version: '0.1.0' }, { dmgUrl: release.dmgUrl.replace('.dmg', '.zip') }]) {
    assert.throws(() => validateAvailability({ ...release, ...change }), /manifest disabled/);
  }
});
function draft() { return { draft: true, prerelease: true, tag_name: tag, target_commitish: commit, assets: Object.entries(sizes).map(([name, size]) => ({ name, size, state: 'uploaded' })) }; }
test('public mode is explicit, mutually exclusive and keeps identity checks', () => {
  assert.deepEqual(auditOptions([]), { local: false, publicMode: false, directory: undefined });
  assert.deepEqual(auditOptions(['--public', 'release']), { local: false, publicMode: true, directory: 'release' });
  for (const args of [['--public', '--local'], ['--local', '--public'], ['--unknown']]) assert.throws(() => auditOptions(args), /Usage/);
  assert.doesNotThrow(() => validateAvailability(release, true));
  assert.doesNotThrow(() => validateAvailability({ ...release, publicAvailable: true }, true));
  assert.throws(() => validateAvailability({ ...release, version: '0.2.0' }, true));
  const published = { ...draft(), draft: false };
  assert.doesNotThrow(() => validatePublic(published, commit, sizes));
  assert.throws(() => validatePublic(draft(), commit, sizes), /public prerelease/);
  for (const change of [{ prerelease: false }, { tag_name: 'other' }, { target_commitish: 'main' }, { assets: [] }]) assert.throws(() => validatePublic({ ...published, ...change }, commit, sizes));
});
test('draft is versioned, unpublished, exact full-SHA target and uploaded asset set', () => {
  assert.doesNotThrow(() => validateDraft(draft(), commit, sizes));
});
for (const [label, mutate, message] of [
  ['older draft target', d => { d.target_commitish = 'c'.repeat(40); }, /exact full provenance commit/],
  ['branch draft target', d => { d.target_commitish = 'main'; }, /exact full provenance commit/],
  ['public release', d => { d.draft = false; }, /draft prerelease/],
  ['stable release', d => { d.prerelease = false; }, /draft prerelease/],
  ['different tag', d => { d.tag_name = 'v0.1.0'; }, /draft prerelease/],
  ['missing asset', d => { d.assets.pop(); }, /Missing/],
  ['incomplete upload', d => { d.assets[0].state = 'starter'; }, /incomplete/],
  ['wrong asset size', d => { d.assets[0].size++; }, /wrong-size/],
  ['duplicate asset', d => { d.assets.push(d.assets[0]); }, /Missing\/incomplete/],
  ['old ZIP', d => { d.assets.push({ name: 'HandsFree-old.zip' }); }, /superseded/],
  ['old DMG', d => { d.assets.push({ name: 'HandsFree-old.dmg' }); }, /superseded/],
  ['extra updater archive', d => { d.assets.push({ name: 'HandsFree-old.app.tar.gz' }); }, /exactly seven/],
]) test(`draft audit rejects ${label}`, () => { const d = draft(); mutate(d); assert.throws(() => validateDraft(d, commit, sizes), message); });

test('first-install actions stay visible, offline-aware and explicitly initiated', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<details\b|<summary\b/);
  assert.match(source, /Download English model \(~148 MB\)/);
  assert.match(source, /Works offline afterward/);
  assert.match(source, /title="Applies to the next recording"/);
  assert.match(source, /el\('mic'\)\.onclick = \(\) => void action\('request_microphone'\)/);
  assert.match(source, /el\('overview-download'\)\.onclick = \(\) => void downloadModel\(\)/);
});
