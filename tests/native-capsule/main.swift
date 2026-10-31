import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let points = CapsuleGeometry.checkmark(in: NSRect(x: 0, y: 0, width: 34, height: 34))
precondition(points[0].x < points[1].x && points[1].x < points[2].x)
precondition(points[1].y > points[0].y && points[1].y > points[2].y, "Check vertex must point down in flipped coordinates")
precondition(points[2].y < points[0].y, "Check must have a longer rising right arm")
for style in [0, 1] {
    StartCue.style = style
    let samples = StartCue.samples
    precondition(samples.count == Int(StartCue.duration * Double(StartCue.rate)))
    precondition((0.08...0.16).contains(StartCue.duration))
    precondition(samples.first == 0 && samples.last == 0)
    let peak = samples.map { abs(Int($0)) }.max()!
    precondition(peak > 3000 && peak < 14000, "Gentle audible headroom, never clipped")
    let steps = zip(samples, samples.dropFirst()).map { abs(Int($0) - Int($1)) }
    precondition(steps.max()! < 2000, "Smooth sample transitions, no clicks")
}
precondition(StartCue.samples(style: 0) != StartCue.samples(style: 1))
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
print("Native capsule geometry, state layout, nonactivation, shortcut matching and cue profiles passed without capture")
