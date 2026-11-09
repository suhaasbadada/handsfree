import { release } from './release.js';

// MacIntel and an "Intel Mac OS X" UA also occur on Apple Silicon.
// Only explicit UA Client Hints may establish Mac architecture; Windows ARM UAs are explicit too.
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
  const arch = os === 'windows' && architecture === 'x86' && hints.bitness === '32' ? 'x86_32'
    : /^(x86|x86_64|amd64)$/.test(architecture) ? 'intel'
    : architecture === 'arm64' || (architecture === 'arm' && (hints.bitness === '64' || os === 'windows'))
      || (os === 'windows' && /\b(?:ARM64|aarch64)\b/i.test(`${userAgent} ${platform}`)) ? 'arm64' : 'unknown';
  return { os, arch };
}

export function downloadState(platform, manifest) {
  const url = publishedUrl(manifest);
  const note = platform.os === 'mac' && platform.arch === 'intel' ? 'Intel Macs are not supported. Download only for another, Apple Silicon Mac.'
    : platform.os === 'mac' ? ''
    : `${platform.os === 'windows' ? 'Windows is not supported; Windows development is paused.' : platform.os === 'linux' ? 'Linux is not supported.' : platform.os === 'mobile' ? 'Mobile devices are not supported.' : 'Your device could not be identified as a supported Mac.'} Download only for another device: an Apple Silicon Mac running macOS 14+.`;
  return { label: url ? (platform.os === 'mac' ? 'Download for Mac' : 'Download for another Mac') : 'Mac download unavailable',
    detail: 'For Apple Silicon Mac · macOS 14+ · English', note, url, target: 'mac' };
}

export function publishedWindowsUrl(manifest) {
  const version = manifest?.version;
  const appVersion = manifest?.appVersion;
  if (typeof version !== 'string' || typeof appVersion !== 'string') return null;
  const expected = `https://github.com/suhaasbadada/handsfree/releases/download/v${version}/HandsFree-${appVersion}-windows-x64-setup.exe`;
  return manifest?.schemaVersion === 1 && manifest.publicAvailable === true
    && /^\d+\.\d+\.\d+-windows-beta\.\d+$/.test(version)
    && /^\d+\.\d+\.\d+$/.test(appVersion)
    && version.startsWith(`${appVersion}-windows-beta.`) && manifest.installerUrl === expected ? expected : null;
}

function publishedUrl(manifest) {
  // Restrict direct downloads to the exact canonical asset, never arbitrary manifest URLs.
  const version = manifest?.version;
  if (typeof version !== 'string') return null;
  const expected = `https://github.com/suhaasbadada/handsfree/releases/download/v${version}/HandsFree-${version}-macos-arm64.dmg`;
  const published = manifest?.schemaVersion === 1 && manifest.publicAvailable === true
    && /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version) && manifest.dmgUrl === expected;
  return published ? expected : null;
}

function setDownloadLink(cta, url, label) {
  cta.setAttribute('aria-label', label);
  if (url) {
    cta.href = url;
    cta.removeAttribute('aria-disabled');
    cta.removeAttribute('tabindex');
  } else {
    cta.removeAttribute('href');
    cta.setAttribute('aria-disabled', 'true');
    cta.setAttribute('tabindex', '-1');
  }
}

export function renderDownload(document, platform, manifest) {
  const state = downloadState(platform, manifest);
  const macUrl = publishedUrl(manifest);
  const brew = document.getElementById('hero-homebrew');
  if (brew) brew.hidden = platform.os !== 'mac' || platform.arch === 'intel' || !macUrl;
  setDownloadLink(document.getElementById('primary-download'), state.url,
    state.url ? 'Download for Mac (Apple Silicon)' : state.label);
  document.getElementById('download-label').textContent = state.label;
  setDownloadLink(document.getElementById('mac-card-download'), macUrl,
    macUrl ? 'Download for Mac (Apple Silicon)' : 'Mac download unavailable');
  document.getElementById('download-requirements').textContent = state.detail;
  document.getElementById('download-platform-note').textContent = state.note;
  document.getElementById('release-status').textContent = publishedUrl(manifest)
    ? `Mac beta v${manifest.version} · DMG · Self-signed, not notarized.`
    : 'No public Mac download yet. Experimental beta assets are awaiting public verification.';
  return state;
}

export async function initializeDownload(document, navigator, manifest = release) {
  let hints = {};
  try { hints = await navigator.userAgentData?.getHighEntropyValues?.(['architecture', 'bitness']) || {}; }
  catch { /* Browsers may withhold hints; never infer Intel from a Mac UA. */ }
  return renderDownload(document, detectPlatform(navigator, hints), manifest);
}

if (typeof document !== 'undefined') void initializeDownload(document, navigator);
