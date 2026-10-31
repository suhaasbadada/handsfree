# HandsFree

**Speak naturally. Keep your hands on your work.**

HandsFree is a native macOS menu-bar dictation app that turns speech into text locally on your Mac. Tap a shortcut, speak, and tap again to transcribe into the text field you started in.

- **Local transcription** with Whisper and Apple Silicon Metal acceleration. No account, paid API, telemetry, or transcript uploads.
- **Stay in flow:** a compact, focus-preserving recording capsule, live microphone meter, and Escape to cancel.
- **Your shortcut:** Fn / 🌐, Option + Space, Control + Shift + Space, or a custom combination.
- **Practical controls:** optional listening sounds, last-transcript copy, and local usage totals.
- **Safer insertion:** checks the original app and field before submitting Paste; if insertion is refused, copies the transcript for manual paste instead.

## Download · Apple Silicon beta

**Public download coming soon.** The first Mac beta is packaged, but publication is pending review of an upstream dependency's licensing caveat. See [release preparation](docs/RELEASING.md). A draft release is available to repository maintainers; it is not a public download.

[Published releases](https://github.com/suhaasbadada/handsfree/releases) · [Beta release notes](docs/releases/v0.1.0-beta.1.md)

**Requires macOS 14+ and Apple Silicon (M-series). English only.** Intel Macs, Windows, and Linux are not supported. The prebuilt app needs **no Node.js, Rust, or developer tools**. Release label: `v0.1.0-beta.1`; internal app version: `0.1.0`.

### Install (once the beta is published)

1. Download and unzip the archive. Inside its `HandsFree-0.1.0-beta.1-macos-arm64` folder, move **HandsFree.app to Applications before launching or granting permissions**. Keep the included third-party notices/source archive with your download.
2. Open `/Applications/HandsFree.app`. This beta is **not notarized** and is signed with a **local self-signed certificate, not Apple Developer ID**. macOS cannot verify its publisher and may block it. Only if you trust this download, use the normal **System Settings → Privacy & Security → Open Anyway** flow after attempting to open it. Wording and availability vary; if your organization's policy blocks it, **do not bypass that policy**. A local signature is not Apple approval or malware screening.
3. In HandsFree's Settings, explicitly allow **Microphone**, then enable **Accessibility** and **Input Monitoring** in System Settings → Privacy & Security. If needed, add the installed app with **+**. Quit and reopen after changing permissions. HandsFree never grants access for you.
4. Click **Download** for the English Whisper model (about **148 MB**, once, from Hugging Face). The app verifies its checksum. Internet is needed for this explicit setup download; dictation works offline afterward. No model is downloaded on launch.

### Start dictating

Select a text field in another app. Briefly tap **Fn / 🌐**, speak after the optional listening cue, then tap again to finish. **Escape** cancels. At two minutes, recording stops and transcribes automatically.

For Fn, set macOS Keyboard → **“Press 🌐 key to” → Do Nothing**, and disable conflicting Fn/double-Fn macOS Dictation shortcuts. Some external keyboards do not expose Fn; choose a combination instead. Shortcuts are observed, not swallowed, so avoid conflicts with the foreground app. Secure Input can block them.

If focus changes or a field is unsupported/secure/read-only, HandsFree does not automatically paste there. A successful transcript is copied instead: **Copied — paste anywhere**. You can also copy the last transcript from Overview. Fallback copy replaces your clipboard and leaves the transcript there; clipboard managers and Universal Clipboard may retain it. For a submitted Paste, the previous clipboard is restored after one second only if unchanged. Paste submission is **not confirmation** that the target accepted it; verify your text before retrying.

## Beta limitations & privacy

Whisper can omit fillers, alter punctuation, or hallucinate. This is not guaranteed verbatim transcription: **review important text**. Automatic insertion depends on app Accessibility support; hardware, permissions, audio routing, Spaces, and individual editors still need real-world testing. No cloud fallback, translation, login auto-start, or automatic updater is included. Updates are manual: quit the app, replace the Applications copy, then reopen; macOS may require reauthorization.

Audio is temporarily stored locally and deleted after completion/cancel/normal quit; a crash can leave it until next launch. The last transcript stays in process memory, not a history database. Only aggregate usage and settings persist alongside the model. See [detailed behavior, diagnostics, troubleshooting, and privacy](docs/DEVELOPMENT.md).

## Development & help

- [Build, stable local signing, diagnostics, tests, and manual checklist](docs/DEVELOPMENT.md)
- [Beta release notes](docs/releases/v0.1.0-beta.1.md)
- [Release packaging and third-party licensing](docs/RELEASING.md)
- [Report an issue](https://github.com/suhaasbadada/handsfree/issues) — include macOS version, Mac model, affected app, and diagnostics; do not post private recordings or transcripts.

Source is publicly viewable, but **no project license has been granted in this repository**. Third-party components retain their own licenses; the release includes their notices and corresponding source copies. This is not a claim that HandsFree itself is open-source licensed.
