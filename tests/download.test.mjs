import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, downloadState, renderDownload, initializeDownload, publishedWindowsUrl } from '../site/download.js';
import { release, windowsRelease } from '../site/release.js';

const mac = { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 };
const enabled = { ...release, publicAvailable: true };
const windowsDisabled = { ...windowsRelease, publicAvailable: false };
const cases = [
  ['Safari Apple Silicon with Intel UA', mac, {}, 'mac', 'unknown'],
  ['actual Intel with no hints is also unknown', mac, {}, 'mac', 'unknown'],
  ['explicit ARM64', mac, { architecture: 'arm', bitness: '64' }, 'mac', 'arm64'],
  ['explicit arm64 token', mac, { architecture: 'arm64' }, 'mac', 'arm64'],
  ['ARM without bitness is unknown', mac, { architecture: 'arm' }, 'mac', 'unknown'],
  ['explicit Intel', mac, { architecture: 'x86', bitness: '64' }, 'mac', 'intel'],
  ['x86_64', mac, { architecture: 'x86_64' }, 'mac', 'intel'],
  ['unknown architecture', mac, { architecture: 'future' }, 'mac', 'unknown'],
  ['Mac UA fallback', { userAgent: mac.userAgent }, {}, 'mac', 'unknown'],
  ['Mac Client Hints', { userAgentData: { platform: 'macOS' } }, {}, 'mac', 'unknown'],
  ['Windows hints', { userAgentData: { platform: 'Windows' } }, {}, 'windows', 'unknown'],
  ['Client Hints take priority over stale platform', { ...mac, userAgentData: { platform: 'Windows' } }, {}, 'windows', 'unknown'],
  ['Windows UA', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, {}, 'windows', 'unknown'],
  ['Linux platform', { platform: 'Linux x86_64' }, {}, 'linux', 'unknown'],
  ['Linux UA', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }, {}, 'linux', 'unknown'],
  ['Android Linux', { platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 14)' }, {}, 'mobile', 'unknown'],
  ['Android hints', { userAgentData: { platform: 'Android' }, platform: 'Linux' }, {}, 'mobile', 'unknown'],
  ['iPadOS desktop UA', { ...mac, maxTouchPoints: 5 }, {}, 'mobile', 'unknown'],
  ['iPad UA', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' }, {}, 'mobile', 'unknown'],
  ['iPhone', { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' }, {}, 'mobile', 'unknown'],
  ['unknown', {}, {}, 'unknown', 'unknown'],
];
for (const [label, nav, hints, os, arch] of cases) test(`platform: ${label}`, () => {
  assert.deepEqual(detectPlatform(nav, hints), { os, arch });
});

test('published manifest permits a direct DMG; unavailable manifests remain disabled', () => {
  assert.equal(typeof release.publicAvailable, 'boolean');
  for (const arch of ['unknown', 'arm64']) {
    const platform = { os: 'mac', arch };
    assert.equal(downloadState(platform, { ...release, publicAvailable: false }).url, null);
    assert.equal(downloadState(platform, release).url, release.publicAvailable ? release.dmgUrl : null);
    assert.equal(downloadState(platform, enabled).url, release.dmgUrl);
    assert.equal(downloadState(platform, enabled).detail, 'For Apple Silicon Mac · macOS 14+ · English');
  }
  for (const os of ['windows', 'linux', 'mobile', 'unknown']) {
    assert.equal(downloadState({ os, arch: 'arm64' }, enabled).url, enabled.dmgUrl);
    assert.equal(downloadState({ os, arch: 'arm64' }, enabled).label, 'Download for another Mac');
    assert.match(downloadState({ os, arch: 'arm64' }, enabled).note, /Download only for another device: an Apple Silicon Mac running macOS 14\+/);
  }
  assert.match(downloadState({ os: 'mac', arch: 'intel' }, enabled).note, /Intel Macs are not supported/);
  assert.equal(downloadState({ os: 'mac', arch: 'intel' }, enabled).url, enabled.dmgUrl);
});

test('bad version, paths, schemas and truthy availability fail closed', () => {
  for (const os of ['mac', 'windows', 'linux', 'mobile', 'unknown']) {
    const platform = { os, arch: 'unknown' };
    for (const manifest of [null, {}, { ...enabled, publicAvailable: false }, { ...enabled, schemaVersion: 2 }, { ...enabled, publicAvailable: 'true' },
      { ...enabled, version: '../escape' }, { ...enabled, version: ['0.1.1-beta.5'] },
      { ...enabled, version: Symbol('invalid') }, { ...enabled, dmgUrl: 'javascript:alert(1)' },
      { ...enabled, dmgUrl: enabled.dmgUrl.replace('.dmg', '.zip') },
      { ...enabled, dmgUrl: `${enabled.dmgUrl}?token=secret` },
      { ...enabled, dmgUrl: enabled.dmgUrl.replace('github.com/', 'github.com.evil/') }]) {
      assert.equal(downloadState(platform, manifest, windowsDisabled).url, null);
    }
  }
});

function fixtureDocument() {
  const elements = new Map();
  return { getElementById(id) {
    if (!elements.has(id)) {
      const attrs = new Map();
      elements.set(id, { textContent: '', set href(value) { attrs.set('href', value); },
        get href() { return attrs.get('href'); },
        setAttribute(k, v) { attrs.set(k, v); }, removeAttribute(k) { attrs.delete(k); }, getAttribute(k) { return attrs.get(k); } });
    }
    return elements.get(id);
  } };
}

test('rendering transitions remove stale links and disabled state without click handlers or navigation', () => {
  const document = fixtureDocument();
  const cta = document.getElementById('primary-download');
  renderDownload(document, { os: 'mac', arch: 'unknown' }, { ...release, publicAvailable: false });
  assert.equal(document.getElementById('download-requirements').textContent, 'For Apple Silicon Mac · macOS 14+ · English');
  assert.equal(cta.href, undefined);
  assert.equal(cta.getAttribute('aria-disabled'), 'true');
  renderDownload(document, { os: 'mac', arch: 'unknown' }, enabled);
  assert.equal(cta.href, enabled.dmgUrl);
  assert.equal(cta.getAttribute('aria-disabled'), undefined);
  assert.equal(document.getElementById('download-label').textContent, 'Download for Mac');
  assert.equal(cta.textContent, '', 'Parent/icon subtree is never replaced');
  assert.equal(cta.getAttribute('aria-label'), 'Download for Mac (Apple Silicon)');
  renderDownload(document, { os: 'windows', arch: 'unknown' }, enabled, windowsDisabled);
  assert.equal(cta.href, enabled.dmgUrl);
  assert.equal(document.getElementById('download-label').textContent, 'Download for another Mac');
  assert.match(document.getElementById('download-platform-note').textContent, /Windows is not supported; Windows development is paused/);
});

test('historical Windows coordinates are retained but public availability is paused', () => {
  assert.equal(windowsRelease.publicAvailable, false);
  assert.equal(windowsRelease.version, '0.1.1-windows-beta.3');
  assert.equal(windowsRelease.appVersion, '0.1.1');
  assert.equal(publishedWindowsUrl(windowsRelease), null);
  assert.equal(publishedWindowsUrl(windowsDisabled), null);
  assert.equal(release.publicAvailable, true, 'Mac beta 7 is available');
  assert.equal(release.dmgUrl, 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.7/HandsFree-0.1.1-beta.7-macos-arm64.dmg');
  for (const arch of ['unknown', 'intel', 'arm64']) {
    const state = downloadState({ os: 'windows', arch }, enabled, windowsDisabled);
    assert.equal(state.url, enabled.dmgUrl);
    assert.equal(state.label, 'Download for another Mac');
    assert.match(state.note, /Windows is not supported; Windows development is paused/);
    assert.match(state.note, /Download only for another device: an Apple Silicon Mac/);
  }
});

test('Mac-only availability ignores even a stale enabled Windows manifest', () => {
  for (const macAvailable of [false, true]) for (const winAvailable of [false, true]) {
    const macManifest = { ...release, publicAvailable: macAvailable };
    const winManifest = { ...windowsRelease, publicAvailable: winAvailable };
    for (const os of ['mac', 'windows', 'linux', 'mobile', 'unknown']) for (const arch of ['intel', 'arm64', 'unknown']) {
      const state = downloadState({ os, arch }, macManifest, winManifest);
      assert.equal(state.target, 'mac');
      assert.equal(state.url, macAvailable ? release.dmgUrl : null);
      assert.match(state.detail, /Apple Silicon Mac · macOS 14\+/);
      if (os !== 'mac') assert.match(state.note, /Download only for another device/);
      const document = fixtureDocument();
      renderDownload(document, { os, arch }, macManifest, winManifest);
      assert.equal(document.getElementById('mac-card-download').href, macAvailable ? release.dmgUrl : undefined);
      assert.equal(document.getElementById('windows-card-download').href, undefined);
      assert.equal(document.getElementById('primary-download').href, macAvailable ? release.dmgUrl : undefined);
    }
  }
});

test('Windows canonical URL validation fails closed for drafts, paths, extension and type confusion', () => {
  const candidate = { ...windowsRelease, publicAvailable: true };
  assert.equal(publishedWindowsUrl(candidate), windowsRelease.installerUrl);
  for (const manifest of [null, {}, windowsDisabled, { ...candidate, schemaVersion: 2 },
    { ...candidate, publicAvailable: 'true' }, { ...candidate, version: '../draft' },
    { ...candidate, version: ['0.1.1-windows-beta.1'] }, { ...candidate, version: Symbol('invalid') },
    { ...candidate, appVersion: ['0.1.1'] }, { ...candidate, appVersion: null },
    { ...candidate, version: '0.1.1-windows-beta.1?draft=true' }, { ...candidate, version: '0.1.1' },
    { ...candidate, appVersion: '0.1.2' }, { ...candidate, appVersion: '0.1.1-beta.1' },
    ...['?download=1', '#asset'].map(suffix => ({ ...candidate, installerUrl: candidate.installerUrl + suffix })),
    ...['http://github.com', 'https://github.com.evil', 'https://user@github.com', 'https://api.github.com']
      .map(host => ({ ...candidate, installerUrl: candidate.installerUrl.replace('https://github.com', host) })),
    ...['.zip', '.dmg', '.EXE'].map(ext => ({ ...candidate, installerUrl: candidate.installerUrl.replace('.exe', ext) })),
    { ...candidate, installerUrl: candidate.installerUrl.replace('/download/', '/latest/download/') },
    { ...candidate, installerUrl: candidate.installerUrl.replace('/download/', '/draft/') },
    { ...candidate, installerUrl: 'javascript:alert(1)' }]) {
    assert.equal(publishedWindowsUrl(manifest), null);
    assert.equal(downloadState({ os: 'windows', arch: 'unknown' }, enabled, manifest).url, enabled.dmgUrl);
  }
});

test('Windows architecture hints and explicit ARM UA never choose x64 automatically', () => {
  for (const [nav, hints] of [
    [{ userAgentData: { platform: 'Windows' } }, { architecture: 'arm', bitness: '64' }],
    [{ userAgentData: { platform: 'Windows' } }, { architecture: 'arm' }],
    [{ userAgent: 'Mozilla/5.0 (Windows NT 10.0; ARM64)' }, {}],
  ]) {
    const platform = detectPlatform(nav, hints);
    assert.deepEqual(platform, { os: 'windows', arch: 'arm64' });
    assert.equal(downloadState(platform, release, { ...windowsRelease, publicAvailable: true }).target, 'mac');
  }
});

test('explicit 32-bit Windows hints do not promote an unsupported installer', () => {
  const platform = detectPlatform({ userAgentData: { platform: 'Windows' } }, { architecture: 'x86', bitness: '32' });
  assert.equal(platform.arch, 'x86_32');
  const state = downloadState(platform, release, { ...windowsRelease, publicAvailable: true });
  assert.equal(state.target, 'mac');
  assert.match(state.note, /Windows is not supported/);
});

test('availability revocation strips stale Mac hrefs from every download control', () => {
  const document = fixtureDocument();
  const platform = { os: 'windows', arch: 'unknown' };
  renderDownload(document, platform, release, { ...windowsRelease, publicAvailable: true });
  assert.equal(document.getElementById('primary-download').href, release.dmgUrl);
  assert.equal(document.getElementById('primary-download').getAttribute('aria-label'), 'Download for Mac (Apple Silicon)');
  renderDownload(document, platform, { ...release, publicAvailable: false }, windowsDisabled);
  for (const id of ['primary-download', 'mac-card-download']) {
    const cta = document.getElementById(id);
    assert.equal(cta.href, undefined, id);
    assert.equal(cta.getAttribute('aria-disabled'), 'true', id);
    assert.equal(cta.getAttribute('tabindex'), '-1', id);
    assert.equal(cta.onclick, undefined);
  }
});

test('absent or rejected hints stay safe and initialization never requires GitHub API', async () => {
  for (const navigator of [mac, { ...mac, userAgentData: { getHighEntropyValues: async () => { throw new Error('denied'); } } }]) {
    const document = fixtureDocument();
    const state = await initializeDownload(document, navigator);
    assert.equal(state.url, release.publicAvailable ? release.dmgUrl : null);
    assert.equal(document.getElementById('primary-download').href, release.publicAvailable ? release.dmgUrl : undefined);
  }
});
