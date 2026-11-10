# Release packaging

**Current release/development scope is Mac-only: Apple Silicon, macOS 14+.** Windows work is paused and Linux is not supported; neither port has a promised scope or release date. Retain historical assets and provenance unchanged. The [Windows records](WINDOWS.md) are historical, not an active packaging or promotion track. This guide is a procedure, not authorization to publish or deploy; an explicit user hold takes precedence.

Current public Mac distribution: **v0.1.1-beta.14**, embedded version **0.1.1**.
Source CI, publication and the anonymous-public seven-asset audit passed for the
exact clean artifact source `d7ea18e36141a9302f973637c926e190c286ecc8`, with
[passing source CI](https://github.com/suhaasbadada/handsfree/actions/runs/42785358444).
See the [published release](https://github.com/suhaasbadada/handsfree/releases/tag/v0.1.1-beta.14)
and [beta 14 evidence](releases/v0.1.1-beta.14.md). The active `release` export and
static downloads select audited beta 14; disabled `candidateRelease` retains
beta 14 audit coordinates only. Group 4 contains keyboard/recovery, system
appearance and the latest-offer updater repair without new AI. Activation is
metadata-only: it copies the exact generated signed feed, without reconstructing
its signature, and does not rebuild or replace the installed app. Artifacts and
their bundled preparation-era docs remain sourced from immutable `d7ea18e36141a9302f973637c926e190c286ecc8`.
DMG SHA-256: `d56e7db32ac886efdd9e97e534bf761e9e384c6973b64fbf053705dea2737f88`.
Updater archive SHA-256: `4b3e60ab151de30ed26a8e53f528dbd85a3793361d1393ed47a306968fa1d053`.
Exact audited feed SHA-256: `904d3231b67f4640281a40fb1f1919a94b173c36468b833cdbc232aff62d0139`.
Beta 13 outputs are preserved under `release/history/beta13-before-beta14-5v8sbkaw/`;
its [historical evidence](releases/v0.1.1-beta.13.md) remains unchanged.
Beta 12 outputs are preserved under `release/history/beta12-before-beta13-dsrbi6sn/`;
its [historical evidence](releases/v0.1.1-beta.12.md) remains unchanged.
Beta 11 outputs are preserved under `release/history/beta11-before-beta12-1bbihewj/`;
its [historical evidence](releases/v0.1.1-beta.11.md) remains unchanged.
Beta 10 outputs are preserved under `release/history/beta10-before-beta11-bbsw66sm/`;
its [historical evidence](releases/v0.1.1-beta.10.md) remains unchanged.
Beta 9 outputs are preserved under `release/history/beta9-before-beta10-ig1265gl/`.
Beta 8 outputs are preserved under `release/history/beta8-before-beta9-38tada9u/`.
The beta 7 → beta 8 attempt failed because the old client skipped TLS provider
initialization. Beta 9 repairs it; the owner-authorized manual bootstrap preserved
model/settings/usage hashes and signing identity and verified native readiness.
Do not describe this as a successful OTA restart; retain the
[beta 9 repair evidence](releases/v0.1.1-beta.9.md). Historical assets stay immutable.
Website/feed deployment and live byte readback, matching Homebrew publication,
remote cask readback and tap CI passed for group 1. See the exact activation/tap
SHAs and run IDs in [the four-release ledger](FEATURE-RELEASES.md#group-1-verified-completion-evidence).
Group 2 activation CI, Pages/live byte readback, matching Homebrew publication,
remote cask readback and tap CI passed; exact receipts are recorded in
[the completed group 2 ledger](FEATURE-RELEASES.md#group-2-publication-evidence--complete).
Hardware, separate-Mac and real OTA acceptance remain
unverified. The owner upgrades through the app; do not manually replace it.
Windows beta 3 and historical Mac assets remain untouched. See
[practice](practice.md) for the private button/shortcut flow, not an external insertion test,
and [Compatibility paste](COMPATIBILITY-PASTE.md) for unchanged opt-in safeguards.

## Beta 14 publication and metadata activation (group 4)

Distribution **v0.1.1-beta.14** retains embedded version **0.1.1**. The exact-source
anonymous-public seven-asset audit passed before this metadata activation.
Active website/feed/README/install coordinates select beta 14; the candidate
export remains disabled and package/audit/build coordinates are unchanged.
Keep the tracked current-feed hash pinned to audited beta 14; tests must not
depend on ignored `release/` artifacts. The actual artifact audit compared
generated feed bytes; normal tests use the tracked feed hash as equality oracle.

This fourth lean release covers keyboard menu/status scrolling and actionable
recovery, guarded workflow focus, system appearance without a native forced Light
theme/background, reduced motion/runtime contrast, and the latest-offer updater
bugfix. Explicit Download refreshes the feed before exact-version/revision
confirmation; changed or expired offers require review/reconfirmation, stale
offers/errors clear, and Check again remains available without an app restart.
Opening/status reads never authorize unsolicited feed polling. The beta 12 layout
stays stable, including the prior beta 12 layout fix. This repairs the user-reported
stale update/expiry problem. See [published scope and limitations](releases/v0.1.1-beta.14.md).

Source validation, exact-source CI, existing-identity signing and local/draft/public
audits passed. Command-line AppKit NSButton target/action tests are not
AXPress/VoiceOver acceptance. No installed OTA/restart, hardware or actual OS
login acceptance is claimed. Preserve the existing self-signed identity, updater
keys, permissions and model/settings/usage data; do not manually install the app.
This metadata-only activation copies the exact generated signed feed and audited
download coordinates. Still independently verify activation CI, Pages/live bytes,
Homebrew cask parity/readback and tap CI. No new AI features or product bloat.

## Beta 13 publication and metadata activation (group 3)

Immutable beta 13 artifact source: `aed1c5c213639958b3b418e54c2330b9ebc80e76`.
Distribution **v0.1.1-beta.13** retains embedded version **0.1.1**. At its activation,
release/site/feed/README/install metadata selected the anonymously audited public
assets; the disabled candidate export and package/build coordinates prepared
beta 14. The four sequential releases are owner-authorized, but publication
is not installed-app acceptance. See [published scope and honest remaining gates](releases/v0.1.1-beta.13.md).

Group 3 covers OS-authoritative launch at login (including approval and explicit
pending-registration cancellation), ephemeral pause for new shortcut starts,
persisted app exclusions and generation-bound menu Finish/Cancel. Accepted
holds/cue-waiting recordings and existing finish/cancel routes remain preserved.
Synthetic own-control click coverage does not establish actual AppKit/window
ordering, real OS login behavior, hardware or OTA acceptance.

Beta 12 outputs were preserved before packaging; no historical assets are
overwritten. Exact-source CI and the anonymous-public seven-asset audit passed
before this metadata-only activation. Copy the exact generated signed feed bytes,
not a reconstructed signature. Activation CI, Pages/live byte readback and matching
Homebrew cask publication/readback and tap CI passed, including independently
verified live site/feed bytes; see the [completed group 3 ledger](FEATURE-RELEASES.md#group-3-publication-evidence--complete).
No manual installed app replacement, data reset, new identity,
models or AI scope is authorized by these metadata edits. The reported stale
updater expiry bug is addressed only by group 4 / beta 14 source, not by changing
the immutable beta 13 artifacts.

## Beta 12 publication and metadata activation (group 2, completed)

Published distribution **v0.1.1-beta.12** retains internal app version **0.1.1**.
Exact-source CI and local/draft/anonymous-public seven-asset audits passed before
this metadata-only activation. Copy `release/macos-arm64.json` byte-for-byte to
`site/updates/macos-arm64.json`; do not reconstruct the signature. The disabled
`candidateRelease` remains disabled audit coordinates (now audited beta 14).
App behavior and immutable beta 12 artifacts do not change during activation;
the current packaging/distribution coordinates target the next candidate.
See [published scope and limitations](releases/v0.1.1-beta.12.md).

Preserve the existing signing identity, permissions and model/settings/usage
data; no installation, launch or OTA acceptance is implied by metadata tests.
All four releases require independent app/Homebrew distribution parity, not just
the last release; preserve the [mandatory cross-repository gate](#mandatory-cross-repository-homebrew-gate).

## Beta 7 artifact source and publication

Published tag `v0.1.1-beta.7` uses embedded app version `0.1.1` and exact clean
artifact source `95367c953fe0e229de236009a6cbaaef04f70f2e`.
[Mac CI passed](https://github.com/suhaasbadada/handsfree/actions/runs/42572677818).
The exact-source public audit passed for all seven anonymously downloaded assets,
including signatures, bundle equality and real minisign version/tamper rejection.
DMG SHA-256: `4cf304dfad49c68dbc7e0fd415fd35b0d1c0de634bc5bb3a610aa34930338a87`.
Updater archive SHA-256: `4b1818f5b547c194da1d8296af38ea1b141dd95a69629346049c594ba226eff6`.
The authorized manual bootstrap preserved the complete installed bundle, signing
requirement, readiness and model/settings/usage hashes after launch. See
[published notes and limitations](releases/v0.1.1-beta.7.md). Activation commits
are later website/docs changes, not artifact source. Forward OTA restart, live
audio and separate-Mac QA remain unperformed; live feed/website/Homebrew rollout
must be verified separately. Historical notes and assets remain immutable.

`package-release.sh` calls `node scripts/package-updater.mjs release/updater`.
That helper owns the guarded clean-source `npm run build:local` build, stages
notices and corresponding source inside the app, re-seals with the existing
macOS identity, signs the version-bound updater archive and exercises the real
minisign verifier. It retains **`release/updater/HandsFree.app`**, the final signed
bundle used unchanged by the DMG and authorized bootstrap installation. Never
substitute `src-tauri/target/release/bundle/macos/HandsFree.app`: that earlier
cache lacks the final resources/signature. No independent second build is used.
An unexpected source change preserves `release/updater/.mac-source-state.json`;
investigate that recovery receipt rather than deleting it or hiding changes.

Published `v0.1.1-beta.14` contains these seven assets from the same clean source; the exact-source anonymous-public audit passed:

- `HandsFree-0.1.1-beta.14-macos-arm64.dmg`
- `PROVENANCE.txt` (exact clean source commit/tree)
- `SHA256SUMS` (exactly six payload entries, excluding itself)
- `HandsFree-0.1.1-beta.14-macos-arm64.app.tar.gz`
- `HandsFree-0.1.1-beta.14-macos-arm64.app.tar.gz.sig`
- `UPDATER-PROVENANCE.txt` (same source and final executable hash)
- `macos-arm64.json` (exact version/target/canonical URL/uploaded signature)

The audit validates safe archive extraction, bundled notices, pinned signatures,
real minisign tamper/version-replay rejection without installing, and complete
bundle/executable equality across archive, mounted DMG and retained final app.
All seven remote assets must match local bytes; public mode uses anonymous GETs.
Default draft and explicit `--local` safety remain. Every mode still requires
HEAD to equal the artifact source, not a later rollout/website commit. Keep the
retained app and clean build cache for re-audit. Output refusal/receipt retention
and mount cleanup are not bypassed. These beta 7 requirements supersede the
historical beta 6 three-asset instructions below.

Only after exact-source publication verification may the primary maintainer
activate website/README/install links, publish the exact generated feed to Pages,
and coordinate the matching Homebrew URL/version/checksum. Preserve model,
settings, usage and permissions during authorized bootstrap installation.
Actual readiness/dictation and OTA replacement/restart acceptance remain separate
gates, not consequences of a successful artifact audit. Beta 6 requires a first
DMG/Homebrew upgrade; it cannot exercise the updater itself.

Beta 11 is the first of four separately gated, sequential feature releases.
Complete its exact-source validation, signed publication, anonymous public audit,
feed/site activation and matching Homebrew cask publication/readback before
advancing to the next feature release. App-repository/Homebrew distribution
parity is mandatory each time, not deferred until the final group. Live hardware
and actual OTA replacement/restart acceptance remain unverified until performed.

Run on the existing Apple Silicon signing machine, with installed npm/Cargo dependencies, Rust documentation (runtime notices), and the existing local signing identity:

```sh
npm test
bash scripts/package-release.sh
```

The script delegates **npm run build:local** and final app preparation to the updater helper (never initializes/replaces the certificate), verifies arm64, bundle ID/version/minimum OS, stages that retained signed app and an Applications shortcut, copies explicit public documentation/dependency sources, generates notices, and creates a compressed **DMG with `hdiutil`**. It signs the DMG using the same existing certificate, runs `hdiutil verify`, mounts it read-only with no auto-open, verifies the contained app and required files, and unmounts. It writes the seven assets and six-entry manifest listed above. No Finder Automation permission is required; no custom Finder window arrangement is promised. It neither installs nor launches the app, downloads a model, nor publishes anything. Python **3.11+** is only a packaging dependency.

The published release label is `v0.1.1-beta.8`; embedded version is `0.1.1`. Its immutable asset is `HandsFree-0.1.1-beta.8-macos-arm64.dmg`. Beta 7 and older remain unchanged: do not rebuild, replace, or re-upload a published artifact. **Do not distribute a user-install ZIP.** The visible beta 8 DMG root contains only `HandsFree.app`, the Applications shortcut, `Install HandsFree.txt`, and `Licenses`. The install guide discloses experimental/self-signed status. Project LICENSE, full dependency notices, `THIRD_PARTY_SOURCES.tar.gz`, `PUBLICATION-NOTES.txt`, and maintainer documentation live under `Licenses`. That source tarball is not an installer. Beta 7 onward also seals notices and corresponding source inside the app for OTA recipients. Keep the image with redistributions.

### Historical beta 5 artifact source

Beta 5 was built from clean source `c5f00405b7b9ec8164e9f1f89c8e1f8ab3696028`, retaining the existing signing identity. [Mac CI build result](https://github.com/suhaasbadada/handsfree/actions/runs/41513549954). DMG SHA-256 is `99c4399246a792b55fcc96dd624bf68a8972fd731c2e7898ef84349e4fd1a155`. Its archived [release notes](releases/v0.1.1-beta.5.md) and published assets remain unchanged. Windows beta 3 is independent and unchanged; see its [release evidence](releases/v0.1.1-windows-beta.3.md). Historical [beta 4 evidence](releases/v0.1.1-beta.4.md) remains intact.

### Historical beta 6 artifact source and activation

Beta 6 was built from clean source `cfd6854ed8875e612b10673513d7199bb5c8124a`.
[Mac CI](https://github.com/suhaasbadada/handsfree/actions/runs/42556991615) passed;
DMG SHA-256 is `56994da40e32922f16e3561daac12fa2ab3c4025cbc3a0f0d2b71719e67d5b1e`.
Publication and the exact-source `npm run release:check -- --public` passed,
including signatures, mounted practice payload and anonymous GET comparisons of
all three asset bytes. The existing Mac's installed executable matched, signing
requirement and permission grants were retained, and model/settings/usage hashes
were preserved after launch. Live microphone practice acceptance and separate-Mac
QA were not performed. These docs are a later activation follow-up, not a rebuild.

Keep `candidateRelease.publicAvailable` false. All audit modes select that exact
preparation export, never the active manifest. Public mode accepts the disabled
matching coordinates so immutable clean source can verify publication before
activation; version, URL, source, tag and byte checks remain mandatory. Preserve
the clean-source audit cache and provenance; do not weaken the HEAD/source check
to re-audit from a later website commit. Do not rebuild published beta 6 to refresh
its bundled preparation-era docs; use the current online release notes instead.

Packaging refuses dirty source before building. The shared `windows-source-state.py --platform macos` guard snapshots exact manifest bytes, allows only Tauri CLI's known addition of the already Mac-target-enabled `macos-private-api` to common features, verifies all remaining TOML fields/source revision/status, and restores only those original bytes (also after a failed build). Any additional change aborts rather than hiding it and preserves `release/updater/.mac-source-state.json` for investigation; do not remove that receipt until the source changes are understood. The Mac target feature and signing scripts/identity remain unchanged. The Windows default guard retains its existing behavior.

`check-macos-assets.mjs` checks the built app and mounted DMG: current Vite JavaScript/CSS must match Tauri's generated embedded bytes **inside the actual executable**, the JavaScript must contain `Your activity` without the old transcript/disclosure UI, and all four bundled Clean/Warm cues must byte-match committed source. A fresh `dist` beside an old executable is not sufficient. Re-audits need the ignored `dist` and `src-tauri/target/release/build` cache from this clean-source build; missing evidence fails closed. The only allowed WAV files are these four exact bundled cue resources, not recordings.

Outputs are never overwritten: move any previous DMG, checksum, and provenance aside explicitly before rerunning. Cleanup only removes this run's temporary staging directory. If unmounting fails, the script preserves that directory and reports its path; detach that exact mount before cleanup. A dirty-tree candidate is local evidence, **not a final release artifact**: rebuild from the reviewed clean commit for publication.

Beta 6 also requires compiled practice UI labels and all four practice command
names in the exactly embedded frontend, plus native-only practice error text in
the executable. Existing dashboard, push-to-talk, Compatibility paste, native
ABI, cue and icon checks remain mandatory. Practice and Compatibility paste
guides and the beta 6 notes must be present in the mounted documentation payload.

The candidate auditor also cleans its exact temporary mount/directory on SIGINT or SIGTERM and exits 130 or 143. Cleanup is idempotent; a failed detach preserves and reports the exact mount and directory rather than deleting mounted contents or using force/global detach. Its signal handlers are removed after cleanup. Synchronous verification commands can delay signal handling until they return.

## Release checklist (maintainer, manual)

For updater-enabled releases, also follow [the signed updater packaging and feed
gates](UPDATES.md#release-integration). The updater archive must be generated
**after** stable macOS signing, with a version-bound signature. The current
published beta 12 assets and feed availability must not be changed merely by
building a future updater release. Preserve exact-source CI/public audit gates;
never weaken them to accept a later activation HEAD.

1. Review the recorded experimental distribution decision and upstream evidence below. Tests and metadata are not legal approval. Retain `site/release.js` `candidateRelease.publicAvailable: false` as audit coordinates; preserve the verified public `release` export until a replacement passes all gates.
2. Review the intended source changes; ensure GitHub **Checks** passes. Run `npm ci`, `npm test`, `npm run build`, Rust fmt/test/clippy from the PR template on the intended commit. Never promote candidate coordinates into active downloads before the publication gates. CI uses a macOS arm64 host and no signing secrets. It does not publish or install.
3. From a clean reviewed commit on the existing signing machine, run `bash scripts/package-release.sh`. Confirm `PROVENANCE.txt` source commit/clean status, verify checksums, and independently inspect the mounted payload. Never initialize a new signing identity for a routine build.
4. With explicit user permission, validate installation on a separate Apple Silicon Mac: Gatekeeper behavior, drag to Applications, permissions, shortcut, microphone, inference, cancellation, paste fallback, and manual update. Record actual results; do not infer these from CI. No clean-machine results are claimed yet. This remains a candid experimental-beta risk, not a claim of release certification or a veto on the owner's requested experimental publication.
5. Update the draft release with **all seven assets listed above** and honest release notes. Set its target to the **full exact clean source SHA**, never an older commit or moving branch. Any existing tag must resolve to that same commit. Remove superseded installer ZIP/DMG assets, not the required source archive inside the image. Run `npm run release:check` to verify six payload checksums/provenance, pinned signatures, the updater feed and real minisign signature, equality of the archive/DMG/retained app, draft target/tag, uploaded asset sizes, and downloaded bytes. `npm run release:check -- --local` skips only GitHub for a pre-upload audit. No audit uploads, installs or publishes. Artifact integrity checks must pass; see [the readiness record](release-readiness.md).
6. Under the owner's explicit experimental-publication authorization, publish the prerelease manually. Run `npm run release:check -- --public` from the same clean source commit before any website follow-up commit. This requires draft=false, prerelease=true, exact source target and existing tag resolving to that commit, and uses credential-free HTTPS GETs to compare all seven public asset bytes. Default mode still rejects public releases; `--local` and `--public` cannot be combined. There is no `/releases/latest` dependency: GitHub excludes prereleases there. All modes still require HEAD to equal the packaged clean source commit; return to that dedicated source checkout to re-audit later rather than weakening identity checks.
7. Only then update the active `site/release.js` `release` export to `publicAvailable: true` with the verified version and exact DMG URL. Update README, release notes, installer guidance, and static/no-JS page availability together, run tests, and deploy Pages. For Mac browsers, this enables a direct, one-click DMG CTA, not a scroll/release-page detour. Never automatically start a download. Mac builds do not gain Intel or non-Mac support from a download link.
8. **Mandatory cross-repository Homebrew gate:** update `suhaasbadada/homebrew-handsfree`'s cask distribution version, exact DMG URL, and SHA-256 to match the same anonymously verified public artifact. Review and publish that tap change before claiming that the recommended Homebrew command delivers the latest customer download. Verify the remote cask contents; app bundle version `0.1.1` alone cannot identify the distribution beta. Existing Homebrew users use `brew update` then `brew upgrade --cask suhaasbadada/handsfree/handsfree`. Preserve models/settings/statistics: no `--zap`, data deletion, or totals reset. Cask metadata checks do not imply an actual installed-app upgrade or onboarding test; perform those only with explicit permission. Do not change quarantine or global Gatekeeper policy.
9. Check the public page and download after deployment, and confirm both direct DMG and Homebrew paths select the same release. To withdraw availability, set the manifest false and update static copy and the tap as appropriate. Never point users at a draft, removed asset, or a Windows/Linux placeholder.

Future releases must update app/Cargo/npm versions together as appropriate and use a new release label/asset path. Never replace an already published binary under an existing version. Historical Windows EXE packaging is retained but paused; Windows and Linux installers are not outputs of this script.

## License inventory

`scripts/release-notices.py` reads **locked, offline Cargo metadata filtered to aarch64-apple-darwin** and the installed frontend API. It conservatively includes the complete resolved platform dependency set, including build-time crates (not a claim every crate is linked). Package IDs, declared SPDX expressions, authors, repository, Cargo checksums, and notice paths are recorded. Full registry source copies preserve embedded notices and supply corresponding source for MPL-2.0 components. No model or user data is bundled.

Native whisper.cpp/ggml source and notices are inside the `whisper-rs-sys` copy. Nested license/copyright/notice files are additionally copied into the notice tree. Rust's installed standard-library copyright inventory and license texts cover the Rust runtime. The frontend API includes its original MIT/Apache texts. HandsFree's own source is MIT licensed (see the root `LICENSE`); this does not change dependency licenses. Cargo source copies come only from cached registry archives checked against Cargo.lock SHA-256 hashes, not local source additions. Upstream source can contain public test-key fixtures; those are not the user's signing keys or credentials.

Some registry crates omit separate license files: selectors embeds MPL notices; objc2-family crates refer to their upstream workspace document; alloc-stdlib omits its workspace BSD text. Checked-in supplements preserve the latter documents from exact `.cargo_vcs_info.json` revisions:

- `objc2-LICENSE.md`: https://raw.githubusercontent.com/madsmtm/objc2/d7d2fa23ceaa5e6096c923b081040e5d81b3b9df/LICENSE.md
- `alloc-stdlib-LICENSE`: https://raw.githubusercontent.com/dropbox/rust-alloc-no-stdlib/0a81fd6928ea3b33c8cd484aa4575d50ffb98012/LICENSE

## Experimental distribution decision — 2026-10-30

The repository owner, Suhaas Badada, explicitly requested a free public experimental Mac beta, self-signed and not notarized. The implementation follows that distribution decision, not a legal opinion. The earlier unconditional publication prohibition overstated the evidence and is withdrawn; original notices and caveats are not withdrawn.

The resolved `block2 0.6.2`, `objc2 0.6.5`, `objc2-encode 4.1.0` and `objc2-foundation 0.3.2` declare MIT; the other objc2 framework crates offer Zlib OR Apache-2.0 OR MIT. The maintainer confirmed old crate license fields in [#826](https://github.com/madsmtm/objc2/issues/826#issuecomment-6103078978). [#23](https://github.com/madsmtm/objc2/issues/23) is alternative relicensing discussion, not absence of the MIT option. #826 is closed; explicit MIT/Apache/Zlib texts were added in [ee9a7ada2131f5944b8750428e265c15632f2a19](https://github.com/madsmtm/objc2/commit/ee9a7ada2131f5944b8750428e265c15632f2a19) on 2026-03-18. Verbatim texts are included as supplements with their original copyright and origin in [licenses/README.md](licenses/README.md).

**Remaining caveat:** the historical workspace document questions the licensing implications of Apple-SDK-derived bindings. That is actual upstream uncertainty, not a specific redistribution prohibition. The maintainer also [notes other contributors](https://github.com/madsmtm/objc2/issues/826#issuecomment-6107377999); the new texts do not certify complete contributor notices. Original hashed registry sources, authors metadata, inline notices and historical workspace document remain intact. The inspected objc2 package sources contain no `.h`/`.tbd` SDK files; this observation is not a legal conclusion. No legal certification or Apple approval is claimed.

Publish only the exact clean-source verified DMG and checksums under the recorded experimental decision, preserving notices and sources. Seek further upstream clarification where appropriate. Separate-Mac QA remains unverified and is disclosed in release notes; no Apple Developer ID/notarization or clean-machine Gatekeeper validation is claimed.
