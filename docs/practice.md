# Private practice on Home

On a ready Mac, Home combines usage totals and **Try your voice**, marked
**Private**. Choose **Record**, speak, then **Finish**. The editable result is
temporary: no paste, clipboard change or usage is counted; leaving Home, losing
window focus or restarting clears it. **Clear practice** removes the text;
**Record again** starts over. Escape or **Cancel practice** discards the session.
Your configured shortcut also works while Home is focused; this tests private
capture, not external insertion. The gear opens Settings. Setup/model download
lives under **Settings → Setup**; the status button opens **Product status** for
readiness and recovery; start a private recording directly on Home. Appearance is under
**Settings → Dictation → Appearance**.

Stable v0.1.1 passed installed private known-speech checks with the Record button
and synthetic Fn using the built-in Mac microphone. This does not establish
physical Fn, external insertion, separate-Mac or universal Bluetooth acceptance.
See the [stable completion record](releases/v0.1.1.md) and [current interface
contract](UI.md). No permission check or visible meter alone proves recognition.

## Historical beta implementation notes

The following checkpoints are preserved as history. Overview, Get started,
Preferences and Start test refer to earlier interfaces, not current navigation;
their unperformed acceptance statements describe those checkpoints.

### Practice in Overview

Extended shortcut instructions and receipt evidence are shown while **Get started**
is open. Returning ready users keep a compact practice panel with the input meter
and timer; recording-state changes do not expand the tutorial or move the layout.

Settings → Preferences → **Appearance** offers Light, Dark and System (default).
It changes presentation only, including the floating capsule; it does not clear
practice, change its geometry/timer or affect capture and usage. Explicit choices
override OS appearance; System follows future OS changes. See [Appearance](APPEARANCE.md)
for persistence, brand palette and automated-verification boundaries.

## Recording controls (Mac beta 12)

Select a microphone in Settings, or choose **System default**. A saved microphone
that is disconnected remains selected and is shown as unavailable; reconnect it
or explicitly choose another input. A recording never silently falls back from a
chosen device to a different microphone. Device listing does not request permission
or open a recorder. Changes apply to the next recording.

The capsule and practice timer count accepted audio samples, not time spent playing
the start cue. The displayed maximum is frozen for that session; changing the
recording-limit preference affects only the next recording. The private meter and
timer are cleared when their practice owner is finished, revoked or loses focus.

Practice reserves status, help and action space so start, processing, completion,
errors and cancellation do not move the textarea, activity or footer. Long errors
remain readable in a bounded scroll area. Contextual buttons transfer keyboard
focus to the textarea before hiding, without scrolling the page.

Available in [Mac beta 6](releases/v0.1.1-beta.6.md) (embedded app version `0.1.1`).
Live microphone practice acceptance and separate-Mac QA have not been performed;
automated checks and local installation do not establish hardware acceptance.

On Apple Silicon Macs running macOS 14 or later, finish the existing microphone,
permissions and English-model setup, then use **Start test**, speak, and choose
**Finish**. The editable temporary field tests microphone capture and local English
transcription. While Overview is focused, your configured shortcut also routes
directly to this private test: toggle to start/finish, or hold and release in
push-to-talk mode. This does not test insertion into another application.

Practice never pastes, copies to the clipboard, changes the last normal transcript,
or counts toward saved usage. Its text lives only in memory. **Cancel** and
**Clear practice** revoke the session and clear the field. **Record again** starts
a fresh test. Leaving Overview,
losing window focus, hiding/closing the window, or restarting clears practice.
If you edit during transcription, your edits are kept instead of being replaced.

To test real insertion, leave practice, select a supported non-secure text field in
another application, and use your usual shortcut. Normal own-app and focus-safety
guards still apply. Practice is not a permission bypass.

## Get started and microphone check

**Get started** in the HandsFree menu, Settings, or practice's setup-help button
opens an inline, revisitable checklist in Overview, not a welcome modal. Ready
returning users do not automatically see it. Each check requires explicit native
Mac readiness: microphone, both Accessibility and Input Monitoring, live shortcut
hook, and verified English model. Unknown states are not ready. The buttons reuse
the existing explicit permission and model actions. Opening or polling the guide
does not request consent, download a model, or record. If permissions are granted
but the hook is disconnected, the guide advises quitting and reopening the app.

The shortcut tutorial uses the configured binding and recording mode. **Start
test** does not mark the shortcut tested. Only a current-context native press or
toggle event reports **Shortcut received**; that proves key receipt, not capture,
speech recognition, or paste. Clear, navigation, focus loss, hiding and menus
retire that evidence. Changing the configured binding/mode also resets it.

The input meter samples the same explicitly started private practice recorder's
`AudioCapture.level()` (dB mapped from -60…0 to 0…1). It creates no second recorder
and saves no audio. Practice still needs the model and permissions first. A missing
reading says waiting, not success or silence. Native main-thread checks require
the matching generation/epoch, active visible window, current permission and
cancellation proof; Rust checks the practice token before and after dispatch,
without holding a Rust lock across it. UI responses are token/generation scoped,
finite and bounded; finish, cancellation, stale results and lost eligibility
remove the meter. Input level is not a speech or transcription quality score.

Coverage: `tests/onboarding.test.mjs` exercises unknown/partial readiness and
configured instructions; `tests/practice.test.mjs` exercises owned meter data,
invalid/missing/stale responses and teardown; Rust `practice` tests exercise
recording-only meter identity. `tests/ui-practice-events.mjs` runs the production
frontend listeners via CDP with a synthetic native bridge, checking revisitable
guidance, no implicit effects, button versus shortcut evidence, meter updates,
and privacy teardown. No live microphone, installed-app update, or hardware
acceptance is implied by these tests.

## Keyboard and recovery (group 4, partial)

The current Home/Settings navigation and its keyboard-focus behavior are specified
in [desktop interface contracts](UI.md). The former brand menu is removed.
Returning eligibility never replays a stale held shortcut.

Populated practice and dictation status regions are named keyboard stops. Use
Down/Page Down to read long messages in their fixed slots; unchanged polls keep
text nodes and scroll position. Empty slots do not enter the tab order.
Practice errors expose **Microphone settings**, focusing the existing picker:
reconnect an unavailable selected device or choose another. **Practice setup
help** still opens the existing guide. General errors offer **Open settings**,
not an inferred action or an automatic retry of uncertain paste. No automatic
permission prompt, download, capture or clipboard access is added.
Production-DOM CDP key/AX tests are synthetic browser evidence only; real macOS
VoiceOver, keyboard configuration and microphone acceptance remain unverified.
