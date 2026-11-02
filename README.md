<p align="center"><a href="https://suhaasbadada.github.io/handsfree/"><img src="site/assets/handsfree.png" width="96" height="96" alt="HandsFree logo"></a></p>

# HandsFree · BETA

**Don’t lose your train of thought.**

Say it while it’s clear. HandsFree turns your thoughts into text, without making typing the bottleneck.

[![License: MIT](https://img.shields.io/badge/License-MIT-706b68.svg)](LICENSE)
[![Mac beta: v0.1.1-beta.5](https://img.shields.io/badge/Mac_beta-v0.1.1--beta.5-a64a45.svg)](https://github.com/suhaasbadada/handsfree/releases/tag/v0.1.1-beta.5)
[![Platforms: Apple Silicon and Windows x64](https://img.shields.io/badge/Platforms-Apple_Silicon_%C2%B7_Windows_x64-706b68.svg)](#platforms)

## Download & install

### Mac — Homebrew recommended

**Apple Silicon Mac · macOS 14+ · English.** Open Terminal and paste (if needed, [install Homebrew first](https://brew.sh/)):

```sh
brew install --cask suhaasbadada/handsfree/handsfree
```

Homebrew simplifies installation; macOS security prompts may still appear. This beta is self-signed, not notarized. If Homebrew 7 reports an untrusted cask, review the [tap repository](https://github.com/suhaasbadada/homebrew-handsfree#readme). Only if you trust its code, run `brew trust --cask suhaasbadada/handsfree/handsfree`, then retry the install. Cask trust is not Apple approval.

Open **Applications → HandsFree**, allow Microphone, Accessibility, and Input Monitoring, then download the English model (~148 MB) in Settings → Overview. [Complete Mac setup, security prompts & existing-app guidance](docs/INSTALL.md).

### [Download for Mac (.dmg)](https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.5/HandsFree-0.1.1-beta.5-macos-arm64.dmg)

**DMG alternative:** drag HandsFree to Applications before opening it or granting permissions. Intel Macs are unsupported. See [Open Anyway and installation guidance](docs/INSTALL.md). No developer tools needed.

### [Download for Windows (.exe)](https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-windows-beta.3/HandsFree-0.1.1-windows-x64-setup.exe)

**Experimental · Windows 10/11 x64 (Intel/AMD) · CPU · English.** Unsigned; not yet hardware-tested. Windows ARM and 32-bit Windows are unsupported. [Windows install guide & SmartScreen guidance](docs/WINDOWS.md). No developer tools or account needed.

[Website](https://suhaasbadada.github.io/handsfree/) · [Releases](https://github.com/suhaasbadada/handsfree/releases) · [Report a bug](https://github.com/suhaasbadada/handsfree/issues)

HandsFree is an open-source, local-first dictation companion. Tap a shortcut, speak, and get text in the field you started in. No account, paid API, telemetry, or cloud transcription service.
Mac beta and experimental Windows beta are available; Linux is planned.

## Features

- **Private by design:** Whisper runs locally with Apple Silicon Metal on Mac or CPU inference on Windows. Download the model once; dictate offline afterward. Windows CPU transcription may be slower.
- **Stay in flow:** a compact recording capsule, live mic meter, and Escape to cancel.
- **Your shortcut:** Fn / 🌐 on Mac, Right Ctrl on Windows, or a custom key combination. Toggle is the default; opt into **Settings → Recording mode → Push to talk** to hold and release. Existing saved shortcuts are preserved.
- **Practical controls:** optional listening sounds and local usage totals. Dictation text stays out of the app window.
- **Safer insertion:** checks the original app and field before submitting Paste; otherwise copies for manual paste.
  Mac beta 5 users can opt into **Settings → Compatibility paste** for apps that hide their text field. It requires the same verified active app/window, but cannot verify the exact field. It is off by default, including upgrades; missing window proof or focus monitoring still requires manual paste. A submitted shortcut does not confirm insertion; no automatic retry or Enter is sent. See [delivery safeguards and limits](docs/COMPATIBILITY-PASTE.md).

## Use cases

- **Think out loud with your coding assistant:** give Claude Code or Codex the goal, context, and details in your own words.
- **Messages & email:** say the reply you have in mind. Review it, then send.
- **Notes & ideas:** capture a thought while it’s fresh; organize it afterward.
- **First drafts:** talk through the rough version, then edit.

No special integration is required: insertion depends on the focused field, with clipboard fallback for terminals and other custom editors. HandsFree doesn’t run commands.

## Platforms

| Platform | Status |
| --- | --- |
| macOS 14+, Apple Silicon | [Mac beta 5 available](https://github.com/suhaasbadada/handsfree/releases/tag/v0.1.1-beta.5) · self-signed, not notarized |
| Intel Macs | Unsupported |
| Windows 10/11, x64 | [Experimental Windows beta 3 available](https://github.com/suhaasbadada/handsfree/releases/tag/v0.1.1-windows-beta.3) · unsigned, not yet hardware-tested |
| Linux | Planned; no build or download available |

Windows ARM and 32-bit Windows are unsupported. Linux has no release date.

## Install

**Windows:** run the [EXE above](#download-for-windows-exe), then follow the [Windows guide](docs/WINDOWS.md): allow desktop microphone access in Windows Settings, explicitly download the English model (~148 MB), and briefly tap **Right Ctrl** to start, then again to finish. Mac Accessibility/Input Monitoring permissions do not apply. Review the experimental limitations before testing.

**Upgrading Windows?** Quit HandsFree and run the new installer; models, settings and statistics are retained. Existing saved shortcuts, including Ctrl+Shift+Space, are preserved: choose **Settings → Use default** to switch to **Right Ctrl**. In default Toggle mode, release within 400 ms; holds, chords and AltGr cancel the tap gesture. Push to talk is a separate opt-in below. This is not a promise of universal conflict-free behavior. [Windows beta 3 notes and build evidence](docs/releases/v0.1.1-windows-beta.3.md).

### Mac

1. Install using the recommended Homebrew command above. Alternatively, open the DMG and drag **HandsFree.app to Applications**, then eject the disk image. Launch the Applications copy before granting permissions.
2. If macOS blocks this unnotarized beta, only if you trust the download, use **System Settings → Privacy & Security → Open Anyway**. Respect your organization’s policies; a local signature is not Apple approval.
3. In HandsFree Settings, allow **Microphone**, then enable **Accessibility** and **Input Monitoring** in System Settings. Quit and reopen after changing permissions.
4. Click **Download** for the English Whisper model (~148 MB from Hugging Face, checksum verified). This explicit, one-time setup needs internet; dictation works offline afterward.

Focus a text field, briefly tap **Fn / 🌐**, speak, and tap again to finish. **Escape** cancels. Choose a different shortcut in Settings if Fn conflicts with macOS or your keyboard. If insertion is unavailable, paste the copied transcript yourself. **Review important text:** speech recognition can make mistakes.

**Optional push to talk (Mac beta 4 / Windows beta 3):** choose **Settings → Recording mode → Push to talk**. Hold Fn on Mac, Right Ctrl on Windows, or your custom combination; release to finish (the first required component released finishes a combination). Other keys, mouse actions during a hold, or observed focus changes cancel without paste. Toggle remains the default; updates preserve your preferences, model and statistics. See [behavior, focus limits and test notes](docs/PUSH-TO-TALK.md).

[Full installation and troubleshooting guide](docs/INSTALL.md) · [Beta release notes](docs/releases/v0.1.1-beta.5.md)

**Homebrew updates:** quit HandsFree, run the following in Terminal, then reopen from Applications:

```sh
brew update
brew upgrade --cask suhaasbadada/handsfree/handsfree
```

Updates preserve your model, settings and statistics. Compatibility paste stays off
unless you enable it in Settings; the Windows beta 3 installer is unchanged.

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
