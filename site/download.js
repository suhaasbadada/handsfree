import { release } from './release.js';

// MacIntel and an "Intel Mac OS X" UA also occur on Apple Silicon.
// Only explicit UA Client Hints may establish desktop architecture.
export function detectPlatform({ userAgent = '', platform = '', maxTouchPoints = 0, userAgentData } = {}, hints = {}) {
  const hinted = userAgentData?.platform || '';
  if (/Android|iPhone|iPad|iPod/i.test(`${userAgent} ${platform}`) || /Android|iOS/i.test(hinted)
      || (platform === 'MacIntel' && maxTouchPoints > 1)) return { os: 'mobile', arch: 'unknown' };
  let os = 'unknown';
  if (/^macOS$/i.test(hinted)) os = 'mac';
  else if (/^Windows$/i.test(hinted)) os = 'windows';
  else if (/^Linux$/i.test(hinted)) os = 'linux';
  else if (/Mac/i.test(platform) || /Macintosh/i.test(userAgent)) os = 'mac';
  else if (/Win/i.test(platform) || /Windows/i.test(userAgent)) os = 'windows';
  else if (/Linux/i.test(platform) || /Linux|X11/i.test(userAgent)) os = 'linux';
  const architecture = String(hints.architecture || '').toLowerCase();
  const arch = /^(x86|x86_64|amd64)$/.test(architecture) ? 'intel'
    : architecture === 'arm64' || (architecture === 'arm' && hints.bitness === '64') ? 'arm64' : 'unknown';
  return { os, arch };
}

export function downloadState(platform, manifest) {
  const url = publishedUrl(manifest);
  const note = platform.os === 'mac' && platform.arch === 'intel' ? 'Intel Macs are not supported. Download only for another, Apple Silicon Mac.'
    : platform.os === 'windows' ? 'Windows planned. This download is for an Apple Silicon Mac.'
    : platform.os === 'linux' ? 'Linux planned. This download is for an Apple Silicon Mac.' : '';
  return { label: url ? (platform.os === 'mac' ? 'Download for Mac' : 'Get Mac beta') : 'Mac beta coming soon',
    detail: 'For Apple Silicon Mac · macOS 14+ · English', note, url };
}

function publishedUrl(manifest) {
  // Restrict direct downloads to the exact canonical asset, never arbitrary manifest URLs.
  const version = manifest?.version;
  const expected = `https://github.com/suhaasbadada/handsfree/releases/download/v${version}/HandsFree-${version}-macos-arm64.dmg`;
  const published = manifest?.schemaVersion === 1 && manifest.publicAvailable === true
    && /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version) && manifest.dmgUrl === expected;
  return published ? expected : null;
}

export function renderDownload(document, platform, manifest) {
  const state = downloadState(platform, manifest);
  const cta = document.getElementById('primary-download');
  document.getElementById('download-label').textContent = state.label;
  cta.setAttribute('aria-label', state.url ? 'Download for Mac (Apple Silicon)' : state.label);
  if (state.url) {
    cta.href = state.url;
    cta.removeAttribute('aria-disabled');
    cta.removeAttribute('tabindex');
  } else {
    cta.removeAttribute('href');
    cta.setAttribute('aria-disabled', 'true');
    cta.setAttribute('tabindex', '-1');
  }
  document.getElementById('download-requirements').textContent = state.detail;
  document.getElementById('download-platform-note').textContent = state.note;
  document.getElementById('release-status').textContent = publishedUrl(manifest)
    ? `Mac beta v${manifest.version} · DMG · Self-signed, not notarized.`
    : 'No public Mac download yet. Experimental beta assets are awaiting public verification.';
  return state;
}

export async function initializeDownload(document, navigator) {
  let hints = {};
  try { hints = await navigator.userAgentData?.getHighEntropyValues?.(['architecture', 'bitness']) || {}; }
  catch { /* Browsers may withhold hints; never infer Intel from a Mac UA. */ }
  return renderDownload(document, detectPlatform(navigator, hints), release);
}

if (typeof document !== 'undefined') void initializeDownload(document, navigator);
