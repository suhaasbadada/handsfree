# Release packaging

Run on the existing Apple Silicon signing machine, with installed npm/Cargo dependencies, Rust documentation (runtime notices), and the existing local signing identity:

```sh
npm test
bash scripts/package-release.sh
```

The script builds through **npm run build:local** (never initializes/replaces the certificate), verifies arm64, bundle ID/version/minimum OS, stages the signed app and an Applications shortcut, copies explicit public documentation/dependency sources, generates notices, and creates a compressed **DMG with `hdiutil`**. It signs the DMG using the same existing certificate, runs `hdiutil verify`, mounts it read-only with no auto-open, verifies the contained app and required files, and unmounts. It writes `release/SHA256SUMS` and `release/PROVENANCE.txt` (source commit and dirty-tree status). No Finder Automation permission is required; no custom Finder window arrangement is promised. It neither installs nor launches the app, downloads a model, nor publishes anything. Python **3.11+** is only a packaging dependency.

The release label remains `v0.1.0-beta.1` while it is draft-only; embedded version stays `0.1.0`. Replace the draft's old ZIP candidate with `HandsFree-0.1.0-beta.1-macos-arm64.dmg` only after review. **Do not distribute a user-install ZIP.** The visible DMG root contains only `HandsFree.app`, the Applications shortcut, `Install HandsFree.txt`, and `Licenses`. The install guide prominently discloses the publication gate. Project LICENSE, full dependency notices, `THIRD_PARTY_SOURCES.tar.gz`, the gate notice, and maintainer documentation live under `Licenses`. The tarball is dependency source, not an installer. Notices remain outside the signed bundle. Keep the image with redistributions.

Outputs are never overwritten: move any previous DMG, checksum, and provenance aside explicitly before rerunning. Cleanup only removes this run's temporary staging directory. If unmounting fails, the script preserves that directory and reports its path; detach that exact mount before cleanup. A dirty-tree candidate is local evidence, **not a final release artifact**: rebuild from the reviewed clean commit for publication.

The candidate auditor also cleans its exact temporary mount/directory on SIGINT or SIGTERM and exits 130 or 143. Cleanup is idempotent; a failed detach preserves and reports the exact mount and directory rather than deleting mounted contents or using force/global detach. Its signal handlers are removed after cleanup. Synchronous verification commands can delay signal handling until they return.

## Release checklist (maintainer, manual)

1. Resolve and record the licensing decision below; do not treat tests or MIT metadata as approval. Keep `site/release.js` `publicAvailable: false` meanwhile.
2. Review and merge the changes; ensure GitHub **Checks** passes. Run `npm ci`, `npm test`, `npm run build`, Rust fmt/test/clippy from the PR template on the intended commit. CI uses a macOS arm64 host and no signing secrets. It does not publish or install.
3. From a clean reviewed commit on the existing signing machine, run `bash scripts/package-release.sh`. Confirm `PROVENANCE.txt` source commit/clean status, verify checksums, and independently inspect the mounted payload. Never initialize a new signing identity for a routine build.
4. With explicit user permission, validate installation on a separate Apple Silicon Mac: Gatekeeper behavior, drag to Applications, permissions, shortcut, microphone, inference, cancellation, paste fallback, and manual update. Record actual results; do not infer these from CI. No clean-machine results are claimed yet.
5. Update the draft release with **DMG**, `SHA256SUMS`, `PROVENANCE.txt`, and honest release notes. Set its target to the **full exact clean source SHA**, never an older commit or moving branch. Any existing tag must resolve to that same commit. Remove superseded installer ZIP/DMG assets, not the required source archive inside the image. Run `npm run release:check` to verify local checksums/provenance, pinned signatures, mounted contents, draft target/tag, uploaded asset sizes, and downloaded draft bytes. `npm run release:check -- --local` skips only GitHub for a pre-upload audit. The manifest covers both DMG and provenance. No audit uploads, installs or publishes. Do not publish while any gate remains unresolved; see [the readiness record](release-readiness.md).
6. After approval, publish the prerelease manually. Verify the exact DMG and checksum are publicly downloadable **without authentication** (a draft URL is not public). No API `/releases/latest` dependency: GitHub excludes prereleases there.
7. Only then set `site/release.js` `publicAvailable: true` with the verified version and exact DMG URL. Update README, release notes, and static/no-JS page availability together, run tests, and deploy Pages. For Mac browsers, this enables a direct, one-click DMG CTA, not a scroll/release-page detour. Never automatically start a download. Known Intel and non-Mac platforms remain unavailable.
8. Check the public page and download after deployment. To withdraw availability, set the manifest false and update static copy. Never point users at a draft, removed asset, or a Windows/Linux placeholder.

Future releases must update app/Cargo/npm versions together as appropriate and use a new release label/asset path. Never replace an already published binary under an existing version. Windows EXE and Linux packaging are future work, not outputs of this script.

## License inventory

`scripts/release-notices.py` reads **locked, offline Cargo metadata filtered to aarch64-apple-darwin** and the installed frontend API. It conservatively includes the complete resolved platform dependency set, including build-time crates (not a claim every crate is linked). Package IDs, declared SPDX expressions, authors, repository, Cargo checksums, and notice paths are recorded. Full registry source copies preserve embedded notices and supply corresponding source for MPL-2.0 components. No model or user data is bundled.

Native whisper.cpp/ggml source and notices are inside the `whisper-rs-sys` copy. Nested license/copyright/notice files are additionally copied into the notice tree. Rust's installed standard-library copyright inventory and license texts cover the Rust runtime. The frontend API includes its original MIT/Apache texts. HandsFree's own source is MIT licensed (see the root `LICENSE`); this does not change dependency licenses or clear the publication gate below. Cargo source copies come only from cached registry archives checked against Cargo.lock SHA-256 hashes, not local source additions. Upstream source can contain public test-key fixtures; those are not the user's signing keys or credentials.

Some registry crates omit separate license files: selectors embeds MPL notices; objc2-family crates refer to their upstream workspace document; alloc-stdlib omits its workspace BSD text. Checked-in supplements preserve the latter documents from exact `.cargo_vcs_info.json` revisions:

- `objc2-LICENSE.md`: https://raw.githubusercontent.com/madsmtm/objc2/d7d2fa23ceaa5e6096c923b081040e5d81b3b9df/LICENSE.md
- `alloc-stdlib-LICENSE`: https://raw.githubusercontent.com/dropbox/rust-alloc-no-stdlib/0a81fd6928ea3b33c8cd484aa4575d50ffb98012/LICENSE

**Publication gate:** objc2's upstream document expressly says the status of Apple-SDK-derived bindings is unclear. It also references MIT rather than supplying a copyright-bearing MIT grant for its crates. Packaging preserves all available evidence and standard license texts but cannot resolve that upstream legal uncertainty. Obtain a licensing decision/clarification before public redistribution; a candidate DMG does not clear this gate. Do not describe this inventory as legal approval.

Before publishing, review the inventory, clear this licensing gate, run the documented checks, and test on a separate Mac with explicit permission. Publish the exact verified DMG and checksum only after accepting those gates. No Apple Developer ID/notarization or clean-machine Gatekeeper validation is claimed.
