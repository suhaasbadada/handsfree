# Experimental Windows beta

**In development, not a verified public release.** The Windows backend and NSIS
packaging are experimental. A successful hosted build is necessary, but does not
prove that microphone capture, shortcuts, insertion, or installation work on a
real PC. The published Apple Silicon Mac beta is unchanged.

## For testers

Target: **Windows 10/11 x64**, an Intel/AMD 64-bit PC, a microphone, and Microsoft
Edge WebView2 Runtime. Windows ARM, 32-bit Windows, and Linux are unsupported.
Transcription is English-only. Not yet hardware-tested; do not assume CI success
establishes installation or dictation reliability.
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
The Windows-only helper also enables Rust `+crt-static` (including native build
dependencies) and CMake `CMP0091=NEW`, `MSVC_RUNTIME_LIBRARY=MultiThreaded` (/MT
for all configurations). Existing Rust flags are preserved; conflicting
`-crt-static` or encoded flags fail explicitly. Repeated dot-sourcing is idempotent.
This does not change Mac compiler flags or signing. A fresh native build is
required when changing CRT settings; do not reuse older native object caches.
For separate `cargo` commands, first dot-source `./scripts/windows-env.ps1` in
the same PowerShell session. Changing these settings requires a clean native
build, not reusing cached whisper objects from a different CPU configuration.

After Tauri builds, the packaging script extracts the NSIS installer with 7-Zip
into a newly created GUID directory under `RUNNER_TEMP` (or the system temp
directory for local builds), without executing anything. It requires exactly
one extracted `handsfree.exe`; `scripts/windows-pe-imports.py` inspects that
actual packaged payload before candidate copying. Tauri patches the bundled
copy's metadata, so its hash may differ from the raw cargo output. The report
hash identifies the extracted payload; provenance records both hashes with
explicit labels. Only the invocation's owned extraction directory is removed
in `finally`; cleanup failure rejects the candidate and reports its exact path.
The gate requires AMD64 PE32+, validates file-backed PE bounds, and checks
normal and delay imports against an explicit Windows 10/11 OS DLL allowlist and
`api-ms-win-`/`ext-ms-win-` API-set contracts. Unknown DLLs and redistributable
CRT imports (including MSVCP140, VCRUNTIME140, and CONCRT140 variants) fail the
build. No Microsoft redistributable DLLs are added. Do not broaden the allowlist
without source evidence. The previous candidate's MSVCP140 import is not safe
merely because Tauri statically links Rust's vcruntime.

Outputs are under `release/windows-x64/`: an EXE, SHA-256 checksums, provenance,
`APP-DEPENDENCIES.json` (actual app hash, architecture, normal/delay imports),
MIT license, dependency inventory/notices, and verified registry source archives
(including MPL corresponding source). These notices and sources are also
bundled under the installed app's `licenses` directory. Generated data stays in
ignored `src-tauri/target` and `release` directories, not Git. Existing candidate
outputs are never overwritten; preserve/move them before rebuilding. The workflow
does not sign, publish a release, launch the app, record audio, or install anything.
`scripts/windows-artifact-checksums.py` creates two distinct manifests:

- Public `SHA256SUMS` covers exactly the five assets
  `HandsFree-0.1.1-windows-x64-setup.exe`, `APP-DEPENDENCIES.json`,
  `PROVENANCE.txt`, `THIRD_PARTY_SOURCES.tar.gz`, and `LICENSE`. The planned
  public release attaches those five files **plus `SHA256SUMS`**: six assets,
  no installer ZIP and no hundreds of individual notice attachments.
- Internal `BUILD-SHA256SUMS` covers every CI artifact file, including the public
  manifest and hidden/nested notices, but excludes itself. It is not a public
  release asset. Artifact upload includes hidden files only within the controlled
  `release/windows-x64/` output so upstream files such as wry's `.license_template`
  are retained. No user settings or arbitrary workspace directories are uploaded.

Before publishing, verify the complete downloaded Actions artifact against
`BUILD-SHA256SUMS`, then verify the six selected public assets using `SHA256SUMS`.
The full notices and source remain inside the NSIS payload as well.
A passing import gate establishes only direct/delay
dependencies of that built app, not dynamic LoadLibrary behavior, installer
operation, or clean-machine startup. Static C++ linkage is not verified until
the real Windows build passes this gate; manual clean-PC acceptance remains
required before distribution.

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

## Website publication checklist (maintainers)

The candidate distribution label is `v0.1.1-windows-beta.1`; the embedded app and
installer version is `0.1.1`. `site/release.js` holds the candidate coordinates,
but `windowsRelease.publicAvailable` stays **false**. A candidate URL in source
is not evidence of a public release. Never use GitHub's `latest` endpoint for
this prerelease.

After the release decision, verify the exact public, non-draft GitHub release
asset `HandsFree-0.1.1-windows-x64-setup.exe` (not an Actions ZIP), checksum, and
provenance while logged out. Only then flip the Windows availability flag.
The website accepts only the canonical GitHub repository URL, versioned Windows
beta tag, and matching versioned x64 EXE name, without query strings or fragments.

Update the static fallback in `site/index.html` at `windows-card-download`
(direct EXE href; remove `aria-disabled` and `tabindex`; update label),
`windows-release-badge` (Experimental · x64), and `windows-release-status`
(version, unsigned, not yet hardware-tested). Update its metadata descriptions
and `noscript` copy, and the Windows status in this guide and README. Keep any
untested hardware limitations explicit. Leave the static hero and Mac card URLs
on **v0.1.1-beta.2**, and leave Mac availability untouched. Without JavaScript,
visitors use the explicit platform cards; no automatic download occurs.

Run `npm test`, `npm run build`, and `node tests/website-smoke.mjs` plus
`node tests/download-website-smoke.mjs`. JavaScript promotes Windows only for
Windows visitors with x64/unknown architecture. Known Windows ARM visitors see
an unsupported note and the Mac fallback, while the explicitly x64-labeled card
remains a deliberate download for another PC. Mac download controls remain
visible independently of Windows availability. Gatekeeper/Open Anyway guidance
applies only to Mac; SmartScreen/unsigned guidance applies only to Windows.
