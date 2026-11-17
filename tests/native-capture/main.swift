import Foundation
import AVFoundation

// Synthetic PCM only. Do not instantiate AVAudioEngine or request microphone.
for rate in [16000.0, 24000.0, 44100.0, 48000.0, 96000.0] {
    for interleaved in [false, true] {
      for (left, right) in [(Float(0.2), Float(0)), (Float(0), Float(0.2)), (Float(0.05), Float(0.15))] {
        let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 2, interleaved: interleaved)!
        var received = [Float]()
        var errors = 0
        let pipeline = try CapturePipeline(input: format) { data, count in
            if count < 0 { errors += 1 }
            else if let data = data { received.append(contentsOf: UnsafeBufferPointer(start: data, count: Int(count))) }
        }
        let frames = Int(rate * 2)
        var position = 0
        while position < frames {
            let count = min(2048, frames - position)
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count))!
            buffer.frameLength = AVAudioFrameCount(count)
            for i in 0..<count {
                let value = Float(sin(2 * Double.pi * 440 * Double(position + i) / rate))
                if interleaved { buffer.floatChannelData![0][2*i] = value * left; buffer.floatChannelData![0][2*i+1] = value * right }
                else { buffer.floatChannelData![0][i] = value * left; buffer.floatChannelData![1][i] = value * right }
            }
            pipeline.enqueue(buffer)
            // Mutate the producer's buffer immediately: queue must own a copy.
            for audio in UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList) {
                memset(audio.mData!, 0, Int(audio.mDataByteSize))
            }
            position += count
        }
        pipeline.close(); pipeline.drain()
        precondition(errors == 0)
        precondition(abs(received.count - 32000) <= 2, "\(rate) output duration \(received.count)")
        // Stereo -> mono must average BOTH channels. Either single-channel
        // fixture must yield 0.1-amplitude sine, not silence or channel-zero gain.
        let body = received.dropFirst(100).dropLast(100)
        let rms = sqrt(body.map { $0*$0 }.reduce(0,+) / Float(body.count))
        let expectedRMS = (left + right) / 2 / sqrt(Float(2))
        precondition(abs(rms - expectedRMS) < 0.001, "\(rate) interleaved=\(interleaved) L=\(left) R=\(right): RMS \(rms), expected \(expectedRMS)")
        precondition(pipeline.level().isFinite && pipeline.level() < 0, "input level must reflect synthetic PCM")
        let before = received.count
        let late = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2048)!
        late.frameLength = 2048; pipeline.enqueue(late); pipeline.drain()
        precondition(received.count == before, "late producer escaped stop barrier")
      }
    }
}
// Force bounded-queue overload without any real-time or microphone access.
let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
let entered = DispatchSemaphore(value: 0), release = DispatchSemaphore(value: 0)
var once = true, errors = 0
let pipeline = try CapturePipeline(input: format) { _, count in
    if count < 0 { errors += 1 }
    else if once { once = false; entered.signal(); release.wait() }
}
let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2048)!
buffer.frameLength = 2048
pipeline.enqueue(buffer)
precondition(entered.wait(timeout: .now()+2) == .success)
for _ in 0..<200 { pipeline.enqueue(buffer) }
release.signal(); pipeline.drain()
precondition(errors == 1, "overload must fail explicitly exactly once")
print("Synthetic 16/44.1/48 kHz stereo left-only/right-only/mixed RMS, owned buffers, EOS duration, stop barrier and bounded overload passed without microphone")

// Exercise the production finish barrier with synthetic PCM and a mock player.
// No engine, microphone, AVAudioPlayer.play, or AppKit is involved.
for reason in ["Fn", "tick", "custom", "limit", "cancel", "error", "quit", "pending-start", "cancel-during-drain", "muted"] {
    var events = [String]()
    let pipe = try CapturePipeline(input: format) { _, count in
        events.append(count < 0 ? "error" : "chunk")
    }
    var started = reason != "pending-start"
    var allowed = reason != "muted"
    if started { pipe.enqueue(buffer) }
    if reason == "error" { pipe.captureFailed() }
    func stopped() -> Bool {
        let wasStarted = started
        started = false
        pipe.close()
        let healthy = pipe.drain()
        events.append("stopped")
        if reason == "cancel-during-drain" { allowed = false }
        return wasStarted && healthy
    }
    if ["cancel", "quit"].contains(reason) {
        _ = stopped() // Generic teardown never invokes finish.
    } else {
        for _ in 0..<2 { // Duplicate queued finishes cannot ring twice.
            CaptureEnd.finish(stop: stopped, allowed: { allowed }, play: { events.append("cue") })
        }
    }
    let expected = ["Fn", "tick", "custom", "limit"].contains(reason) ? 1 : 0
    precondition(events.filter { $0 == "cue" }.count == expected, "\(reason): \(events)")
    if let cue = events.firstIndex(of: "cue") {
        precondition(events[cue - 1] == "stopped")
        precondition(!events.suffix(from: cue).contains("chunk"), "No future chunks after cue")
    }
    let before = events.count
    pipe.enqueue(buffer); pipe.drain()
    precondition(events.count == before, "Late tap escaped finish barrier")
}
print("Finish once after drain; cancel/error/quit/pending-start/mute suppressed without playback")

do {
    let available = [MicrophoneDevice(uid: "one", name: "Same name"), MicrophoneDevice(uid: "two", name: "Same name")]
    let saved = try Microphones.selectedUID(saved: "two", available: available, defaultUID: { preconditionFailure("Saved UID never resolves default") })
    let system = try Microphones.selectedUID(saved: nil, available: available, defaultUID: { "one" })
    precondition(saved == "two" && system == "one")
    do {
        _ = try Microphones.selectedUID(saved: "disconnected", available: available, defaultUID: { preconditionFailure("Unavailable UID must not fall back") })
        preconditionFailure("Disconnected UID accepted")
    } catch {}
    var events: [String] = []
    let prepared = try MicrophoneBinding.prepare(resolve: { events.append("resolve UID"); return 42 }, bind: { id in
        precondition(id == 42); events.append("bind")
    }, format: { events.append("format"); return "selected format" })
    precondition(prepared.0 == 42 && prepared.1 == "selected format")
    precondition(events == ["resolve UID", "bind", "format"])
    for failure in ["missing", "bind"] {
        events = []
        do {
            _ = try MicrophoneBinding.prepare(resolve: {
                events.append("resolve")
                if failure == "missing" { throw NSError(domain: "missing UID", code: 1) }
                return 42
            }, bind: { _ in events.append("bind"); throw NSError(domain: "bind failed", code: 1) }, format: { events.append("format"); return "default forbidden" })
            preconditionFailure("Selection failure must not fall back")
        } catch { precondition(!events.contains("format")) }
    }
    try MicrophoneBinding.revalidate(expected: 42, resolve: { 42 })
    do {
        try MicrophoneBinding.revalidate(expected: 42, resolve: { 43 })
        preconditionFailure("Changed route during cue must fail")
    } catch {}
    print("Microphone UID bind-before-format, missing/bind failure and delayed route revalidation passed without hardware")
} catch { preconditionFailure("Synthetic microphone binding failed: \(error)") }

