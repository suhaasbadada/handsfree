// Flip publicAvailable only AFTER publishing and verifying the public DMG asset.
// The embedded app version is 0.1.1; this is the distribution label.
export const release = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.6',
  publicAvailable: true,
  status: 'Experimental Mac beta 6 available. Explicit-button in-app practice; self-signed, not notarized.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.6/HandsFree-0.1.1-beta.6-macos-arm64.dmg',
});

// Preparation/audit coordinates only; the website continues to use release above.
// Beta 7 preparation only; published beta 6 remains active until byte verification.
export const candidateRelease = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.7',
  publicAvailable: false,
  status: 'Mac beta 7 candidate only; publication and installation acceptance pending.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.7/HandsFree-0.1.1-beta.7-macos-arm64.dmg',
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
