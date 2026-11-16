# macOS audio-session ownership

## One admitted session, isolated input and optional output engines

`Bridge.record` freezes microphone UID, sounds/profile/volume, generation and
cancellation epoch. It publishes one `AudioSession` reference on AppKit, then
constructs and runs `AudioCapture` on that session's serial hardware owner.
`SessionAudioOwner` owns an input-only `AudioCapture` and, only for audible
sessions, an output-only `SessionCueOutput`. They share the same admitted session
lifecycle, not an AVAudioEngine graph. Binding the input AU to an explicit device
can remove that engine's output capability; accessing its mixer/output would
therefore create an invalid zero-channel output graph. Input never accesses a
player, mixer or output node. Output never accesses an input node.

Input negotiation/start completes first, with PCM acceptance disabled, so a
Bluetooth input profile settles before the fresh output-only engine is created.
Output freezes the system-default output UID read-only and checks both the live
default and actual output AU device plus nonzero rate/channels. There is no
default/device/rate write, aggregate creation, automatic fallback, or recording retry.
Disabled sounds or zero volume create no output engine and add no cue tail.
Profile and volume are frozen at admission. Preview remains an independent,
explicitly idle-only AVAudioPlayer action with no idle input engine.

Preparation installs the tap with acceptance closed and starts the input engine,
then prepares/starts optional output.
Start-cue completion plus the quiet tail permits acceptance, subject to the
original epoch/start gate and route/format checks. Muted sessions skip playback
and the quiet tail, not preparation or the independent three-second startup
watchdog. The watchdog closes acceptance and reports failure even if a
synchronous OS startup operation has not returned. It cannot safely interrupt
that OS call; ownership remains occupied until cleanup actually completes.

### Bounded preaccept input negotiation

Production `AudioCapture.prepareSession` uses `CapturePreparation` for at most
two input preparations under that same session, generation, epoch, frozen UID
and original three-second watchdog. Only an observed engine configuration
notification **inside initial input prepare**, before input-start commit or any
cue/PCM acceptance, authorizes the second preparation. A generic NSError or
contained Objective-C exception is terminal even if a notification also arrived.
There is no timer, delay, device heuristic or retry of recording. Public legacy
`AudioCapture.start()` remains single-attempt.

The first attempt closes/discards its pipeline, removes its observer, stops the
input engine and removes the tap before replacement. Both teardown operations
must succeed. The same input-only engine and binding are retained; the new
`CaptureStartup` owns a fresh observer, converter and explicit fresh hardware
tap format, revalidating selected UID/actual device and hardware/output formats.
Apple's `AVAudioEngine.h` configuration-notification contract retains nodes and
old formats; `stop` releases prepare resources. `AVAudioNode.h` permits removing
the old tap and explicitly applying a format to an unconnected output bus. This
input-only graph has no connections/player/mixer to rebuild or reset.

Cancellation/watchdog revoke is permanently locked across replacement; retired
attempt identities cannot report failure against the new attempt. Lost UID,
binding/format/stop/remove failure, expired gate/deadline or cancellation never
authorize another preparation. The second failure is final. Configuration
changes after input-start commit (including cue, listening and end-cue periods)
retain their existing failure disposition. No output engine is created until
input negotiation succeeds, and neither input preparation accepts PCM.

Bounded format diagnostics retain `negotiationAttempts`, `initial_config_change`
and `initialInputRate` alongside the terminal failure metadata/current input rate;
successful reconciliation has no intermediate visible failure. These fields
contain no device identity or localized speech/error description.

## Admission is not observation

`AudioSession.Observation.audioReady` is true only after acceptance is enabled.
It becomes false immediately on finish, stop, cancellation or capture failure.
The capsule's recording controls retain their existing phase/hold semantics,
but display **Starting…** rather than claiming to listen before readiness.
Its timer captures the exact session reference and overlay generation; a stale
timer cannot project another session's readiness. Meter reads return a bounded
cached value and schedule at most one owner refresh, never wait on hardware.