// The real Objective-C throw stays entirely in Objective-C, not Swift frames.
let exception = HFTestCaptureException()!
precondition((exception as NSError).domain == "HandsFree capture exception")
precondition((exception as NSError).userInfo.isEmpty, "Exception details must not leak route identity")
precondition(HFCaptureBoundary({}) == nil)
for operation in 0..<7 {
    precondition(HFTestCaptureAdapter(Int32(operation))?.localizedDescription == exception.localizedDescription)
}

for rate in [16000.0, 24000.0, 44100.0, 48000.0, 96000.0] {
  for channels: AVAudioChannelCount in [1, 2] {
    let fresh = AVAudioFormat(standardFormatWithSampleRate: rate, channels: channels)!
    let cached = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    precondition(HFTestCaptureExplicitFormat(fresh, cached))
    var output = cached
    var installed = false
    var pipe: CapturePipeline?
    var samples = 0
    let startup = CaptureStartup(operations: .init(observe: { _ in {} }, validate: {},
        format: { fresh }, outputFormat: { output }, install: { format, pipeline in
            precondition(format === fresh && !installed)
            installed = true; output = format; pipe = pipeline
        }, prepare: { precondition(installed && output == fresh) },
        start: { precondition(output == fresh) }, stop: {}, remove: {})) { _, count in
            precondition(count >= 0); samples += Int(count)
        }
    try startup.start()
    let pcm = AVAudioPCMBuffer(pcmFormat: fresh, frameCapacity: AVAudioFrameCount(rate))!
    pcm.frameLength = pcm.frameCapacity
    for audio in UnsafeMutableAudioBufferListPointer(pcm.mutableAudioBufferList) {
        memset(audio.mData!, 0, Int(audio.mDataByteSize))
    }
    pipe!.enqueue(pcm)
    precondition(startup.stop() && abs(samples - 16000) <= 2)
  }
}

for failure in ["none", "zero", "format-exception", "output-exception", "uid", "install", "prepare", "start", "format-race", "format-prepare", "format-start", "output-install", "output-prepare", "output-start", "output-zero", "route-install", "route-prepare", "route-start", "route-running", "format-running", "cancel", "cancel-start", "stop", "remove"] {
    var events = [String]()
    var changed: (() -> Void)?
    var retained: CapturePipeline?
    var samples = 0, failures = 0
    // Recorder was created before playback at 48kHz. The cue switches the
    // hardware to 24kHz; production must not retain that pre-cue converter.
    var current = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    var nodeOutput = current // distinct: cue changes hardware but not cached output
    var startup: CaptureStartup!
    startup = CaptureStartup(operations: .init(observe: { callback in
        events.append("observe"); changed = callback
        return { events.append("unobserve"); changed = nil }
    }, validate: {
        events.append("validate")
        try MicrophoneBinding.revalidate(expected: 42, resolve: { failure == "uid" ? 43 : 42 })
    }, format: {
        events.append("format")
        if failure == "format-exception" { throw HFTestCaptureAdapter(0)! }
        return current
    }, outputFormat: {
        events.append("output")
        if failure == "output-exception" { throw HFTestCaptureAdapter(6)! }
        return nodeOutput
    }, install: { tapFormat, pipe in
        precondition(tapFormat === current, "Must pass exact fresh hardware format to tap")
        precondition(nodeOutput.sampleRate == 48000, "Model must retain pre-cue output until explicit install")
        if failure != "output-install" { nodeOutput = tapFormat }
        if failure == "output-zero" { nodeOutput = AVAudioFormat(standardFormatWithSampleRate: 0, channels: 1)! }
        events.append("install"); retained = pipe
        let early = AVAudioPCMBuffer(pcmFormat: current, frameCapacity: 2048)!
        early.frameLength = 2048
        pipe.enqueue(early) // no samples may publish before final startup validation
        if failure == "install" { throw HFTestCaptureAdapter(1)! }
        if failure == "route-install" { changed?() }
        if failure == "format-race" { current = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)! }
        if failure == "cancel" { startup.stop() }
    }, prepare: {
        events.append("prepare")
        if failure == "prepare" { throw HFTestCaptureAdapter(2)! }
        if failure == "route-prepare" { changed?() }
        if failure == "format-prepare" { current = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)! }
        if failure == "output-prepare" { nodeOutput = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)! }
    }, start: {
        events.append("start")
        if failure == "start" { throw HFTestCaptureAdapter(3)! }
        if failure == "route-start" { changed?() }
        if failure == "cancel-start" { startup.stop() }
        if failure == "format-start" { current = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)! }
        if failure == "output-start" { nodeOutput = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)! }
    }, stop: {
        events.append("stop")
        if failure == "stop" { throw HFTestCaptureAdapter(4)! }
    }, remove: {
        events.append("remove")
        if failure == "remove" { throw HFTestCaptureAdapter(5)! }
    })) { _, count in
        if count < 0 { failures += 1 } else { samples += Int(count) }
    }
    current = AVAudioFormat(standardFormatWithSampleRate: failure == "zero" ? 0 : 24000, channels: 1)!
    let success = ["none", "stop", "remove", "route-running", "format-running"].contains(failure)
    do {
        try startup.start()
        precondition(success && startup.started, "Unexpected start: \(failure)")
        let pcm = AVAudioPCMBuffer(pcmFormat: current, frameCapacity: 24000)!
        pcm.frameLength = 24000
        memset(pcm.floatChannelData![0], 0, 24000 * MemoryLayout<Float>.size)
        retained!.enqueue(pcm)
        if failure == "route-running" { changed?() }
        if failure == "format-running" {
            // A runtime packet changing format must fail, not rearm or rebuild.
            let different = AVAudioPCMBuffer(pcmFormat: AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!, frameCapacity: 2048)!
            different.frameLength = 2048
            retained!.enqueue(different); retained!.enqueue(pcm)
        }
    } catch { precondition(!success && !startup.started, "Unexpected failure: \(failure): \(error)") }
    let healthy = startup.stop()
    if ["format-race", "output-install", "output-zero", "output-exception"].contains(failure) { precondition(!events.contains("prepare")) }
    if ["format-prepare", "output-prepare"].contains(failure) { precondition(!events.contains("start")) }
    precondition(healthy == (failure == "none"))
    precondition(!startup.stop() && !startup.started)
    precondition(events.first == "observe" && events.filter { $0 == "unobserve" }.count == 1)
    if ["zero", "format-exception", "uid"].contains(failure) {
        precondition(!events.contains("install") && !events.contains("start"))
    } else {
        precondition(events.contains("stop") && events.contains("remove"), "Partial teardown: \(failure): \(events)")
    }
    if failure == "none" { precondition(abs(samples - 16000) <= 2 && failures == 0) }
    else if success { precondition(samples <= 16002 && failures == 1) }
    else { precondition(samples == 0 && failures == 0, "Bridge owns the one startup failure") }
    let before = samples
    let late = AVAudioPCMBuffer(pcmFormat: AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!, frameCapacity: 2048)!
    late.frameLength = 2048
    retained?.enqueue(late); retained?.drain()
    changed?()
    precondition(samples == before && !startup.started, "Late publish: \(failure)")
    do { try startup.start(); preconditionFailure("Retired startup revived") } catch {}
}
print("Capture startup exception, preaccept format, teardown and stale producer contracts passed without hardware")

