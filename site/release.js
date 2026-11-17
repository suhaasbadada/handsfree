// Flip publicAvailable only AFTER publishing and verifying the public DMG asset.
// The embedded app version is 0.1.1; this is the distribution label.
export const release = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.24',
  publicAvailable: true,
  status: 'Experimental Mac beta 24 available. Exact signed-candidate hardware and private Practice checks passed; user-operated installed OTA/restart acceptance pending. Built-in Mac microphone only; self-signed, not notarized.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.24/HandsFree-0.1.1-beta.24-macos-arm64.dmg',
});

// Stable candidate audit coordinates; the active beta 24 above is authoritative.
// Disabled even after publication; not a second availability switch.
export const candidateRelease = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1',
  publicAvailable: false,
  status: 'Stable v0.1.1 candidate preparation: bugs 1 and 2 implementation and acceptance pending. Exact signed-candidate hardware, private Practice, packaging, publication and installed OTA/restart acceptance remain pending; self-signed, not notarized, no Apple approval; not an availability switch.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1/HandsFree-0.1.1-macos-arm64.dmg',
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
