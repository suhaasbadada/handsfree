# Windows native beta backend

This documents source implementation, not a published or hardware-tested EXE.
Windows 10/11 x64, desktop microphone access and WebView2 are required. The
dashboard/website and hosted Windows CI are separate milestones.

## Platform boundary

`src-tauri/src/platform` selects Swift FFI on macOS and Rust/Win32 on Windows.
Linux deliberately fails compilation. Swift source, Mac configuration, signing
and installed application are unchanged. Mac keeps Fn, native keycodes, Metal
and existing preferences. Windows uses Ctrl+Shift+Space and CPU inference with
four threads; physical DOM shortcut codes are translated to Windows VK codes.

Tauri 2.7's build helper validates only the common dependency's feature list,
not Cargo's target feature union. `build.rs` applies a build-helper-only override
for this check; runtime `generate_context!` reads the real, unchanged Mac
configuration and the Mac-only dependency enables private APIs. The Tauri CLI
also normalizes the common feature list when building: after a Mac CLI build,
keep `macos-private-api` in the Mac target dependency, not the common table.
Direct Cargo checks do not rewrite the manifest. Never change signing identity.

## Runtime

- CPAL's WASAPI default input uses the device's hardware format. The real-time
  callback copies owned, bounded packets with `try_send`, without app/UI locks.
  An owner/processing thread handles all channels and integer/float formats,
  downmixes to mono and uses a persistent adaptive 96–768-tap Hann-windowed sinc low-pass
  resampler to 16 kHz. Overflow/device failure emits one negative-count callback;
  it cannot deliver a successful partial transcription. Stop drops the stream,
  drains accepted packets and the filter, then joins before acknowledging.
  Cancellation discards data through the existing epoch/generation gates.
  Source-rate filter support scales with the input rate (8–384 kHz accepted),
  preserving at least 45 dB of 9 kHz alias rejection through 384 kHz. The
  maximum filter size and retained history are bounded at 768 source samples.
- Cue PCM is embedded from the existing Clean/Warm assets, gain-adjusted and
  played by Win32 on sound workers. A session snapshots its sound preferences.
  Capture waits for its start cue plus 180 ms, with cancellation checks. Only
  a healthy, intentional Finish plays the end cue after capture is drained.
  Explicit preview plays the selected end cue even when automatic cues are off.
- A dedicated message-loop thread owns `RegisterHotKey(MOD_NOREPEAT)`, shortcut
  capture mode, and the low-level Escape observer. Idle/injected keystrokes pass
  through. Only active dictation consumes Escape; Enter is never intercepted.
  Binding collisions and persistence failures restore the previous binding.
  Polling probes the owner with a two-second timeout without registering again.
- The compact Win32 HUD uses `NOACTIVATE`, tool-window/topmost styles and
  no-activate show/position/mouse handling. It never activates the target.
  Listening Cancel/Finish and processing Cancel dispatch the same native events
  as the keyboard. Input RMS drives the bars; reduced-motion mode is static.
  Work-area positioning and scaling use the foreground monitor's DPI. The
  window title describes state/actions, but custom hit areas are **not full UIA
  accessible buttons**; Escape and the global finish shortcut remain available.

## Conservative delivery

Clipboard ownership has its own message-only HWND thread. It uses
`MsgWaitForMultipleObjectsEx` plus bounded `PeekMessage`/`DispatchMessage` batches;
posted control messages wake and stop it. It never runs COM, clipboard
transactions or delivery commands. Consequently another app's synchronous
`WM_DESTROYCLIPBOARD` notification is dispatched even while UIA or delayed
rendering blocks the separate delivery worker. Teardown restores owned data,
releases UIA before COM uninitialization, destroys/joins the HWND owner, then
acknowledges quit. The Windows native regression test sends that exact owner
notification during a deliberately blocked command, without modifying the
machine's real clipboard.

A dedicated MTA COM owner captures foreground HWND/PID and focused UI Automation
runtime ID **before** the start cue. It refuses password, disabled, read-only,
unknown and unsupported fields. ValuePattern must report writable; TextPattern
fallback additionally requires Edit control type and explicitly false
IsReadOnly. UIA connection/transaction timeouts are configured when supported.
The original window/process/field and editability are checked again immediately
before clipboard publication and before `SendInput`; cancellation is checked
before and after potentially blocking UIA calls. No titles, coordinates, target
activation, Enter events, or editor-specific guessing are used.

Clipboard preservation supports HGLOBAL Unicode/ANSI/OEM text and locale only,
with a 16 MiB per-format bound. Unsupported/mixed formats refuse auto-paste and
intentionally copy the dictation instead, replacing those formats. Delayed
rendering must leave sequence and ownership unchanged before publication.
Restoration is best-effort after 800 ms, or during teardown, and only while the
backend still owns the exact sequence and transaction generation. Another app's
clipboard changes are never overwritten by restoration. Explicit transcript
copy supersedes any pending restoration and deliberately stays on clipboard.

`SendInput` is global and cannot atomically bind input to a field: there remains
an unavoidable race after the final identity check. Success means **shortcut
submitted**, not insertion acknowledged. Zero submitted events safely permit
copy fallback (including UIPI/elevated-editor rejection). Partial submission is
result **17**, "submission uncertain": release stuck keys, never retry or
automatically copy, and ask the user to inspect the original field. Result 16
remains cancellation; only refusals 1–15 trigger fallback. Recognized transcript
usage still counts as in the existing delivery flow, not as confirmed insertion.

