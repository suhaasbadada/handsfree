# State ownership and transition contracts

## Decision

Keep **small, separately owned machines**, not one global FSM or a new framework.
Make the observation contracts, action policies, side-effect boundaries and
verification paths explicit. Preserve the existing Rust FIFO, generation/epoch
gates, native main-thread ownership and streaming teardown barriers.

This is the smallest useful improvement for all three audiences:

- **UX:** coherent action eligibility, no backward installer progress, actionable
  failure instead of silently accepting an unknown updater phase; keyboard and
  confirmation behavior remain covered by the existing browser smoke.
- **Developer experience:** exhaustive TypeScript phase unions, one frontend
  phase-policy table, real Rust/TypeScript policy agreement tests, targeted tests
  without microphone, permissions, packages or models.
- **Agent experience:** [source-linked machine inventory](state-machines.json)
  with searchable owners, state encoding, conceptual events, dependency edges,
  invariants and verification entry points. No inference from a single phase or
  an undocumented collection of booleans is required.

The inventory covers app-owned runtime code, retained Windows adapters and the
supporting website/release tools. It is a reviewed map of **machine families**;
some entries contain orthogonal submachines (for example an audio engine and its
converter queue). Conceptual state/event names are summaries, not new serialized
values. Dependency internals and every possible product of flags are not claimed
to be exhaustively modeled. Anchor checks keep references fresh; they cannot
prove discovery completeness or runtime correctness on an untested OS.

## The important boundaries

1. **Observation is not authorization.** `src/state.ts` describes phase-level UI
   eligibility. Rust checks current ownership under its FIFO/locks before effects.
   Native owners recheck permission/focus/cancellation immediately before delivery.
   A button becoming enabled is never a lease to capture, paste or install.
2. **Phase is not lifecycle.** A cancelled streaming worker still owns its slot;
   `processing` includes cancellation acknowledgement. Physical key release does
   not end the focus watch. Practice's completed text retains a token until Clear.
   Update operation progress and its install/quit lease are separate machines.
3. **Epoch, generation and revision are not interchangeable.** Epoch revokes work
   at input receipt; generation identifies a recording; practice token tombstones
   late starts; UI revision discards stale IPC. None may be reset to resurrect work.
4. **Snapshots may skip states.** A reloaded/slow WebView can observe installation
   without seeing its download. Do not reject snapshots using an adjacency-only
   global reducer. Within one active update revision, however, progress cannot
   move `installing` back to `downloading`; the owning invoke reports terminal errors.
5. **Intent precedes effects.** Updates check only on request; install/reset require
   explicit confirmation. Practice has no external paste, clipboard or usage route.
   Delivery is once-only, with uncertain submission never converted into a retry.
6. **Commit and observation differ.** Preference transactions apply/persist/rollback;
   usage persists after delivery and reports a separate save error. A green build,
   artifact audit or live feed is not a successful installed-app update/restart.

## Practical navigation

| Problem | Start with inventory IDs | Verify |
| --- | --- | --- |
| Unexpected start/finish/cancel | `dictation`, `cancellation`, `hold-routing`, `fn-tap` | Rust routing/epoch/hold tests |
| Audio truncation or capture after cancel | `native-audio`, `cue-capture-handoff`, `stream-slot`, `audio-queue`, `segmentation-inference` | Native cue tests and streaming Rust tests |
| Lost/stale practice text or dashboard shortcut | `dashboard-context`, `practice-input`, `practice-lease`, `practice-ui` | `tests/practice-input.test.mjs`, `tests/practice.test.mjs`, Rust router/gate tests, browser event integration |
| Wrong field, double paste, clipboard loss | `delivery`, `focus-resolution`, `clipboard` | Permission-free native/focus harnesses; real editor acceptance is separate |
| Shortcut settings race | `shortcut-key-recognizer`, `shortcut-capture`, `preference-transaction`, `native-hook` | `tests/shortcut.test.mjs`, browser smoke |
| Disabled/wrong action | `action-policy`, `preferences-ui`, `permissions-readiness` | Shared policy fixture in Node and Rust |
| Update error or stale dialog | `update-operation`, `update-lifecycle`, `updates-ui`, `dialogs` | Updater Rust/Node tests, fresh-process TLS regression, isolated signed install |
| Tray/Dock/reopen behavior | `dashboard-lifecycle` | Native lifecycle tests; installed readiness |
| Paused Windows code | IDs prefixed `windows-` | Preserve code; Mac tests do not establish Windows runtime acceptance |
| Marketing demo/download or release rollout | IDs prefixed `website-` or `release-` | Website/packaging tests; deployment and runtime gates separately |

## Executable contracts

- Dashboard routing uses a revision-bound view context, not a recording lease.
  Focus loss, navigation, open menus/dialogs and shortcut capture revoke input
  eligibility. Native visibility/focus and recording guards remain authoritative.
  A physical hold keeps its receipt context through release/cancel; an ineligible
  dashboard press is absorbed, never converted into external dictation.
  `PracticeInputs` owns physical identity and early release, while `Practice`
  separately owns token/generation and finish-before-start acknowledgement.
  Existing external dictation retains its ordinary completion route. Own-app
  delivery refusal code 15 exits before clipboard fallback and usage publication.

- `src/state.ts`: separate dictation/practice/update phase spaces; readonly phase
  policies fail closed for unknown/disconnected states. There is deliberately no
  global `downloading` state: a model download and an app update are different owners.
- `tests/fixtures/action-policy.json`: common truth table exercised by Node's real
  frontend policies and Rust's actual configuration/preview/cancel/install guards.
  It freezes existing eligibility, including the stricter update refusal for
  `not_pasted`; it does not relax guards for uncommitted work.
- `tests/updates.test.mjs`: revision/stale-response, unknown/incomplete snapshot,
  explicit confirmation, duplicate invoke and monotonic progress behavior.
- `tests/state-catalog.test.mjs`: unique IDs, resolvable owners/anchors/test paths
  and valid dependency references. Catalog cycles reflect coordination, not a
  scheduling order; do not topologically reorder runtime code from this graph.
- `allowImportingTsExtensions` supports direct `.ts` imports in Node 24's existing
  type-stripped test path and the existing no-emit/Vite build. No new runtime/test
  dependency or generated code is introduced.

```sh
node --test tests/state.test.mjs tests/state-catalog.test.mjs tests/updates.test.mjs
cargo test --manifest-path src-tauri/Cargo.toml --locked phase_policy_matches_shared_frontend_contract
npm test
npm run build
```

## Change protocol and next priorities

Before adding a phase/flag, find its owner here and specify the event, stale-work
identity, rejected transitions, side effects and error recovery. Update the
catalog and shared policy tests in the same change. Keep OS-sensitive authority
where it lives; do not hold Rust state locks across synchronous native dispatch.

Do not replace every boolean with an enum at once. Next extractions should be
complete, independently tested work units: shortcut capture (UI promise/deadline
ownership), then preference pending/editing coordination. Native delivery, audio
teardown and the recording FIFO have the highest safety impact and should only
change for a demonstrated issue with adapter-level regressions and real acceptance.

No wire format, native ABI, settings schema, model, usage, signing key or Windows
support scope changes are part of this state-contract work. Beta 9 remains the
separately signed repair distribution; these source changes do not silently replace
its immutable app or establish future OTA/dictation acceptance.
