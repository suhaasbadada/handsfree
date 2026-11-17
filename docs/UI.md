# Desktop interface contracts

- Product status is an interactive control at the top right on every destination,
  not a passive sidebar footer. Its accessible dialog explains the current failure
  separately from permission/model/shortcut checks and provides direct permission,
  model-download, input-device and private-test actions. Opening/refreshing it never
  records, prompts, downloads or changes preferences. Unknown/disconnected status
  clears stale readiness. Native guards remain authoritative; private testing still
  needs explicit Start. The dialog follows existing Practice-context revocation,
  restores focus on dismissal, and keeps recovery actions reachable in small windows.
- Overview and Practice fit the default 980×820 and minimum 560×650 windows in
  their normal ready states. Settings has one content scroller; the sidebar and
  compact footer stay in place. Small/zoomed viewports use normal reachable
  document scrolling rather than clipping controls. Long transcripts and errors
  remain keyboard-readable; fitting a normal page never hides actual content.
- Practice has one editor and primary action. Start, Finish and Record again
  reuse their action slot. Meter, timer and status transitions do not move the
  editor. Settings lives in the sidebar only; navigating there retires private
  context/text. Error-specific recovery opens product status, never another
  Settings button. No onboarding panel is inserted into Practice.
- Practice's compact waveform projects only the existing identity/readiness-checked
  input level. Unready, stale, cancelled and hidden contexts reset it to quiet dots;
  it never opens a microphone or animates invented speech. The accessible meter
  remains available and reduced-motion disables bar transitions. Privacy is the
  idle status fallback, with a persistent editor description for screen readers.
- Page hierarchy uses typography, whitespace and subtle dividers, not filled,
  bordered cards around every section. Overview metrics are unboxed; the Practice
  link is a lightweight row. Practice retains only its functional editor surface.
  Settings sections have no enclosing rectangles. Buttons center labels with equal
  inline padding; controls use compact 32px targets and quiet native select values
  instead of filled rectangles. Utility actions use labeled SVG icons. The app
  picker clears its divider; recovery remains separate
  and aligned. Long recovery text stays scrollable rather than overlapping actions.
- Sound preview remains usable in quiescent idle/result/error/setup phases, without
  clearing that state. UI eligibility does not authorize native audio: recorder,
  active-owner, preview and installer guards still apply.
- Shortcut text uses the theme's red accent inside its existing key box, including
  custom combinations. The status microphone selector is a checklist row aligned
  with the other checks, with an icon-only refresh. Opening status, entering Settings
  or regaining focus refreshes device metadata without opening an audio engine.
- Settings must not scroll horizontally, including its inner `main` scroller.
  Native WebKit select option text is contained at the select itself; whole-page
  overflow hiding is not a fix. Offscreen WKWebView regressions exercise realistic,
  unavailable and long labels, both palettes, minimum/tiny widths and measured 16px
  scrollbar gutters, with a reversible negative control for the original overflow.
- The revisitable setup guide belongs to Settings. It observes native proofs and
  uses explicit permission/download actions. Closing it focuses the visible
  Settings heading, never a hidden practice field.
- Updates stay inline in the footer, with no update or install-confirmation modal.
  Clicking the refresh action checks the feed and spins its icon. A verified offer
  changes that same control to Download & update with its exact version; another
  explicit click rechecks and installs only that version, then the native updater
  reopens HandsFree. A changed offer needs another click, never silent consent.
  Busy states disable repeats, byte progress and failures stay inline, and ordinary
  status polling never contacts the feed. Native idle/install/signature guards stay
  authoritative. Reduced motion disables the spinner, not its readable status.
- Ready setup is not repeated at the bottom of Settings. Missing requirements
  remain actionable there and in product status. Settings omits the duplicate
  general failure strip; the top-right control remains the direct recovery entry.
- Recording phase means an admitted owner, not microphone readiness. The native
  capsule and dashboard show Starting until exact-session readiness is observed.
  Practice preserves Finish/Cancel eligibility while withholding speech guidance,
  meter and sample-derived timer until its identity-checked readiness observation.
- The cream/graphite/muted-red palette and saved Light/Dark/System preference
  remain shared across destinations. Browser regressions cover both palettes,
  normal/minimum/tiny viewports, actual keyboard focus, update states and private
  context teardown. These checks are not native VoiceOver or microphone acceptance.