// Exercise the actual session controller with fake device operations and a
// deterministic scheduler. Nothing here constructs an engine or plays audio.
final class SessionHarness {
    let condition = NSCondition()
    var events: [String] = []
    var timers: [(Double, () -> Void)] = []
    var completed: [() -> Void] = []
    var routeFailure: (() -> Void)?
    var failurePoint = ""
    var boundary: ((String) -> Void)?
    var accepted: (() -> Void)?
    func event(_ name: String) {
        condition.lock(); events.append(name); condition.broadcast(); condition.unlock()
        boundary?(name)
    }
    func count(_ name: String) -> Int {
        condition.lock(); defer { condition.unlock() }; return events.filter { $0 == name }.count
    }
    func wait(_ name: String) {
        condition.lock(); defer { condition.unlock() }
        let deadline = Date().addingTimeInterval(2)
        while !events.contains(name) { precondition(condition.wait(until: deadline), "Missing \(name): \(events)") }
    }
    func schedule(_ seconds: Double, _ callback: @escaping () -> Void) {
        condition.lock(); timers.append((seconds, callback)); condition.broadcast(); condition.unlock()
    }
    func fire(_ seconds: Double, before: () -> Void = {}) {
        condition.lock()
        let deadline = Date().addingTimeInterval(2)
        while !timers.contains(where: { $0.0 == seconds }) { precondition(condition.wait(until: deadline), "Missing timer \(seconds): \(events)") }
        let callbacks = timers.filter { $0.0 == seconds }.map { $0.1 }
        timers.removeAll { $0.0 == seconds }; condition.unlock()
        before(); callbacks.forEach { $0() }
    }
    func complete(_ index: Int = 0) {
        condition.lock(); let callback = completed[index]; condition.unlock(); callback()
    }
    func routeChanged() { condition.lock(); let callback = routeFailure; condition.unlock(); callback?() }
    func operations(_ routeFailure: @escaping () -> Void) throws -> AudioSession.Operations {
        condition.lock(); self.routeFailure = routeFailure; condition.unlock()
        event("factory")
        if failurePoint == "factory" { throw NSError(domain: "synthetic", code: 1) }
        return .init(prepare: {
            self.event("prepare")
            if self.failurePoint == "prepare" { throw NSError(domain: "synthetic", code: 1) }
        }, enable: {
            self.event("enable")
            if self.failurePoint == "enable" { throw NSError(domain: "synthetic", code: 1) }
            self.accepted?()
        }, close: { self.event("close") }, drain: { self.event("drain"); return self.failurePoint != "drain" },
        play: { ending, callback in
            self.condition.lock(); self.completed.append(callback); self.condition.unlock()
            self.event(ending ? "end" : "start")
            if self.failurePoint == (ending ? "end" : "start") { throw NSError(domain: "synthetic", code: 1) }
        }, stopCue: { self.event("stopCue") }, stop: { self.event("stop") },
        level: { -30 }, outputRate: { 24000 }, cancel: { self.event("revoke") })
    }
    func session(sounds: Bool = true, authorized: @escaping () -> Bool = { true }, epochAllowed: @escaping () -> Bool = { true }) -> AudioSession {
        let s = AudioSession(generation: 77, epoch: 8, sounds: sounds, authorized: authorized,
            epochAllowed: epochAllowed,
            failure: { self.event("failure") }, retired: { _ in self.event("retired") }, scheduler: schedule)
        accepted = { [weak s] in s?.acceptedPCM() }
        return s
    }
}

do {
    let h = SessionHarness(), s: AudioSession
    s = h.session(); s.start(factory: h.operations)
    h.wait("enable")
    precondition(h.count("start") == 0 && h.timers.allSatisfy { $0.0 == 3 })
    // finish() is an owner-queue barrier after enable has committed readiness.
    s.finish(); h.wait("end")
    precondition(!s.snapshot().audioReady && h.count("drain") == 1 && h.count("stop") == 0)
    s.finish()
    let stopped = DispatchSemaphore(value: 0)
    DispatchQueue.global().async { s.stop(); stopped.signal() }
    precondition(h.count("end") == 1 && h.count("stop") == 0)
    h.complete(); h.wait("retired")
    precondition(stopped.wait(timeout: .now() + 2) == .success)
    h.complete(); h.complete(); h.fire(3)
    precondition(h.count("stop") == 1 && h.count("failure") == 0)
}
for point in ["factory", "prepare", "enable"] {
    let h = SessionHarness(); h.failurePoint = point
    let s = h.session(); s.start(factory: h.operations)
    h.wait("failure"); precondition(!s.snapshot().audioReady && h.count("failure") == 1)
    h.routeFailure?(); s.cancel(); s.stop()
    precondition(h.count("failure") == 1 && h.count("end") == 0)
}
for boundary in ["factory", "prepare", "enable", "drain", "end"] {
    let h = SessionHarness(); let s = h.session()
    h.boundary = { if $0 == boundary { s.cancel() } }
    s.start(factory: h.operations)
    if ["drain", "end"].contains(boundary) { h.wait("enable"); s.finish() }
    h.wait("retired"); s.stop()
    precondition(!s.snapshot().audioReady && h.count("failure") == 0 && h.count("stop") == 1)
    if boundary != "end" { precondition(h.count("end") == 0) }
    if h.count("start") > 0 { h.complete() }
}
for endFailure in ["end", "timeout", "drain"] {
    let h = SessionHarness(); let s = h.session(); s.start(factory: h.operations)
    h.wait("enable")
    h.failurePoint = endFailure; s.finish()
    if endFailure == "timeout" { h.wait("end"); h.fire(3) }
    h.wait("retired")
    precondition(h.count("failure") == (endFailure == "drain" ? 1 : 0) && h.count("drain") == 1 && !s.isRecording)
}
do {
    let h = SessionHarness(); let s = h.session(sounds: false); s.start(factory: h.operations)
    h.wait("enable"); s.finish(); h.wait("retired")
    precondition(h.count("start") == 0 && h.count("end") == 0)
    precondition(h.timers.count == 2 && h.timers.allSatisfy { $0.0 == 3 }, "Muted sessions transfer hardware to handoff watchdog, with no cue/tail timer")
    let denied = SessionHarness(); let d = denied.session(authorized: { false }); d.start(factory: denied.operations)
    denied.wait("retired"); precondition(denied.count("factory") == 0)
}
do {
    let format = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!
    var pipeline: CapturePipeline!, samples = 0
    let startup = CaptureStartup(operations: .init(observe: { _ in {} }, validate: {}, format: { format },
        outputFormat: { format }, install: { _, p in pipeline = p }, prepare: {}, start: {}, stop: {}, remove: {})) { _, n in
        precondition(n >= 0); samples += Int(n)
    }
    let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 24000)!
    pcm.frameLength = 24000; memset(pcm.floatChannelData![0], 0, 24000 * 4)
    try startup.start(acceptAudio: false)
    pipeline.enqueue(pcm); precondition(samples == 0)
    try startup.enable(); pipeline.enqueue(pcm)
    precondition(startup.closeAndDrain() && abs(samples - 16000) <= 2)
    let before = samples; pipeline.enqueue(pcm); precondition(!startup.closeAndDrain())
    precondition(startup.stop() && samples == before)
}
print("Session cue completion/deadline, cancellation boundaries, muted start, nonfatal end and gated PCM passed without hardware")

