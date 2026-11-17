// Flip publicAvailable only AFTER publishing and verifying the public DMG asset.
// The embedded app version is 0.1.1; this is the distribution label.
export const release = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.23',
  publicAvailable: true,
  status: 'Experimental Mac beta 23 available. Exact signed-candidate hardware and private Practice checks passed; installed OTA/restart acceptance pending. Built-in Mac microphone only; self-signed, not notarized.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.23/HandsFree-0.1.1-beta.23-macos-arm64.dmg',
});

// Beta 24 candidate audit coordinates; the active release above is authoritative.
// Disabled even after publication; not a second availability switch.
export const candidateRelease = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.24',
  publicAvailable: false,
  status: 'Mac beta 24 candidate: simplified Home, Settings and product health UI. Exact signed-candidate hardware, private Practice, packaging, publication and installed OTA/restart acceptance remain pending; not an availability switch.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.24/HandsFree-0.1.1-beta.24-macos-arm64.dmg',
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
