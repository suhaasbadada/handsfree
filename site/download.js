import { release, windowsRelease } from './release.js';

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

export function downloadState(platform, manifest, windowsManifest = windowsRelease) {
  const windowsUrl = publishedWindowsUrl(windowsManifest);
  if (platform.os === 'windows' && ['intel', 'unknown'].includes(platform.arch) && windowsUrl) {
    return { label: 'Download for Windows', detail: 'For Windows 10/11 x64 · CPU · English',
      note: '', url: windowsUrl, target: 'windows' };
  }
  const url = publishedUrl(manifest);
  const note = platform.os === 'mac' && platform.arch === 'intel' ? 'Intel Macs are not supported. Download only for another, Apple Silicon Mac.'
    : platform.os === 'windows' ? `${windowsUrl ? 'Windows beta is x64 only.' : 'Windows beta in testing. No verified installer available yet.'} ${platform.arch === 'arm64' ? 'Windows ARM is unsupported. ' : platform.arch === 'x86_32' ? '32-bit Windows is unsupported. ' : ''}Target: Windows 10/11 x64. This download is for an Apple Silicon Mac.`
    : platform.os === 'linux' ? 'Linux planned. This download is for an Apple Silicon Mac.'
    : platform.os === 'mobile' ? 'Mobile devices are unsupported. This download is for an Apple Silicon Mac.' : '';
  return { label: url ? (platform.os === 'mac' ? 'Download for Mac' : 'Get Mac beta') : 'Mac beta coming soon',
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

export function renderDownload(document, platform, manifest, windowsManifest = windowsRelease) {
  const state = downloadState(platform, manifest, windowsManifest);
  const macUrl = publishedUrl(manifest);
  const windowsUrl = publishedWindowsUrl(windowsManifest);
  const isWindows = state.target === 'windows';
  const brew = document.getElementById('hero-homebrew');
  if (brew) brew.hidden = platform.os !== 'mac' || platform.arch === 'intel' || !macUrl;
  setDownloadLink(document.getElementById('primary-download'), state.url,
    state.url ? (isWindows ? 'Download for Windows (x64 EXE)' : 'Download for Mac (Apple Silicon)') : state.label);
  document.getElementById('download-label').textContent = state.label;
  for (const [id, hidden] of [['primary-apple-icon', isWindows], ['primary-windows-icon', !isWindows]]) {
    const icon = document.getElementById(id);
    if (hidden) icon.setAttribute('hidden', '');
    else icon.removeAttribute('hidden');
  }
  const secondary = document.getElementById('secondary-mac-download');
  setDownloadLink(secondary, macUrl, macUrl ? 'Download for Mac (Apple Silicon)' : 'Mac beta coming soon');
  secondary.hidden = !isWindows;
  setDownloadLink(document.getElementById('mac-card-download'), macUrl,
    macUrl ? 'Download for Mac (Apple Silicon)' : 'Mac beta coming soon');
  setDownloadLink(document.getElementById('windows-card-download'), windowsUrl,
    windowsUrl ? 'Download for Windows (x64 EXE)' : 'Build verification pending');
  document.getElementById('windows-download-label').textContent = windowsUrl ? 'Download for Windows' : 'Build verification pending';
  document.getElementById('windows-release-badge').textContent = windowsUrl ? 'Experimental · x64' : 'In testing';
  document.getElementById('windows-release-status').textContent = windowsUrl
    ? `Windows beta v${windowsManifest.version} · EXE · Unsigned · Not yet hardware-tested.`
    : 'Windows beta in testing. Test installer pending verification; no public Windows download yet.';
  document.getElementById('download-requirements').textContent = state.detail;
  document.getElementById('download-platform-note').textContent = state.note;
  document.getElementById('release-status').textContent = publishedUrl(manifest)
    ? `Mac beta v${manifest.version} · DMG · Self-signed, not notarized.`
    : 'No public Mac download yet. Experimental beta assets are awaiting public verification.';
  return state;
}

export async function initializeDownload(document, navigator, manifest = release, windowsManifest = windowsRelease) {
  let hints = {};
  try { hints = await navigator.userAgentData?.getHighEntropyValues?.(['architecture', 'bitness']) || {}; }
  catch { /* Browsers may withhold hints; never infer Intel from a Mac UA. */ }
  return renderDownload(document, detectPlatform(navigator, hints), manifest, windowsManifest);
}

if (typeof document !== 'undefined') void initializeDownload(document, navigator);
