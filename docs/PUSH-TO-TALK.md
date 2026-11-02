# Push to talk (release planned)

Settings → **Recording mode** offers **Toggle** (the unchanged default) and
**Push to talk**. Selecting the latter is explicit; upgrades do not opt users in.
Planned for Mac beta 4 and Windows beta 3. These candidates are not yet public;
existing published downloads are unchanged until publication is verified.

In Push to talk, hold the configured shortcut, speak, then release to finish.
The default is Fn / Globe on Mac and physical Right Ctrl on Windows. Custom
combinations require the exact saved modifiers; releasing the primary key or
the first required modifier finishes. Pressing other keys, mouse actions, or
changing foreground application cancels without paste. Escape and the native
HUD's Cancel and Finish remain available. Target identity is still checked at
delivery: focus changes never redirect output into a different field.

Observed foreground-application and field-focus changes continue to cancel
through processing and delivery, even after releasing the shortcut. Switching
away and back does not re-enable delivery. Mac field-focus monitoring uses AX
notifications where supported; Windows uses foreground/field-focus WinEvents.
Final original-target validation remains the fallback for unobservable focus
changes. After release, ordinary typing and mouse actions do not by themselves
cancel processing; an observed focus change does. The non-activating native HUD
does not change focus when Finish or Cancel is clicked.

The trigger stays latched until its physical primary key is released, including
after cancellation, automatic duration limits, failures, and HUD Finish. Repeats
cannot restart recording. Already-held keys are quarantined when hooks, mode,
binding, or shortcut capture reset. Windows AltGr and injected input cannot
start a hold; injected input cancels an active hold. Fn chords may briefly begin
the normal start cue before the second key cancels. No Fn/Ctrl events are
consumed or remapped; normal OS key functions still run. Custom Windows
shortcuts retain checked RegisterHotKey ownership, while physical low-level
edges, not WM_HOTKEY, drive holds. Mac remains listen-only and does not claim
exclusive registration. Choose a conflict-free shortcut.

Mode changes are disabled while recording, processing, downloading, or recording
a shortcut. Backend configuration executes on the same FIFO as gesture starts,
so queued presses cannot race a preference edit. Native application and disk
save failures leave the old mode selected. Missing/unknown saved mode fields
fall back to Toggle independently of saved shortcut, sounds, limit, and totals.
Sounds, recording limits, transcript privacy, aggregate statistics, original
target checks, and clipboard fallback behavior are unchanged.

## Protocol and verification

An additive C ABI reports `(edge, source, token)`: press=1, release=2, cancel=3.
Native tokens monotonically identify physical gestures. Receipt-time cancellation
can invalidate an accepted session even while cue/UI Automation work blocks the
FIFO; cancellation of a pending/rejected gesture never cancels an unrelated
session. The coordinator maps accepted presses to actual session generations,
not cancellation epochs. Releases are always queued, even before a start has
executed. A receipt-time capture-start gate prevents an early release from
opening the microphone after the cue; normal finish/drain semantics remain intact.
Accepted identity and native focus surveillance survive release until actual
session completion. `hf_gesture_complete(token)` retires exactly that native
token without changing the physical held-key latch. Rejected presses are retired
separately and cannot overwrite a processing session's cancellation identity.
Mode/binding/capture barriers invalidate stale queued starts. The legacy toggle
callback ABI and isolated-tap recognizers remain unchanged.

Rust tests exercise physical lifetime, repeat/chord/reset latching, cancellation,
early-release gating, rejected presses, and stale generation protection. Swift
native tests exercise the production hold recognizer without installing hooks,
recording or playback. Browser fixtures cover mode persistence/rollback, pending
polls, busy/capture disabling, actual Windows labels, and compact layouts.

Hardware acceptance still requires an authorized Mac and Windows session:
Fn/Right Ctrl/custom holds longer than the old tap deadline, fast press-release
during the cue, modifier-first release, Fn+arrows/Delete and Ctrl shortcuts,
AltGr/injection, focus/mouse cancellation, permission/hook loss, duration limit
while held, and native HUD Finish/Cancel. Verify one delivery to the original
field, no restart while held, no cancelled paste, and no cue in captured audio.
Automated tests do not establish microphone, device timing, or global-hook
behavior on real hardware.