do {
    let h = SessionHarness(), release = DispatchSemaphore(value: 0)
    h.boundary = { if $0 == "prepare" { release.wait() } }
    let s = h.session(); s.start(factory: h.operations); h.wait("prepare")
    h.fire(3); h.wait("failure")
    precondition(!s.isRecording && h.count("revoke") == 1)
    release.signal(); h.wait("retired")
    precondition(h.count("start") == 0 && h.count("enable") == 0 && h.count("failure") == 1)
}
for boundary in ["listening", "drain", "end"] {
    let h = SessionHarness(), s: AudioSession
    s = h.session(); s.start(factory: h.operations); h.wait("enable")
    if boundary == "drain" { h.boundary = { if $0 == "drain" { h.routeChanged() } }; s.finish() }
    else if boundary == "end" { s.finish(); h.wait("end"); h.routeChanged() }
    else { h.routeChanged() }
    h.wait("retired"); s.stop()
    precondition(h.count("failure") == (boundary == "end" ? 0 : 1), "Wrong route failure disposition: \(boundary)")
    precondition(!s.isRecording && h.count("stop") == 1)
}
for profile in ["clean", "warm"] {
    for ending in [false, true] {
        let role = ending ? "end" : "start"
        let data = try Data(contentsOf: URL(fileURLWithPath: "src-tauri/native/assets/sounds/\(profile)-\(role).wav"))
        let pcm = try SessionCuePCM.decode(data)
        precondition(pcm.format.sampleRate == 48000 && pcm.format.channelCount == 1)
        precondition(pcm.frameLength == (ending ? 11520 : 5760))
        precondition(pcm.floatChannelData![0][0] == 0)
        var malformed = data; malformed[20] = 3
        do { _ = try SessionCuePCM.decode(malformed); preconditionFailure("Non-PCM asset accepted") } catch {}
    }
}
for malformed in [Data(), Data(repeating: 0, count: 44)] {
    do { _ = try SessionCuePCM.decode(malformed); preconditionFailure("Malformed cue accepted") } catch {}
}
print("Independent startup deadline, route/drain error once-only disposition and production asset decoding passed without hardware")

func awaitReady(_ session: AudioSession) {
    let deadline = Date().addingTimeInterval(2)
    while !session.isRecording && Date() < deadline { usleep(1000) }
    precondition(session.isRecording)
}