`hf_audio_status(generation, epoch)` returns bounded metadata for that exact
identity: `audioReady`, diagnostic `reason`, format/rate metadata and bounded
timing events. It neither constructs an engine nor authorizes capture.
Ready format metadata includes `inputRate`, `inputChannels`, and, when audible,
`outputRate`, `outputChannels`, `cueRate`. First startup/playback failure preserves
`failureStage`, sanitized/truncated (64-character) `failureDomain`, `failureCode`
and a fixed `failureException` marker for contained Objective-C exceptions.
Diagnostics are collected before owner teardown, including partial preparation;
cleanup cannot replace the original error. No localized OS error/exception
description, device UID or name is emitted.
Rust's normal status exposes `audio_ready`, `audio_reason`, `audio_generation`
and `audio_diagnostic`. `practice_status` adds **`audio_ready: boolean | null`**
to the existing reply, without changing `phase`, token/generation ownership or
control eligibility. Native readiness is observed outside Rust locks, then
revalidated against the practice token, meter generation/epoch and current
cancellation epoch. An absent, stale or non-recording observation yields null.

## Failure facts and release

Diagnostic reason strings never decide whether a capture failure is fatal.
Locked `captureAccepted` records that this session reached readiness;
`producerDrained` records that normal producer drain completed. Before readiness,
startup failure requires the live startup gate. After readiness, capture/route/
converter failure reports once using the epoch/cancellation guard, even if
physical release already closed the startup gate and Finish has not yet run.
Failure during drain also defeats partial transcription. Revoked epochs cannot
publish errors. Once drain is complete, end-cue playback/route failure can retire
the session but cannot corrupt already-final PCM or fail transcription.

## EOS and full retirement are separate barriers

Normal `hf_finish` snapshots the exact session on AppKit, then closes and drains
the producer on the calling FIFO worker, **outside AppKit**. Rust publishes EOS
after this drain. Both engines stay alive for the end cue; completion or its
three-second deadline tears it down. Generic `hf_stop` preserves that cue and
waits for full retirement outside AppKit. Cancellation closes acceptance
immediately under the short session lock, then queues hardware cleanup.

Worker completion calls `hf_stop` after either normal finish or cancellation,
before releasing `INGRESS` or publishing idle. Retirement clears the native
global recorder on AppKit only if it still references that exact session, then
releases the worker's retirement barrier. A queued new Fn/start remains in the
existing FIFO until then; it cannot race a retained old recorder and produce a
false microphone error. No new global phase or early slot release is needed.
Quit cleanup only revokes/queues teardown on AppKit; it must not block the
runloop waiting for a synchronous OS call. Rust state locks do not cross these
native waits. An OS call that never returns remains a real occupied owner, not
fake idle; only cue completion has a safely bounded deadline.

## Verification and inventory handoff

Permission-free native harnesses cover release-before-Finish failure, revoked
epochs, drain failure, nonfatal end-cue errors, blocked preparation with runnable
main-loop work, independent startup timeout, late callbacks, cancellation and
withheld end-cue completion holding a queued restart until retirement. Capsule
accessibility checks distinguish Starting from Listening. These are synthetic
operations and in-memory conversion, not microphone, playback or audibility
acceptance. Real devices/rates, Bluetooth route changes and signed installed-app
behavior remain separate acceptance gates.

Suggested shared inventory updates (owned by the coordinating agent):

- `native-audio`: point to `AudioSession`; describe serial hardware ownership,
  accepted/drained facts, independent startup watchdog and retirement barrier.
  Remove obsolete claims of main-thread hardware startup.
- `cue-capture-handoff`: describe one session's isolated input/output ownership, completion/deadline
  handoff, quiet tail, producer drain before end cue and full retirement before
  admitting another FIFO start.
- `overlay` and `practice-lease`: readiness is exact-session observation, not a
  new phase or authorization; native meter access does not wait on hardware.
- `stream-slot`/`audio-queue`: EOS follows drain; slot release/idle follows native
  retirement, including cancellation; capture errors defeat partial success.
