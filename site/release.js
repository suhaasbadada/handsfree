// Flip publicAvailable only AFTER publishing and verifying the public DMG asset.
export const release = Object.freeze({
  schemaVersion: 1,
  version: '0.1.5',
  publicAvailable: true,
  status: 'Stable Mac v0.1.5 published and public bytes verified. Signed candidate microphone capture, cancellation and built-in private dictation passed. Homebrew parity and v0.1.5 installed update/restart acceptance are pending. Self-signed, not notarized.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.5/HandsFree-0.1.5-macos-arm64.dmg',
});

// Candidate audit coordinates; the active release above is authoritative.
// Disabled even after publication; not a second availability switch.
export const candidateRelease = Object.freeze({
  schemaVersion: 1,
  version: '0.1.6',
  publicAvailable: false,
  status: 'Stable v0.1.6 candidate preparation; signed acceptance and publication pending. Self-signed, not notarized; not an availability switch.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.6/HandsFree-0.1.6-macos-arm64.dmg',
});

// Historical coordinates only. Windows development and public promotion are paused.
// Distribution tag differs from the embedded application/installer version (0.1.1).
export const windowsRelease = Object.freeze({
  schemaVersion: 1,
  publicAvailable: false,
  version: '0.1.1-windows-beta.3',
  appVersion: '0.1.1',
  installerUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-windows-beta.3/HandsFree-0.1.1-windows-x64-setup.exe',
  status: 'Paused. Historical Windows beta; unsupported and not offered for download.',
});
