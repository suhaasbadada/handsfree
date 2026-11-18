import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
// Historical receipt assertions operate on the intact pre-beta-23 guide suffix.
const beta22ReleaseGuide = () => {
  const guide = read('docs/RELEASING.md');
  const start = guide.indexOf('# Release packaging\n');
  assert.ok(start > 0, 'Beta 23 preparation prepends the intact historical guide');
  return guide.slice(start);
};

test('active docs disclose stable while historical beta notes and app identity remain unchanged', () => {
  assert.match(read('README.md'), /!\[Mac stable: v0\.1\.7\]\(https:\/\/img.shields.io\/badge\/Mac_stable-v0\.1\.7-a64a45.svg\)/);
  assert.match(read('docs/releases/v0.1.1-beta.2.md'), /# HandsFree v0\.1\.1-beta\.2/);
  assert.match(read('docs/releases/v0.1.1-beta.2.md'), /Prerelease · Beta testing/);
  assert.match(read('docs/INSTALL.md'), /# Install HandsFree \(Mac stable\)/);
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(config.productName, 'HandsFree');
  assert.equal(config.identifier, 'com.handsfree.local');
});

test('Published Mac stable matches the audited embedded version', async () => {
  const { release, candidateRelease } = await import('../site/release.js');
  const { candidate, tag } = await import('../scripts/check-release.mjs');
  const version = JSON.parse(read('package.json')).version;
  assert.equal(version, '0.1.7');
  assert.equal(JSON.parse(read('package-lock.json')).version, version);
  assert.equal(JSON.parse(read('package-lock.json')).packages[''].version, version);
  assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version, version);
  assert.equal(release.version, '0.1.7');
  assert.equal(release.publicAvailable, true, 'Activation follows publication and public asset verification');
  assert.equal(candidateRelease.version, version);
  assert.equal(candidateRelease.publicAvailable, false, 'Candidate must not activate public downloads');
  assert.ok(release.dmgUrl.endsWith(`/releases/download/v${release.version}/HandsFree-${release.version}-macos-arm64.dmg`));
  assert.equal(release.dmgUrl, candidateRelease.dmgUrl, 'Activation selects the audited candidate');
  assert.equal(candidateRelease.schemaVersion, 1);
  assert.match(candidateRelease.status, /Stable v0\.1\.7 signed candidate accepted and published/);
  assert.match(candidateRelease.status, /pending/);
  assert.match(candidateRelease.status, /self-signed, not notarized/i);
  assert.equal(JSON.parse(read('src-tauri/distribution.json')).version, candidateRelease.version);
  assert.equal(tag, `v${candidateRelease.version}`);
  assert.equal(candidate, `HandsFree-${candidateRelease.version}-macos-arm64.dmg`);
  assert.ok(candidateRelease.dmgUrl.endsWith(`/releases/download/${tag}/${candidate}`));
  assert.ok(read(`docs/releases/${tag}.md`).includes(`Internal app version: **${version}**`));
});

test('v0.1.2 activation preserves its preparation record and prior stable feed bytes', () => {
  const notes = read('docs/releases/v0.1.2.md');
  const preparation = notes.slice(notes.indexOf('# HandsFree v0.1.2 — planned stable release\n'));
  assert.equal(createHash('sha256').update(preparation).digest('hex'),
    '00d799bf0c836f03b9e470daa5133003effee048aca89aaf199470b0e7c1a8a3');
  assert.equal(createHash('sha256').update(read('docs/releases/artifacts/v0.1.1-macos-arm64.json')).digest('hex'),
    '783a4c1ac21a69e5da782b06e59e29a3716d051bd92973182da434d30ca52fa7',
    'Previous signed stable feed remains a byte-identical historical artifact');
});

test('beta 24 activation preserves all prior guide, notes and Windows release bytes', () => {
  const guide = read('docs/RELEASING.md');
  assert.ok(guide.startsWith('## Stable v0.1.1 publication and distribution activation — 2026-11-17\n'));
  assert.equal(createHash('sha256').update(guide.slice(guide.indexOf('## Stable v0.1.1 PREPARATION — 2026-11-17\n'))).digest('hex'),
    '8186a94749588d6573109efa20bc0f9898f847e9c8c52d6fbc0b0b0f7d8a3336',
    'Complete prior guide including stable preparation remains byte-identical');
  const notes = read('docs/releases/v0.1.1.md');
  assert.equal(createHash('sha256').update(notes.slice(notes.indexOf('# HandsFree v0.1.1 — stable candidate preparation\n'))).digest('hex'),
    '4a63a9a1f2cdb96a0e1b6e05bc0b4cd849075a0ab9d4a7c6cd07e40ad68fdfce',
    'Original stable preparation record remains byte-identical');
  const history = guide.slice(guide.indexOf('## Beta 24 publication — exact signed candidate\n'));
  assert.equal(createHash('sha256').update(history).digest('hex'),
    'a815c86e5c6754b2f03d36053ecf69443dbf38d8f185efce05afa9ec7ab033ce',
    'Entire pre-stable guide remains byte-identical');
  assert.equal(createHash('sha256').update(read('docs/releases/v0.1.1-beta.24.md')).digest('hex'),
    '44bc0e1c467e04ff1a81a56f3c04eecd45be2a75c78090b736dce66d138df2db');
  const preparation = guide.slice(guide.indexOf('## Beta 24 candidate preparation\n'));
  assert.equal(createHash('sha256').update(preparation).digest('hex'),
    '2d648b3783f7b850ab65b242da6c0c94a1c85fef8aaaecf444b407d455df0e97',
    'Complete pre-activation guide remains byte-identical, including beta 24 preparation');
  const prior = guide.slice(guide.indexOf('## Beta 23 publication — exact signed candidate\n'));
  assert.equal(createHash('sha256').update(prior).digest('hex'),
    '3df627c0d5e669278ef3c860882d96b0bfe17d42e594eba4d012f6cac59a9e3d',
    'Entire beta 23 publication/preparation and older guide remain byte-identical');
  const historical = createHash('sha256');
  for (let beta = 6; beta <= 23; beta++) historical.update(read(`docs/releases/v0.1.1-beta.${beta}.md`));
  assert.equal(historical.digest('hex'), '645882b57b4510e20b97d8d3e0d2954f933499701147c88ed91b6a387d035ef6');
  for (const [name, hash] of [
    ['windowsRelease', 'ad8b3df4266efb3b3ea9d037cc8a03ee71cf8db3556cd6491896d7629954dd62'],
  ]) {
    const object = read('site/release.js').match(new RegExp(`export const ${name} = Object.freeze\\(\\{[\\s\\S]*?\\n\\}\\);`))?.[0];
    assert.ok(object, name);
    assert.equal(createHash('sha256').update(object).digest('hex'), hash, `${name} stays byte-identical during preparation`);
  }
});

test('beta 24 publication pins exact candidate evidence and preserves the original preparation record', () => {
  const notes = read('docs/releases/v0.1.1-beta.24.md');
  const original = '# HandsFree v0.1.1-beta.24\n\n' + notes.slice(notes.indexOf('Unpublished experimental Mac candidate'));
  assert.equal(createHash('sha256').update(original).digest('hex'),
    '6b3684433cbc48fd9a498f04e1dab6d55702c67fc55d4d3a038620a4969f6167');
  const published = notes.split('## Historical preparation checkpoint')[0];
  assert.match(published, /Published experimental Mac beta/);
  assert.doesNotMatch(published, /Unpublished experimental Mac candidate/);
  for (const source of [published, read('docs/RELEASING.md').split('## Beta 24 candidate preparation')[0]]) {
    for (const evidence of ['b20bb12f4c5281e7632b43c97c32cf3b81968029', '44046181154',
      '51af2dec59d43510061e8199626bbf05f38392e33fa36c482f779df396d4a2ff',
      '48b4043be67abba130176b9404c8ea864fc9d149e2bd530b542975e8935fc357',
      '8d69bbd5e5c23679c97c27712a8ff46b6a823038f8a861aebd131e892e371388',
      'e205e12e5f9dedb20e8146813184ad2dd3306d6c06456c1df2eaecbec20ffdb3',
      '145.2 / 108.3 / 105.3 / 93.0', '246.9 / 209.2', 'Physical Fn',
      'node scripts/publish-release.mjs --publish release', 'user', 'installed',
      'OTA/restart', 'pending', 'Homebrew', 'clipboard']) assert.ok(source.includes(evidence), evidence);
  }
});

test('beta 24 checkpoints distinguish implementation, earlier verification and pending exact-candidate gates', () => {
  const notes = read('docs/releases/v0.1.1-beta.24.md').replace(/\s+/g, ' ');
  for (const checkpoint of ['Unpublished experimental Mac candidate', 'Internal app version: **0.1.1**',
    'Remove sidebar', 'Settings entry', 'Prioritize Settings', 'select affordances',
    'microphone help', 'Honest health colors', 'Remove Setup guide', 'Minimal copy',
    'Home context merge is intentional', 'eligibility is **not** native authorization',
    'Updates.installing', 'pending-check revocation', 'certified preaccept reconciliation',
    'beta 24 checkpoints', 'Beta 23 receipts cannot substitute',
    'node scripts/publish-release.mjs --publish release', "installed app's in-app OTA/restart",
    'Exit beta only after user satisfaction', '943c87c']) assert.ok(notes.includes(checkpoint), checkpoint);
});

test('beta 22 publication documents audited source and capture-first scope without manufacturing hardware receipts', () => {
  const notes = read('docs/releases/v0.1.1-beta.22.md');
  for (const evidence of ['Published experimental Mac beta', 'Internal app version: **0.1.1**',
    'v0.1.1-beta.21', 'completion', 'no idle microphone', 'owner/FIFO/generation/epoch',
    'SessionCueOutput.playIfAllowed', 'after blocking output validation', '32 px',
    'WebKit', '48 real offscreen WebKit', 'negative control', 'Metadata refresh',
    'BLOCKED', 'permission timeout', 'zero capture admissions', '1293 ms', '220 ms',
    '180 ms', '1767 ms', 'not beta 22 measurements', 'not** promise instant cold',
    'not driven by the headless harness', 'b777c551d4e64110d500e8ecfebcf1488c855e5e',
    '44004684790', 'anonymous-public seven-asset audits passed', 'explicitly authorized',
    '324 passed / 1 skipped', '90 passed / 3 ignored', 'separate pending gates owned by the primary',
    '81154c3c735018723870f98d9158bedd6274342997160f3c8f94f575dba1cf30',
    '35d4bdbcfda979d28f124227e44f423c9479d0cf7157017dd59d41c5d45985eb',
    '03f139757fd661b22d21e06e97e8f4e3be5c68d859bca3e04ecf8a9613325912',
    'beta21-before-beta22-u4q3o7hg', 'remain **unverified**']) {
    assert.ok(notes.replace(/\s+/g, ' ').includes(evidence), evidence);
  }
  const guide = beta22ReleaseGuide();
  const candidateStart = guide.indexOf('## Beta 22 candidate preparation');
  const priorStart = guide.indexOf('## Beta 21 publication');
  assert.ok(candidateStart > 0 && candidateStart < priorStart);
  const publicationStart = guide.indexOf('## Beta 22 publication');
  assert.ok(publicationStart > 0 && publicationStart < candidateStart);
  const previousGuide = guide.slice(0, publicationStart) + guide.slice(priorStart);
  const preparedGuide = guide.slice(0, publicationStart) + guide.slice(candidateStart);
  assert.equal(createHash('sha256').update(preparedGuide).digest('hex'),
    '3b20cd9db757f0336b89861a7c7a2a2e6d7aa8c4d64077497e0caf9e4bda777d',
    'Publication prepends receipts without altering candidate preparation or any prior guide byte');
  assert.equal(createHash('sha256').update(read('docs/releases/v0.1.1-beta.21.md')).digest('hex'),
    'd872890c45dd2a235b379bad85c5df0de39633ee3b04959c3417fa7e7010d301',
    'Historical beta 21 notes remain byte-identical');
  assert.equal(createHash('sha256').update(previousGuide).digest('hex'),
    '34b03f3f72bf9c4d76fcbf88b42a9b76fa259bab3bb8c1273bd335aca23b264b',
    'Beta 22 publication preserves all existing guide bytes, including beta 6–21 evidence');
});

test('beta 23 publication preserves dated candidate diagnostics and the complete prior guide and beta 22 notes', () => {
  const notes = read('docs/releases/v0.1.1-beta.23.md').replace(/\s+/g, ' ');
  for (const evidence of ['Unpublished experimental Mac candidate', 'Internal app version: **0.1.1**',
    'notification before first PCM', 'read-only certification', 'device UID',
    'revision-bound', 'provisional', 'whole capture', 'Final drain certification',
    'before EOS/success', 'Joffrey', 'missing final-hook fail-open', 'fail-closed guard',
    'owner/FIFO/epoch/generation', '3s watchdog', 'no added wait, retry, idle microphone',
    'Three real-hardware', 'isolated scratch app', 'existing installed signing identity',
    '35,200 converted frames in 23 packets', '44.1 kHz mono', 'one preparation',
    '249.866 / 250.033 / 251.661 ms', 'not attempt order', 'zero failures',
    'captureReleased: true', '625 installed/model/data files', '48813',
    'Audio was discarded', 'MacBook Air Microphone', 'Bluetooth coverage is not claimed', 'acoustic audibility',
    'OTA replacement/restart remain **unverified**', '325 Node tests passed / 1 skipped',
    '90 Rust tests passed / 3 ignored', 'strict Clippy passed', 'exact-source CI',
    'No beta 23 artifact SHA', 'signed feed remain on published beta 22']) {
    assert.ok(notes.includes(evidence), evidence);
  }
  assert.equal(createHash('sha256').update(beta22ReleaseGuide()).digest('hex'),
    'f9fa073caec49249383eb3531e38b97405a8c35b68f1ad456292ada00e154772',
    'Every byte of the pre-beta-23 guide remains intact, including historical active wording');
  assert.equal(createHash('sha256').update(read('docs/releases/v0.1.1-beta.22.md')).digest('hex'),
    '66caecf578fe4a3749e6967a8be07e95b8400d1969b946b97ac28d542dbe3eaf',
    'Published beta 22 evidence is immutable');
});

test('beta 23 publication pins final candidate evidence and retains all preparation bytes', () => {
  const historical = createHash('sha256');
  for (let beta = 6; beta <= 22; beta++) historical.update(read(`docs/releases/v0.1.1-beta.${beta}.md`));
  historical.update(read('docs/FEATURE-RELEASES.md'));
  assert.equal(historical.digest('hex'),
    '1560900691182b7094d12f1c30497cc12646481ad6863d66bb3bf27fcfd371cf',
    'All beta 6–22 notes and FEATURE ledger remain byte-identical');
  const guide = read('docs/RELEASING.md');
  const preparation = guide.slice(guide.indexOf('## Beta 23 candidate preparation\n'));
  assert.equal(createHash('sha256').update(preparation).digest('hex'),
    '3679900b4235da85a9c629c46daacebebd355cfc17d685acdf2064f2a29797d9',
    'Publication prepends receipts without rewriting preparation or historical guide');
  for (const source of [guide, read('docs/releases/v0.1.1-beta.23.md')]) {
    for (const evidence of ['c1922f013777fe5dde66d173d3ec640d69696a79', '44020869412',
      '9673e1cd9905d054ae6740b286e94c8c710c94b5b72ab5fe99660a05c5cf52b0',
      '1b0db63d0ebb15661c5613bc26677d6a66f7fce63cd2ddfd6c9db4c1aa530f55',
      'ebb23392111c75095d1881c05a6d6e6287ac6460413619e5f92de35f0f3614ae',
      '232.888 / 189.926 /', '188.204 ms', '208.38 ms', '**pending**']) {
      assert.ok(source.includes(evidence), evidence);
    }
  }
  const policy = read('AGENTS.md');
  for (const evidence of ['scripts/publish-release.mjs --publish release',
    'Green CI is not hardware evidence', 'failed/stale/mismatched',
    "installed app's in-app OTA/restart", 'manual app replacement']) {
    assert.ok(policy.includes(evidence), evidence);
  }
});

test('beta 21 published notes distinguish audited publication from pending deployment and installed acceptance', () => {
  const notes = read('docs/releases/v0.1.1-beta.21.md');
  for (const evidence of ['Published experimental Mac beta', 'Internal app version: **0.1.1**',
    'preaccept validation', 'after output preparation', 'three-second hardware',
    'three-second cue/handoff', 'two-attempt', 'FIFO', 'generation/epoch',
    'cue-period PCM is discarded', 'quiescent phase', 'native waveform levels only',
    'Light/Dark/System', '315 passed / 1 skipped', '3 ignored', 'Joffrey',
    '2.585s', '2.807s', '3.003s', '3.039s', '11,200 samples / 8 callbacks',
    'failed attempt is not a pass', 'acoustic audibility', 'installed dictation',
    'actual OTA', 'separate pending gates owned by the primary',
    '26b07229cd8013df0a0f19af3f647f313245205b', '43984857612',
    'b1bafe4f75418fef6b73062a237ee64be0eb8596b989699e3b5e3c3fbd4888d0',
    '8cc430e337f6565d9d8bacd6e1a4cf81ea8ae2314f1b46ea0fe5e57e2e3e6500',
    '9589d08c6dac19ef60cfc6bbbfd4e52f07d4cde615346a6485162ee464a8cb27',
    'beta20-before-beta21-zp8vy_yg', '322 passed / 1 skipped']) {
    assert.ok(notes.includes(evidence), evidence);
  }
  const guide = read('docs/RELEASING.md');
  assert.ok(guide.indexOf('## Beta 21 publication') < guide.indexOf('## Beta 21 candidate preparation'));
  assert.ok(guide.indexOf('## Beta 21 candidate preparation') < guide.indexOf('## Beta 20 publication'));
  for (const receipt of ['26b07229cd8013df0a0f19af3f647f313245205b', '43984857612',
    'b1bafe4f75418fef6b73062a237ee64be0eb8596b989699e3b5e3c3fbd4888d0',
    '8cc430e337f6565d9d8bacd6e1a4cf81ea8ae2314f1b46ea0fe5e57e2e3e6500',
    '9589d08c6dac19ef60cfc6bbbfd4e52f07d4cde615346a6485162ee464a8cb27']) {
    assert.ok(guide.includes(receipt), receipt);
  }
  assert.doesNotMatch(notes, /No beta 21 signed artifacts|No publication or metadata activation is claimed/);
  assert.equal(createHash('sha256').update(read('docs/releases/v0.1.1-beta.20.md')).digest('hex'),
    'c6a5beee0f48a57e40abfdc8f12db2aaa8a0be8a90b4e26f222350b2920bf9f5',
    'Beta 21 activation preserves historical beta 20 notes byte-for-byte');
});

test('beta 13 publication notes separate audited artifacts from pending deployment and OS acceptance', () => {
  const notes = read('docs/releases/v0.1.1-beta.13.md');
  for (const evidence of ['Published experimental Mac beta', 'Internal app version: **0.1.1**',
    'OS-authoritative', 'Approval-required is not', 'Cancel pending registration',
    'ephemeral', 'shortcut starts only', 'Start\n  test', 'persisted bundle IDs',
    'regular running-app', 'generation-bound', 'Control::Finish(Some(generation))',
    'already accepted recording', 'cue-waiting', 'synthetic routing/hit-test',
    'Actual AppKit/window ordering', '**unverified**', 'microphone hardware',
    'OTA replacement/restart', 'No AI features, new models', 'transcript history, snippets',
    'existing signing identity', 'Do not manually replace the installed app',
    'exact-source anonymous public audit', 'aed1c5c213639958b3b418e54c2330b9ebc80e76',
    '/actions/runs/42775050746', '48eee3b3684875b11c586ea4af9fec22fdefe150485db1f53f21e4e6f85a184e',
    '17308d0483e7d9820d9d585b4038c128ccc9637ecd70707c02dcba457de02271',
    '055169ccc4670c7f8b5c19f018920e9bae4cbc365e0472a0b47d3a14ccb0e675',
    'beta12-before-beta13-dsrbi6sn', 'remain pending gates before group 4',
    'group 4 / beta 14']) assert.ok(notes.includes(evidence), evidence);
  const guide = read('docs/RELEASING.md');
  assert.ok(guide.includes('## Beta 13 publication and metadata activation (group 3)'));
  assert.ok(guide.includes('release/site/feed/README/install metadata selected'));
  assert.ok(guide.includes('aed1c5c213639958b3b418e54c2330b9ebc80e76'));
  assert.doesNotMatch(notes, /Unpublished experimental|No beta 13 clean-source SHA/);
  const ledger = read('docs/FEATURE-RELEASES.md');
  for (const evidence of ['Group 3 publication evidence — COMPLETE',
    'aed1c5c213639958b3b418e54c2330b9ebc80e76', '42775050746',
    'e6c13c991884fc5b3e9da75b85256845fee181b4', '42776429338',
    '777c6b32cafa18444a1c437b3960a8685c721861', '42776388356',
    '42776429267', '99fd55f03f905b079915aededd7a7c3870b85d81', '42778706884',
    'Live beta 13 website/feed byte readback',
    '055169ccc4670c7f8b5c19f018920e9bae4cbc365e0472a0b47d3a14ccb0e675',
    'group 4 / beta 14']) assert.ok(ledger.includes(evidence), evidence);
});

test('beta 15 publication documents appearance, cached update status and separate acceptance gates', () => {
  const notes = read('docs/releases/v0.1.1-beta.15.md');
  for (const scope of ['Internal app version: **0.1.1**', 'Light, Dark and System',
    'defaulting to System', 'isolated Store field', 'native WKWebView and capsule',
    'removes the native override', 'paper,', 'ink and muted-red', 'cream primary-button',
    'warm', 'website remains light-only', 'not a brand repaint', 'verified available version',
    'at last check', 'failed checks', 'local cached status only', 'unsolicited feed checks',
    'auto-install', 'Fixed footer', 'before confirmation', 'once-only signed updater',
    'four completed beta 11–14', 'v0.1.1-beta.14', 'coordinates are disabled',
    'Do not manually replace', 'updater keys', 'usage statistics', 'VoiceOver/AXPress',
    'real OTA', '**unverified**']) assert.ok(notes.includes(scope), scope);
  assert.match(read('docs/RELEASING.md'), /## Beta 15 publication and metadata activation/);
  for (const source of [notes, read('docs/RELEASING.md')]) {
    for (const evidence of ['3641d4cd5ac7a1081bc3f1f0bbf9d0d6acb6d7e4', '42921056595',
      '208f178256c9ede3327e290bfe84d4e5b9577da53801b6ca834aa88acc4cf86f',
      'ecd1578546cf9df2b5bfafaf894bbb8209b645c1fa0074ce157c4a87a4ede398',
      '580764c93b4aed5b68dae7ebd9df2f7362675939295321fa0d3aac8a4ae03e39',
      'beta14-before-beta15-_wpbr0gq', 'Pages', 'Homebrew']) assert.ok(source.includes(evidence), evidence);
  }
  assert.match(notes, /Published experimental Mac beta/);
  assert.doesNotMatch(notes, /Candidate experimental|No beta 15 clean artifact source/);
});

test('beta 17 publication records exact receipts without claiming deployment or hardware acceptance', () => {
  const notes = read('docs/releases/v0.1.1-beta.17.md');
  for (const evidence of ['Published experimental Mac beta', 'Internal app version: **0.1.1**',
    'Three installed-app SIGABRT', 'November 12, 2026', 'AudioCapture.start',
    '24 kHz', '48 kHz', 'fresh post-cue', 'nil', 'device UID', 'Objective-C',
    'NSExceptions', 'before startup', 'Locked invalidation', 'PCM delivery',
    'independently', 'generation-bound', 'no automatic retries', 'silent device switches',
    '307 passed', '1 skipped', '90 passed, 3 ignored', 'Joffrey', '4 targeted',
    'no findings', 'do not instantiate', 'AVAudioEngine', '**unverified**',
    'candidateRelease.publicAvailable']) {
    assert.ok(notes.includes(evidence), evidence);
  }
  const guide = read('docs/RELEASING.md');
  assert.ok(guide.indexOf('## Beta 17 publication') < guide.indexOf('## Beta 16 publication'));
  for (const source of [notes, guide]) {
    for (const evidence of ['9c0ab6affb8dca95d74fa48ae10248b51f765236', '43522974823',
      '580568cb5da52a42e26e4bbb247105eacbed2187dbc05733bcdd7d9f740fb82e',
      '607dd8b4867712b68aa97f9d130e9bdb93c688dccca2b867d032cb0c17d65b62',
      'cb298141bcaa187fe9203e648a27492552c9dc83b6eddfaeb191857bb06170e3',
      'beta16-before-beta17-fvlf54mz', 'Activation CI', 'Pages', 'Homebrew',
      'tap CI remain separate pending gates']) assert.ok(source.includes(evidence), evidence);
  }
  assert.doesNotMatch(notes, /Unpublished experimental|No beta 17 clean artifact source|remain on\s+audited \*\*beta 16/);
});

test('beta 16 publication records exact receipts without claiming activation or runtime acceptance', () => {
  const notes = read('docs/releases/v0.1.1-beta.16.md');
  for (const scope of ['Published experimental Mac beta', 'Internal app version: **0.1.1**',
    'Overview, Practice and Settings', 'does not grant capture', 'ephemeral',
    'context revocation', 'focus', 'tray routing', 'General, Dictation, Appearance & sound and Setup',
    'Light/Dark/System', 'prominent update footer', 'stable geometry', 'Usage/data semantics',
    'native guards remain unchanged', 'candidateRelease.publicAvailable',
    'VoiceOver/AXPress', 'microphone hardware',
    'actual OTA', '**unverified**', 'Do not manually replace the installed app',
    'existing signing identity', 'updater keys']) assert.ok(notes.includes(scope), scope);
  const guide = read('docs/RELEASING.md');
  assert.match(guide, /## Beta 16 publication and metadata activation/);
  assert.ok(guide.indexOf('## Beta 16 publication') < guide.indexOf('## Beta 15 publication'));
  for (const source of [notes, guide]) {
    for (const evidence of ['79b509bf6f8196ff9d1922498f92120cbf9e85f2', '43149304049',
      'c3be19d550a8d7cfbed2642fc321aa0d34431684d761e55f59ebe530fae5f071',
      '43e1ecb7d72d0afabb37cb4fd77c42dcfd29d24333c56a956b84250e27987cdf',
      '8dfed02a2df4bac85ad5c09e2273bd0209d5d529435b994ede74dfcc29b6ac15',
      'beta15-before-beta16-w53ip9wg', 'Activation CI', 'Pages', 'Homebrew',
      'tap CI remain', 'pending gates']) assert.ok(source.includes(evidence), evidence);
  }
  assert.doesNotMatch(notes, /Candidate experimental|No beta 16 clean artifact source|remain on audited beta 15/);
});

test('beta 20 activation preserves completed historical ledger bytes', () => {
  const hashes = {
    'docs/FEATURE-RELEASES.md': '4e52e54e2be54bc1f0985034e37cb765c59f838f9f8512ec0eedeb83977bada8',
  };
  for (const [path, hash] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash, `${path} remains byte-identical`);
  }
});

test('completed beta 11–21 release notes remain byte-identical', () => {
  const historicalHashes = {
    11: '7bac886586a6572df5547bf59ba19c02df39eeba1c52b2b1914e0dc789458276',
    12: '6fa6cfec6faec6453cb70d14a482ed75e82de85a86118800cb5c75b4fcb6f1b8',
    13: '4d00621bba88c93bef383f267fa5c74295d145ef9d2c9efd206c49a4385ecb6e',
    14: '284e70f6eb8be1448973aafcfc14daa83b053c9b1f47768733a904393b420a3e',
    15: '0b19241a9128f26bd433279515e4bd0e1aad53591bc26c9d9d2ff12f27b778ce',
    16: '7ae1061ed855c37985b97644993c45229f7d02cc5215b203dec339470beea667',
    17: '7aeea7cff3ebca7f9811d2f5b4d5e183af1fb3cd6eeb6cc6355ca236270da42c',
    18: 'd72203bb5693414dbe917feb3f3d7c30718ebb92f87f78acc952e118be47412c',
    19: 'a3fab18a23366468b09a3681b67e22f7237bbb95d4cb45a325408c1c2850b705',
    20: 'c6a5beee0f48a57e40abfdc8f12db2aaa8a0be8a90b4e26f222350b2920bf9f5',
    21: 'd872890c45dd2a235b379bad85c5df0de39633ee3b04959c3417fa7e7010d301',
  };
  for (const [beta, hash] of Object.entries(historicalHashes)) {
    assert.equal(createHash('sha256').update(read(`docs/releases/v0.1.1-beta.${beta}.md`)).digest('hex'), hash,
      `Historical beta ${beta} evidence remains byte-identical`);
  }
});

test('beta 20 published notes distinguish narrow source evidence from release and hardware acceptance', () => {
  const notes = read('docs/releases/v0.1.1-beta.20.md');
  for (const evidence of ['Published experimental Mac beta', 'Internal app version: **0.1.1**',
    'Starting', 'negotiationAttempts: 1', 'not a missing-setup', 'locked startup commit',
    'bounded two-attempt', 'Generic errors, Objective-C exceptions, cancellation and runtime errors',
    'No global hardware-rate writes', 'additional UI changes', '312 passed / 1 skipped',
    '90 passed / 3 ignored', 'Joffrey', 'no findings', 'not the exact locked-commit gap',
    'No beta 20 Bluetooth', 'actual OTA acceptance', 'not a verified hardware fix',
    'candidateRelease.publicAvailable', 'Homebrew', 'Do not manually replace']) {
    assert.ok(notes.includes(evidence), evidence);
  }
  const guide = beta22ReleaseGuide();
  assert.ok(guide.indexOf('## Beta 20 publication and metadata activation') < guide.indexOf('## Beta 19 publication'));
  // All prior guide bytes, including historical receipts, remain untouched.
  const priorGuide = guide.slice(0, guide.indexOf('## Beta 22 publication'))
    + guide.slice(guide.indexOf('## Beta 19 publication'));
  assert.equal(createHash('sha256').update(priorGuide).digest('hex'),
    'fdabf1e370364c28a68760f8a3890ceaf0b7e2fedef5a9d4c0da8c11ffd634fd');
  const publishedGuide = guide.slice(0, guide.indexOf('## Beta 22 publication'))
    + guide.slice(guide.indexOf('## Beta 20 publication and metadata activation'));
  assert.equal(createHash('sha256').update(publishedGuide).digest('hex'),
    'a5be1f83fd20057a3cd138676b49a8e4c740034a3452499de39f4f1504471722',
    'Candidate preparation preserves all prior guide bytes, including beta 20 receipts');
});

test('beta 20 publication records exact source and public audit receipts without claiming deployment', () => {
  for (const source of [read('docs/RELEASING.md'), read('docs/releases/v0.1.1-beta.20.md')]) {
    for (const receipt of ['821f43dd3bb2143b9bc30cff6ab4c4346d5ff5bd', '43960661087',
      '843dcd138dd5230c07e9963a61e67775ef61be9f86e2def8dc2bd90140c5f950',
      '67a6687d6148eaddd627afd014d17d2174d733f03ebcdb74546618e2d5375553',
      '5c39f1994b7d4264a0b2d44e268247316b885208595e27a92c0d924a694473eb',
      'anonymous-public seven-asset audit passed', 'beta19-before-beta20-fgo7exen/',
      'Activation CI', 'Pages', 'Homebrew', 'tap CI remain separate pending gates']) {
      assert.ok(source.includes(receipt), receipt);
    }
  }
  assert.doesNotMatch(read('docs/releases/v0.1.1-beta.20.md'), /Candidate experimental|feed remain beta 19|No final beta 20 clean artifact/);
});

test('beta 19 publication records combined scope and waived hardware acceptance honestly', () => {
  const notes = read('docs/releases/v0.1.1-beta.19.md');
  for (const evidence of ['Internal app version: **0.1.1**', 'single input engine',
    'output-only', 'PCM is discarded', 'idle microphone', 'at most two',
    'same engine', 'original device UID, epoch and start gate',
    'Cancellation is permanent', 'three-second startup watchdog',
    'global rate writes', 'EOS', 'retirement', 'AppKit never waits',
    'independently of physical shortcut release', 'end-cue failure is nonfatal',
    '**Starting**', '**Listening**', 'Practice and Settings replace Overview',
    'Dictation', 'Settings owns the guide', '30 px', 'single-line footer',
    '980×820', '560×650', 'accessible scrolling fallback', 'Light/Dark/System',
    'volume-default', 'Joffrey', '24 passed', '90 passed / 3 ignored',
    '**Full hardware acceptance has not passed.**', 'zero sessions',
    'waived further hardware testing', 'real Fn', 'real OTA',
    'seven-asset audit', 'Homebrew', 'Do not manually replace']) {
    assert.ok(notes.includes(evidence), evidence);
  }
  const guide = read('docs/RELEASING.md');
  assert.ok(guide.indexOf('## Beta 19 publication and metadata activation') < guide.indexOf('## Beta 18 publication'));
  for (const source of [notes, guide]) {
    for (const receipt of ['280e3696a9ec3e89156fb0830cff1a583f34d609', '43824451404',
      '8658dab4ee0b4392891195b442d3aad9aaa4a9a6f465b228e8eb7a0cdac713be',
      'c6c4d6dccbfe0c35a5c3d78eb53d420b469733dde6ca7cebc19d3a409a2c58a4',
      'f48b7b8d032e7e8a9e617f0dab174886af93d25a757ca4eae6cdf1aa5cf3d270',
      'anonymous-public seven-asset audit passed', 'Activation CI', 'pending gates']) {
      assert.ok(source.includes(receipt), receipt);
    }
  }
  assert.ok(guide.includes('beta18-before-beta19-mtuif6ha/'));
  assert.doesNotMatch(notes, /Candidate experimental|audit are pending|remain beta 18|No final source SHA/);
});

test('beta 18 publication notes separate scratch hardware evidence from installed acceptance', () => {
  const notes = read('docs/releases/v0.1.1-beta.18.md');
  for (const evidence of ['Published experimental Mac beta', 'Internal app version: **0.1.1**',
    'November 15, 2026', '24 kHz', '48 kHz', '-10868', 'stayed open, but capture failed',
    'not a device-name, device A/B/C or AirPods special case', 'fresh hardware format',
    'unconnected', 'before prepare, before start and after', 'device UID',
    'disabled PCM delivery', 'No automatic retries', 'fallback-rate writes',
    'privacy changes', 'permission-owning', '15 callbacks, 36,000 frames',
    '**not a pass**', '16 sink callbacks', '24,000 converted frames', '1.5 seconds',
    'healthyStop true', 'isRecording false', 'device-running 0', 'normal',
    '48/48 before initialization and 24/24 after stop', '**not** prove',
    'model name AirPods', 'No PCM files or transcription', 'PID 27303',
    'macOS 14 hardware acceptance', '**unverified**', '308 passed, 1 skipped',
    '90 passed, 3 ignored', 'Joffrey', 'before the full Swift hardware attempt',
    'candidateRelease.publicAvailable', 'metadata activation',
    'Do not manually replace the installed app']) assert.ok(notes.includes(evidence), evidence);
  const guide = read('docs/RELEASING.md');
  assert.ok(guide.indexOf('## Beta 18 publication') < guide.indexOf('## Beta 17 publication'));
  for (const source of [notes, guide]) {
    for (const evidence of ['3f5c43c3cb5265950157f9801b06f3c83b6488e1', '43802655931',
      '16a1cf7e3e393b24057a7ddaddbb52fe60207f4077e1a4063c9b6e9ead5d40a9',
      'c7a50a68b691296df08d5ef2331330903566d5cb596689f06621c45eeae8c6a8',
      'd6986510ec05fee9b848cd50b0b4c32b53833e8684e6ca1c90f8ca566a25661d',
      'anonymous-public seven-asset audit passed', 'beta17-before-beta18-vjtrtyp6',
      'Activation CI', 'Homebrew', 'tap CI remain separate pending gates']) assert.ok(source.includes(evidence), evidence);
    assert.doesNotMatch(source.split('## Beta 17 publication')[0], /Unpublished experimental|No beta 18 clean artifact-source|No beta 18 artifact\nsource/);
  }
});

test('beta 14 publication records audited source and hashes, with real OS acceptance separate', () => {
  const notes = read('docs/releases/v0.1.1-beta.14.md');
  for (const evidence of ['Published experimental Mac beta',
    'Internal app version: **0.1.1**', 'beta 11–14', '**before confirmation**',
    'exact version and controller revision', 'expires during confirmation',
    'changed version requires fresh review/reconfirmation', '**Check again**',
    'unsolicited feed polling', 'Keyboard and recovery', 'bounded status/error scrolling',
    'no native forced Light theme', 'Reduced-motion', 'runtime-contrast',
    'original beta 12 layout', '**NSButton target/actions**', '**not AXPress acceptance**',
    'd7ea18e36141a9302f973637c926e190c286ecc8', '/actions/runs/42785358444',
    'local/draft/anonymous-public seven-asset', 'audits passed',
    'd56e7db32ac886efdd9e97e534bf761e9e384c6973b64fbf053705dea2737f88',
    '4b3e60ab151de30ed26a8e53f528dbd85a3793361d1393ed47a306968fa1d053',
    '904d3231b67f4640281a40fb1f1919a94b173c36468b833cdbc232aff62d0139',
    'beta13-before-beta14-5v8sbkaw', 'candidate-era documentation remains immutable',
    'user-reported stale updater', 'prior beta 12 layout fix', 'independent distribution gates passed',
    'OTA replacement/restart', 'VoiceOver', '**unverified**', 'updater keys',
    'model/settings/usage data', 'No new AI features']) assert.ok(notes.includes(evidence), evidence);
  assert.doesNotMatch(notes, /Unpublished experimental|audits are pending|No beta 14 artifact source SHA/);
  const guide = read('docs/RELEASING.md');
  assert.match(guide, /## Beta 14 publication and metadata activation \(group 4\)/);
  const ledger = read('docs/FEATURE-RELEASES.md');
  assert.match(ledger, /Group 4 publication evidence — COMPLETE/);
  for (const source of [guide, ledger]) {
    for (const evidence of ['d7ea18e36141a9302f973637c926e190c286ecc8', '42785358444',
      'd56e7db32ac886efdd9e97e534bf761e9e384c6973b64fbf053705dea2737f88',
      '4b3e60ab151de30ed26a8e53f528dbd85a3793361d1393ed47a306968fa1d053',
      '904d3231b67f4640281a40fb1f1919a94b173c36468b833cdbc232aff62d0139',
      'beta13-before-beta14-5v8sbkaw']) assert.ok(source.includes(evidence), evidence);
  }
  for (const beta of [11, 12, 13, 14]) {
    assert.ok(ledger.includes(`https://github.com/suhaasbadada/handsfree/releases/tag/v0.1.1-beta.${beta}`));
  }
  // Source-only historical oracle: never read ignored release/ output.
  assert.equal(createHash('sha256').update(read('docs/releases/artifacts/v0.1.1-macos-arm64.json')).digest('hex'),
    '783a4c1ac21a69e5da782b06e59e29a3716d051bd92973182da434d30ca52fa7');
});

test('beta 12 historical notes and completed group 2 parity ledger do not claim hardware acceptance', () => {
  const notes = read('docs/releases/v0.1.1-beta.12.md');
  for (const evidence of ['Published experimental Mac beta', 'selected device UID',
    'System default', 'never silently falls back', 'captured session samples',
    'frozen for that session', 'not newly invented', 'stable layout',
    'errors and cancellation', 'Focus transfer', '40e56571584dd6f17df020571f523a6e45b110b1',
    '/actions/runs/42765942619', 'anonymous-public seven-asset', 'existing signing',
    'e7e588bdfaf22d291a72cc8a820eab227ad3fa2f21f63f011115521cbe5d6b12',
    '22ea22c351ac2d28a16364b851a6fbdf21f18fa026265329f73459b5bea46500',
    '30d23e26e80bf201634b842c80360eae9eb6de16660475b202fd8f634353a20d',
    'beta11-before-beta12-1bbihewj', '**unverified**', 'Do not advance to\ngroup 3',
    'four sequential feature releases', 'suhaasbadada/homebrew-handsfree']) {
    assert.ok(notes.includes(evidence), evidence);
  }
  const ledger = read('docs/FEATURE-RELEASES.md');
  for (const evidence of ['994bcb82b2cb92a08badbd4754695378f89afa88', '42761543948',
    '8ca7ea9bab03e240fddbf1e9017169e5c70c8bff', '42762733421', '42762733468',
    '3b29243b6b776f2c88493ec50652a123ebce251c', '42762691517',
    'Live website/feed byte readback', 'Verified complete publication/parity gates',
    'Group 2 publication evidence — COMPLETE', '40e56571584dd6f17df020571f523a6e45b110b1',
    '42765942619', 'fff4b4204aa8d144111cf5d9b491b6fc1728d6d0', '42767293534', '42767293520',
    'a933768c5c0586093b9becb9f1d4cbdfc125d968', '42767247856', 'Hardware/OTA acceptance remains separate and unverified']) {
    assert.ok(ledger.includes(evidence), evidence);
  }
});

test('beta 6 publication evidence remains historical', () => {
  const notes = read('docs/releases/v0.1.1-beta.6.md');
  assert.match(notes, /Published experimental Mac beta/);
  assert.match(notes, /not a shortcut test/);
  assert.match(notes, /does not copy to the clipboard/);
  assert.match(notes, /count toward usage/);
  assert.ok(notes.includes('cfd6854ed8875e612b10673513d7199bb5c8124a'));
  assert.ok(notes.includes('56994da40e32922f16e3561daac12fa2ab3c4025cbc3a0f0d2b71719e67d5b1e'));
  assert.ok(notes.includes('/actions/runs/42556991615'));
  assert.match(notes, /npm run release:check -- --public/);
  assert.match(notes, /live microphone practice acceptance and separate-Mac QA were \*\*not performed\*\*/);
  assert.doesNotMatch(notes, /Unpublished candidate|Current verified public download remains/);
  assert.match(read('docs/practice.md'), /Available in \[Mac beta 6\]/);
  assert.doesNotMatch(read('docs/DEVELOPMENT.md'), /Practice field \(development builds\)|unpublished beta 6 candidate/);
});

test('Mac stable activation coordinates current docs and all static download links', async () => {
  const { release } = await import('../site/release.js');
  assert.equal(release.version, '0.1.7');
  assert.equal(createHash('sha256').update(read('docs/releases/artifacts/v0.1.6-macos-arm64.json')).digest('hex'),
    '43c16960c0797e3430c60e19c3a58e56226c0cfa699d9bb6b52b5c779d32f479');
  assert.equal(createHash('sha256').update(read('docs/releases/artifacts/v0.1.5-macos-arm64.json')).digest('hex'),
    '804af365125eb4b917a78e623b6a88df401bb3f24e02fd8e090c7056a3b99861');
  assert.equal(createHash('sha256').update(read('docs/releases/artifacts/v0.1.4-macos-arm64.json')).digest('hex'),
    'b25ff322df3a5a5ddf43ebf8173c3c8a3b91e308564b9bf89708de7b14ad4dab');
  assert.equal(createHash('sha256').update(read('docs/releases/artifacts/v0.1.3-macos-arm64.json')).digest('hex'),
    '3b51d56517b2f0b7cd792c0def745f9556917ff974658001426e9cd1cf8db4ca');
  assert.equal(createHash('sha256').update(read('docs/releases/artifacts/v0.1.2-macos-arm64.json')).digest('hex'),
    '139c4f42f65cf32e211b5ecfb495963c9241a6c73caad3415dc767b8b1686420');
  const feed = read('site/updates/macos-arm64.json');
  assert.equal(createHash('sha256').update(feed).digest('hex'),
    '6bdbd4ee48ab8d94d1857cc8421a2a3b4e9e7df5d96ca010d2c49858bbe2b79d',
    'Activation preserves exact anonymously audited v0.1.7 signed feed bytes');
  assert.equal(JSON.parse(feed).version, release.version);
  assert.equal(JSON.parse(feed).platforms['darwin-aarch64'].url,
    release.dmgUrl.replace('.dmg', '.app.tar.gz'));
  for (const path of ['README.md', 'docs/INSTALL.md', 'site/index.html']) {
    const source = read(path);
    assert.ok(source.includes(release.dmgUrl), `${path} links the verified current Mac DMG`);
    assert.doesNotMatch(source, /releases\/download\/v0\.1\.1-beta\.\d+\/|HandsFree-0\.1\.1-beta\.\d+-macos|Mac_beta-v0\.1\.1--beta\.\d+-/, `${path} must not advertise a stale Mac download; historical evidence links remain valid`);
  }
  const links = [...read('site/index.html').matchAll(/href="([^"]+\.dmg)"/g)].map(match => match[1]);
  assert.equal(links.length, 2, 'Primary and platform-card Mac links have no-JS defaults');
  assert.deepEqual(links, [release.dmgUrl, release.dmgUrl]);
  assert.ok(read('README.md').includes(`docs/releases/v${release.version}.md`));
  assert.ok(read('docs/INSTALL.md').includes(`\`${release.version}\``));
  for (const path of ['README.md', 'docs/INSTALL.md', 'docs/UPDATES.md', 'site/index.html']) {
    const source = read(path);
    assert.match(source, /Download &(?:amp;)? update/, `${path} describes published stable inline updates`);
  }
  // Detailed legacy controls and changed-version consent belong in the linked guide,
  // not duplicated in the concise README and landing page.
  assert.match(read('docs/UPDATES.md'), /another click/);
  assert.match(read('docs/UPDATES.md'), /older betas/);
});

test('beta 11 publication records immutable source and pending deployment/acceptance gates', () => {
  const notes = read('docs/releases/v0.1.1-beta.11.md');
  for (const evidence of ['Published experimental Mac beta', '994bcb82b2cb92a08badbd4754695378f89afa88',
    '/actions/runs/42761543948', 'local, draft and anonymous-public seven-asset audits',
    '240799cedf24705bbd5b940baaa940a1b3c6c0de01f834f2edf9f1c1dd8b53d3',
    '88bf0041059a98b8d8686b473098551008e37bd7e646e981eee738dcae3f8da2',
    'd2610f7d5618c1127c8d8c48b678da9fc136a57ce546f5fae8dd1074eb092e54',
    'beta10-before-beta11-bbsw66sm', 'Live website/feed byte verification',
    'authorized in-app update', '**unverified**', 'Do not advance to group 2 yet']) {
    assert.ok(notes.includes(evidence), evidence);
  }
  assert.doesNotMatch(notes, /Unpublished experimental|Current verified public downloads and signed feed remain/);
  const feed = JSON.parse(read('docs/releases/artifacts/v0.1.1-macos-arm64.json'));
  assert.equal(feed.version, '0.1.1');
  assert.equal(feed.platforms['darwin-aarch64'].url,
    'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1/HandsFree-0.1.1-macos-arm64.app.tar.gz');
  assert.equal(createHash('sha256').update(notes).digest('hex'),
    '7bac886586a6572df5547bf59ba19c02df39eeba1c52b2b1914e0dc789458276',
    'Historical beta 11 evidence remains byte-identical');
});

test('beta 7 publication evidence distinguishes artifact source, bootstrap and pending forward OTA', () => {
  const notes = read('docs/releases/v0.1.1-beta.7.md');
  for (const evidence of ['95367c953fe0e229de236009a6cbaaef04f70f2e', '/actions/runs/42572677818',
    '4cf304dfad49c68dbc7e0fd415fd35b0d1c0de634bc5bb3a610aa34930338a87',
    '4b1818f5b547c194da1d8296af38ea1b141dd95a69629346049c594ba226eff6',
    'npm run release:check -- --public', 'all seven assets', 'manually installed',
    'model/settings/usage hashes', 'no beta 8 exists']) assert.ok(notes.includes(evidence), evidence);
  assert.match(notes, /forward OTA replacement\/restart was not performed/);
  assert.match(notes, /Live audio\/dictation acceptance and separate-Mac QA were \*\*not performed\*\*/);
  assert.doesNotMatch(notes, /Candidate only|No artifact source SHA/);
  assert.equal(createHash('sha256').update(read('docs/releases/v0.1.1-beta.6.md')).digest('hex'),
    '2f735b7e48de1d60d96fbe592987991796a05fa7d8510b6e4e3b63afbf715b30', 'Historical beta 6 notes remain byte-identical');
  assert.equal(createHash('sha256').update(read('docs/releases/artifacts/v0.1.1-macos-arm64.json')).digest('hex'),
    '783a4c1ac21a69e5da782b06e59e29a3716d051bd92973182da434d30ca52fa7', 'Activation preserves exact anonymously verified stable feed bytes');
  for (const path of ['docs/INSTALL.md', 'docs/UPDATES.md']) {
    const source = read(path);
    assert.match(source, /Check for updates/);
    assert.match(source, /Download & restart/);
    assert.match(source, /beta 6|Beta 6/);
    assert.match(source, /connection metadata/);
  }
});

test('beta 8 evidence separates published focus fix from pending real OTA acceptance', () => {
  const notes = read('docs/releases/v0.1.1-beta.8.md');
  for (const evidence of ['5d5e8b151fa1877a6f8965f6fb0255dacb3e8823', '/actions/runs/42695055468',
    '842f1f2c0e435cec4d8e7fb743798d30a11c58258bf7e41fbb201b0d5e661063',
    '8256e9579b6dcd3705e1b6f82fcdd822dfca85a60d08e78b1ed37a079deb4812',
    'npm run release:check -- --public', 'all seven anonymous public asset downloads',
    'Do not manually replace', 'not yet verified', 'Keyboard navigation']) assert.ok(notes.includes(evidence), evidence);
  assert.match(notes, /Published experimental Mac beta/);
  assert.doesNotMatch(notes, /Unpublished experimental/);
});

test('Mac Compatibility paste release guidance discloses opt-in and once-only delivery limits', () => {
  for (const path of ['docs/INSTALL.md', 'docs/COMPATIBILITY-PASTE.md', 'docs/releases/v0.1.1-beta.5.md']) {
    const source = read(path).replace(/\s+/g, ' ');
    assert.match(source, /Settings → Compatibility paste/);
    assert.match(source, /off by default|Default off/i);
    assert.match(source, /exact (?:text )?field cannot be verified|cannot verify the exact field/);
    assert.match(source, /never.*(?:retries|retry)|no automatic retry|no compatibility retry/i);
    assert.match(source, /never.*Enter|no.*Enter/i);
    assert.doesNotMatch(source, /Not yet published|prerelease candidate|After this release is published/);
  }
  const notes = read('docs/releases/v0.1.1-beta.5.md');
  assert.equal(createHash('sha256').update(notes).digest('hex'), 'b254a7804074989882c016b6161227a189a54a1f41bdcf9aefa681b6bed3525c', 'Historical beta 5 notes remain byte-identical');
  assert.ok(notes.includes('c5f00405b7b9ec8164e9f1f89c8e1f8ab3696028'));
  assert.ok(notes.includes('99c4399246a792b55fcc96dd624bf68a8972fd731c2e7898ef84349e4fd1a155'));
  assert.ok(notes.includes('/actions/runs/41513549954'));
  assert.match(notes, /Windows beta 3.*unchanged/);
});

test('release checklist gates the recommended Homebrew path on matching published cask metadata', () => {
  const source = read('docs/RELEASING.md');
  assert.match(source, /Mandatory cross-repository Homebrew gate/);
  assert.match(source, /suhaasbadada\/homebrew-handsfree/);
  assert.match(source, /cask distribution version, exact DMG URL, and SHA-256/);
  assert.match(source, /before claiming.*latest customer download/);
  assert.match(source, /no `--zap`, data deletion, or totals reset/);
});

test('Mac-only scope pauses Windows promotion while preserving historical release guidance', async () => {
  const { windowsRelease } = await import('../site/release.js');
  assert.equal(windowsRelease.version, '0.1.1-windows-beta.3');
  assert.equal(windowsRelease.publicAvailable, false);
  assert.match(windowsRelease.status, /paused/i);
  for (const path of ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/INSTALL.md', 'docs/DEVELOPMENT.md', 'docs/RELEASING.md', 'docs/WEBSITE.md', 'site/index.html']) {
    const source = read(path);
    assert.doesNotMatch(source, /https:\/\/[^\s"<>)]*\.exe/, `${path} must not promote Windows installers`);
    assert.doesNotMatch(source, /Linux (?:is )?planned|Linux coming soon|Download for Windows/i);
    assert.match(source, /Mac[- ]only|only current product/i, `${path} states the current scope`);
  }
  for (const path of ['docs/WINDOWS.md', 'docs/WINDOWS-NATIVE.md', 'docs/WINDOWS-PLAN.md']) {
    assert.match(read(path).split('\n').slice(0, 6).join('\n'), /paused.*historical|historical.*paused/i, `${path} is clearly archived`);
  }
  assert.match(read('.github/ISSUE_TEMPLATE/bug_report.yml'), /Apple Silicon Mac beta \(macOS 14\+\)/);
  assert.doesNotMatch(read('.github/ISSUE_TEMPLATE/bug_report.yml'), /Mac or experimental Windows beta|Windows \(x64 experimental beta\)/);
  assert.match(read('.github/ISSUE_TEMPLATE/feature_request.yml'), /Mac-only/);
  assert.doesNotMatch(read('.github/ISSUE_TEMPLATE/feature_request.yml'), /Windows and Linux are planned/);
  assert.match(read('.github/pull_request_template.md'), /Windows CI is manual-only, not a routine gate/);
  for (const path of ['docs/WINDOWS.md', 'docs/releases/v0.1.1-windows-beta.3.md']) {
    const source = read(path);
    assert.ok(source.includes(windowsRelease.installerUrl), `${path} retains the historical versioned installer coordinates`);
    assert.match(source, /Push to talk/);
    assert.match(source, /Toggle/);
    assert.match(source, /not yet (?:live )?hardware-tested/i);
  }
  for (const path of ['docs/PUSH-TO-TALK.md', 'docs/releases/v0.1.1-beta.4.md', 'docs/releases/v0.1.1-windows-beta.3.md']) {
    assert.doesNotMatch(read(path), /release planned|Planned candidate|not yet published|source builds/);
  }
  assert.ok(read('docs/releases/v0.1.1-beta.4.md').includes('bfe0a3f874b496777ab0342e22cac59220ad390d'));
  assert.ok(read('docs/releases/v0.1.1-windows-beta.3.md').includes('bfe0a3f874b496777ab0342e22cac59220ad390d'));
});
