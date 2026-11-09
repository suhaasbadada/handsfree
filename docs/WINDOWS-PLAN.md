# Windows beta plan — paused / historical

> **Archived plan and implementation record, not a current roadmap.** Current product and development focus is Mac-only: Apple Silicon, macOS 14+. Windows work is paused; Linux is not supported. No port or release date is promised. Milestones, pending acceptance and delivery instructions below record the former Windows effort and do not authorize new work, publication or promotion. Preserve the shared code/platform facade for possible future ports.

## Scope

The historical experimental Windows x64 beta was [published](WINDOWS.md): existing dashboard/settings,
local English transcription, Right Ctrl alone or a custom global shortcut,
default Toggle and opt-in push to talk in beta 3
(existing saved shortcuts are preserved; Settings → Use default changes only the shortcut),
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

1. **Complete — platform seam:** native API selection, target dependencies, portable storage
   and target-specific configuration.
2. **Complete — Windows runtime implementation:** real microphone capture/resampling, registered shortcuts,
   non-activating controls and conservative text delivery.
3. **Complete — platform-aware settings:** correct shortcut labels, microphone setup and
   model download without macOS-only permission instructions.
4. **Complete — review, native Windows CI, packaging and experimental publication:**
   [run 41220795488](https://github.com/suhaasbadada/handsfree/actions/runs/41220795488)
   passed full MSVC/native tests, NSIS build and real-model CPU transcription.
   Public `v0.1.1-windows-beta.2` was built from `3d68d4b53e895988683b1c4372bc552eb4cf1a3b`;
   all six public assets were anonymously verified, all 614 internal checksum
   entries passed, and independent extraction matched the CI payload PE report.
   Historical beta.1 assets/audit remain immutable. Mac beta and Homebrew were unchanged by that release.
   Beta 3 adds optional push to talk from `bfe0a3f874b496777ab0342e22cac59220ad390d`;
   see [its build evidence and release notes](releases/v0.1.1-windows-beta.3.md).
5. **Pending — manual hardware acceptance:** installation, microphone, actual
   editors, clipboard, sound/HUD and SmartScreen checks in [the tester guide](WINDOWS.md).
   Publication is experimental, not a hardware-tested label. Record real results
   before claiming these cases passed; no scope expansion is required.

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

## Historical delivery process (inactive)

Commit and push validated milestones. Record exact CI/build results and remaining
testing in `docs/WINDOWS.md`. Website/README must distinguish source support,
download availability and hardware-tested status; never advertise a nonexistent
EXE. Never replace immutable published Mac assets.
