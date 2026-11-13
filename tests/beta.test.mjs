import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('app footer and landing brand show a semantic, visible Beta badge', () => {
  for (const path of ['src/main.ts', 'site/index.html']) {
    const source = read(path);
    if (path.startsWith('site')) assert.match(source, /aria-label="HandsFree beta home"/);
    else assert.match(source, /<footer>[\s\S]*<span class="beta-badge">BETA<\/span>[\s\S]*<\/footer>/);
    assert.match(source, /class="beta-badge">BETA<\/(?:sup|span)>/);
    assert.equal([...source.matchAll(/class="beta-badge"/g)].length, 1, 'One unobtrusive badge per surface');
  }
  for (const path of ['src/style.css', 'site/styles.css']) {
    assert.match(read(path), path.startsWith('src') ? /\.beta-badge\s*\{[^}]*color:\s*var\(--accent\);[^}]*font-size:\s*(?:10|11)px/ : /\.beta-badge\s*\{[^}]*color:\s*#873c38;[^}]*font-size:\s*(?:10|11)px/);
  }
});

test('landing Beta is a small superscript, not a full-size wordmark or pill', () => {
  assert.match(read('site/index.html'), /<sup class="beta-badge">BETA<\/sup>/);
  const rule = read('site/styles.css').match(/\.beta-badge\{([^}]*)\}/)?.[1];
  assert.match(rule, /top:-0\.55em/);
  assert.match(rule, /font-size:10px/);
  assert.doesNotMatch(rule, /border:|padding:|background:/);
});

