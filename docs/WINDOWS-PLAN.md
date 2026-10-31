# Windows beta plan

## Scope

The experimental Windows x64 beta is [public](WINDOWS.md): existing dashboard/settings,
local English transcription, Right Ctrl alone or a custom global shortcut in current source
(published beta.1 still uses Ctrl+Shift+Space),
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
   [run 41191415412](https://github.com/suhaasbadada/handsfree/actions/runs/41191415412)
   passed full MSVC/native tests, NSIS build and real-model CPU transcription.
   Public `v0.1.1-windows-beta.1` was built from `1625d4874c15e2529b24adb04930bcd4efaf64df`;
   its seven public assets were anonymously verified. The post-bundle audit
   transparently supplements original metadata without changing installer bytes.
   Newer checksum/payload pipeline source `1bb9112` is independent; no later CI
   result is claimed here. Mac beta and Homebrew remain unchanged.
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

## Delivery

Commit and push validated milestones. Record exact CI/build results and remaining
testing in `docs/WINDOWS.md`. Website/README must distinguish source support,
download availability and hardware-tested status; never advertise a nonexistent
EXE. Never replace immutable published Mac assets.
