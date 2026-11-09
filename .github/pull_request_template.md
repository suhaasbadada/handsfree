## Change

What changes, and why?

## Validation

- [ ] `npm ci`, `npm test`, `npm run build`
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --locked`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings`
- [ ] Relevant UI/manual checks described (or marked not run)
- [ ] Mac regressions checked; shared logic/platform facade and retained Windows implementation preserved (Windows CI is manual-only, not a routine gate)
- [ ] Docs, privacy, and dependency notices reviewed when affected

Current focus is Mac-only: Apple Silicon, macOS 14+. Windows work is paused; Linux is unsupported. No credentials, signing material, models, recordings, local settings, or build artifacts included. Do not claim microphone, permission, inference, or clean-machine installation checks unless actually performed. Distinguish hosted build tests from real hardware testing.
