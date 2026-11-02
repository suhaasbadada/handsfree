// Flip publicAvailable only AFTER publishing and verifying the public DMG asset.
// The embedded app version is 0.1.1; this is the distribution label.
export const release = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.5',
  publicAvailable: false,
  status: 'Experimental Mac beta 5 candidate. Optional Compatibility paste; self-signed, not notarized. Not yet published.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.5/HandsFree-0.1.1-beta.5-macos-arm64.dmg',
});

// Independent from the Mac beta. Exact public EXE and checksums verified anonymously.
// Availability does not imply hardware acceptance; keep the experimental label.
// Distribution tag differs from the embedded application/installer version (0.1.1).
export const windowsRelease = Object.freeze({
  schemaVersion: 1,
  publicAvailable: true,
  version: '0.1.1-windows-beta.3',
  appVersion: '0.1.1',
  installerUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-windows-beta.3/HandsFree-0.1.1-windows-x64-setup.exe',
  status: 'Experimental Windows beta 3 available. Right Ctrl Toggle default; optional push to talk. Unsigned; not yet hardware-tested.',
});
