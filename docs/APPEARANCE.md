# Appearance

Settings → Preferences has one Appearance select: **Light**, **Dark**, **System**.
System is the default for older settings and an absent or malformed appearance
field. Other saved preferences and usage totals are preserved. No localStorage,
theme navigation, capture permission or recording-state change is involved.

The saved lowercase `appearance` field in the existing Store is also returned by
native `status`. Explicit selection calls `set_appearance` through Configure's
FIFO. Its AppKit adapter applies Aqua/DarkAqua to `NSApplication.appearance` on
the main thread; System assigns **nil**, removing the override rather than
snapshotting the current OS theme. Main window, WKWebView and floating capsule
therefore inherit live native appearance. Build-time window theme/background
remain unforced. Rust never holds Inner across synchronous AppKit dispatch.

Writes merge the current Store. On persistence failure, readable disk determines
the reconciled appearance, including when rename succeeded before directory sync
failed. If reading also fails, the last known preference is retained and the
durability error remains visible; disk durability cannot then be established.
The frontend has a separate pending owner/revision, ignores stale polls and
duplicate changes, and re-reads native status after failure. The select can show
pending intent, but the root `data-appearance` reflects actual saved/reconciled
preference only. Missing older status fields mean System. No focus, scrolling,
practice clearing, microphone, timer or usage effects are part of this setter.

Light uses the landing page's paper, ink, muted, line, tint, card and muted-red
primary/cream foreground (`site/styles.css` is unchanged). Dark retains the warm
charcoal/cream/rose adaptation; the primary uses rose with dark ink. Native
CapsulePalette uses matching light/dark brand values, including Finish. Small
text and primary text retain ≥4.5:1 contrast; capsule accents retain ≥3:1.

## Verification

- `tests/appearance.test.mjs`: default native configuration remains unforced.
- Rust Store test: absent/malformed field isolation, all enum values, atomic file
  roundtrip and preservation of other preferences/usage.
- `tests/appearance-controller.test.mjs`: real controller's pending, duplicate,
  stale response, failure/post-rename reconciliation and saved-restart behavior.
- `tests/native-capsule/main.swift` (via `npm test`): guarded native adapter,
  actual app override removal, live capsule inheritance and painted contrast,
  without microphone or login registration.
- `tests/ui-appearance.mjs` (via `tests/ui-smoke.mjs`): production DOM/IPC, all six
  mode/OS combinations, future OS changes, explicit stability, unchanged practice
  geometry/state, actual landing CSS consumption, primary contrast, pending and
  failure recovery, saved preference reload mocks. The full smoke also checks
  responsive layout, other text readability, practice events and keyboard flows.

These are source/fake-backend/native-harness checks, not installed-app acceptance.
No signing, packaging, installation, permission prompts or release is implied.
