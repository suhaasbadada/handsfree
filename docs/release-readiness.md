# Mac beta candidate readiness

**Experimental beta; not legal or Apple certification.** The owner explicitly requested public experimental distribution on 2026-10-30; see [the recorded decision and upstream evidence](RELEASING.md#experimental-distribution-decision--2026-10-30). The free route is a stable, locally self-signed DMG for Apple Silicon, macOS 14+, English. No paid Apple Developer membership, notarization service, certificate installation, system-security bypass, or automatic publishing is required or performed. Self-signing does not provide Apple publisher verification or malware screening. Managed Macs may prohibit this installation route.

## Candidate acceptance record

| Gate | Status / evidence required |
| --- | --- |
| First install | Prepared: drag HandsFree to Applications, short install guide visible at image root; complete license/source tree retained under `Licenses`. No Finder Automation permission. |
| First dictation | Prepared: optional four-step Settings helper; explicit macOS permissions, one-time checksum-verified ~148 MB download, then offline. Escape/Cancel and manual copy fallback documented. |
| Recording duration | Implemented: persisted 2/3/4/5 minute selection, default 2; changes affect next recording. Synthetic/native tests and headless UI tests cover limits and failed preference writes; these are not real microphone/inference QA. |
| Final source/artifact identity | **Awaiting clean reviewed commit and rebuild.** `npm run release:check -- --local` checks full commit/tree, clean start/end provenance, both SHA-256 entries, pinned existing signing certificate, bundle ID/version/arm64/minimum OS, DMG integrity and payload. It reads but never replaces the installed Applications copy if present. |
| GitHub draft consistency | **Awaiting final asset upload and exact target correction by maintainer.** `npm run release:check` also requires draft + prerelease, exact full-SHA target, matching remote tag if one exists, and downloads all three assets to compare their bytes. An old target (including the earlier `4956fc3` target) must fail, not be waved through because checks passed elsewhere. |
| CI | Require successful Checks on the **final commit**, not a previous commit. Existing branch results are not final-candidate approval. |
| Separate-Mac installation | **Not yet verified; experimental risk accepted for owner-requested beta publication, not a claimed pass.** With explicit permission, check Gatekeeper, Applications copy, permissions, shortcut, capture/inference, 2–5 minute auto-stop, cancellation, failed capture recovery, paste fallback and manual update. |
| Dependency licensing | **Experimental distribution decision recorded 2026-10-30.** Upstream confirms declared license options; exact text supplements, original notices and source retained. Historical SDK-derived caveat and contributor-notice completeness are not legally certified. |
| Public availability | **Disabled.** Draft URLs are not public. Keep `site/release.js` false and static/no-JS copy unavailable until explicitly approved publication and anonymous download verification. |

## Upstream evidence and distribution scope

The checked-in evidence is `docs/licenses/objc2-LICENSE.md`, from the locked upstream revision [`d7d2fa23ceaa5e6096c923b081040e5d81b3b9df`](https://github.com/madsmtm/objc2/blob/d7d2fa23ceaa5e6096c923b081040e5d81b3b9df/LICENSE.md). Its **Apple SDKs** section asks whether distribution of SDK-derived bindings is allowed; its opening section declares license choices and links to MIT. This is upstream-stated uncertainty, **not a demonstrated license violation** and not resolved by HandsFree's own MIT license, an Apple membership fee, or a signing certificate.

Cargo.lock currently includes `objc2 0.6.5`, `block2 0.6.2`, `objc2-encode 4.1.0`, `objc2-exception-helper 0.1.1`, and `objc2-*` framework crates at `0.3.2`. The generated, platform-filtered `Licenses/THIRD_PARTY_NOTICES/inventory.json` is the authority for exact packaged dependency IDs, declared licenses and repositories; the inventory conservatively includes build dependencies, not just linked code. Full verified registry source and available upstream notices are retained, not stripped to make the image look cleaner.

The owner requested public experimental distribution; this is the recorded operational decision, not legal approval. Upstream #826 confirms older license fields, is closed, and added explicit copyright-bearing MIT/Apache/Zlib texts in `ee9a7ada2131f5944b8750428e265c15632f2a19`. Issue #23 concerns alternative relicensing. [Supplement provenance](licenses/README.md) preserves links, the contributor caveat and verbatim texts. The earlier absolute publication veto is withdrawn, not the historical evidence. If dependencies change, rebuild and re-audit from a new clean commit.

## Local preparation verification — 2026-10-30

- `npm test`: **98 passed**, including pure draft-target/dirty-provenance/checksum rejection fixtures, deterministic child-process SIGINT/SIGTERM cleanup/failure tests, and synthetic native capture/paste policy harnesses. The installed macOS 27 SDK emits an existing `installTap` deprecation warning; macOS 14 compatibility was not tested on hardware.
- `npm run build`, Rust fmt check, **36 Rust tests**, and clippy with `-D warnings`: **passed**.
- Headless app and website smoke tests: **passed** across 320–1280 px, including expanded setup help, recording-limit save/rollback, loading cancellation, actionable capture-error status and unavailable public download. No real microphone/model inference used.
- Exploratory **dirty-tree** packaging through `npm run build:local`: **passed**. Read-only mount inspection confirmed exactly four visible root items, all 312 inventoried packages and source archive retained, visible candidate warning, existing-certificate signatures on DMG/app, arm64 and bundle/minimum-OS metadata. Existing Applications copy was inspected read-only, **not updated**. Both manifest checksums passed. This exploratory image is archived locally and must not be uploaded as the final artifact.
- `release:check --local` on the dirty tree: **rejected as intended**. The final clean-source end-to-end checker and draft byte audit remain pending, not represented as passed. Read-only GitHub inspection confirmed the older full target SHA begins `4956fc3`; the by-tag release API returns 404 for this draft, so the checker enumerates authenticated releases and pins its release ID instead.

## Final handoff commands (maintainer)

Publication-preparation follow-up (2026-10-30): `npm test` **100 passed**;
`npm run build`, shell syntax, Python AST syntax and `git diff --check` passed.
Offline notice generation retained **312 packages**, the source archive and
byte-identical supplements. Headless website smoke passed at 320–1280 px,
including dark mobile, keyboard, reduced motion and no-JS unavailable fallback.
These results do not claim a fresh signed DMG, new CI result, GitHub upload,
public audit, installed app update or real microphone/separate-Mac QA.

After review, commit and push through the normal workflow, then wait for Checks on that SHA. Do not run packaging while another process edits/commits the source. Explicitly move previous candidate outputs to a named archive (never silently overwrite them).

```sh
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
bash scripts/package-release.sh
npm run release:check -- --local
```

Packaging uses `npm run build:local` and the existing certificate only; it does not install. After maintainer updates the **draft** target to `git rev-parse HEAD` (full SHA), uploads the DMG, SHA256SUMS and PROVENANCE.txt, and removes superseded installer ZIP/DMG assets:

```sh
npm run release:check
```

The second audit uses existing `gh` authentication with read-only API/download operations; no new secrets. Re-running is idempotent. It verifies a candidate, never legally certifies publication. A dirty-tree exploratory DMG cannot pass; a final clean rebuild and fresh upload are mandatory. After publishing under the recorded decision, run `npm run release:check -- --public` on that same clean source HEAD before website changes. It independently GETs all assets without credentials and requires a matching public prerelease and source tag. Then coordinate the website flag/static copy as documented in `RELEASING.md`. This preparation update itself does not claim final build, upload, anonymous audit, or new CI success.
