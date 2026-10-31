# Experimental Windows beta

**In development, not a verified public release.** The Windows backend and NSIS
packaging are experimental. A successful hosted build is necessary, but does not
prove that microphone capture, shortcuts, insertion, or installation work on a
real PC. The published Apple Silicon Mac beta is unchanged.

## For testers

Target: **Windows 10/11 x64**, an Intel/AMD 64-bit PC, a microphone, and Microsoft
Edge WebView2 Runtime. Windows ARM, 32-bit Windows, and Linux are unsupported.
Use a supported, security-updated Windows installation (Windows 10 may require
ESU). CPU-only transcription may be substantially slower than Mac Metal.

There is **no public Windows installer link yet**. Maintainers can retrieve a
candidate from the [Windows beta candidate workflow](https://github.com/suhaasbadada/handsfree/actions/workflows/windows.yml)
after its checks pass. GitHub may require login to download an Actions artifact;
it expires after 14 days. This internal artifact container is not the installer.
Extract it, then use `HandsFree-0.1.1-windows-x64-setup.exe`. Only trust a candidate
from an expected commit and successful workflow run. Read `PROVENANCE.txt`,
`LICENSE`, and `THIRD_PARTY_NOTICES` alongside it. Maintainers must not advertise
an available download until the actual installer has been verified.

Compare the installer against `SHA256SUMS` in PowerShell:

```powershell
Get-FileHash .\HandsFree-0.1.1-windows-x64-setup.exe -Algorithm SHA256
```

A matching hash checks integrity against that file, not the publisher's identity.
This beta is **unsigned**: SmartScreen may warn about an unknown publisher. Only
if you trust the official candidate and your organization's policy permits it,
use **More info → Run anyway** when Windows offers it. If the option is absent,
stop; do not disable Defender, SmartScreen, antivirus, or managed protections.

The NSIS installer is per-user; it should not require administrator elevation
for HandsFree itself. WebView2's Microsoft bootstrapper may need internet and
additional permission if the runtime is absent. Do not run HandsFree elevated.
Installation is not an automatic update to any existing app.

## First run and privacy

1. Open HandsFree and its Settings. Enable microphone access for desktop apps in
   **Windows Settings → Privacy & security → Microphone** (Windows 11), or
   **Privacy → Microphone** (Windows 10). Choose a working default input device.
2. Explicitly download the English Whisper model (~148 MB from Hugging Face;
   checksum verified). Setup requires internet; transcription runs locally after
   download. No account or cloud transcription API is required.
3. Focus a disposable text field in a normal, non-elevated app. The Windows
   default shortcut is **Ctrl+Shift+Space**; Fn / 🌐 is Mac-only. Tap once to start,
   speak briefly, then tap again to finish. **Escape** cancels recording.
4. Review the result. Speech recognition can make mistakes. Insertion is
   conservative: unsupported/custom editors, terminals, elevated windows,
   password fields, or changed focus may require manual paste or reject delivery.
   HandsFree must not press Enter or send a message for you.

Audio and transcripts are not a retained history. Local settings, usage totals,
and the downloaded model persist; the clipboard and clipboard managers may
retain copied text. Do not share recordings, private text, settings, or models
in bug reports. Report Windows version/build, CPU architecture, app/version,
candidate commit, and synthetic reproduction steps instead.

## Build a candidate on Windows

Use a dedicated checkout on Windows x64 with PowerShell 7, Node 22.18+,
Rust stable **x86_64-pc-windows-msvc**, Visual Studio 2022 C++ Build Tools and the
Windows SDK, CMake, Python 3.11+, LLVM/libclang, and 7-Zip on PATH. Install Rust's
`rustfmt`, `clippy`, and `rust-docs` components. Set `LIBCLANG_PATH` if libclang is
not in `C:\Program Files\LLVM\bin`. Do not use a MinGW target.

```powershell
npm ci
npm test
npm run build
./scripts/windows-package.ps1
```

The script runs Rust format/tests/clippy and builds NSIS with the Windows-only
Tauri overlay. Its environment helper disables host-native and optional x86
instruction-set tuning (including AVX/AVX2/AVX512) in the locked whisper build.
This favors compatibility over speed; it does not establish a tested CPU matrix.
For separate `cargo` commands, first dot-source `./scripts/windows-env.ps1` in
the same PowerShell session. Changing these settings requires a clean native
build, not reusing cached whisper objects from a different CPU configuration.

Outputs are under `release/windows-x64/`: an EXE, SHA-256 checksum, provenance,
MIT license, dependency inventory/notices, and verified registry source archives
(including MPL corresponding source). These notices and sources are also
bundled under the installed app's `licenses` directory. Generated data stays in
ignored `src-tauri/target` and `release` directories, not Git. Existing candidate
outputs are never overwritten; preserve/move them before rebuilding. The workflow
does not sign, publish a release, launch the app, record audio, or install anything.

## Required manual acceptance before sharing

Record actual results, machine/OS details, commit, and installer hash. Do not mark
unchecked items as passed. Automated CI does **not** perform these tests.

- [ ] Clean per-user install, launch, tray, quit/relaunch, and uninstall on Windows
      10 and 11 x64; no unexpected UAC or missing DLLs; license/source files present.
- [ ] Review Windows dependency notices, including Microsoft's WebView2 loader
      redistribution terms (separate from the Rust wrappers' MIT license).
- [ ] WebView2-present and WebView2-missing setup, including denied/offline setup;
      clear failure without disabling system protections.
- [ ] Microphone allowed/denied/unavailable/disconnected; recording meter; cancel
      via Escape; rapid shortcut toggles; no lingering microphone after quit.
- [ ] First model download, interruption/retry, checksum rejection, then offline
      dictation; short and long speech, silence, and non-speech without bogus text.
- [ ] Default/custom shortcut conflict handling; idle/recording/transcribing UI;
      clean/warm/off listening cue behavior without capturing playback as speech.
- [ ] Notepad and a browser text field: finish inserts once in the original field,
      without Enter/send. Verify clipboard fallback in terminals/custom editors.
- [ ] While recording/transcribing, switch app, change field, close the target,
      open a password/elevated field: **no paste into the wrong field/app**, no
      surprise Enter/send. If unsafe delivery occurs, stop sharing the candidate.
- [ ] Existing clipboard (text/non-text), manual paste, clipboard retention warning,
      and no retained recording/transcript history. Use only synthetic test text.
- [ ] Older supported x64 hardware: startup and CPU inference without illegal
      instructions; record timing rather than promising real-time transcription.

Public release is a separate maintainer decision after build, notice review, and
runtime acceptance. Keep Windows availability false on the website until then;
never replace or hide the working Mac download to announce a Windows candidate.
