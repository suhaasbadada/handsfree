import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
test('objc2 supplement bytes retain exact upstream texts and documented provenance', () => {
  for (const [license, checksum] of Object.entries({
    APACHE: '0c9a5f6fe28e27015e12506ffe58c9e007cead169af9670ec15c1df0d14e4f2a',
    MIT: 'f6a2e783669a0dd7a2c3b8a4f76db40ae49033e66e1bdc30f3aa25fe5577b070',
    ZLIB: 'fced3e7fedc235fa83ed0108b0df74d86b435d06436356f46917a903cbadd80a',
  })) assert.equal(createHash('sha256').update(read(`docs/licenses/objc2-LICENSE-${license}.txt`)).digest('hex'), checksum);
  const origin = read('docs/licenses/README.md').toString();
  for (const evidence of ['ee9a7ada2131f5944b8750428e265c15632f2a19', '6103078978', '6107377999', '2026-10-30']) assert.ok(origin.includes(evidence));
  assert.match(read('docs/licenses/objc2-LICENSE.md').toString(), /unclear whether distributing derived works/);
  const script = read('scripts/release-notices.py').toString();
  assert.match(script, /hashlib.sha256\(crate.read_bytes\(\)\).hexdigest\(\) != checksum/);
  assert.match(script, /THIRD_PARTY_SOURCES.tar.gz/);
  assert.doesNotMatch(script, /PUBLICATION BLOCKED/);
});
