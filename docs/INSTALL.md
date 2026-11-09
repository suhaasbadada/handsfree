# Install HandsFree (Mac beta)

Requires **Apple Silicon (M-series), macOS 14+, English**. This is the only current product and development target. In Apple menu → About This Mac, check that **Chip** names an Apple M-series chip. Intel Macs, Windows, Linux, and mobile are not currently supported. Windows work is paused; no Windows or Linux port or release date is promised.

**Experimental beta — self-signed and not notarized.** Separate-Mac installation testing is not yet verified. See `Licenses/PUBLICATION-NOTES.txt` and `Licenses/Documentation/release-readiness.md` for the distribution decision, upstream caveat and testing limitations. No paid account, Apple Developer membership, payment, or certificate installation is required.

<a id="homebrew-option"></a>

## Homebrew option — recommended

1. If needed, [install Homebrew from its official website](https://brew.sh/).
2. Open **Terminal** (Applications → Utilities) and paste this command for the [HandsFree tap](https://github.com/suhaasbadada/homebrew-handsfree#readme):

```sh
brew install --cask suhaasbadada/handsfree/handsfree
```

Homebrew 7 may prompt for trust before loading a third-party cask. **Only if prompted**, review the tap repository first. If you trust its Homebrew code, approve only this cask, then retry the install:

```sh
brew trust --cask suhaasbadada/handsfree/handsfree
brew install --cask suhaasbadada/handsfree/handsfree
```

Homebrew simplifies installation; macOS security prompts may still appear. Trust approves the cask’s Homebrew code, **not the app’s Apple identity or notarization**. This beta remains self-signed and not notarized. Homebrew verifies the pinned download checksum; Gatekeeper, quarantine, and the permissions below still apply. Continue with **First launch** below; Homebrew does not download the speech model for you.

### Existing manual installation

Already have a manually installed `/Applications/HandsFree.app`? Homebrew may report that the app already exists. You can keep using your current manual installation. If you choose to switch and Homebrew asks you to resolve that conflict, quit HandsFree and move the existing app copy to a safe backup location before retrying the install. Keep the backup until the new copy works; do not delete your models, settings, statistics, or other user data. Permissions may need reauthorization.

For optional manual Homebrew-managed updates, or the required beta 6-and-earlier
bootstrap to the current beta, quit HandsFree, then run:

```sh
brew update
brew upgrade --cask suhaasbadada/handsfree/handsfree
```

Reopen the Applications copy afterward. The current Mac distribution is `0.1.1-beta.8` (the embedded app version remains `0.1.1`); Homebrew selects upgrades using the cask's distribution version. Beta updates are reviewed manually, not promised on a schedule. Its documented online-audit prerelease policy finding is intentional, not a claim that the beta meets Homebrew’s stable-release policy.

Normal updates preserve your existing model, settings, and usage totals; they do not restart onboarding or reset permissions. Do not use `--zap`, delete HandsFree's data folders, or reset totals to update. Existing permissions may still need reauthorization if macOS requests it. No installed-app upgrade or clean-machine onboarding test is implied by the release's artifact checks.

## DMG alternative

Download the [Mac DMG](https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.8/HandsFree-0.1.1-beta.8-macos-arm64.dmg). Open it and drag **HandsFree.app** onto **Applications**. Keep the disk image: its `Licenses` folder (project license, dependency notices and corresponding sources) accompanies redistributions. No ZIP extraction or developer tools are needed. Eject the image after copying. Do not launch the copy inside the disk image.

For optional manual DMG updates, quit HandsFree, replace the Applications copy,
then reopen. Beta 6 and earlier need this or Homebrew as a one-time bootstrap.
Permissions may need reauthorization.

## Signed in-app updates — beta 7 onward

Choose footer **Updates → Check for updates**. When a newer version is offered,
choose **Download & restart…** and confirm the exact version. Opening the dialog
only reads local installed metadata; checks and downloads never run automatically.
An explicit check shares ordinary connection metadata with GitHub, never audio,
transcripts, model files, settings or usage. Copy important fallback text before
restarting: in-memory results do not survive restart. Updates require an idle,
normal `/Applications/HandsFree.app`; errors including HTTP 404 are shown, not
reported as up to date. Model/settings/usage remain outside the replaced bundle.
Beta 8 is available to test a real forward OTA replacement/restart; acceptance
remains pending until the installed beta 7 app completes that flow.
See [trust and safeguards](UPDATES.md) and [beta 8 evidence](releases/v0.1.1-beta.8.md).

## First launch — both install methods

1. Open **Applications → HandsFree** before granting permissions.
2. This beta is **self-signed, not Apple Developer ID signed or notarized**. macOS cannot verify its publisher and may block it. Only if you trust the download, attempt to open it, then use System Settings → Privacy & Security → **Open Anyway** if offered. Do not disable Gatekeeper or bypass organizational policies. Signing is not Apple approval or malware screening. If Open Anyway is not offered or your Mac is managed, contact your administrator; do not weaken system security.
3. In HandsFree Settings, explicitly allow **Microphone**, **Accessibility**, and **Input Monitoring**. Quit and reopen after permission changes if needed. HandsFree cannot grant access for you.
4. On **Overview** or in **Settings → Setup**, choose **Download** for the English Whisper model (~148 MB, from Hugging Face) if it is not already present. It is checksum-verified and downloaded only on request. Dictation then works offline.

Focus a text field, tap your shortcut to speak, and tap again to transcribe. Escape cancels. Review the result; if automatic insertion is unavailable, paste the copied text yourself. Fn may require macOS Keyboard → “Press 🌐 key to” → Do Nothing and disabling conflicting Dictation shortcuts. Alternatively choose another shortcut in HandsFree.

**Practice (introduced in Mac beta 6):** after setup, choose **Start practice** on Overview,
speak, then **Finish**. The temporary editable result does not paste, change the
clipboard or count toward usage. This is not a shortcut or external-insertion
test. See [practice safeguards](practice.md) and the
[release evidence and unperformed hardware checks](releases/v0.1.1-beta.8.md).

**Toggle remains the default.** For optional hold-to-record behavior, select
**Settings → Recording mode → Push to talk**: hold Fn / Globe or your saved
shortcut, speak, then release to finish. Custom combinations finish on the first
required component's release. Other keys or mouse actions during a hold, and
observed focus changes, cancel without paste. Updates do not opt you in or reset
your shortcut, model or statistics. See [behavior and safeguards](PUSH-TO-TALK.md).

**Optional Compatibility paste:** after upgrading, enable
**Settings → Compatibility paste** yourself for apps that hide their Accessibility
text field. It is **off by default**, including upgrades. It can send one paste
only while the original app/window is still verified active; the exact field
cannot be verified. Missing window proof or focus monitoring still means manual
paste. A submitted shortcut is not confirmation that text appeared: HandsFree
never automatically retries it or presses Enter. Check the result before pasting
again. See [delivery safeguards and limits](COMPATIBILITY-PASTE.md). No permission
reset, model reinstall, or statistics reset is needed. This does not guarantee
insertion in every editor; repeat real-use checks after upgrading.

Recordings stop automatically at your chosen 2–5 minute limit (Settings); changes apply to the next recording. Processing can take time on longer dictations; Escape or Cancel discards the pending result. If recording or processing fails, read the status message before retrying. Copy text remains available for a transcript that could not be pasted.
