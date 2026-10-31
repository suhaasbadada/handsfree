// Flip publicAvailable only AFTER publishing and verifying the public DMG asset.
// The embedded app version is 0.1.1; this is the distribution label.
export const release = Object.freeze({
  schemaVersion: 1,
  version: '0.1.1-beta.2',
  publicAvailable: true,
  status: 'Experimental Mac beta available. Not notarized.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.2/HandsFree-0.1.1-beta.2-macos-arm64.dmg',
});

// Independent from the published Mac beta. A CI candidate is not a public release.
// Set a real version/installer URL only after Windows build and runtime acceptance.
export const windowsRelease = Object.freeze({
  publicAvailable: false,
  version: null,
  installerUrl: null,
  status: 'Windows beta in testing. No verified installer available yet.',
});