// Virtual time drives the real controller's independent timers, not an alternate
// model of its state. Timer callbacks can be replayed to simulate stale dispatch.
final class SessionClock {
    private let condition = NSCondition()
    private var now: Double = 0
    private var timers: [(Double, () -> Void)] = []
    private var fired: Set<Int> = []
    func schedule(_ seconds: Double, _ callback: @escaping () -> Void) {
        condition.lock(); timers.append((now + seconds, callback)); condition.broadcast(); condition.unlock()
    }
    func waitCount(_ count: Int) {
        condition.lock(); defer { condition.unlock() }
        let deadline = Date().addingTimeInterval(2)
        while timers.count < count { precondition(condition.wait(until: deadline)) }
        precondition(timers.count == count, "Unexpected extra timer/rearm")
    }
    func advance(_ time: Double) {
        condition.lock(); precondition(time >= now); now = time
        let due = timers.indices.filter { !fired.contains($0) && timers[$0].0 <= time }
        due.forEach { fired.insert($0) }
        let callbacks = due.map { timers[$0].1 }; condition.unlock()
        callbacks.forEach { $0() }
    }
    func replay(_ index: Int) {
        condition.lock(); let callback = timers[index].1; condition.unlock(); callback()
    }
}
func clockSession(_ h: SessionHarness, _ clock: SessionClock, sounds: Bool = true,
                  epochAllowed: @escaping () -> Bool = { true }) -> AudioSession {
    AudioSession(generation: 77, epoch: 8, sounds: sounds, authorized: { true }, epochAllowed: epochAllowed,
        failure: { h.event("failure") }, retired: { _ in h.event("retired") }, scheduler: clock.schedule)
}
do {
    let h = SessionHarness(), clock = SessionClock()
    let s = clockSession(h, clock)
    h.boundary = { if $0 == "prepare" { clock.advance(2.633) } }
    s.start(factory: h.operations); awaitReady(s); clock.waitCount(2)
    precondition(h.count("start") == 0)
    clock.advance(3.038)
    precondition(h.count("failure") == 0 && h.count("enable") == 1)
    clock.replay(0); clock.replay(1); clock.advance(9)
    precondition(s.isRecording && h.count("failure") == 0)
    s.cancel(); s.stop()
}
do {
    let h = SessionHarness(), clock = SessionClock(), s: AudioSession
    s = clockSession(h, clock)
    h.boundary = { if $0 == "prepare" { clock.advance(2.6) } }
    s.start(factory: h.operations); awaitReady(s); clock.waitCount(2)
    clock.advance(3.048); clock.replay(0)
    precondition(s.isRecording && h.count("failure") == 0, "Retired deadlines cannot kill listening")
    s.cancel(); s.stop()
}
for completeNearDeadline in [false, true] {
    let h = SessionHarness(), clock = SessionClock(), s: AudioSession
    s = clockSession(h, clock)
    let release = DispatchSemaphore(value: 0)
    h.boundary = { if $0 == "enable" { release.wait() } }
    s.start(factory: h.operations); h.wait("enable"); clock.waitCount(2)
    if completeNearDeadline { clock.advance(2.9); clock.replay(0) }
    clock.advance(3); h.wait("failure"); release.signal(); h.wait("retired"); s.stop()
    precondition(s.snapshot().failureStage == "cue_handoff_timeout" && !s.isRecording)
    clock.advance(9)
    precondition(!s.isRecording && h.count("failure") == 1, "Cue completion/tail cannot extend or revive expired handoff")
}
for blocked in ["factory", "prepare", "enable", "muted-enable"] {
    let h = SessionHarness(), clock = SessionClock(), release = DispatchSemaphore(value: 0)
    let point = blocked == "muted-enable" ? "enable" : blocked
    h.boundary = { if $0 == point { release.wait() } }
    let s = clockSession(h, clock, sounds: blocked != "muted-enable")
    s.start(factory: h.operations)
    h.wait(point)
    clock.advance(3); h.wait("failure")
    let hardware = ["factory", "prepare"].contains(blocked)
    precondition(s.snapshot().failureStage == (hardware ? "hardware_startup_timeout" : "cue_handoff_timeout"))
    precondition(!s.isRecording && h.count("retired") == 0, "Deadline reports independently of blocked owner, but cannot fake retirement")
    clock.replay(0)
    if !hardware { clock.replay(1) }
    // A later callback cannot overwrite the first deadline's diagnostic bytes.
    s.configurationFailure("late_configuration")
    precondition(s.snapshot().failureDomain == "Audio startup deadline" && s.snapshot().failureCode == 1)
    precondition(s.snapshot().failureStage == (hardware ? "hardware_startup_timeout" : "cue_handoff_timeout"))
    release.signal(); h.wait("retired"); s.stop()
    if h.count("start") > 0 { h.complete() }
    clock.advance(9)
    precondition(!s.isRecording && h.count("failure") == 1 && h.count("retired") == 1)
}
for boundary in ["prepare", "enable"] {
    let h = SessionHarness(), clock = SessionClock()
    let s = clockSession(h, clock)
    h.boundary = { if $0 == boundary { s.cancel(); clock.replay(0) } }
    s.start(factory: h.operations)
    h.wait("retired"); s.stop(); clock.advance(9)
    precondition(!s.isRecording && h.count("failure") == 0)
}
do {
    let h = SessionHarness(), clock = SessionClock(), gate = NSLock()
    var live = true
    let s = clockSession(h, clock, epochAllowed: { gate.lock(); defer { gate.unlock() }; return live })
    let release = DispatchSemaphore(value: 0)
    h.boundary = { if $0 == "enable" { release.wait() } }
    s.start(factory: h.operations); h.wait("enable"); clock.waitCount(2)
    gate.lock(); live = false; gate.unlock()
    clock.advance(3); release.signal(); h.wait("retired"); s.stop()
    precondition(!s.isRecording && h.count("failure") == 0)
}
print("Production phase deadline transfer: virtual 2.633s hardware with immediate capture, stale timers, blocked factory/enable, muted handoff and cancellation/epoch gates passed without hardware")
for revoked in [false, true] {
    let h = SessionHarness(), gate = NSLock()
    var authorized = true, epochLive = true
    let s = h.session(sounds: false,
        authorized: { gate.lock(); defer { gate.unlock() }; return authorized },
        epochAllowed: { gate.lock(); defer { gate.unlock() }; return epochLive })
    s.start(factory: h.operations); awaitReady(s)
    // Physical release closes startup authorization before Finish reaches FIFO.
    gate.lock(); authorized = false; epochLive = !revoked; gate.unlock()
    h.routeChanged(); s.finish(); s.stop()
    precondition(h.count("failure") == (revoked ? 0 : 1))
    precondition(h.count("retired") == 1)
}
for operation in ["finish", "stop", "cancel"] {
    let h = SessionHarness(), release = DispatchSemaphore(value: 0), done = DispatchSemaphore(value: 0)
    h.boundary = { if $0 == "prepare" { release.wait() } }
    let s = h.session(); s.start(factory: h.operations); h.wait("prepare")
    DispatchQueue.global().async {
        if operation == "finish" { s.finish() }
        else if operation == "cancel" { s.cancel() }
        s.stop(); done.signal()
    }
    // The AppKit/runloop caller never owns the hardware wait.
    var mainRan = false
    DispatchQueue.main.async { mainRan = true }
    let deadline = Date().addingTimeInterval(1)
    while !mainRan && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.001)) }
    precondition(mainRan && h.count("retired") == 0)
    precondition(s.level() == -60)
    s.cancel(); precondition(!s.isRecording && h.count("revoke") >= 1)
    release.signal()
    precondition(done.wait(timeout: .now() + 2) == .success)
    precondition(h.count("enable") == 0 && h.count("start") == 0)
}
for cancel in [false, true] {
    let h = SessionHarness(), next = SessionHarness(), done = DispatchSemaphore(value: 0)
    let s = h.session(); s.start(factory: h.operations)
    awaitReady(s)
    s.finish(); h.wait("end")
    let fifo = DispatchQueue(label: "synthetic.control.fifo")
    let n = next.session(sounds: false)
    fifo.async { s.stop(); n.start(factory: next.operations); done.signal() }
    precondition(done.wait(timeout: .now() + 0.05) == .timedOut)
    precondition(next.count("factory") == 0 && h.count("retired") == 0)
    if cancel { s.cancel() } else { h.fire(3) }
    precondition(done.wait(timeout: .now() + 2) == .success)
    h.complete() // stale completion cannot rearm/retire the next owner
    next.wait("enable"); n.cancel(); n.stop()
    precondition(h.count("retired") == 1 && h.count("end") == 1 && h.count("enable") == 1)
}
print("Release/epoch failure facts, responsive main during blocked teardown and FIFO retirement admission passed without hardware")

