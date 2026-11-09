# Release packaging

**Current release/development scope is Mac-only: Apple Silicon, macOS 14+.** Windows work is paused and Linux is not supported; neither port has a promised scope or release date. Retain historical assets and provenance unchanged. The [Windows records](WINDOWS.md) are historical, not an active packaging or promotion track. This guide is a procedure, not authorization to publish or deploy; an explicit user hold takes precedence.

Current public Mac distribution: **v0.1.1-beta.6**, embedded version **0.1.1**.
CI, publication and anonymous public-byte verification passed for the exact clean
artifact source; see [beta 6 evidence](releases/v0.1.1-beta.6.md). The active
`release` export and static downloads select verified beta 6. The separate disabled
`candidateRelease` export retains the artifact-source audit coordinates, not a
second availability switch. Website deployment and the cross-repository Homebrew
gate below remain distinct checks; do not claim either from artifact verification.
Windows beta 3 and historical Mac assets remain untouched. See
[practice](practice.md) for the explicit-button flow, not a shortcut/insertion test,
and [Compatibility paste](COMPATIBILITY-PASTE.md) for unchanged opt-in safeguards.

Run on the existing Apple Silicon signing machine, with installed npm/Cargo dependencies, Rust documentation (runtime notices), and the existing local signing identity:

```sh
npm test
bash scripts/package-release.sh
```

The script builds through **npm run build:local** (never initializes/replaces the certificate), verifies arm64, bundle ID/version/minimum OS, stages the signed app and an Applications shortcut, copies explicit public documentation/dependency sources, generates notices, and creates a compressed **DMG with `hdiutil`**. It signs the DMG using the same existing certificate, runs `hdiutil verify`, mounts it read-only with no auto-open, verifies the contained app and required files, and unmounts. It writes `release/SHA256SUMS` and `release/PROVENANCE.txt` (source commit and dirty-tree status). No Finder Automation permission is required; no custom Finder window arrangement is promised. It neither installs nor launches the app, downloads a model, nor publishes anything. Python **3.11+** is only a packaging dependency.

The published release label is `v0.1.1-beta.6`; embedded version is `0.1.1`. Its immutable asset is `HandsFree-0.1.1-beta.6-macos-arm64.dmg`. Public beta 5 remains unchanged: do not rebuild, replace, or re-upload a published artifact. Future releases require a new label and coordinated packaging/audit versions. **Do not distribute a user-install ZIP.** The visible DMG root contains only `HandsFree.app`, the Applications shortcut, `Install HandsFree.txt`, and `Licenses`. The install guide discloses experimental/self-signed status. Project LICENSE, full dependency notices, `THIRD_PARTY_SOURCES.tar.gz`, `PUBLICATION-NOTES.txt`, and maintainer documentation live under `Licenses`. The tarball is dependency source, not an installer. Notices remain outside the signed bundle. Keep the image with redistributions.

### Historical beta 5 artifact source

