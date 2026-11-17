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

Input negotiation/start completes with PCM acceptance disabled, followed immediately
by input revalidation and atomic acceptance. There is no start cue or quiet tail.
Completion asset read/decode and output construction/prepare/start happen only after
accepted PCM closes and drains. Admission freezes the system-default output UID
read-only (without constructing output) and completion checks both the live
default and actual output AU device plus nonzero rate/channels. There is no
default/device/rate write, aggregate creation, automatic fallback, or recording retry.
Disabled sounds or zero volume create no output engine and add no cue tail.
Profile and volume are frozen at admission. Preview remains an independent,
explicitly idle-only AVAudioPlayer action with no idle input engine.

Preparation installs the tap with acceptance closed and starts the input engine,
then immediately validates and enables input; no output work is on this path.
Input-start commit means running, not accepted capture. An input configuration
notification after that commit and before acceptance only advances a locked
revision; it never opens PCM or reads OS state in the notification callback.
After input preparation the serial owner revalidates
the frozen selected/actual input device, hardware format, node output format,
converter input format and engine `isRunning` (through the Objective-C exception
boundary). It repeats that validation immediately before enabling acceptance.
Unchanged, running input can proceed without a retry; changed identity/format or
a stopped engine fails recoverably. A notification racing the validation fails
the atomic revision check rather than accepting an unvalidated snapshot.
Revocation/deadline tombstones cannot be cleared by validation. After acceptance,
each live input notification also advances that revision and requests read-only
certification on the existing serial owner, after releasing the route lock.
Certification reuses the actual selected/default device, frozen UID, input AU
binding, fresh hardware and node-output formats against the frozen tap/converter
format, and actual engine-running operations. An unchanged, running input is
benign regardless of elapsed time or whether first PCM has arrived. Frozen format
diagnostics alone are not evidence. No notification/tap callback reads OS state.
Exact-format PCM continues provisionally; certification never enables/reopens a
producer. Failed reads, contained exceptions, changed identity/format/running or
a notification during validation fail the whole transcription once, including
partial PCM already delivered. There is no quiet loop, retry, restart or fallback.
A separate independent three-second pending-certification watchdog closes/revokes
and reports even if its owner is blocked. Cancellation, epoch revocation and final
drain certification make stale work/deadlines inert; they cannot grant late acceptance.
Acceptance follows immediately, subject to the original epoch/start gate and
route/format checks. Startup has
two phase-bounded, independent three-second budgets, not one global three-second
whole-startup limit. The hardware deadline covers factory construction, input
preparation (including at most one reconciliation) and input validation.
Successful `route_ready` atomically retires that
deadline and transfers to a separate three-second handoff deadline covering
immediate enable/revalidation. Only actual `audioReady`, failure or cancellation
retires the handoff. Late/duplicate hardware callbacks cannot kill handoff, and
retired callbacks cannot affect listening or end cues. Audible and muted sessions
use the same immediate enable path, without an intentional wait.

Both watchdogs run independently of the serial owner, so blocked factory,
input-prepare or enable OS calls cannot starve them. First-failure diagnostics identify
`hardware_startup_timeout` or `cue_handoff_timeout`, preserving an earlier cause.
The logical startup budget is at most 3 s hardware + 3 s handoff, with no added
normal-path wait. Deadline/cancellation permanently close acceptance and report
at most once subject to epoch/start authorization. They cannot safely interrupt
a synchronous OS call; ownership stays occupied until real cleanup completes.

### Bounded preaccept input negotiation

Production `AudioCapture.prepareSession` uses `CapturePreparation` for at most
two input preparations under that same session, generation, epoch, frozen UID
and original three-second hardware watchdog (never reset between attempts). Only an observed engine configuration
notification **during initial input startup**, before input-start commit or any
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
changes after input-start commit but before acceptance require the read-only
confirmation above, not another preparation. Listening uses read-only
certification, not additional negotiation. After certified drain, input/output notifications
retire completion nonfatally after drain. No output engine is created until
Finish has closed, drained and certified accepted PCM; neither input preparation accepts PCM.

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
Ready format metadata includes `inputRate` and `inputChannels`; completion later
adds available `outputRate`, `outputChannels`, `cueRate`. First startup/playback failure preserves
`failureStage`, sanitized/truncated (64-character) `failureDomain`, `failureCode`
and a fixed `failureException` marker for contained Objective-C exceptions.
Diagnostics are collected before owner teardown, including partial preparation;
cleanup cannot replace the original error. No localized OS error/exception
description, device UID or name is emitted.
Asynchronous callback failures retain their first `input_configuration`,
`output_configuration` or `capture_pipeline` cause, even if startup fails before
`route_ready`; available input/output format metadata is snapshotted on the owner
before the validity guard/cleanup. Notification callbacks perform no OS reads.
Rust's normal status exposes `audio_ready`, `audio_reason`, `audio_generation`
and `audio_diagnostic`. `practice_status` adds **`audio_ready: boolean | null`**
to the existing reply, without changing `phase`, token/generation ownership or
control eligibility. Native readiness is observed outside Rust locks, then
revalidated against the practice token, meter generation/epoch and current
cancellation epoch. An absent, stale or non-recording observation yields null.

## Failure facts and release

