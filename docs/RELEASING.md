# Release packaging

Run on the existing Apple Silicon signing machine, with installed npm/Cargo dependencies, Rust documentation (runtime notices), and the existing local signing identity:

```sh
npm test
bash scripts/package-release.sh
```

The script builds through **npm run build:local** (never initializes/replaces the certificate), verifies arm64, bundle ID/version/minimum OS, copies only the signed app and explicit public documentation/dependency sources, generates notices, archives with macOS `ditto`, extracts and verifies again, and writes `release/SHA256SUMS`. It neither installs nor launches the app, downloads a model, nor publishes anything. Python **3.11+** is only a packaging dependency.

The release label is `v0.1.0-beta.1`; embedded version stays `0.1.0`. The ZIP contains a named folder with `HandsFree.app`, installation instructions, notices, and `THIRD_PARTY_SOURCES.tar.gz`. Notices remain outside the signed bundle. Keep them with redistributions.

## License inventory

`scripts/release-notices.py` reads **locked, offline Cargo metadata filtered to aarch64-apple-darwin** and the installed frontend API. It conservatively includes the complete resolved platform dependency set, including build-time crates (not a claim every crate is linked). Package IDs, declared SPDX expressions, authors, repository, Cargo checksums, and notice paths are recorded. Full registry source copies preserve embedded notices and supply corresponding source for MPL-2.0 components. No model or user data is bundled.

Native whisper.cpp/ggml source and notices are inside the `whisper-rs-sys` copy. Nested license/copyright/notice files are additionally copied into the notice tree. Rust's installed standard-library copyright inventory and license texts cover the Rust runtime. The frontend API includes its original MIT/Apache texts. No license is selected for HandsFree itself. Cargo source copies come only from cached registry archives checked against Cargo.lock SHA-256 hashes, not local source additions. Upstream source can contain public test-key fixtures; those are not the user's signing keys or credentials.

Some registry crates omit separate license files: selectors embeds MPL notices; objc2-family crates refer to their upstream workspace document; alloc-stdlib omits its workspace BSD text. Checked-in supplements preserve the latter documents from exact `.cargo_vcs_info.json` revisions:

- `objc2-LICENSE.md`: https://raw.githubusercontent.com/madsmtm/objc2/d7d2fa23ceaa5e6096c923b081040e5d81b3b9df/LICENSE.md
- `alloc-stdlib-LICENSE`: https://raw.githubusercontent.com/dropbox/rust-alloc-no-stdlib/0a81fd6928ea3b33c8cd484aa4575d50ffb98012/LICENSE

**Publication gate:** objc2's upstream document expressly says the status of Apple-SDK-derived bindings is unclear. It also references MIT rather than supplying a copyright-bearing MIT grant for its crates. Packaging preserves all available evidence and standard license texts but cannot resolve that upstream legal uncertainty. Obtain a licensing decision/clarification before public redistribution; a candidate ZIP does not clear this gate. Do not describe this inventory as legal approval.

Before publishing, review the inventory, clear this licensing gate, run the documented checks, and test on a separate Mac with explicit permission. Publish the exact verified ZIP and checksum only after accepting those gates. No Apple Developer ID/notarization or clean-machine Gatekeeper validation is claimed.
