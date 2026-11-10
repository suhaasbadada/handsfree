// Flip publicAvailable only AFTER publishing and verifying the public DMG asset.
// The embedded app version is 0.1.1; this is the distribution label.
export const release = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.11',
  publicAvailable: true,
  status: 'Experimental Mac beta 11 available. Guided setup and private microphone check; self-signed, not notarized.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.11/HandsFree-0.1.1-beta.11-macos-arm64.dmg',
});

// Preparation/audit coordinates only; the website continues to use release above.
// Beta 12 candidate audit coordinates; not a second availability switch.
export const candidateRelease = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.12',
  publicAvailable: false,
  status: 'Mac beta 12 candidate: microphone selection, session timer and stable practice layout; not yet publicly verified.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.12/HandsFree-0.1.1-beta.12-macos-arm64.dmg',
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
