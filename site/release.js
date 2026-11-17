// Flip publicAvailable only AFTER publishing and verifying the public DMG asset.
// The embedded app version is 0.1.1; this is the distribution label.
export const release = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1',
  publicAvailable: true,
  status: 'Stable Mac v0.1.1 published and public bytes verified. Homebrew offers the same release. Installed in-app update/restart and private dictation checks passed on the built-in Mac microphone. Self-signed, not notarized; separate-Mac installation, physical Fn and universal Bluetooth behavior are not verified.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1/HandsFree-0.1.1-macos-arm64.dmg',
});

// Candidate audit coordinates; the active release above is authoritative.
// Disabled even after publication; not a second availability switch.
export const candidateRelease = Object.freeze({
  schemaVersion: 1,
  version: '0.1.2',
  publicAvailable: false,
  status: 'Stable v0.1.2 candidate preparation; signed candidate acceptance and publication pending. Self-signed, not notarized; not an availability switch.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.2/HandsFree-0.1.2-macos-arm64.dmg',
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
