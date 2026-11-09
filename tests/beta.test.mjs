import test from 'node:test';
import assert from 'node:assert/strict';
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
    assert.match(read(path), /\.beta-badge\s*\{[^}]*color:\s*#873c38;[^}]*font-size:\s*(?:10|11)px/);
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
  assert.match(read('README.md'), /!\[Mac beta: v0\.1\.1-beta\.5\]\(https:\/\/img.shields.io\/badge\/Mac_beta-v0\.1\.1--beta\.5-a64a45.svg\)/);
  assert.match(read('docs/releases/v0.1.1-beta.2.md'), /# HandsFree v0\.1\.1-beta\.2/);
  assert.match(read('docs/releases/v0.1.1-beta.2.md'), /Prerelease · Beta testing/);
  assert.match(read('docs/INSTALL.md'), /# Install HandsFree \(Mac beta\)/);
  assert.match(read('scripts/package-release.sh'), /NAME=HandsFree-0\.1\.1-beta\.6-macos-arm64/);
  assert.match(read('scripts/package-release.sh'), /-volname 'HandsFree Beta — drag to Applications'/);
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(config.productName, 'HandsFree');
  assert.equal(config.identifier, 'com.handsfree.local');
});

test('Mac beta 6 candidate package and audit coordinate without changing published beta 5 or embedded version', async () => {
  const { release, candidateRelease } = await import('../site/release.js');
  const { candidate, tag } = await import('../scripts/check-release.mjs');
  const version = JSON.parse(read('package.json')).version;
  assert.equal(version, '0.1.1');
  assert.equal(JSON.parse(read('package-lock.json')).version, version);
  assert.equal(JSON.parse(read('package-lock.json')).packages[''].version, version);
  assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version, version);
  assert.ok(read('src-tauri/Cargo.toml').includes(`version = "${version}"`));
  assert.ok(read('src-tauri/Cargo.lock').includes(`name = "handsfree"\nversion = "${version}"`));
  assert.equal(release.version, `${version}-beta.5`);
  assert.equal(release.publicAvailable, true, 'Activation follows publication and public asset verification');
  assert.equal(candidateRelease.version, `${version}-beta.6`);
  assert.equal(candidateRelease.publicAvailable, false, 'Candidate must not activate public downloads');
  assert.equal(tag, `v${candidateRelease.version}`);
  assert.equal(candidate, `HandsFree-${candidateRelease.version}-macos-arm64.dmg`);
  assert.ok(candidateRelease.dmgUrl.endsWith(`/releases/download/${tag}/${candidate}`));
  assert.ok(read('scripts/package-release.sh').includes(`NAME=${candidate.slice(0, -4)}`));
  assert.ok(read('scripts/package-release.sh').includes(`== ${version} ]]`));
  assert.ok(read('src/main.ts').includes(`<span id="app-version">${version}</span>`));
  assert.match(read('src/main.ts'), /getVersion\(\)\.then/);
  assert.ok(read(`docs/releases/${tag}.md`).includes(`Internal app version: **${version}**`));
});

test('beta 6 preparation packages practice guidance and keeps publication evidence honest', () => {
  const packager = read('scripts/package-release.sh');
  const audit = read('scripts/check-release.mjs');
  for (const name of ['practice.md', 'COMPATIBILITY-PASTE.md']) {
    assert.ok(packager.includes(`docs/${name}`));
    assert.ok(packager.includes(`Licenses/Documentation/${name}`));
    assert.ok(audit.includes(`Documentation/${name}`));
  }
  assert.ok(packager.includes('docs/releases/v0.1.1-beta.6.md'));
  assert.match(audit, /validateAvailability\([^\n]*\.candidateRelease, publicMode\)/);
  const notes = read('docs/releases/v0.1.1-beta.6.md');
  assert.match(notes, /Unpublished candidate/);
  assert.match(notes, /not a shortcut test/);
  assert.match(notes, /does not copy to the clipboard/);
  assert.match(notes, /count toward usage/);
  assert.doesNotMatch(notes, /\b[a-f0-9]{40,64}\b|actions\/runs\/\d+/);
});

test('Mac beta 5 activation coordinates current docs and all static download links', async () => {
  const { release } = await import('../site/release.js');
  assert.equal(release.version, '0.1.1-beta.5');
  for (const path of ['README.md', 'docs/INSTALL.md', 'site/index.html']) {
    const source = read(path);
    assert.ok(source.includes(release.dmgUrl), `${path} links the verified current Mac DMG`);
    assert.doesNotMatch(source, /v0\.1\.1-beta\.[234]|HandsFree-0\.1\.1-beta\.[234]|Mac_beta-v0\.1\.1--beta\.[234]/, `${path} must not advertise a stale Mac beta`);
  }
  const links = [...read('site/index.html').matchAll(/href="([^"]+\.dmg)"/g)].map(match => match[1]);
  assert.equal(links.length, 2, 'Primary and platform-card Mac links have no-JS defaults');
  assert.deepEqual(links, [release.dmgUrl, release.dmgUrl]);
  assert.ok(read('README.md').includes(`docs/releases/v${release.version}.md`));
  assert.ok(read('docs/INSTALL.md').includes(`\`${release.version}\``));
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
