# Contributing

Small, focused pull requests are welcome. Discuss larger changes in an issue first. Today the app is an Apple Silicon macOS 14+ English beta; Windows and Linux are planned, not implemented.

See [development](docs/DEVELOPMENT.md) for local setup and native behavior. Use Node 24+, Rust stable, and the macOS command-line tools. Run the checks listed in the pull request template. CI checks frontend, Swift harnesses, Rust formatting/tests/clippy on macOS; it does not exercise real microphone input, permissions, inference, or Gatekeeper.

Keep the warm light/red design, keyboard accessibility, explicit permissions, and local-first behavior. Preserve user shortcut and cue preferences. Never add recordings, transcripts, downloaded models, personal diagnostics/settings, signing credentials, or build output to Git. Redact issue logs.

Use `npm run build:local` for local app updates **only with your existing signing identity**; never automatically replace an identity. Ordinary CI does not need signing credentials. Do not install or launch a newly built app without the user's permission.

Your contributions are provided under the project's [MIT license](LICENSE). Dependencies retain their own terms. Dependency changes require a notice/source and licensing review; see the [experimental beta distribution decision and upstream caveats](docs/RELEASING.md). A green build is not legal approval or authorization to publish a new release.
