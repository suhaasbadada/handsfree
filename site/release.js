// Flip publicAvailable only AFTER publishing and verifying the public DMG asset.
// The embedded app version remains 0.1.0; this is the distribution label.
export const release = Object.freeze({
  schemaVersion: 1,
  version: '0.1.0-beta.1',
  publicAvailable: true,
  status: 'Experimental Mac beta available. Not notarized.',
  dmgUrl: 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.0-beta.1/HandsFree-0.1.0-beta.1-macos-arm64.dmg',
});
