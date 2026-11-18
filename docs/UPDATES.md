# Signed in-app updates (Mac beta 7 onward)

Since v0.1.2, updates are entirely inline in the footer. Click the **update icon**
to check. In v0.1.5, a verified offer swaps the refresh icon for a download arrow
in the same spot. Its tooltip and accessible label show **Download & update** and
the exact version. Clicking it authorizes that version only, freshly rechecked
before download. Progress and retry details are available from the same control
without expanding the footer or opening a dialog. Local status reads never contact
the feed, and there is no unsolicited background download.

In v0.1.1 the footer check is labeled **Updates**. Homebrew releases are tracked
separately from this feed.

Published older betas still use their **Check for updates** dialog and **Download & restart**
action until upgraded. Stable v0.1.1 installed-app replacement/restart and private
dictation acceptance passed, alongside activation CI, Pages/feed byte readback and
Homebrew publication/readback and tap CI. See the [completion record](releases/v0.1.1.md)
for exact evidence and limits; publication alone does not establish these gates.

Introduced in [published Mac beta 7](releases/v0.1.1-beta.7.md), not a retroactive
change to beta 6. Beta 6 and earlier need one initial DMG/Homebrew bootstrap
upgrade. [Beta 8](releases/v0.1.1-beta.8.md) fixes initial Updates dialog focus and
provided the first forward OTA test opportunity. At that checkpoint, replacement/restart
was not completed. The first beta 7 → beta 8 attempt failed before installation;
see the repair evidence below. Publication, feed deployment and OTA acceptance
are separate gates.

## First forward-update failure and repair

[Beta 9](releases/v0.1.1-beta.9.md) is the published correction. The authorized
manual bootstrap completed with unchanged model/settings/usage hashes and signing
requirement, and fresh native readiness was verified. At that historical checkpoint,
the signed beta 9 feed returned HTTP 200 and matched audited bytes independently
of installation; this is not a claim about the current live feed.

The actual beta 7 → beta 8 attempt reported “The update operation stopped
unexpectedly.” The installed executable remained beta 7. A fresh-process Rust
regression reproduced a panic in the updater's reqwest 0.13 client: no rustls
crypto provider was configured. HandsFree restores already-validated metadata
instead of calling the plugin's network `check()`; that skipped the plugin's
provider initialization. Signature-only artifact tests did not exercise this.

The repaired builder explicitly initializes the already-selected ring provider
before restoring metadata, preserving any provider already set by the process.
The regression now passes, and an explicit acceptance test downloads the public
signed archive with the real plugin, verifies it, installs into a test-owned
temporary app bundle, verifies its signature/executable, and removes that bundle.
It never replaces or launches `/Applications/HandsFree.app` or reads user data.
Run it explicitly against the retained app for the live feed version:

```sh
HANDSFREE_UPDATER_REFERENCE_APP="$PWD/release/updater/HandsFree.app" \
  cargo test --manifest-path src-tauri/Cargo.toml --locked \
  updater::tests::public_download_and_isolated_install -- --ignored --exact
```

This is isolated installer evidence, **not** an actual installed-app restart or
dictation acceptance. Published beta 7 and beta 8 contain the client-side defect;
their immutable binaries/feed signatures are not replaced. A new corrected,
signed distribution requires one authorized manual bootstrap before its updater
can perform future upgrades. Merely retrying or upgrading manually to the old
published beta 8 does not repair the defect.

## User flow

On Apple Silicon macOS, click the **update icon** in the footer to check (**Updates** in v0.1.1). The installed
release is read from metadata embedded in the executable, not the latest release
feed or older betas' shared internal app version `0.1.1`. The explicit check contacts
`https://suhaasbadada.github.io/handsfree/updates/macos-arm64.json`.
Starting the app and ordinary status polling do not check online.
These requests disclose ordinary connection metadata to GitHub, never audio,
transcripts, model files, settings, or usage totals.

An available update offers **Download & update** and displays its exact version.
That explicit click is install/reopen consent for that version only. The controller
refreshes metadata first; a changed offer is shown and requires another click,
never silently substituted. The recheck is not an archive download. Navigation
during preparation revokes pending intent. Up-to-date, offline and malformed
responses never install. Failed checks expose an inline retry; no modal is needed.
No unsolicited installation or downgrade occurs. A native idle barrier refuses updates during recording,
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
requires another explicit check before retrying. For current feed activation and
live-byte verification status, see the [stable release record](releases/v0.1.1.md).
A 404 is an explicit failure, not an up-to-date result. Do not
invent beta 6 updater metadata or point the feed at the DMG.

## Trust and key custody

The official Mac-only `tauri-plugin-updater` verifies a dedicated updater
signature, with `requireSignedVersion: true`. Feed versions use strict semantic
ordering of the embedded distribution (for example beta 8 > beta 7), not the
stable internal version. The only accepted target is `darwin-aarch64`; URLs must
be the exact canonical versioned HandsFree GitHub `.app.tar.gz` asset. Metadata
expires at exactly ten minutes. Local status reads clear expired offers and their
notes without contacting the feed, except while an operation owns the state.
Failed checks/installs also clear unusable offers while retaining the installed
version. If explicit version intent outlives the cache, the same native RAII operation
refreshes metadata before acquiring the FIFO idle/install lease or downloading
any archive bytes. The same freshly verified confirmed version can proceed;
a different version is returned as a fresh offer and **requires another click**,
never silent substitution. Ordinary status polling still never
authorize a feed request. Signature, canonical URL, pinned key, version ordering,
install/quit exclusion and crypto-provider initialization remain mandatory.

Fake-clock/transport Rust tests and controller/fresh-document browser tests cover
expiry, same/newer/offline responses, stale callbacks and the cached-beta11 to
fresh-beta12 flow without downloading or installing a release. These are not
installed-app OTA, restart, microphone or hardware acceptance.

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

Historical beta publication and bootstrap evidence remain in their release notes.
The [stable release record](releases/v0.1.1.md) owns current hardware evidence and
completed installed OTA/restart and remaining separate-Mac acceptance limits. Windows work
remains paused.
