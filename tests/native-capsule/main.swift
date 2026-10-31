import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let points = CapsuleGeometry.checkmark(in: NSRect(x: 0, y: 0, width: 34, height: 34))
precondition(points[0].x < points[1].x && points[1].x < points[2].x)
precondition(points[1].y > points[0].y && points[1].y > points[2].y, "Check vertex must point down in flipped coordinates")
precondition(points[2].y < points[0].y, "Check must have a longer rising right arm")
do {
    let samples = StartCue.samples
    precondition(samples.count == Int(StartCue.duration * Double(StartCue.rate)))
    precondition(StartCue.duration == 0.085)
    precondition(samples == StartCue.samples, "Deterministic noise, no random playback variation")
    for legacyStyle: Int32 in [0, 1] {
        soundStyle(legacyStyle)
        precondition(samples == StartCue.samples, "Both legacy styles normalize to one cue")
    }
    precondition(samples.first == 0 && samples.last == 0)
    let peak = samples.map { abs(Int($0)) }.max()!
    precondition(peak > 14000 && peak < 18000, "Clear click with over 5 dB full-volume headroom")
    let steps = zip(samples, samples.dropFirst()).map { abs(Int($0) - Int($1)) }
    precondition(steps.max()! < 9000, "Filtered transient, not an unbounded one-sample spike")
    func rms(_ from: Double, _ to: Double) -> Double {
        let window = samples[Int(from * Double(StartCue.rate))..<Int(to * Double(StartCue.rate))]
        return sqrt(window.reduce(0) { $0 + pow(Double($1) / 32768, 2) } / Double(window.count))
    }
    let level = rms(0, StartCue.duration)
    func magnitude(_ frequency: Double, _ from: Double, _ to: Double) -> Double {
        let start = Int(from * Double(StartCue.rate))
        let end = Int(to * Double(StartCue.rate))
        var real = 0.0, imaginary = 0.0
        for i in start..<end {
            let phase = 2 * Double.pi * frequency * Double(i) / Double(StartCue.rate)
            real += Double(samples[i]) * cos(phase)
            imaginary += Double(samples[i]) * sin(phase)
        }
        return hypot(real, imaginary) / Double(end - start)
    }
    precondition((0.045...0.12).contains(level), "Moderate RMS, not a nearly silent or over-loud impulse")
    let peakIndex = samples.firstIndex { abs(Int($0)) == peak }!
    precondition(Double(peakIndex) / Double(StartCue.rate) < 0.010, "Transient peaks promptly, not a slow swell")
    precondition(rms(0, 0.001) < rms(0.002, 0.006) * 0.5, "Controlled 2 ms attack, not a hard discontinuity")
    precondition(rms(0.002, 0.015) * 0.5 > 0.035, "Articulated attack remains substantial at default 50% volume")
    precondition(rms(0.010, 0.040) > 0.025, "Audible short body, not the former nearly inaudible tiny tick")
    precondition(rms(0.030, 0.045) < rms(0.005, 0.020) * 0.4, "Controlled 30–50 ms decay")
    precondition(rms(0.050, 0.070) < rms(0.030, 0.045) * 0.4, "No sustained swish or ringing")
    precondition(rms(0.075, StartCue.duration) == 0, "Silent final 10 ms, no truncated endpoint")
    precondition(rms(0.070, 0.075) < 0.0001, "Smooth taper into silence")
    precondition(StartCue.envelope(time: 0) == 0)
    precondition(StartCue.envelope(time: StartCue.duration) == 0)
    // Full-window DFT bins give an approximate power spectrum without audio I/O.
    let powers = (1...Int(Double(StartCue.rate) * StartCue.duration / 2)).map { bin in pow(magnitude(Double(bin) / StartCue.duration, 0, StartCue.duration), 2) }
    let total = powers.reduce(0, +)
    func power(_ low: Double, _ high: Double) -> Double {
        powers.enumerated().filter { (low..<high).contains(Double($0.offset + 1) / StartCue.duration) }.reduce(0) { $0 + $1.element }
    }
    precondition(powers.max()! / total < 0.08, "No single pure-tone dominance")
    precondition(power(1000, 4000) / total > 0.50, "Mid/high articulation rather than muffled low-mid pop")
    precondition(power(8000, 22050) / total < 0.06, "Restrained high-frequency hiss")
    precondition(power(0, 300) / total < 0.015, "No heavy bass thump")
    precondition(power(1000, 2000) > total * 0.15 && power(2000, 4000) > total * 0.15, "Broad non-tonal click, not a beep")
    precondition(powers.max()! > powers.min()! * 100, "Filtered, nonconstant spectrum")
    print("Cue: \(samples.count) samples / \(StartCue.duration)s, peak \(peak), RMS \(level), max step \(steps.max()!), strongest bin \(powers.max()! / total)")
}
for mods: UInt32 in 0...15 {
    for code: Int64 in [0, 49, 53, 63] {
        for repeating in [false, true] {
            for down in [false, true] {
                precondition(ShortcutPolicy.matches(code: code, modifiers: mods, expectedCode: 49, expectedModifiers: 5, repeatEvent: repeating, alreadyDown: down) == (code == 49 && mods == 5 && !repeating && !down))
            }
        }
    }
}
for idle in [false, true] {
    for busy in [false, true] {
        for recording in [false, true] {
            for playing in [false, true] {
                precondition(CuePolicy.canPreview(idle: idle, busy: busy, recording: recording, playing: playing) == (idle && !busy && !recording && !playing))
            }
        }
    }
}
precondition(!CuePolicy.canCapture(current: true, allowed: false))
precondition(!CuePolicy.canCapture(current: false, allowed: true))
precondition(CuePolicy.canCapture(current: true, allowed: true))
let recordingRect = CapsuleGeometry.rect(phase: 1)
let processingRect = CapsuleGeometry.rect(phase: 2)
precondition(processingRect.size == NSSize(width: 54, height: 28))
for step in 0...22 {
    let rect = CapsuleGeometry.transition(from: recordingRect, to: processingRect, progress: CGFloat(step) / 22)
    precondition(recordingRect.contains(rect))
    precondition(rect.midX == recordingRect.midX && rect.minY == recordingRect.minY)
}
precondition(CapsuleGeometry.transition(from: recordingRect, to: processingRect, progress: 1) == processingRect)
for text in ["Couldn’t hear you.\nTry again", "Needs attention\nOpen HandsFree"] {
    let size = (text as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 10.5, weight: .medium)])
    precondition(size.width <= 132 && size.height <= 28, "Compact status text must fit without clipping")
}
for text in ["No speech", "Copied"] {
    let size = (text as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 10.5, weight: .medium)])
    precondition(size.width <= 132 && size.height <= 14, "Single-line status text must fit the centered 14 pt height")
}
for phase: Int32 in [1, 2, 3, 4, 5, 1] {
    overlay(phase)
    if phase == 1 || phase == 2 { precondition(!previewSound(), "No playback during capture or processing") }
    let panel = app.windows.first { $0 is NSPanel }!
    precondition(panel.frame.size == NSSize(width: 150, height: 44))
    precondition(!panel.canBecomeKey && !panel.canBecomeMain && !panel.isKeyWindow)
    precondition(panel.styleMask.contains(.nonactivatingPanel))
    let view = panel.contentView!
    let buttons = view.subviews.compactMap { $0 as? NSButton }
    precondition(buttons.count == 2 && buttons.allSatisfy { $0.isFlipped })
    precondition(buttons.allSatisfy { view.bounds.contains($0.frame) && $0.frame.width == 34 && $0.frame.height == 34 })
    precondition(buttons.filter { !$0.isHidden }.count == (phase == 1 ? 2 : 0))
    precondition(panel.ignoresMouseEvents == (phase == 2))
    if phase == 2 {
        precondition(view.accessibilityLabel() == "Transcribing")
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.3))
        precondition((view as! PillView).capsuleRect == processingRect)
    }
    if phase == 4 { precondition(view.accessibilityLabel() == "No speech") }
    if phase == 5 { precondition(view.accessibilityLabel() == "Copied") }
    let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main!
    precondition(abs(panel.frame.midX - screen.visibleFrame.midX) < 0.01)
    // Exercise drawing and text layout for every state without starting capture.
    let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds)!
    view.cacheDisplay(in: view.bounds, to: bitmap)
    if phase == 1, let path = ProcessInfo.processInfo.environment["HF_CAPSULE_PREVIEW"] {
        try! bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
    }
}
overlay(0)
precondition(!app.windows.first { $0 is NSPanel }!.isVisible)
// A stale animation timer must not redisplay a dismissed or superseded capsule.
overlay(1); overlay(2); overlay(0)
RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.3))
precondition(!app.windows.first { $0 is NSPanel }!.isVisible)
overlay(1); overlay(2); overlay(4)
RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.3))
precondition((app.windows.first { $0 is NSPanel }!.contentView as! PillView).capsuleRect == recordingRect)
overlay(0)
print("Native capsule geometry, state layout, nonactivation, shortcut matching and nonmusical cue passed without capture")
