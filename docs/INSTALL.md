# Install HandsFree (Mac beta)

Requires **Apple Silicon (M-series), macOS 14+, English**. In Apple menu → About This Mac, check that **Chip** names an Apple M-series chip. Intel Macs, Windows, Linux, and mobile are not supported by this build.

1. Open the downloaded `.dmg`. Drag **HandsFree.app** onto **Applications**. Keep the disk image: its `LICENSE`, `THIRD_PARTY_NOTICES`, and `THIRD_PARTY_SOURCES.tar.gz` accompany redistributions. No ZIP extraction or developer tools are needed. Eject the image after copying.
2. Open **Applications → HandsFree**, not the copy inside the disk image. Do this **before granting permissions**.
3. This beta is **self-signed, not Apple Developer ID signed or notarized**. macOS cannot verify its publisher and may block it. Only if you trust the download, attempt to open it, then use System Settings → Privacy & Security → **Open Anyway** if offered. Do not disable Gatekeeper or bypass organizational policies. Signing is not Apple approval or malware screening.
4. In HandsFree Settings, explicitly allow **Microphone**, **Accessibility**, and **Input Monitoring**. Quit and reopen after permission changes if needed. HandsFree cannot grant access for you.
5. Choose **Download** for the English Whisper model (~148 MB, from Hugging Face). It is checksum-verified and downloaded only on request. Dictation then works offline.

Focus a text field, tap your shortcut to speak, and tap again to transcribe. Escape cancels. Review the result; if automatic insertion is unavailable, paste the copied text yourself. Fn may require macOS Keyboard → “Press 🌐 key to” → Do Nothing and disabling conflicting Dictation shortcuts. Alternatively choose another shortcut in HandsFree.

Updates are manual: quit HandsFree, replace the Applications copy, reopen. Permissions may need reauthorization. See the README at the disk image root for privacy and limitations, or the [online guide](https://github.com/suhaasbadada/handsfree#install-once-the-beta-is-published). **This candidate is not approved for public distribution:** see its publication-gate notice.
