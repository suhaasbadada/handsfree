import Foundation
import AVFoundation

// Synthetic PCM only. Do not instantiate AVAudioEngine or request microphone.
for rate in [16000.0, 24000.0, 44100.0, 48000.0] {
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
precondition(exception.localizedDescription == "Failed to create tap due to format mismatch")
precondition(HFCaptureBoundary({}) == nil)
for operation in 0..<6 {
    precondition(HFTestCaptureAdapter(Int32(operation))?.localizedDescription == exception.localizedDescription)
}

for failure in ["none", "zero", "format-exception", "uid", "install", "prepare", "start", "format-race", "format-start", "route-install", "route-prepare", "route-start", "route-running", "cancel", "cancel-start", "stop", "remove"] {
    var events = [String]()
    var changed: (() -> Void)?
    var retained: CapturePipeline?
    var samples = 0, failures = 0
    // Recorder was created before playback at 48kHz. The cue switches the
    // hardware to 24kHz; production must not retain that pre-cue converter.
    var current = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
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
    }, install: { pipe in
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
    }, start: {
        events.append("start")
        if failure == "start" { throw HFTestCaptureAdapter(3)! }
        if failure == "route-start" { changed?() }
        if failure == "cancel-start" { startup.stop() }
        if failure == "format-start" { current = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)! }
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
    let success = ["none", "stop", "remove", "route-running"].contains(failure)
    do {
        try startup.start()
        precondition(success && startup.started, "Unexpected start: \(failure)")
        let pcm = AVAudioPCMBuffer(pcmFormat: current, frameCapacity: 24000)!
        pcm.frameLength = 24000
        memset(pcm.floatChannelData![0], 0, 24000 * MemoryLayout<Float>.size)
        retained!.enqueue(pcm)
        if failure == "route-running" { changed?() }
    } catch { precondition(!success && !startup.started, "Unexpected failure: \(failure): \(error)") }
    let healthy = startup.stop()
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
print("Capture startup exception, post-cue format, teardown and stale producer contracts passed without hardware")