Diagnostic reason strings never decide whether a capture failure is fatal.
Locked `captureAccepted` records that this session reached readiness;
`producerDrained` records a successful, live, revision-certified normal producer
drain (not merely entering drain or flushing the converter). Before readiness,
startup failure requires the live startup gate. After readiness, capture/route/
converter failure reports once using the epoch/cancellation guard, even if
physical release already closed the startup gate and Finish has not yet run.
Failure during drain/final certification also defeats partial transcription. Revoked epochs cannot
publish errors. Once drain is complete, end-cue playback/route failure can retire
the session but cannot corrupt already-final PCM or fail transcription.

## EOS and full retirement are separate barriers

Normal `hf_finish` snapshots the exact session on AppKit, then closes and drains
the producer on the calling FIFO worker, **outside AppKit**. It then performs fresh
read-only input validation and certifies that snapshot's revision and the live
session's `producerDrained` fact in one short atomic boundary, before returning
to Rust for EOS. A missing final-validator hook fails capture; it cannot grant an
uncertified successful drain. This final validation is required even if a notification's owner
task was queued behind Finish, or arrived during converter drain. A notification
during final reads/before certification fails closed; one after certification may
retire completion but cannot invalidate final PCM. Converter failure can never
produce a successful certificate or start completion work.

Lock order is session -> preparation (revocation only) -> route -> producer.
Certificate commits take session -> route; notification callbacks release route
and preparation locks before calling the session. OS reads and converter drains
occur outside all these locks. Runtime validation clears its pending ticket only
inside the same session/revision boundary, so a concurrent notification cannot
be lost. Startup's `drained` cleanup flag is deliberately separate from the final
certificate. Only after successful certified drain with actual accepted PCM does
optional completion read/decode/create/prepare run asynchronously on the same
serial owner. Missing assets/output metadata, changed frozen output UID, output
failure or its three-second deadline are nonfatal to final PCM. No current-default
fallback is permitted. The deadline starts before deferred construction and
prevents late playback even if an OS call returns late; cancellation does likewise.
No-PCM, failed and cancelled sessions perform no completion work. Both engines
retire together. Generic `hf_stop` preserves that cue and
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
fake idle; startup watchdogs bound logical failure, not OS-call retirement.

## Verification and inventory handoff

Permission-free native harnesses cover release-before-Finish failure, revoked
epochs, drain failure, nonfatal end-cue errors, blocked preparation with runnable
main-loop work, independent hardware/handoff timeouts (including blocked
factory/enable), virtual 2.633 s preparation with immediate acceptance,
25 production-chain accepted-input certification scenarios (including notification
after enable/before first PCM, ongoing lossless provisional PCM, actual route/
format/running mismatches, contained errors, notification inside validation,
blocked validation cancellation/timeout, physical release, Finish queued ahead
of validation, notification during converter drain/final reads and on both sides
of the certificate boundary, converter failure and stale callbacks),
an omitted final-validator hook failing closed before EOS/completion,
stale/duplicate deadlines, muted handoff, cancellation and
withheld end-cue completion holding a queued restart until retirement. Capsule
accessibility checks distinguish Starting from Listening. These are synthetic
operations and in-memory conversion, not microphone, playback or audibility
acceptance. Real devices/rates, Bluetooth route changes and signed installed-app
behavior remain separate acceptance gates.

Suggested shared inventory updates (owned by the coordinating agent):

- `native-audio`: point to `AudioSession`; describe serial hardware ownership,
  accepted/drained facts, independent phase-scoped hardware/handoff watchdogs
  and retirement barrier.
  Remove obsolete claims of main-thread hardware startup.
- `cue-capture-handoff`: describe capture-first immediate input acceptance and deferred completion/deadline
  output, producer drain before end cue and full retirement before
  admitting another FIFO start.
- `overlay` and `practice-lease`: readiness is exact-session observation, not a
  new phase or authorization; native meter access does not wait on hardware.
- `stream-slot`/`audio-queue`: EOS follows drain; slot release/idle follows native
  retirement, including cancellation; capture errors defeat partial success.
# Explicit signed-candidate release probe

`handsfree --release-smoke` is an explicit, macOS-only early dispatch before normal
application setup. No normal launch/idle capture behavior changes. Bridge's
`productionAudioFactory` is shared by normal recording and the probe: actual
AudioCapture, AudioSession and SessionAudioOwner, both live/final certificate
hooks and deferred completion remain one implementation. Optional trace observes
certificate results, notifications, cleanup and weak input/engine lifetime; it
does not authorize or alter capture. Converted format metadata comes from the
actual pipeline's output format.

`ReleaseSmokeController.drive` is the common injected-effect control flow used
by the probe and permission-free native tests. Actual PCM controls finish/cancel,
not elapsed time or readiness. Three finishes need >=16000 mono-16k frames and
nonzero samples; cancellation needs its first actual PCM. Every attempt needs one
preparation, no failure/late accepted PCM, full retirement and baseline device
running state/identity restored. Saved input and sound preferences are read-only;
no permission prompt, audio file, model, paste, usage or settings transaction exists.
Independent 12s cancellation / 18s hard per-attempt / 80s global bounds cannot be
blocked by the serial hardware owner. Hard exit closes only this diagnostic process
and cannot yield success evidence. No other app instance is terminated; even idle
instances are conservatively rejected and isolation is rechecked during capture.
Older instances do not share a lock; external concurrent launches remain an
operator exclusion requirement, not a claimed OS-wide guarantee.

The Node runner snapshots the exact source/signature/bundle/archive/OS identity
before and after, writes only a private ignored metadata receipt, and all release
audit modes require that evidence within 24h. Permission-free tests and earlier
scratch-app diagnostics do not prove hardware operation or installed dictation/OTA.