// Exercise the same concrete partial-resource owner used by Bridge. Model the
// selected input AU as input-only (zero output channels); the independent system
// output is 2ch/48k. Neither graph may monitor input or force a device/rate.
for point in ["input_prepare", "input_start", "output_create", "output_prepare", "output_start", "output_route", "end_route", "none", "muted"] {
    let h = SessionHarness()
    let muted = point == "muted"
    let s = h.session(sounds: !muted)
    let pcm = AVAudioPCMBuffer(pcmFormat: AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!, frameCapacity: 1)!
    pcm.frameLength = 1
    s.start { changed in
        var input = try h.operations(changed)
        input.prepare = {
            h.event("input_prepare")
            if point == "input_prepare" { throw AudioStageFailure("input_prepare", NSError(domain: "synthetic", code: -10875)) }
            h.event("input_start")
            if point == "input_start" { throw AudioStageFailure("input_start", NSError(domain: "synthetic", code: 7)) }
        }
        input.formats = { ["inputRate": 24000, "inputChannels": 1] }
        let output: (() throws -> SessionAudioOwner.Output)? = muted ? nil : {
            h.event("output_create")
            if point == "output_create" {
                // Like the real constructor's defer: no resource escapes a
                // throwing factory without cleaning up its partial allocation.
                h.event("output_stop")
                throw NSError(domain: "synthetic", code: 8)
            }
            return .init(prepare: {
                h.event("output_prepare")
                if point == "output_prepare" { throw NSError(domain: "synthetic", code: -10875) }
                h.event("output_start")
                if point == "output_start" { throw AudioStageFailure("output_start", NSError(domain: "synthetic", code: 9)) }
                if point == "output_route" { changed() }
            }, play: { _, _, completed in
                h.condition.lock(); h.completed.append(completed); h.condition.unlock()
                h.event("end")
            }, stopCue: { h.event("output_stopCue") }, stop: { h.event("output_stop") },
            formats: { ["outputRate": 48000, "outputChannels": 2, "cueRate": 48000] })
        }
        return SessionAudioOwner(input: input, makeOutput: output, cue: { _ in pcm }).operations()
    }
    if !point.hasPrefix("input_") {
        awaitReady(s)
        let ready = s.snapshot()
        precondition(ready.formats["inputChannels"] == 1)
        precondition(ready.formats["outputChannels"] == nil && h.count("output_create") == 0,
                     "Audible startup must not construct, prepare or start output")
        s.finish()
        if ["none", "end_route"].contains(point) {
            h.wait("end")
            if point == "end_route" { h.routeChanged() } else { h.complete() }
        }
    }
    h.wait("retired"); s.stop()
    precondition(h.count("stop") == 1, "Input resource must retire: \(point)")
    let madeOutput = !muted && !point.hasPrefix("input_")
    precondition(h.count("output_stop") == (madeOutput ? 1 : 0), "Output must retire independently: \(point)")
    precondition(h.count("failure") == (point.hasPrefix("input_") ? 1 : 0))
    precondition(h.count("enable") == (point.hasPrefix("input_") ? 0 : 1))
    if point != "none" && point != "muted" && point != "output_route" && point != "end_route" {
        precondition(s.snapshot().failureStage == point)
        precondition(s.snapshot().failureDomain == "synthetic")
    }
    if point == "output_prepare" {
        precondition(s.snapshot().failureCode == -10875)
        precondition(s.snapshot().formats["inputRate"] == 24000)
    }
    if muted { precondition(h.count("output_create") == 0 && h.count("start") == 0) }
}
let boundedError = AudioStageFailure("input_prepare", NSError(domain: String(repeating: "x", count: 200), code: -10875,
    userInfo: [NSLocalizedDescriptionKey: "private-device-UID"]))
precondition(boundedError.domain.count == 64 && boundedError.code == -10875)
precondition(AudioStageFailure("output_prepare", exception).exceptionName == "NSException")
print("Production split-engine owner partial starts, input-only topology, muted allocation, output route disposition and bounded first diagnostics passed without hardware")

