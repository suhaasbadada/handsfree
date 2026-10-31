<p align="center"><a href="https://suhaasbadada.github.io/handsfree/"><img src="site/assets/handsfree.png" width="96" height="96" alt="HandsFree logo"></a></p>

# HandsFree · BETA

**Don’t lose your train of thought.**

Say it while it’s clear. HandsFree turns your thoughts into text, without making typing the bottleneck.

[![License: MIT](https://img.shields.io/badge/License-MIT-706b68.svg)](LICENSE)
[![Mac beta: v0.1.1-beta.2](https://img.shields.io/badge/Mac_beta-v0.1.1--beta.2-a64a45.svg)](https://github.com/suhaasbadada/handsfree/releases/tag/v0.1.1-beta.2)
[![Platforms: Apple Silicon and Windows x64](https://img.shields.io/badge/Platforms-Apple_Silicon_%C2%B7_Windows_x64-706b68.svg)](#platforms)

## Download

### [Download for Mac (.dmg)](https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.2/HandsFree-0.1.1-beta.2-macos-arm64.dmg)

**Apple Silicon Mac · macOS 14+ · English.** Intel Macs are unsupported. This beta is self-signed, not notarized: see [Open Anyway and installation guidance](docs/INSTALL.md). No developer tools needed.

### [Download for Windows (.exe)](https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-windows-beta.1/HandsFree-0.1.1-windows-x64-setup.exe)

**Experimental · Windows 10/11 x64 (Intel/AMD) · CPU · English.** Unsigned; not yet hardware-tested. Windows ARM and 32-bit Windows are unsupported. [Windows install guide & SmartScreen guidance](docs/WINDOWS.md). No developer tools or account needed.

Prefer Homebrew on Mac? As a second option, with Homebrew already installed:

```sh
brew install --cask suhaasbadada/handsfree/handsfree
```

If Homebrew prompts for trust, review the [tap README](https://github.com/suhaasbadada/homebrew-handsfree#readme) first. Cask trust approves Homebrew code, not the app’s Apple identity or notarization. See [Homebrew setup and existing-app guidance](docs/INSTALL.md#homebrew-option).

[Website](https://suhaasbadada.github.io/handsfree/) · [Releases](https://github.com/suhaasbadada/handsfree/releases) · [Report a bug](https://github.com/suhaasbadada/handsfree/issues)

HandsFree is an open-source, local-first dictation companion. Tap a shortcut, speak, and get text in the field you started in. No account, paid API, telemetry, or cloud transcription service.
Mac beta and experimental Windows beta are available; Linux is planned.

## Features

- **Private by design:** Whisper runs locally with Apple Silicon Metal on Mac or CPU inference on Windows. Download the model once; dictate offline afterward. Windows CPU transcription may be slower.
- **Stay in flow:** a compact recording capsule, live mic meter, and Escape to cancel.
- **Your shortcut:** Fn / 🌐 on Mac, Ctrl+Shift+Space on Windows, or a custom key combination.
- **Practical controls:** optional listening sounds and local usage totals. Dictation text stays out of the app window.
- **Safer insertion:** checks the original app and field before submitting Paste; otherwise copies for manual paste.

## Use cases

- **Think out loud with your coding assistant:** give Claude Code or Codex the goal, context, and details in your own words.
- **Messages & email:** say the reply you have in mind. Review it, then send.
- **Notes & ideas:** capture a thought while it’s fresh; organize it afterward.
- **First drafts:** talk through the rough version, then edit.

No special integration is required: insertion depends on the focused field, with clipboard fallback for terminals and other custom editors. HandsFree doesn’t run commands.

## Platforms

| Platform | Status |
| --- | --- |
| macOS 14+, Apple Silicon | [Mac beta available](https://github.com/suhaasbadada/handsfree/releases/tag/v0.1.1-beta.2) · self-signed, not notarized |
| Intel Macs | Unsupported |
| Windows 10/11, x64 | [Experimental Windows beta available](https://github.com/suhaasbadada/handsfree/releases/tag/v0.1.1-windows-beta.1) · unsigned, not yet hardware-tested |
| Linux | Planned; no build or download available |

Windows ARM and 32-bit Windows are unsupported. Linux has no release date. The published Mac beta and Homebrew remain unchanged.

## Install

**Windows:** run the [EXE above](#download-for-windows-exe), then follow the [Windows guide](docs/WINDOWS.md): allow desktop microphone access in Windows Settings, explicitly download the English model (~148 MB), and use **Ctrl+Shift+Space**. Mac Accessibility/Input Monitoring permissions do not apply. Review the experimental limitations before testing.

### Mac

1. Open the DMG and drag **HandsFree.app to Applications**. Eject the disk image and launch the Applications copy before granting permissions.
2. If macOS blocks this unnotarized beta, only if you trust the download, use **System Settings → Privacy & Security → Open Anyway**. Respect your organization’s policies; a local signature is not Apple approval.
3. In HandsFree Settings, allow **Microphone**, then enable **Accessibility** and **Input Monitoring** in System Settings. Quit and reopen after changing permissions.
4. Click **Download** for the English Whisper model (~148 MB from Hugging Face, checksum verified). This explicit, one-time setup needs internet; dictation works offline afterward.

Focus a text field, briefly tap **Fn / 🌐**, speak, and tap again to finish. **Escape** cancels. Choose a different shortcut in Settings if Fn conflicts with macOS or your keyboard. If insertion is unavailable, paste the copied transcript yourself. **Review important text:** speech recognition can make mistakes.

[Full installation and troubleshooting guide](docs/INSTALL.md) · [Beta release notes](docs/releases/v0.1.1-beta.2.md)

## Build from source

For the Mac build: requires Apple Silicon, macOS 14+, Node 22.18+ (24 recommended), Rust stable, CMake, and Xcode Command Line Tools with Swift and a macOS SDK. For experimental Windows x64 builds and tester acceptance checks, see [Windows beta](docs/WINDOWS.md).

```sh
git clone https://github.com/suhaasbadada/handsfree.git
cd handsfree
npm ci
npm run tauri build -- --bundles app
```

The default build is **ad-hoc signed**, not notarized. Rebuilds can require renewed macOS permissions. For installed local updates, use `npm run build:local` with your existing signing identity; see [stable local signing and development](docs/DEVELOPMENT.md). Nothing installs automatically.

```sh
npm test       # automated checks
npm run build  # frontend typecheck and production build
```

## Contributing & support

Bug reports, documentation improvements, and focused contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started; include your OS version, CPU architecture, app version, and affected editor in bug reports, never private recordings or transcripts.

- [Security policy](SECURITY.md) — report vulnerabilities responsibly.
- [Development, privacy & diagnostics](docs/DEVELOPMENT.md) — local settings/usage persist; audio recordings and transcript history do not. Clipboard managers may retain copied text.
- [Website development](docs/WEBSITE.md) · [Release packaging](docs/RELEASING.md)

## License

HandsFree’s own code is [MIT licensed](LICENSE), © 2026 Suhaas Badada. Dependencies and speech models retain their own licenses. See [third-party notices and release caveats](docs/RELEASING.md) for upstream licensing details.
