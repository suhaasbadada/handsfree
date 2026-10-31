# Windows beta plan

## Scope

Prepare an experimental Windows x64 beta: the existing dashboard/settings,
local English transcription, Ctrl+Shift+Space or a custom global shortcut,
recording controls, audio cues, safe insertion and clipboard fallback, and an
NSIS EXE installer. Linux, cloud services, new models and UI redesigns are out
of scope. Fn remains a macOS-only option.

## Mac protection

- Keep the Swift capture, overlay and delivery implementation unchanged.
- Select native backends and platform dependencies at compile time.
- Keep Mac signing, distribution artifacts, Homebrew, installed app and user
  settings untouched.
- Run existing Mac tests, formatting, Clippy and production build before
  integration. Review shared lifecycle and persistence changes independently.

## Milestones

1. Platform seam: native API selection, target dependencies, portable storage
   and target-specific configuration.
2. Windows runtime: real microphone capture/resampling, registered shortcuts,
   non-activating controls and conservative text delivery.
3. Platform-aware settings: correct shortcut labels, microphone setup and
   model download without macOS-only permission instructions.
4. Windows CI: compile/test on a Windows runner and build a versioned NSIS
   installer with checksums and provenance.
5. Review, fix findings, and rerun Mac and Windows checks. Publish only artifacts
   that passed the applicable build checks, labeled experimental and not yet
   hardware-tested. Keep current Mac download available throughout.

## Acceptance and boundaries

- No successful-looking placeholders for Windows functionality.
- No partial transcription, clipboard changes or usage increments after cancel.
- Refuse unsafe/ambiguous insertion; copy the result instead. Never activate a
  target window or simulate Enter.
- Explicit failures on audio overflow/device errors; bounded memory and ordered
  stop/drain. No microphone access during status polling or automated tests.
- Keep existing default recording limit, selected sound and model behavior.
- CI compilation is not microphone, editor, SmartScreen or installer testing.
  Supply the tester with a short, explicit manual acceptance checklist.
- No signing purchase, security bypass, automatic startup or elevated install.

## Delivery

Commit and push validated milestones. Record exact CI/build results and remaining
testing in `docs/WINDOWS.md`. Website/README must distinguish source support,
download availability and hardware-tested status; never advertise a nonexistent
EXE. Never replace immutable published Mac assets.
