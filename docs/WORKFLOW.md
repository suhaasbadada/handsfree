# macOS workflow controls

The native main-thread `WorkflowPolicy` owns **future admission**, separately from
recording lifetime, cancellation epochs, physical holds, and Store persistence.
Pause is ephemeral and starts false in each process. Only exclusions persist.
There is no saved launch-at-login boolean: ServiceManagement is authoritative.

## IPC

All commands below are macOS-only. Settings are explicit actions, never startup
registration or a login polling loop. Tauri arguments use camelCase.

```ts
type LoginStatus = {
  status: 'enabled' | 'approval_required' | 'not_registered' | 'not_found' | 'unknown';
  error: string | null;
};
type WorkflowStatus = {
  paused: boolean;
  excluded_bundle_ids: string[];
  login: LoginStatus;
};
// workflow_status() -> WorkflowStatus
// set_paused({ paused: boolean }) -> WorkflowStatus
// set_excluded_apps({ bundleIds: string[] }) -> WorkflowStatus
// running_apps() -> { bundle_id: string; name: string }[]
// set_launch_at_login({ enabled: boolean }) -> LoginStatus
// open_login_settings() -> void
```

`set_launch_at_login` returns the **actual post-operation status**, plus the
localized operation error if registration/unregistration failed. Approval-needed
is not enabled. Repeated enable while awaiting approval does not register again.
Opening login settings neither registers nor unregisters. Ordinary launch
presentation is unchanged.

While approval is required, **Cancel pending registration** is a separate,
explicit action using `set_launch_at_login({ enabled: false })`; the checkbox
does not pretend pending approval is enabled. The action shares the login write
pending owner, then renders the actual returned OS status. An unregister error
is shown without claiming cancellation succeeded. Mock UI regression coverage
does not establish real signed-app ServiceManagement cancellation acceptance.

`running_apps` reads regular NSWorkspace application metadata only: no AX lookup,
permission request, activation, or capture. Names are plain strings, not markup.
Keep saved exclusions for IDs absent from this list. Exclusions are sorted,
deduplicated, case-preserving, limited to 256 entries of at most 255 ASCII bytes;
IDs contain nonempty dot-separated components using letters, digits, `_` or `-`.
Malformed saved exclusions reset only that field, preserving other Store fields.

### Dashboard shortcut receipts

`practice-input` events additionally carry a native `receipt: number`. Forward it
as `practice_start({ token, shortcutReceipt: receipt })` **only when starting from
that event**. Explicit Start test omits `shortcutReceipt`. A finish/release of an
existing practice keeps its existing generation/token route, not a new start.
The optional argument preserves explicit button compatibility, but callers must
not strip shortcut provenance. This distinguishes paused shortcut starts from
the explicit test without turning pause into a cancellation of active practice.

## Boundaries

- Receipt checks pause before routing dashboard/global input. Exclusions apply
  only to external starts. Rejected down events still latch physical identity:
  resume/refocus cannot rearm a held Fn/key until physical release.
- Native receipt tickets freeze PID and bundle ID, are monotonic and bounded
  (512 retained). Evicted/unknown tickets fail closed, never borrow current focus.
  At external native admission the current identity must match receipt, remain
  external and known, and pass current policy. Recheck after reentrant AX target
  resolution, before constructing `AudioCapture`. Practice requires own foreground;
  shortcut practice also requires its receipt and current unpaused policy.
- Successful FIFO/native admission freezes the boundary: cue-waiting and ongoing
  recordings never reread workflow policy. Existing cancellation/focus/epoch and
  capture-start gates remain unchanged. Pause/exclusion setters neither cancel
  nor reset physical gestures; accepted release, toggle-to-finish, Escape, capsule
  Finish/Cancel, menu Finish/Cancel and completion retain their ordinary owners.
- Exclusion changes run on `Control::Configure`: merge into the fresh Store under
  its lock, save, release the lock, then dispatch native configuration. No Rust
  state lock crosses synchronous main-thread dispatch. A failed post-rename
  directory sync can leave new disk data: reload/reconcile the actual field,
  apply it, and return an explicit durability error, never claim fictional rollback.
- Tray Pause/Resume observes native state. Finish snapshots the displayed
  recording generation and uses `Control::Finish(Some(generation))`; it never
  toggles into a new recording. FIFO generation/phase checks remain authoritative.

## Dashboard controls

The macOS Settings **Workflow** card offers temporary Pause/Resume, launch at
login and a running-app exclusion picker. The brand menu also offers Pause/Resume.
Pause is orthogonal to dictation phase and expires when the app restarts. Explicit
**Start test** remains available. Existing Finish/Cancel paths remain unchanged.

Launch at login reflects actual macOS ServiceManagement status, not a saved
checkbox. Approval-required stays unchecked and exposes **Open Login Items**;
the UI does not claim registration means enabled. Registration errors retain the
last observed state. Each write has an independent pending owner; background
status reads are coalesced and cannot overwrite a newer edit. Tray changes are
observed on the next status refresh, without polling app metadata.

Exclusions persist bundle IDs, including absent apps; remove them from the list
without launching the app. Settings open and **Refresh** list regular running
apps using metadata only. Names render as text, never HTML. The picker neither
activates apps nor requests Accessibility/consent. Failed saves retain the saved
list and selected picker value for retry.

Shortcut-origin practice forwards its native receipt as `shortcutReceipt` to
`practice_start`; missing/invalid receipts fail closed before starting. Button
starts omit this argument. Receipt identity does not replace physical hold,
context, token, generation or early-release guards.

## Automated verification

`tests/workflow.test.mjs` exercises real typed controller behavior, independent
writes, failures, duplicates and stale/coalesced reads. Fresh-document production
listener/CDP tests in `tests/ui-practice-events.mjs` cover pause roundtrip and tray
observation, approval vs enabled, failed writes, absent-app removal, text-only
names and actual receipt IPC/button omission, retaining existing context/focus
and responsive layout assertions. `npm test`, `npm run build`, and the bounded
Brave `tests/ui-smoke.mjs` run do not use live OS login registration or capture.

`cargo test`, strict Clippy, and `tests/native.test.mjs` exercise synthetic
admission identities, rejected-down/resume/release, existing finish and accepted
release through policy changes, stale/changed identities, explicit vs shortcut
practice, fake login adapter effects/errors and isolated malformed Store fields.
No test registers login, opens a microphone, installs/launches an app, or changes
live settings. Hardware and real signed-app ServiceManagement acceptance remain
separate release gates.
