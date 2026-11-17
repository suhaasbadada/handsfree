## Change

What changes, and why?

Related issues (use `Fixes #...` only for bugs actually resolved by this PR):

## Review and risk

- Behavior changes and failure/rollback risks:
- Independent review results and unresolved findings:
- Native privacy, focus, FIFO/epoch/generation boundaries affected (or none):

## Validation

- [ ] `npm ci`, `npm test`, `npm run build`
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --locked`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings`
- [ ] Relevant UI/manual checks described (or marked not run)
- [ ] Mac regressions checked; shared logic/platform facade and retained Windows implementation preserved (Windows CI is manual-only, not a routine gate)
- [ ] Docs, privacy, and dependency notices reviewed when affected
- [ ] Exact PR head / check run recorded; independent review findings and discussions resolved
- [ ] No signing material, model/audio/user data, direct-main push or check bypass

- [ ] Current-head required checks passed and review discussions are resolved before merge

## Release impact

State whether this is source/candidate preparation, post-publication metadata
activation, or neither. If it is release work, link exact source/artifact/hardware
evidence and the owner's publication authorization. Mark installed OTA/dictation
and Homebrew parity separately; never infer them from green CI. No automatic
publication occurs on merge. See `docs/RELEASE-PROCESS.md`.

Current focus is Mac-only: Apple Silicon, macOS 14+. Windows work is paused; Linux is unsupported. No credentials, signing material, models, recordings, local settings, or build artifacts included. Do not claim microphone, permission, inference, or clean-machine installation checks unless actually performed. Distinguish hosted build tests from real hardware testing.
