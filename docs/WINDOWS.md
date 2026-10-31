# Experimental Windows beta

**[Download for Windows (.exe)](https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-windows-beta.1/HandsFree-0.1.1-windows-x64-setup.exe)**

**Experimental · Windows 10/11 x64 · CPU · English.** Public beta
[`v0.1.1-windows-beta.1`](https://github.com/suhaasbadada/handsfree/releases/tag/v0.1.1-windows-beta.1)
is available; not yet hardware-tested. Hosted Windows compilation, native tests,
NSIS packaging and actual CPU model transcription passed. This does not prove
live microphone, editor, clean-PC installation or SmartScreen behavior.
The published Apple Silicon Mac beta and Homebrew are unchanged.

## For testers

Target: **Windows 10/11 x64**, an Intel/AMD 64-bit PC, a microphone, and Microsoft
Edge WebView2 Runtime. Windows ARM, 32-bit Windows, and Linux are unsupported.
Transcription is English-only. Not yet hardware-tested; do not assume CI success
establishes installation or dictation reliability.
Use a supported, security-updated Windows installation (Windows 10 may require
ESU). CPU-only transcription may be substantially slower than Mac Metal.

Download the EXE above directly; no GitHub account, Actions ZIP or developer
tools are needed. Read the release's `PROVENANCE.txt`, `POST-BUNDLE-AUDIT.txt`,
`APP-DEPENDENCIES.json`, and license. Dependency notices and corresponding source
are bundled with the app; the release also provides `THIRD_PARTY_SOURCES.tar.gz`.

Compare the installer against `SHA256SUMS` in PowerShell:

```powershell
Get-FileHash .\HandsFree-0.1.1-windows-x64-setup.exe -Algorithm SHA256
```

A matching hash checks integrity against that file, not the publisher's identity.
For this exact installer, SHA-256 is
`9e851cd194101e512970c34d94976d547b8e2b30d58409570d10e565e74677b5`.
This beta is **unsigned**: SmartScreen may warn about an unknown publisher. Only
if you trust the official candidate and your organization's policy permits it,
use **More info → Run anyway** when Windows offers it. If the option is absent,
stop; do not disable Defender, SmartScreen, antivirus, or managed protections.

The NSIS installer is per-user; it should not require administrator elevation
for HandsFree itself. WebView2's Microsoft bootstrapper may need internet and
additional permission if the runtime is absent. Do not run HandsFree elevated.
Installation is not an automatic update to any existing app.
The actual extracted beta.1 application was inspected as AMD64 PE32+ with
31 direct imports, all Windows OS DLLs, and no MSVCP/VCRUNTIME or custom DLL
dependency. No separate Visual C++ redistributable is needed for those inspected
imports. This is evidence about this payload, not a guarantee about dynamic
loading, all future builds, or every Windows installation. WebView2 is still required.

## First run and privacy

1. Open HandsFree and its Settings. Enable microphone access for desktop apps in
   **Windows Settings → Privacy & security → Microphone** (Windows 11), or
   **Privacy → Microphone** (Windows 10). Choose a working default input device.
   Mac Accessibility and Input Monitoring permissions do not apply on Windows.
2. Explicitly download the English Whisper model (~148 MB from Hugging Face;
   checksum verified). Setup requires internet; transcription runs locally after
   download. No account or cloud transcription API is required.
3. Focus a disposable text field in a normal, non-elevated app. The Windows
   default shortcut is **Ctrl+Shift+Space**; Fn / 🌐 is Mac-only. Tap once to start,
   speak briefly, then tap again to finish. **Escape** cancels recording.
   The shared settings retain the two-minute default recording limit and
   optional listening tones; use Settings to adjust them.
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
without source evidence. An earlier, unpublished candidate's MSVCP140 import
was not safe merely because Tauri statically links Rust's vcruntime; the public
beta.1 payload was separately inspected and has no such import.

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
  `PROVENANCE.txt`, `THIRD_PARTY_SOURCES.tar.gz`, and `LICENSE`. New candidates
  attach those five files **plus `SHA256SUMS`**: six assets,
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
operation, or clean-machine startup. The public beta.1 payload's imports were
verified by extraction; future builds must pass this gate independently. The
newer packaging/checksum pipeline at `1bb9112` does not change published beta.1
bytes or retroactively establish a passing CI run for that newer commit.

## Published beta.1 provenance and verification

The immutable installer was compiled from `1625d4874c15e2529b24adb04930bcd4efaf64df`.
[Windows CI run 41191415412](https://github.com/suhaasbadada/handsfree/actions/runs/41191415412)
passed full MSVC build/test/NSIS packaging and actual English-model CPU
transcription, without microphone access. Source/packaged notices were reviewed.
The published installer SHA above is unchanged from that build.

The original CI metadata reported the raw pre-bundle EXE hash, not the
Tauri-modified embedded app hash, and its artifact checksum listing omitted
hidden notice files. The release transparently includes `POST-BUNDLE-AUDIT.txt`
with the extracted payload's corrected hash and audit scope; original provenance
is retained, not silently rewritten. Public `SHA256SUMS` covers six payload
assets, including this audit, and is the seventh release asset. All seven were
downloaded anonymously and verified by the publishing maintainer. The newer
pipeline fixes future metadata/hidden-file coverage; it is independent of this
release's post-bundle audit. No claim is made here about a later CI run's result.

## Required manual acceptance before a hardware-tested label

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

This public experimental release permits deliberate early testing; the unchecked
hardware cases above remain outstanding, not waived or marked passed. Never
replace or hide the working Mac download to announce a Windows beta.

## Website publication checklist (maintainers)

The public distribution label is `v0.1.1-windows-beta.1`; the embedded app and
installer version is `0.1.1`. `site/release.js` has
`windowsRelease.publicAvailable: true` after anonymous public asset verification.
Never use GitHub's `latest` endpoint for this prerelease.

For any future release decision, verify the exact public, non-draft GitHub release
asset `HandsFree-0.1.1-windows-x64-setup.exe` (not an Actions ZIP), checksum, and
provenance while logged out. Only then flip the Windows availability flag.
The website accepts only the canonical GitHub repository URL, versioned Windows
beta tag, and matching versioned x64 EXE name, without query strings or fragments.

Keep the static fallback in `site/index.html` at `windows-card-download`
(direct EXE href; no `aria-disabled` or `tabindex`; download label),
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