// Exercise the SAME production preparation controller/factory, real converter,
// split owner and AudioSession watchdog; no AVAudioEngine or device is created.
final class NegotiationHarness {
    let session = SessionHarness()
    let mode: String
    var preparation: CapturePreparation!
    var made = 0, installs = [Double](), starts = 0, samples = 0
    var hardware = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    var output: AVAudioFormat
    var callbacks = [() -> Void]()
    var pipes = [CapturePipeline]()
    var allowed = true
    init(_ mode: String) {
        self.mode = mode; output = hardware
        preparation = CapturePreparation { [unowned self] in self.make() }
    }
    func packet(_ pipe: CapturePipeline, _ format: AVAudioFormat) {
        let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2048)!
        pcm.frameLength = 2048
        memset(pcm.floatChannelData![0], 0, 2048 * MemoryLayout<Float>.size)
        pipe.enqueue(pcm)
    }
    func make() -> CaptureStartup {
        made += 1; let attempt = made
        var validations = 0, outputReads = 0
        func configurationChange() {
            self.hardware = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!
            self.callbacks.last?()
            if self.mode == "cancel-start-change" { self.preparation.revoke() }
        }
        if attempt == 2 {
            precondition(session.count("unobserve1") == 1 && session.count("remove1") == 1)
            if mode == "cancel-replacement" { preparation.revoke() }
            callbacks.first?() // in-flight old notification must not touch the replacement
        }
        return CaptureStartup(operations: .init(observe: { callback in
            self.callbacks.append(callback)
            return { self.session.event("unobserve\(attempt)") }
        }, validate: {
            validations += 1
            try MicrophoneBinding.revalidate(expected: 42, resolve: {
                if self.mode == "uid-missing" && attempt == 2 { throw NSError(domain: "Missing selected input", code: 1) }
                return self.mode == "uid-changed" && attempt == 2 ? 43 : 42
            })
            if attempt == 1 && validations == 2 && self.mode == "config-poststart" { configurationChange() }
        }, format: { self.hardware }, outputFormat: {
            outputReads += 1
            let result = self.output
            // Deliver after the final format snapshot, immediately before commit.
            if attempt == 1 && outputReads == 3 && self.mode == "config-commit" { configurationChange() }
            return result
        }, install: { fresh, pipe in
            precondition(fresh === self.hardware)
            precondition(HFTestCaptureExplicitFormat(fresh, self.output))
            self.output = fresh; self.installs.append(fresh.sampleRate); self.pipes.append(pipe)
            self.packet(pipe, fresh)
            if attempt == 1 && self.mode == "config-install" { configurationChange() }
        }, prepare: {
            self.packet(self.pipes.last!, self.hardware)
            if attempt == 1 {
                if ["config-install", "config-start", "config-poststart", "config-commit", "cancel-start-change", "generic-start", "generic-start-with-change"].contains(self.mode) { return }
                if self.mode == "generic" { throw NSError(domain: "generic", code: 9) }
                if self.mode == "exception" { throw HFTestCaptureAdapter(2)! }
                self.hardware = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!
                self.callbacks.last?()
                if self.mode == "generic-with-change" { throw NSError(domain: "generic", code: 9) }
                if self.mode == "cancel-first" { self.preparation.revoke() }
                if self.mode == "deadline-first" { self.session.fire(3) }
            } else {
                self.session.condition.lock()
                precondition(self.session.timers.count == 1 && self.session.timers[0].0 == 3,
                             "Negotiation must retain the original watchdog, never rearm it")
                self.session.condition.unlock()
                if self.mode == "second-config" { self.callbacks.last?() }
                if self.mode == "deadline-second" { self.session.fire(3) }
            }
        }, start: {
            self.starts += 1
            if attempt == 1 {
                if ["config-start", "cancel-start-change", "generic-start-with-change"].contains(self.mode) { configurationChange() }
                if ["generic-start", "generic-start-with-change"].contains(self.mode) {
                    throw NSError(domain: "generic", code: 9)
                }
            }
        }, stop: {
            self.session.event("stop\(attempt)")
            if self.mode == "cleanup-stop" && attempt == 1 { throw HFTestCaptureAdapter(4)! }
        }, remove: {
            self.session.event("remove\(attempt)")
            if self.mode == "cleanup-remove" && attempt == 1 { throw HFTestCaptureAdapter(5)! }
            if self.mode == "cancel-cleanup" && attempt == 1 { self.preparation.revoke() }
            if self.mode == "gate-cleanup" && attempt == 1 { self.allowed = false }
        })) { _, count in
            if count > 0 { self.samples += Int(count) }
        }
    }
    func operations(_ failure: @escaping () -> Void) -> AudioSession.Operations {
        preparation.routeFailed = failure
        let input = AudioSession.Operations(prepare: { try self.preparation.prepare(allowed: { self.allowed }) },
            enable: { try self.preparation.current.enable(); self.session.event("enabled") },
            close: { self.preparation.current.closeAcceptance() }, drain: { self.preparation.current.closeAndDrain() },
            play: { _, _ in }, stopCue: {}, stop: { self.preparation.revoke(); self.preparation.current.stop() },
            level: { -60 }, outputRate: { 0 }, cancel: { self.preparation.revoke() }, formats: {
                ["inputRate": self.preparation.current.inputFormat?.sampleRate ?? 0,
                 "initial_config_change": self.preparation.initialConfigChange ? 1 : 0,
                 "initialInputRate": self.preparation.initialRate,
                  "negotiationAttempts": Double(self.preparation.attempts)]
            }, validatePrepared: { try self.preparation.current.validatePrepared() })
        return SessionAudioOwner(input: input, makeOutput: {
            precondition(self.preparation.current.started)
            self.session.event("output")
            return .init(prepare: {}, play: { _, _, done in
                self.session.condition.lock(); self.session.completed.append(done); self.session.condition.unlock()
                self.session.event("cue")
            }, stopCue: {}, stop: {}, formats: { ["outputRate": 24000] })
        }, cue: { _ in AVAudioPCMBuffer(pcmFormat: self.hardware, frameCapacity: 2048)! }).operations()
    }
}
for mode in ["config-start", "config-install", "config-poststart", "config-commit", "cancel-start-change", "generic-start", "generic-start-with-change", "success", "cue-route", "listening-route", "uid-missing", "uid-changed", "cancel-first", "cancel-cleanup", "cancel-replacement", "gate-cleanup", "cleanup-stop", "cleanup-remove", "generic", "exception", "generic-with-change", "second-config", "deadline-first", "deadline-second"] {
    let h = NegotiationHarness(mode), s = h.session.session()
    s.start(factory: h.operations)
    let success = mode == "success" || mode.hasPrefix("config-")
    let prepared = success || ["cue-route", "listening-route"].contains(mode)
    if prepared {
        h.session.wait("enabled"); awaitReady(s)
        precondition(h.samples == 0 && h.session.count("output") == 0)
        precondition(h.starts == (["config-start", "config-poststart", "config-commit"].contains(mode) ? 2 : 1), mode)
        precondition(h.installs == [48000, 24000] && h.preparation.attempts == 2)
        precondition(h.session.count("failure") == 0)
        // Retired callbacks and producers cannot fail/accept for the live attempt.
        h.callbacks[0](); h.packet(h.pipes[0], h.hardware)
        precondition(h.session.count("failure") == 0)
        if mode == "cue-route" {
            h.hardware = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
            h.callbacks[1]()
        }
        else {
            if mode == "listening-route" { h.callbacks[1]() }
            else {
                h.packet(h.pipes[1], h.hardware)
                precondition(h.preparation.current.closeAndDrain() && h.samples > 0,
                             "The fresh converter must accept PCM only after cue handoff")
                s.cancel()
            }
        }
    }
    h.session.wait("retired"); s.stop()
    precondition(success ? h.samples > 0 : h.samples == 0)
    let expectedFailures = success ? 0 : 1
    precondition(h.session.count("failure") == expectedFailures, mode)
    precondition(h.session.count("output") == 0, mode)
    if ["uid-missing", "uid-changed", "second-config", "deadline-second"].contains(mode) {
        precondition(h.preparation.attempts == 2, mode)
        precondition(s.snapshot().formats["initial_config_change"] == 1, mode)
        precondition(s.snapshot().formats["initialInputRate"] == 48000, mode)
    } else if !prepared { precondition(h.preparation.attempts == 1, mode) }
    precondition(h.made <= 2)
    if ["generic-start", "generic-start-with-change"].contains(mode) {
        precondition(s.snapshot().failureStage == "input_start" && s.snapshot().failureDomain == "generic")
        precondition(s.snapshot().failureCode == 9 && h.made == 1)
    }
    if mode == "cancel-start-change" { precondition(h.made == 1 && h.preparation.attempts == 1) }
}
print("Production preaccept negotiation: fresh 48-to-24k converter/tap, same UID, stale callbacks, cleanup/cancel/gate failures and one hardware 3s watchdog passed without hardware")

