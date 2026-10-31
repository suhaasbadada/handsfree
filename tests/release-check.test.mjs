import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { candidate, tag, validateMetadata, validateDraft, validateAvailability } from '../scripts/check-release.mjs';
import { release } from '../site/release.js';

const commit = 'a'.repeat(40), tree = 'b'.repeat(40);
const digest = text => createHash('sha256').update(text).digest('hex');
function fixture() {
  const provenance = `Candidate: ${candidate}\nSource commit: ${commit}\nSource tree: ${tree}\nWorking tree status at packaging (empty means clean):\n\nWorking tree status after packaging (empty means clean):\n\nBuilt on: 15.0\n`;
  const hashes = { [candidate]: digest('disk image'), 'PROVENANCE.txt': digest(provenance) };
  return { provenance, hashes, checksums: Object.entries(hashes).map(([name, hash]) => `${hash}  ${name}\n`).join(''), commit, tree, status: '' };
}
test('clean candidate has exact source commit/tree and both verified checksums', () => {
  assert.equal(validateMetadata(fixture()), commit);
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
  ['duplicate checksum', f => { f.checksums = `${f.checksums.split('\n')[0]}\n`.repeat(2); }, /duplicate/],
  ['path traversal', f => { f.checksums = f.checksums.replace('PROVENANCE.txt', '../PROVENANCE.txt'); }, /Invalid checksum/],
  ['extra checksum', f => { f.checksums += `${digest('x')}  other.dmg\n`; }, /exactly/],
]) test(`release audit rejects ${label}`, () => { const f = fixture(); mutate(f); assert.throws(() => validateMetadata(f), message); });

const sizes = { [candidate]: 123, 'PROVENANCE.txt': 456, SHA256SUMS: 789 };
test('draft audit requires the matching website manifest to remain unavailable', () => {
  assert.doesNotThrow(() => validateAvailability(release));
  for (const change of [{ publicAvailable: true }, { version: '0.1.0' }, { dmgUrl: release.dmgUrl.replace('.dmg', '.zip') }]) {
    assert.throws(() => validateAvailability({ ...release, ...change }), /manifest disabled/);
  }
});
function draft() { return { draft: true, prerelease: true, tag_name: tag, target_commitish: commit, assets: Object.entries(sizes).map(([name, size]) => ({ name, size, state: 'uploaded' })) }; }
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
]) test(`draft audit rejects ${label}`, () => { const d = draft(); mutate(d); assert.throws(() => validateDraft(d, commit, sizes), message); });

test('first-install guidance is concise, accessible, offline-aware and not an automatic consent bypass', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /<summary>First dictation & setup help<\/summary><ol>/);
  assert.match(source, /Use the copy in Applications before allowing permissions/);
  assert.match(source, /~148 MB.*dictation works offline/);
  assert.match(source, /aria-describedby="recording-limit-help"/);
  assert.match(source, /· Next recording/);
});
