// Flip publicAvailable only AFTER publishing and verifying the public DMG asset.
// The embedded app version is 0.1.1; this is the distribution label.
export const release = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.8',
  publicAvailable: true,
  status: 'Experimental Mac beta 8 available. Updates dialog focus fix; self-signed, not notarized.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.8/HandsFree-0.1.1-beta.8-macos-arm64.dmg',
});

// Preparation/audit coordinates only; the website continues to use release above.
// Beta 9 preparation only; active downloads remain unchanged until verification.
export const candidateRelease = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.9',
  publicAvailable: false,
  status: 'Mac beta 9 preparation only; public availability is controlled above.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.9/HandsFree-0.1.1-beta.9-macos-arm64.dmg',
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
