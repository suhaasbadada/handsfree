# Desktop interface contracts

- Product status is an interactive control at the top right on every destination,
  not a passive sidebar footer. Its accessible dialog explains the current failure
  separately from permission/model/shortcut checks and provides direct permission,
  model-download and input-device actions. Opening/refreshing it never
  records, prompts, downloads or changes preferences. Unknown/disconnected status
  clears stale readiness. Native guards remain authoritative; private testing still
  needs explicit Record on Home. The dialog follows existing Practice-context revocation,
  restores focus on dismissal, and keeps recovery actions reachable in small windows.
- Home combines Words, Time saved and Dictations with the private editor in one
  screen, fitting default 980×820 and minimum 560×650 normal ready states.
  There is no sidebar, brand menu or Overview/Practice tab bar. A static brand
  anchors the header; compact status and one accessible Settings gear sit right.
  Settings replaces Home; the back arrow or Escape in ordinary Settings returns focus
  to the accessible Home heading, not the editor, without recording. Open dialogs,
  native selects and shortcut capture retain their own Escape handling. The tray
  Practice action may focus the editor; keyboard focus remains visible. The Settings gear
  is transparent at rest, with a temporary hover fill rather than a selected fill.
  Settings has one content scroller; the header and
  compact footer stay in place. The stable candidate footer shows app version and
  English/on-device metadata without a BETA badge. Small/zoomed viewports use normal reachable
  document scrolling rather than clipping controls. Long transcripts and errors
  remain keyboard-readable; fitting a normal page never hides actual content.
- Practice has one editor and primary action. Record, Finish and Record again
  reuse their action slot. Actions size intrinsically with bounded wrapping, not
  fixed-width grid cells; completed/empty Record again labels and icons must fit
  inside button padding, including larger text. Meter, timer and status transitions
  do not move the editor. Settings has one header entry; navigating there retires private
  context/text. Error-specific recovery opens product status, never another
  Settings button. No onboarding panel is inserted into Practice.
- Practice's compact waveform projects only the existing identity/readiness-checked
  input level. Unready, stale, cancelled and hidden contexts reset it to quiet dots;
  it never opens a microphone or animates invented speech. The accessible meter
  remains available and reduced-motion disables bar transitions. Privacy is the
  idle status fallback, with a persistent editor description for screen readers.
- Page hierarchy uses typography, whitespace and subtle dividers, not filled,
  bordered cards around every section. Home metrics are unboxed and the private
  editor retains only its functional surface.
  Settings sections have no enclosing rectangles. Buttons center labels with equal
  inline padding; controls use compact 32px targets and quiet native select values
  instead of filled rectangles. Native selects have separate current-color SVG
  chevrons (including mode and completion sound), preserving native
  keyboard semantics, ellipsis and full-name tooltips. Microphone help is an
  accessible description, not a paragraph competing with its refresh button.
  Appearance is a labeled icon radio group for System, Light and Dark.
  Settings order is shortcut, recording limit, sound and adjacent volume, then
  microphone, mode, appearance and General extras. Utility actions use labeled SVG icons. The app
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
- Setup guidance is removed. Product status remains the single health/recovery
  surface with explicit permission/model/device actions. Ready is green only
  when native requirements are met; missing requirements, capture errors and
  disconnection remain red, never relabeled healthy because permissions pass.
  Home eligibility is intentional: native private shortcut receipts work there,
  but Settings/modal/blur/install revoke all pending Practice work and clear text
  and meter. Returning only restores eligibility, never starts recording.
- Updates stay inline in the footer, with no update or install-confirmation modal.
  Clicking the refresh action checks the feed and shows a busy SVG spinner. A verified offer
  changes that same control to a marked download icon with a visible action,
  exact version, and notice that the app will reopen; another
  explicit click rechecks and installs only that version, then the native updater
  reopens HandsFree. A changed offer needs another click, never silent consent.
  Busy states disable repeats, byte progress and failures stay inline, and ordinary
  status polling never contacts the feed. Native idle/install/signature guards stay
  authoritative. Reduced motion disables the spinner, not its readable status.
- Ready setup is not repeated at the bottom of Settings. Missing requirements
  remain actionable there and in product status. Settings omits the duplicate
  general failure strip; the top-right control remains the direct recovery entry.
- On macOS, Practice has centered icon-only Record/Finish and Clear/Cancel
  controls inside the editor. No status text or status space sits below it.
  Live regions announce results; the Practice problem icon above the editor and
  the Product status control open actionable diagnostics without starting capture.
- Recording phase means an admitted owner, not microphone readiness. The native
  capsule and dashboard show Starting until exact-session readiness is observed.
  Practice preserves Finish/Cancel eligibility while withholding speech guidance,
  meter and sample-derived timer until its identity-checked readiness observation.
- The cream/graphite/muted-red palette and saved Light/Dark/System preference
  remain shared across destinations. Browser regressions cover both palettes,
  normal/minimum/tiny viewports, actual keyboard focus, update states and private
  context teardown. `tests/ui-stable-bugs.mjs` covers action-content geometry and
  navigation focus; `tests/ui-webkit-layout.jxa` also measures completed/empty
  icon layout in WebKit. These checks are not native VoiceOver or microphone acceptance.