## Status contract for the platform-aware dashboard

- `status.platform` is `macos` or `windows`.
- On Windows `microphone` means default input device present, **not** confirmed
  authorization. Polling never opens a stream. Actual access is attempted only
  by explicit recording; the native authorization diagnostic is -1 (unknown).
- Windows `accessibility` and `input_monitoring` are false/not applicable, not
  pretend grants. Windows readiness requires device/model/hotkey, not those
  Mac-only bits. Setup actions open Windows Settings, never Mac consent panels.
- Hook diagnostics: 1 connected, 101 registration conflict/failure, 102 Escape
  hook failure, 103 message-loop failure/timeout. Error messages do not include
  transcript, clipboard contents, target identity or recording data.
- Native event contract remains 4 Cancel, 5 Finish, 7 shortcut Toggle. Capture
  callbacks remain `(generation, epoch, mono16k pointer, count)`; negative count
  signals terminal capture failure. No callback acquires `Inner`.

Windows local data inherits the user's AppLocalData ACL; Unix chmod is not
claimed to implement Windows privacy. Repeated settings/statistics replacement
uses `MoveFileExW(REPLACE_EXISTING | WRITE_THROUGH)`, never remove-then-rename.
Unix directory/file modes (0700/0600) and directory fsync remain in place.

## Manual acceptance before a hardware-tested label

1. Install as a standard user on clean Windows 10/11 x64; verify WebView2 setup,
   tray, settings, uninstall and existing Mac download remaining available.
2. Deny desktop microphone access, disconnect/default-switch input, and test
   44.1/48/96 kHz mono/stereo/multichannel hardware. Confirm explicit failures,
   no partial delivery, bounded memory and reliable stop/restart.
3. Test default/custom shortcuts, collisions, shortcut capture, held modifiers,
   Escape during cues/recording/inference and repeated cancel/start. Idle Escape,
   typing and Enter must behave normally. Canceled work must not copy/count.
4. Test cue profiles/volume/mute/preview and Finish/cancel during pending cues.
   Confirm mic begins after the cue and cancel never plays a Finish cue.
5. Verify Notepad, a browser edit field and RichEdit; then password/read-only/
   unsupported/elevated editors. Change field/window during transcription.
   Refusals must copy once and never activate an editor or press Enter.
6. Verify empty/plain-text/mixed-image clipboard, another app updating it during
   delivery, explicit fallback/manual copy, delayed restoration and quit. Check
   partial-input result handling with an injected test adapter, not blind retry.
7. Check HUD actions without focus changes, multi-monitor mixed DPI/work areas,
   reduced animation and keyboard-only cancellation/finish. Record accessibility
   limitations rather than claiming fully accessible native HUD controls.

Automated compilation is not microphone, editor, installer or SmartScreen testing.

## Verification performed on the Mac development host (2026-10-30)

- `npm ci`, `npm test`: 108 passed (existing Swift SDK deprecation warnings).
- `npm run build`: TypeScript and production Vite build passed.
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`: passed.
- `cargo test`: 51 passed, one explicitly ignored existing-model smoke test.
  This includes hardware-rate resampler quality/duration/bounds/drain tests and
  shortcut registration/persistence rollback tests, without microphone access.
- `tauri build --no-bundle`: Mac optimized binary built without installing or
  opening an app. The CLI-normalized common Mac feature was then moved back to
  its target-only declaration. A final direct
  `cargo build --release --features tauri/custom-protocol` also passed.
- Windows native/backend modules and their test code passed Windows GNU-target
  type checking and Clippy with warnings denied in a temporary harness using
  the real CPAL and Windows crate versions/features. That harness substitutes
  only Whisper language lookup functions referenced by the transcript module;
  it does **not** validate the full Tauri/Whisper application or execute Windows
  tests. No production source contains that substitution.
- Full `cargo check --target x86_64-pc-windows-gnu --tests` was attempted but
  blocked in `ring` because this Mac lacks `x86_64-w64-mingw32-gcc`. A real
  Windows MSVC runner must build/test the complete app and installer next.
- `git diff --check` passed. Swift/native asset bytes, Mac Tauri configuration
  and signing script match the base commit. No installed app, speech models,
  microphone, credentials or user data were accessed or updated.

Windows WASAPI, Win32/UIA editor behavior, clipboard restoration, sound playback,
HUD input/DPI, NSIS installation and SmartScreen remain hardware/manual tests.

### Independent-review fixes

The clipboard HWND now has a dedicated, continuously pumped owner thread,
separate from potentially blocking delivery/COM work. Its Windows regression
test sends `WM_DESTROYCLIPBOARD` with a one-second timeout while the delivery
worker is deliberately blocked, and checks joined teardown; it never opens or
modifies the real clipboard. This native test was Windows-target typechecked
and linted on the Mac host, not executed there.

The resampler no longer uses a fixed source-rate tap count at 192/384 kHz.
Adaptive support retains the 48 kHz filter's time span, capped at 768 taps.
Hardware-free tests exercise stream/single-buffer equivalence, exact output
duration, bounded history, repeatable drain, 1 kHz passband and at least 45 dB
alias rejection at 9/9.1/9.5/10/12 kHz for 44.1/48/96/192/384 kHz input. The
measured 9 kHz rejection was -62.4 dB at 44.1 kHz and -84.3 dB at the other
tested rates. Mac Rust tests (51 passed, one ignored), formatting and Clippy
were rerun successfully, as was Windows-target native-module/test Clippy.