// Running input remains closed until atomic read-only validation. Completion
// output notifications occur only after drain and cannot poison final PCM.
precondition(HFTestCaptureRunningBoundary())
for mode in ["benign", "cue-notice", "cue-format", "format", "node-format", "uid", "stopped", "validation-notice", "commit-notice", "cancel", "timeout", "cancel-commit", "timeout-commit", "runtime", "pipeline", "output"] {
    let h = SessionHarness(), s = h.session()
    let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
    let changedFormat = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 44100)!
    pcm.frameLength = 44100; memset(pcm.floatChannelData![0], 0, 44100 * 4)
    var changed: (() -> Void)!, stale: (() -> Void)!, pipeline: CapturePipeline!
    var hardware = format, node = format, uid = AudioDeviceID(42), running = true
    var validating = false, samples = 0, starts = 0
    var pipelineFailure: (() -> Void)?
    var startup: CaptureStartup!
    startup = CaptureStartup(operations: .init(observe: { callback in
        changed = callback; stale = callback; return { changed = nil }
    }, validate: {
        try MicrophoneBinding.revalidate(expected: 42, resolve: { uid })
        if validating {
            if mode == "cancel" { s.cancel() }
            if mode == "timeout" { h.fire(3) }
            if mode == "validation-notice" { changed() }
        }
    }, format: { hardware }, outputFormat: { node }, install: { _, p in pipeline = p },
    prepare: {}, start: { starts += 1 }, stop: {}, remove: {}, running: {
        if validating {
            if mode == "cancel-commit" { s.cancel() }
            if mode == "timeout-commit" { h.fire(3) }
            if mode == "commit-notice" { changed() }
        }
        return running
    })) { _, count in
        if count > 0 { samples += Int(count); s.acceptedPCM() }
        if count < 0 { pipelineFailure?() }
    }
    startup.routeFailed = { s.configurationFailure("input_configuration") }
    s.start { failed in
        pipelineFailure = failed
        let input = AudioSession.Operations(prepare: { try startup.start(acceptAudio: false, negotiate: true) }, enable: {
            try startup.enable(); pipeline.enqueue(pcm); h.event("enabled")
        }, close: { startup.closeAcceptance() }, drain: { startup.closeAndDrain() }, play: { _, _ in },
        stopCue: {}, stop: { startup.stop() }, level: { -60 }, outputRate: { 0 },
        cancel: { startup.revoke() }, formats: { ["inputRate": format.sampleRate] },
        validatePrepared: {
            changed() // unchanged preaccept configuration revision is valid
            if mode == "format" { hardware = changedFormat }
            if mode == "node-format" { node = changedFormat }
            if mode == "uid" { uid = 43 }
            if mode == "stopped" { running = false }
            validating = true; defer { validating = false }; try startup.validatePrepared()
        })
        return SessionAudioOwner(input: input, makeOutput: {
            .init(prepare: {
                precondition(startup.started && samples > 0)
                pipeline.enqueue(pcm) // must remain discarded
                if mode == "output" { s.configurationFailure("output_configuration") }
            }, play: { _, _, completion in
                if mode == "cue-notice" { changed() }
                if mode == "cue-format" { hardware = changedFormat; changed() }
                h.condition.lock(); h.completed.append(completion); h.condition.unlock(); h.event("cue")
            }, stopCue: {}, stop: {}, formats: { ["outputRate": 44100] })
        }, cue: { _ in pcm }).operations()
    }
    if ["benign", "cue-notice", "cue-format", "output", "runtime", "pipeline"].contains(mode) {
        h.wait("enabled"); awaitReady(s)
        precondition(h.count("cue") == 0)
        if mode == "runtime" { changed(); h.wait("retired") }
        else if mode == "pipeline" {
            let bad = AVAudioPCMBuffer(pcmFormat: changedFormat, frameCapacity: 1)!
            bad.frameLength = 1; pipeline.enqueue(bad); h.wait("retired")
        }
        else {
            s.finish()
            if mode != "output" { h.wait("cue"); h.complete() }
            h.wait("retired")
        }
        s.stop()
        precondition(samples > 0 && h.count("failure") == (["runtime", "pipeline"].contains(mode) ? 1 : 0))
        if mode == "runtime" { precondition(s.snapshot().failureStage == "input_configuration") }
        if mode == "pipeline" { precondition(s.snapshot().failureStage == "capture_pipeline") }
    } else {
        h.wait("retired"); s.stop()
        precondition(samples == 0 && h.count("cue") == 0)
        precondition(h.count("failure") == (mode.hasPrefix("cancel") ? 0 : 1))
        if !mode.hasPrefix("cancel") && !mode.hasPrefix("timeout") {
            precondition(s.snapshot().failureStage == "input_configuration")
            precondition(s.snapshot().formats["inputRate"] == 44100 && s.snapshot().outputRate == 0)
        }
    }
    let failures = h.count("failure"); stale(); precondition(h.count("failure") == failures && starts == 1)
}
print("Production input-only preaccept validation: benign notification, UID/formats/running failures, atomic revision, cancellation/timeout tombstones and strict runtime failure passed without hardware")

// Deferred work cannot block EOS, manufacture retirement or revive cancelled
// playback. Include the final production validation-to-play authorization boundary.
for blocked in ["decode", "output_prepare", "play_validate"] {
    for disposition in ["cancel", "timeout"] {
        let h = SessionHarness(), release = DispatchSemaphore(value: 0), done = DispatchSemaphore(value: 0)
        let s = h.session()
        let pcm = AVAudioPCMBuffer(pcmFormat: AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!, frameCapacity: 1)!
        s.start { failed in
            let input = try h.operations(failed)
            return SessionAudioOwner(input: input, makeOutput: {
                precondition(h.count("close") > 0 && h.count("drain") > 0)
                h.event("decode")
                if blocked == "decode" { release.wait() }
                return .init(prepare: {
                    h.event("output_prepare")
                    if blocked == "output_prepare" { release.wait() }
                }, play: { _, allowed, _ in
                    try SessionCueOutput.playIfAllowed(validate: {
                        h.event("play_validate")
                        if blocked == "play_validate" { release.wait() }
                    }, allowed: allowed, play: { h.event("unexpected_play") })
                }, stopCue: {}, stop: { h.event("output_stop") }, formats: { [:] })
            }, cue: { _ in pcm }).operations()
        }
        awaitReady(s)
        precondition(h.count("decode") == 0 && h.count("output_prepare") == 0)
        s.finish(); h.wait(blocked) // Finish/EOS returned despite blocked output.
        DispatchQueue.global().async { s.stop(); done.signal() }
        if disposition == "cancel" { s.cancel() } else { h.fire(3) }
        precondition(done.wait(timeout: .now() + 0.02) == .timedOut && h.count("retired") == 0)
        release.signal()
        precondition(done.wait(timeout: .now() + 2) == .success)
        precondition(h.count("unexpected_play") == 0 && h.count("failure") == 0 && h.count("output_stop") == 1)
    }
}
for suppression in ["no_pcm", "cancel", "drain_failure", "missing_asset"] {
    let h = SessionHarness(), s = h.session()
    if suppression == "no_pcm" { h.accepted = nil }
    if suppression == "drain_failure" { h.failurePoint = "drain" }
    s.start { failed in
        SessionAudioOwner(input: try h.operations(failed), makeOutput: {
            h.event("completion_load")
            throw NSError(domain: "Missing completion asset", code: 1)
        }, cue: { _ in nil }).operations()
    }
    awaitReady(s)
    precondition(h.count("completion_load") == 0)
    if suppression == "cancel" { s.cancel() } else { s.finish() }
    h.wait("retired"); s.stop()
    precondition(h.count("completion_load") == (suppression == "missing_asset" ? 1 : 0))
    precondition(h.count("failure") == (suppression == "drain_failure" ? 1 : 0))
}
print("Capture-first deferred completion: no startup cue work/tail, EOS before blocked output, cancel/deadline retirement barriers and no-PCM/missing-asset disposition passed without hardware")
for frozen in ["admitted-output", ""] {
    for live in ["admitted-output", "replacement-output", "missing"] {
        var reads = 0
        do {
            try SessionCueOutput.validateIdentity(frozen) {
                reads += 1
                if live == "missing" { throw NSError(domain: "Output unavailable", code: 1) }
                return live
            }
            precondition(frozen == live && !frozen.isEmpty)
        } catch { precondition(frozen != live || live == "missing" || frozen.isEmpty) }
        precondition(reads == (frozen.isEmpty ? 0 : 1), "Never reselect/fall back to a new output")
    }
}
