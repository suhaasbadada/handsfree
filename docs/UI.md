# Desktop interface contracts

- Overview and Practice fit the default 980×820 and minimum 560×650 windows in
  their normal ready states. Settings has one content scroller; the sidebar and
  compact footer stay in place. Small/zoomed viewports use normal reachable
  document scrolling rather than clipping controls. Long transcripts and errors
  remain keyboard-readable; fitting a normal page never hides actual content.
- Practice has one editor and primary action. Start, Finish and Record again
  reuse their action slot. Meter, timer and status transitions do not move the
  editor. Its Settings action navigates to Dictation settings and retires the
  private input context/text; it never inserts an onboarding panel into Practice.
- Practice's compact waveform projects only the existing identity/readiness-checked
  input level. Unready, stale, cancelled and hidden contexts reset it to quiet dots;
  it never opens a microphone or animates invented speech. The accessible meter
  remains available and reduced-motion disables bar transitions. Privacy is the
  idle status fallback, with a persistent editor description for screen readers.
- Buttons center labels with equal inline padding. The app picker clears its row
  divider; Overview's padded Practice link and recovery panel are separate aligned
  surfaces. Long recovery text remains scrollable rather than overlapping actions.
- Sound preview remains usable in quiescent idle/result/error/setup phases, without
  clearing that state. UI eligibility does not authorize native audio: recorder,
  active-owner, preview and installer guards still apply.
- The revisitable setup guide belongs to Settings. It observes native proofs and
  uses explicit permission/download actions. Closing it focuses the visible
  Settings heading, never a hidden practice field.
- Update status is a compact single-line footer action. A verified offer remains
  emphasized with its accessible version; unknown/error/up-to-date observations
  remain distinct. The dialog retains explicit check and exact-version install
  consent. A cached status never authorizes network activity or installation.
- Recording phase means an admitted owner, not microphone readiness. The native
  capsule and dashboard show Starting until exact-session readiness is observed.
  Practice preserves Finish/Cancel eligibility while withholding speech guidance,
  meter and sample-derived timer until its identity-checked readiness observation.
- The cream/graphite/muted-red palette and saved Light/Dark/System preference
  remain shared across destinations. Browser regressions cover both palettes,
  normal/minimum/tiny viewports, actual keyboard focus, update states and private
  context teardown. These checks are not native VoiceOver or microphone acceptance.
