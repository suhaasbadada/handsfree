// Flip publicAvailable only AFTER publishing and verifying the public DMG asset.
// The embedded app version is 0.1.1; this is the distribution label.
export const release = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.22',
  publicAvailable: true,
  status: 'Experimental Mac beta 22 available. Capture-first startup, completion-only sound and compact controls; hardware permission test blocked, installed dictation and OTA acceptance unverified; self-signed, not notarized.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.22/HandsFree-0.1.1-beta.22-macos-arm64.dmg',
});

// Beta 23 candidate audit coordinates; the active release above is authoritative.
// Disabled even after publication; not a second availability switch.
export const candidateRelease = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.23',
  publicAvailable: false,
  status: 'Mac beta 23 candidate: certify actual input identity, formats and running state across configuration notifications and final drain. Three isolated hardware diagnostics passed; installed dictation, acoustic audibility, OTA, packaging, publication and public audit remain unverified; not an availability switch.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.23/HandsFree-0.1.1-beta.23-macos-arm64.dmg',
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