test('README, release notes, installer guide and filename disclose beta without renaming the app', () => {
  assert.match(read('README.md'), /!\[Mac beta: v0\.1\.1-beta\.17\]\(https:\/\/img.shields.io\/badge\/Mac_beta-v0\.1\.1--beta\.17-a64a45.svg\)/);
  assert.match(read('docs/releases/v0.1.1-beta.2.md'), /# HandsFree v0\.1\.1-beta\.2/);
  assert.match(read('docs/releases/v0.1.1-beta.2.md'), /Prerelease · Beta testing/);
  assert.match(read('docs/INSTALL.md'), /# Install HandsFree \(Mac beta\)/);
  assert.match(read('scripts/package-release.sh'), /NAME=HandsFree-0\.1\.1-beta\.17-macos-arm64/);
  assert.match(read('scripts/package-release.sh'), /-volname 'HandsFree Beta — drag to Applications'/);
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(config.productName, 'HandsFree');
  assert.equal(config.identifier, 'com.handsfree.local');
});

test('active Mac beta 17 and disabled beta 17 audit coordinates keep embedded version unchanged', async () => {
  const { release, candidateRelease } = await import('../site/release.js');
  const { candidate, tag } = await import('../scripts/check-release.mjs');
  const version = JSON.parse(read('package.json')).version;
  assert.equal(version, '0.1.1');
  assert.equal(JSON.parse(read('package-lock.json')).version, version);
  assert.equal(JSON.parse(read('package-lock.json')).packages[''].version, version);
  assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version, version);
  assert.ok(read('src-tauri/Cargo.toml').includes(`version = "${version}"`));
  assert.ok(read('src-tauri/Cargo.lock').includes(`name = "handsfree"\nversion = "${version}"`));
  assert.equal(release.version, `${version}-beta.17`);
  assert.equal(release.publicAvailable, true, 'Activation follows publication and public asset verification');
  assert.equal(candidateRelease.version, `${version}-beta.17`);
  assert.equal(candidateRelease.publicAvailable, false, 'Candidate must not activate public downloads');
  assert.ok(release.dmgUrl.endsWith(`/releases/download/v${release.version}/HandsFree-${release.version}-macos-arm64.dmg`));
  assert.equal(release.dmgUrl, candidateRelease.dmgUrl, 'Active beta 17 matches the audited coordinates');
  assert.deepEqual(candidateRelease, {
    schemaVersion: 1,
    version: '0.1.1-beta.17',
    publicAvailable: false,
    status: 'Mac beta 17 candidate: capture format negotiation and exception containment. Publication and public audit pending; not an availability switch.',
    dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.17/HandsFree-0.1.1-beta.17-macos-arm64.dmg',
  }, 'Candidate-era coordinates remain byte-for-byte unchanged and disabled after activation');
  assert.equal(JSON.parse(read('src-tauri/distribution.json')).version, candidateRelease.version);
  assert.equal(tag, `v${candidateRelease.version}`);
  assert.equal(candidate, `HandsFree-${candidateRelease.version}-macos-arm64.dmg`);
  assert.ok(candidateRelease.dmgUrl.endsWith(`/releases/download/${tag}/${candidate}`));
  assert.ok(read('scripts/package-release.sh').includes(`NAME=${candidate.slice(0, -4)}`));
  assert.ok(read('scripts/package-release.sh').includes(`== ${version} ]]`));
  assert.ok(read('src/main.ts').includes(`<span id="app-version">${version}</span>`));
  assert.match(read('src/main.ts'), /getVersion\(\)\.then/);
  assert.ok(read(`docs/releases/${tag}.md`).includes(`Internal app version: **${version}**`));
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
  assert.ok(read('src-tauri/src/updater.rs').includes('assert_eq!(installed_version(), "0.1.1-beta.17")'));
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

test('beta 17 activation preserves completed historical ledger bytes', () => {
  const hashes = {
    'docs/FEATURE-RELEASES.md': '4e52e54e2be54bc1f0985034e37cb765c59f838f9f8512ec0eedeb83977bada8',
  };
  for (const [path, hash] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash, `${path} remains byte-identical`);
  }
});

test('completed beta 11–16 release notes remain byte-identical', () => {
  const historicalHashes = {
    11: '7bac886586a6572df5547bf59ba19c02df39eeba1c52b2b1914e0dc789458276',
    12: '6fa6cfec6faec6453cb70d14a482ed75e82de85a86118800cb5c75b4fcb6f1b8',
    13: '4d00621bba88c93bef383f267fa5c74295d145ef9d2c9efd206c49a4385ecb6e',
    14: '284e70f6eb8be1448973aafcfc14daa83b053c9b1f47768733a904393b420a3e',
    15: '0b19241a9128f26bd433279515e4bd0e1aad53591bc26c9d9d2ff12f27b778ce',
    16: '7ae1061ed855c37985b97644993c45229f7d02cc5215b203dec339470beea667',
  };
  for (const [beta, hash] of Object.entries(historicalHashes)) {
    assert.equal(createHash('sha256').update(read(`docs/releases/v0.1.1-beta.${beta}.md`)).digest('hex'), hash,
      `Historical beta ${beta} evidence remains byte-identical`);
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
  // Source-only oracle: never read ignored release/ output to check active feed.
  assert.equal(createHash('sha256').update(read('site/updates/macos-arm64.json')).digest('hex'),
    'cb298141bcaa187fe9203e648a27492552c9dc83b6eddfaeb191857bb06170e3');
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

test('beta 17 packaging retains practice guidance; beta 6 publication evidence remains historical', () => {
  const packager = read('scripts/package-release.sh');
  const audit = read('scripts/check-release.mjs');
  for (const name of ['practice.md', 'COMPATIBILITY-PASTE.md']) {
    assert.ok(packager.includes(`docs/${name}`));
    assert.ok(packager.includes(`Licenses/Documentation/${name}`));
    assert.ok(audit.includes(`Documentation/${name}`));
  }
  assert.ok(packager.includes('docs/releases/v0.1.1-beta.17.md'));
  assert.match(audit, /validateAvailability\([^\n]*\.candidateRelease, publicMode\)/);
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

test('Mac beta 17 activation coordinates current docs and all static download links', async () => {
  const { release } = await import('../site/release.js');
  assert.equal(release.version, '0.1.1-beta.17');
  for (const path of ['README.md', 'docs/INSTALL.md', 'site/index.html']) {
    const source = read(path);
    assert.ok(source.includes(release.dmgUrl), `${path} links the verified current Mac DMG`);
    assert.doesNotMatch(source, /releases\/download\/v0\.1\.1-beta\.(?:[23456789]|10|11|12|13|14|15|16)\/|HandsFree-0\.1\.1-beta\.(?:[23456789]|10|11|12|13|14|15|16)-macos|Mac_beta-v0\.1\.1--beta\.(?:[23456789]|10|11|12|13|14|15|16)-/, `${path} must not advertise a stale Mac download; historical evidence links remain valid`);
  }
  const links = [...read('site/index.html').matchAll(/href="([^"]+\.dmg)"/g)].map(match => match[1]);
  assert.equal(links.length, 2, 'Primary and platform-card Mac links have no-JS defaults');
  assert.deepEqual(links, [release.dmgUrl, release.dmgUrl]);
  assert.ok(read('README.md').includes(`docs/releases/v${release.version}.md`));
  assert.ok(read('docs/INSTALL.md').includes(`\`${release.version}\``));
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
  const feed = JSON.parse(read('site/updates/macos-arm64.json'));
  assert.equal(feed.version, '0.1.1-beta.17');
  assert.equal(feed.platforms['darwin-aarch64'].url,
    'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.17/HandsFree-0.1.1-beta.17-macos-arm64.app.tar.gz');
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
  assert.equal(createHash('sha256').update(read('site/updates/macos-arm64.json')).digest('hex'),
    'cb298141bcaa187fe9203e648a27492552c9dc83b6eddfaeb191857bb06170e3', 'Activation preserves exact anonymously verified beta 17 feed bytes');
  for (const path of ['README.md', 'docs/INSTALL.md', 'SECURITY.md', 'docs/UPDATES.md']) {
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
  for (const path of ['README.md', 'docs/INSTALL.md', 'docs/COMPATIBILITY-PASTE.md', 'docs/releases/v0.1.1-beta.5.md']) {
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
