# Handsfree v1

A native macOS menu-bar dictation app for Apple Silicon (macOS 14+). Tap **Fn / 🌐** to record, tap again to transcribe locally and paste into the original text field. **Escape** cancels. The bottom-center, audio-responsive pill is an AppKit **non-activating NSPanel**, not a web window; it does not take keyboard focus.

## Build and launch

Requires Apple Silicon, Node **22.18+** (24 recommended), Rust stable, CMake, and current Xcode Command Line Tools with Swift and a macOS SDK. No Python runtime, account, paid API, or cloud transcription service is needed. Full Xcode may be needed if your Command Line Tools lack the Metal toolchain.

```sh
git clone https://github.com/suhaasbadada/handsfree.git
cd handsfree
npm ci
npm run tauri build -- --bundles app
open src-tauri/target/release/bundle/macos/Handsfree.app
```

The ad-hoc-signed app is for local use, not notarized distribution. Nothing installs into `/Applications` automatically. Launch the **same app bundle from the same path** after granting permissions; rebuilding/moving ad-hoc-signed binaries can invalidate macOS permission grants.

For normal use, quit the app, copy `src-tauri/target/release/bundle/macos/Handsfree.app` into `/Applications`, and launch that copy **before granting permissions**. If Handsfree is missing from Accessibility or Input Monitoring, click **+** in that pane and choose `/Applications/Handsfree.app`, then enable its switch. Quit and reopen Handsfree after granting access.

For frontend/native development: `npm run tauri dev`. Use the bundled `.app` for reliable privacy permission attribution; dev runs may show the terminal or development binary in System Settings. `npm run dev` alone only serves the settings UI and has no native bridge.

## First run (explicit actions only)

1. Click **Allow** for Microphone. If denied, enable Handsfree under System Settings → Privacy & Security → Microphone.
2. Click **Open** for Accessibility / Input Monitoring and enable Handsfree in **both** Privacy & Security panes. Accessibility is needed to inspect the original text field and post Paste; Input Monitoring is needed for the global Fn event tap. Quit/relaunch after changing grants. The app never changes preferences itself.
3. Click **Download** to explicitly fetch **Whisper base.en (147,964,211 bytes)** from `huggingface.co/ggerganov/whisper.cpp`. SHA-256 is pinned and verified before atomic installation. No model download happens on launch. Subsequent dictation works offline. Retry a failed download; partial files are discarded rather than resumed.
4. In Keyboard settings, set **“Press 🌐 key to” → Do Nothing**. Also disable macOS Dictation's Fn/double-Fn shortcut if enabled. Select a text box in another app and briefly tap Fn (under 450 ms). Fn held down, key repeats, Fn+arrows/F-keys, and modifier chords must not toggle recording. External keyboards that do not expose hardware Fn events are unsupported.

Close settings to keep the app in the menu bar. Left-click its waveform icon for settings / last transcript; right-click for the menu, cancel, or quit. There is no login-item auto-start in v1.

## Behavior and safety

- English-only `whisper-rs` / whisper.cpp inference with **Metal**. Four CPU worker threads; the model is loaded per utterance (a little extra startup latency, no permanent model memory). There is no LLM rewrite, grammar cleanup, filler deletion, or remote fallback.
- **Filler preservation is best-effort, not guaranteed.** A verbatim/disfluency prompt encourages “um”, “uh”, repetitions, etc., but Whisper can omit them, add punctuation, or hallucinate. v1 is not a lossless verbatim engine. Confirm accuracy before using consequential text.
- Uses the macOS default microphone, requesting 16 kHz mono signed-16-bit WAV. The pill responds to microphone power, not a simulated waveform. Quiet/short recordings and high no-speech-probability segments are rejected. Very soft speech may be treated as silence. At two minutes recording stops and transcribes automatically.
- One active recording/inference/download at a time; single-instance plugin prevents simultaneous processes sharing audio files. Generation tokens prevent cancelled inference from pasting. During inference, Cancel suppresses the result immediately but keeps the engine busy until its current computation returns (no unsafe forced context destruction).
- Stores the original frontmost app PID and focused Accessibility element. Immediately before Paste, **both must still match**, and the role must be a non-secure text field, text area, or combo box. Focus mismatch, password fields, missing AX support, and custom editors fall back to the last transcript in settings. It never activates the target app or sends Enter/Return. AX inspection and event delivery are not atomic; avoid switching focus at the exact instant transcription finishes.
- Inserts a single line: control characters (including newlines / Return, tabs, NUL, and Escape) become spaces. Words, punctuation, repetitions, and fillers are not rewritten. There is no simulated Enter key.
- Paste temporarily uses the system clipboard, then restores its previous contents after one second (or normal quit) **only if the clipboard has not changed**. A crash during that interval can leave the transcript on the clipboard. Clipboard managers / Universal Clipboard may observe the transcript. Slow apps can miss Paste; synthetic event delivery is not an insertion acknowledgement. The app retains the last result in memory for manual Copy even when Paste is attempted. Clipboard ownership is not a privacy boundary.
- Audio lives in `~/Library/Application Support/com.handsfree.local/recording.wav` inside an owner-only directory, and is deleted after success, failure, cancel, normal quit, and on next launch after a crash. Sudden process/OS failure can leave the WAV until next launch. The model lives in the same directory as `ggml-base.en.bin`. Transcripts are kept **only in process memory**, not a history database. No telemetry, analytics, or transcript uploads.
- Escape is observed, **not swallowed**, so it also reaches the foreground app. Fn is observed, not remapped. macOS Secure Input, lock screens, permission revocation, device disconnects, sandboxed/custom editors, full-screen Spaces, and clipboard consumers require manual testing. No automatic retry into another field.

## Verification

```sh
npm test                         # frontend state presentation
npm run build                    # strict TypeScript + production Vite build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build -- --bundles app
codesign --verify --deep --strict src-tauri/target/release/bundle/macos/Handsfree.app
```

Rust unit tests cover Fn tap/hold/repeat/chord filtering and silence/short/click rejection. Permission prompts, hardware Fn, actual capture, Metal inference with downloaded weights, paste correctness, Spaces placement, and filler accuracy require user-authorized interactive testing; compilation alone does not prove them.

### Manual acceptance checklist

In TextEdit, browser text areas, and your usual editor: verify start/stop without focus change, meter response, processing state, exactly one paste, no Enter, and clipboard restoration. Try “Um, I, I think, uh, you know, this works” and inspect filler retention. Test silence, Escape while recording/inference, rapid Fn taps, Fn+arrow, Fn held >450 ms, changing focus before completion, password fields, a disconnected microphone, denied permissions, and offline operation after model setup. Verify no paste after cancellation or focus mismatch.

## Layout

- `src/`: small TypeScript/Vite settings + onboarding; no microphone/browser speech API.
- `src-tauri/src/main.rs`: model lifecycle, verified explicit download, state/concurrency, WAV validation, local inference, tray, IPC.
- `src-tauri/src/logic.rs`: independently testable hotkey/silence logic.
- `src-tauri/native/Bridge.swift`: global CGEvent tap, AVAudioRecorder, AX target validation, clipboard paste, AppKit pill. Compiled to a static library by `build.rs`.
- `src-tauri/Info.plist`: microphone usage description and menu-bar (`LSUIElement`) application identity.

Upstream: [Tauri](https://v2.tauri.app/), [whisper-rs](https://github.com/tazz4843/whisper-rs), [whisper.cpp / model source](https://huggingface.co/ggerganov/whisper.cpp). Review their respective licenses before redistribution.
