# Signed in-app updates (Mac beta 7 onward)

Introduced in [published Mac beta 7](releases/v0.1.1-beta.7.md), not a retroactive
change to beta 6. Beta 6 and earlier need one initial DMG/Homebrew bootstrap
upgrade. [Beta 8](releases/v0.1.1-beta.8.md) fixes initial Updates dialog focus and
provides the first forward OTA test opportunity. Actual replacement/restart is
still pending user acceptance. Publication, feed deployment and OTA acceptance
are separate gates.

## User flow

On Apple Silicon macOS, choose **Updates** in the footer. The installed release is
read from metadata embedded in the executable, not the latest release feed or the
shared internal app version `0.1.1`. **Check for updates** explicitly contacts
`https://suhaasbadada.github.io/handsfree/updates/macos-arm64.json`.
Opening the dialog, starting the app, and status polling do not check online.
These requests disclose ordinary connection metadata to GitHub, never audio,
transcripts, model files, settings, or usage totals.

An available update offers **Download & restart…**, followed by confirmation of
the exact distribution version. No automatic installation, downgrade, or silent
restart is performed. A native idle barrier refuses updates during recording,
transcription, practice, shortcut capture, model download, or an unpasted result.
While downloading/installing, new work and quitting are blocked. The official
Tauri installer verifies the artifact signature and authenticated version before
replacement, then HandsFree restarts. macOS may request administrator approval.
Only the normal `/Applications/HandsFree.app` is eligible; symlinked,
translocated and unknown app copies are refused.

The model, preferences and usage file are outside the app and are not rewritten
by the updater. Unsaved in-memory last-transcript text does not survive restart;
copy anything important first. Offline/404/malformed-feed/signature/installation
failures are shown explicitly, not reported as “up to date.” An install failure
requires another explicit check before retrying. The exact anonymously verified
beta 8 feed is checked in for Pages deployment. Verify live HTTP 200 and exact
audited bytes separately. A 404 is an explicit failure, not an up-to-date result. Do not
invent beta 6 updater metadata or point the feed at the DMG.

## Trust and key custody

The official Mac-only `tauri-plugin-updater` verifies a dedicated updater
signature, with `requireSignedVersion: true`. Feed versions use strict semantic
ordering of the embedded distribution (for example beta 8 > beta 7), not the
stable internal version. The only accepted target is `darwin-aarch64`; URLs must
be the exact canonical versioned HandsFree GitHub `.app.tar.gz` asset. Metadata
expires after ten minutes and is revalidated against the confirmed version.

The updater public key is in `src-tauri/tauri.macos.conf.json`. Its private key is
kept at `~/Library/Application Support/HandsFree Updater Signing/handsfree-updater.key`
with owner-only file/directory access, outside Git. It is separate from, and does
not replace, the existing macOS code-signing identity. Never print, upload, commit,
or pass private key contents/passwords as command arguments. This local key is
filesystem-protected; keep a secure offline backup before depending on it for
public updates. Never overwrite/regenerate it for an ordinary release. Losing it
requires a separately authorized bootstrap/key-rotation plan for installed users.

## Release integration

1. Advance `src-tauri/distribution.json` for every new binary distribution. Keep
   the release tag, DMG label, updater archive and active public download version
   coordinated. Published version paths and signatures are immutable.
2. Use clean reviewed source. Do not enable
   Tauri's automatic pre-signing updater archive: the local signing helper applies
   the stable macOS identity after the Tauri build. Archive only that final app.
3. Run `bash scripts/package-release.sh` for coordinated DMG/updater preparation.
   It calls `node scripts/package-updater.mjs release/updater`, which builds with
   **`npm run build:local`** inside a guarded clean-source transaction, never
   trusting an earlier cached app. It verifies the
   existing macOS signature, current embedded frontend and distribution; stages
   dependency notices and corresponding source inside the updater's app (because
   OTA users do not mount the DMG); re-seals that copy with the same macOS identity;
   archives the signed bundle; signs with the dedicated key and `--app-version`; runs the
   real minisign verifier against the artifact, corrupt bytes and a tampered
   authenticated version; and writes provenance, checksums and a feed candidate.
   It never creates keys, installs, uploads or activates anything. Outputs refuse
   overwrite. It retains the final sealed `release/updater/HandsFree.app` for the
   DMG and authorized bootstrap installation; never substitute the raw build cache.
   Standalone updater preparation also accepts an explicit output directory.
   Preserve the generated archive, `.sig`, checksums and provenance.
4. Follow the existing DMG/notices/clean-source CI and publication audits. Publish
   the additional canonical `.app.tar.gz` and `.app.tar.gz.sig` assets under the
   **same exact clean-source tag**, with `UPDATER-PROVENANCE.txt` and
   `macos-arm64.json`. The root manifest covers all six public payload files;
   `SHA256SUMS` is the seventh public asset. The auditor verifies the real minisign
   signature without installing and compares the complete signed bundles in the
   archive, DMG and retained app. Keep project/dependency notices and sources
   available with that release; the DMG remains the complete redistribution image.
   Verify anonymous download bytes and signatures before activating the feed.
5. Only then publish the generated `macos-arm64.json` at `site/updates/`, with
   plain-text release notes if desired, and deploy Pages. Preserve its exact
   version/target/URL/signature. Update and verify Homebrew and the website's DMG
   links separately; they must select the same distribution. Never use GitHub's
   `/releases/latest`, which omits prereleases.
6. Validate a real authorized upgrade from the previous updater-enabled build:
   explicit confirmation, current signature/identity, retained permissions and
   model/settings/usage, restart/readiness, and representative dictation. Unit
   tests or a generated signature alone do not establish this acceptance gate.

Beta 7 publication, artifact verification and authorized manual bootstrap
installation are recorded in the release notes. Forward OTA installation/restart,
live audio acceptance and separate-Mac QA have not been performed. Windows work
remains paused.