Beta 5 was built from clean source `c5f00405b7b9ec8164e9f1f89c8e1f8ab3696028`, retaining the existing signing identity. [Mac CI build result](https://github.com/suhaasbadada/handsfree/actions/runs/41513549954). DMG SHA-256 is `99c4399246a792b55fcc96dd624bf68a8972fd731c2e7898ef84349e4fd1a155`. Its archived [release notes](releases/v0.1.1-beta.5.md) and published assets remain unchanged. Windows beta 3 is independent and unchanged; see its [release evidence](releases/v0.1.1-windows-beta.3.md). Historical [beta 4 evidence](releases/v0.1.1-beta.4.md) remains intact.

### Beta 6 artifact source and activation

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

Packaging now refuses dirty source before building. The shared `windows-source-state.py --platform macos` guard snapshots exact manifest bytes, allows only Tauri CLI's known addition of the already Mac-target-enabled `macos-private-api` to common features, verifies all remaining TOML fields/source revision/status, and restores only those original bytes (also after a failed build). Any additional change aborts rather than hiding it and preserves `release/.mac-source-state.json` for investigation; do not remove that receipt until the source changes are understood. The Mac target feature and signing scripts/identity remain unchanged. The Windows default guard retains its existing behavior.

`check-macos-assets.mjs` checks the built app and mounted DMG: current Vite JavaScript/CSS must match Tauri's generated embedded bytes **inside the actual executable**, the JavaScript must contain `Your activity` without the old transcript/disclosure UI, and all four bundled Clean/Warm cues must byte-match committed source. A fresh `dist` beside an old executable is not sufficient. Re-audits need the ignored `dist` and `src-tauri/target/release/build` cache from this clean-source build; missing evidence fails closed. The only allowed WAV files are these four exact bundled cue resources, not recordings.

Outputs are never overwritten: move any previous DMG, checksum, and provenance aside explicitly before rerunning. Cleanup only removes this run's temporary staging directory. If unmounting fails, the script preserves that directory and reports its path; detach that exact mount before cleanup. A dirty-tree candidate is local evidence, **not a final release artifact**: rebuild from the reviewed clean commit for publication.

Beta 6 also requires compiled practice UI labels and all four practice command
names in the exactly embedded frontend, plus native-only practice error text in
the executable. Existing dashboard, push-to-talk, Compatibility paste, native
ABI, cue and icon checks remain mandatory. Practice and Compatibility paste
guides and the beta 6 notes must be present in the mounted documentation payload.

The candidate auditor also cleans its exact temporary mount/directory on SIGINT or SIGTERM and exits 130 or 143. Cleanup is idempotent; a failed detach preserves and reports the exact mount and directory rather than deleting mounted contents or using force/global detach. Its signal handlers are removed after cleanup. Synchronous verification commands can delay signal handling until they return.

## Release checklist (maintainer, manual)

1. Review the recorded experimental distribution decision and upstream evidence below. Tests and metadata are not legal approval. Retain `site/release.js` `candidateRelease.publicAvailable: false` as audit coordinates; preserve the verified public `release` export until a replacement passes all gates.
2. Review the intended source changes; ensure GitHub **Checks** passes. Run `npm ci`, `npm test`, `npm run build`, Rust fmt/test/clippy from the PR template on the intended commit. Never promote candidate coordinates into active downloads before the publication gates. CI uses a macOS arm64 host and no signing secrets. It does not publish or install.
3. From a clean reviewed commit on the existing signing machine, run `bash scripts/package-release.sh`. Confirm `PROVENANCE.txt` source commit/clean status, verify checksums, and independently inspect the mounted payload. Never initialize a new signing identity for a routine build.
4. With explicit user permission, validate installation on a separate Apple Silicon Mac: Gatekeeper behavior, drag to Applications, permissions, shortcut, microphone, inference, cancellation, paste fallback, and manual update. Record actual results; do not infer these from CI. No clean-machine results are claimed yet. This remains a candid experimental-beta risk, not a claim of release certification or a veto on the owner's requested experimental publication.
5. Update the draft release with **DMG**, `SHA256SUMS`, `PROVENANCE.txt`, and honest release notes. Set its target to the **full exact clean source SHA**, never an older commit or moving branch. Any existing tag must resolve to that same commit. Remove superseded installer ZIP/DMG assets, not the required source archive inside the image. Run `npm run release:check` to verify local checksums/provenance, pinned signatures, mounted contents, draft target/tag, uploaded asset sizes, and downloaded draft bytes. `npm run release:check -- --local` skips only GitHub for a pre-upload audit. The manifest covers both DMG and provenance. No audit uploads, installs or publishes. Artifact integrity checks must pass; see [the readiness record](release-readiness.md).
6. Under the owner's explicit experimental-publication authorization, publish the prerelease manually. Run `npm run release:check -- --public` from the same clean source commit before any website follow-up commit. This requires draft=false, prerelease=true, exact source target and existing tag resolving to that commit, and uses credential-free HTTPS GETs to compare all three public asset bytes. Default mode still rejects public releases; `--local` and `--public` cannot be combined. There is no `/releases/latest` dependency: GitHub excludes prereleases there. All modes still require HEAD to equal the packaged clean source commit; return to that dedicated source checkout to re-audit later rather than weakening identity checks.
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
