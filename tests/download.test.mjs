import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, downloadState, renderDownload, initializeDownload } from '../site/download.js';
import { release } from '../site/release.js';

const mac = { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 };
const enabled = { ...release, publicAvailable: true };
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
  assert.equal(release.publicAvailable, true);
  for (const arch of ['unknown', 'arm64']) {
    const platform = { os: 'mac', arch };
    assert.equal(downloadState(platform, { ...release, publicAvailable: false }).url, null);
    assert.equal(downloadState(platform, release).url, release.dmgUrl);
    assert.equal(downloadState(platform, enabled).url, release.dmgUrl);
    assert.equal(downloadState(platform, enabled).detail, 'For Apple Silicon Mac · macOS 14+ · English');
  }
  for (const os of ['windows', 'linux', 'mobile', 'unknown']) {
    assert.equal(downloadState({ os, arch: 'arm64' }, enabled).url, enabled.dmgUrl);
    assert.equal(downloadState({ os, arch: 'arm64' }, enabled).label, 'Get Mac beta');
  }
  assert.match(downloadState({ os: 'mac', arch: 'intel' }, enabled).note, /Intel Macs are not supported/);
  assert.equal(downloadState({ os: 'mac', arch: 'intel' }, enabled).url, enabled.dmgUrl);
});

test('bad version, paths, schemas and truthy availability fail closed', () => {
  for (const os of ['mac', 'windows', 'linux', 'mobile', 'unknown']) {
    const platform = { os, arch: 'unknown' };
    for (const manifest of [null, {}, { ...enabled, publicAvailable: false }, { ...enabled, schemaVersion: 2 }, { ...enabled, publicAvailable: 'true' },
      { ...enabled, version: '../escape' }, { ...enabled, dmgUrl: 'javascript:alert(1)' },
      { ...enabled, dmgUrl: enabled.dmgUrl.replace('.dmg', '.zip') },
      { ...enabled, dmgUrl: `${enabled.dmgUrl}?token=secret` },
      { ...enabled, dmgUrl: enabled.dmgUrl.replace('github.com/', 'github.com.evil/') }]) {
      assert.equal(downloadState(platform, manifest).url, null);
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
  renderDownload(document, { os: 'windows', arch: 'unknown' }, enabled);
  assert.equal(cta.href, enabled.dmgUrl);
  assert.equal(document.getElementById('download-label').textContent, 'Get Mac beta');
  assert.match(document.getElementById('download-platform-note').textContent, /Windows planned/);
});

test('absent or rejected hints stay safe and initialization never requires GitHub API', async () => {
  for (const navigator of [mac, { ...mac, userAgentData: { getHighEntropyValues: async () => { throw new Error('denied'); } } }]) {
    const document = fixtureDocument();
    const state = await initializeDownload(document, navigator);
    assert.equal(state.url, release.dmgUrl);
    assert.equal(document.getElementById('primary-download').href, release.dmgUrl);
  }
});
