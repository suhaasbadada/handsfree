import AppKit

// Actual admission policy + physical receipt latch; synthetic identities only.
var workflowPolicy = WorkflowPolicy()
for id: String? in [nil, ""] {
    precondition(!workflowPolicy.external(bundle: id, own: false))
}
precondition(!workflowPolicy.external(bundle: "dev.handsfree", own: true))
precondition(workflowPolicy.external(bundle: "com.example.Editor", own: false))
workflowPolicy.excluded = ["com.example.Editor"]
precondition(!workflowPolicy.external(bundle: "com.example.Editor", own: false))
precondition(workflowPolicy.shortcut(bundle: "dev.handsfree", own: true, recording: false))
workflowPolicy.paused = true
precondition(!workflowPolicy.shortcut(bundle: "dev.handsfree", own: true, recording: false))
precondition(workflowPolicy.shortcut(bundle: nil, own: false, recording: true)) // Finish survives.
var rejectedReceipt = HoldGesture()
precondition(rejectedReceipt.key(down: true, valid: false) == nil)
workflowPolicy.paused = false
workflowPolicy.excluded = []
precondition(rejectedReceipt.key(down: true, valid: true) == nil) // resume/refocus cannot rearm
precondition(rejectedReceipt.key(down: false, valid: true) == nil)
precondition(rejectedReceipt.key(down: true, valid: true) == 1)
workflowPolicy.paused = true
workflowPolicy.excluded = ["com.example.Editor"]
precondition(rejectedReceipt.key(down: false, valid: false) == 2) // accepted release survives
// Admission is a value decision, never a live policy closure in cue-wait work.
workflowPolicy.paused = false
workflowPolicy.excluded = []
let admitted = workflowPolicy.external(bundle: "com.example.Editor", own: false)
workflowPolicy.paused = true
precondition(admitted && !workflowPolicy.external(bundle: "com.example.Editor", own: false))
let ownIdentity = ShortcutTarget(pid: 10, bundle: "dev.handsfree")
let editorIdentity = ShortcutTarget(pid: 20, bundle: "com.example.Editor")
let otherEditor = ShortcutTarget(pid: 30, bundle: "com.example.Other")
let unknownIdentity = ShortcutTarget(pid: 0, bundle: nil)
// Explicit practice remains allowed; a delayed shortcut practice does not.
precondition(workflowPolicy.admits(practice: true, shortcut: false, received: nil, live: ownIdentity, ownPID: 10))
precondition(!workflowPolicy.admits(practice: true, shortcut: true, received: ownIdentity, live: ownIdentity, ownPID: 10))
workflowPolicy.paused = false
precondition(workflowPolicy.admits(practice: true, shortcut: true, received: ownIdentity, live: ownIdentity, ownPID: 10))
precondition(!workflowPolicy.admits(practice: true, shortcut: false, received: nil, live: editorIdentity, ownPID: 10))
precondition(workflowPolicy.admits(practice: false, shortcut: true, received: editorIdentity, live: editorIdentity, ownPID: 10))
for target in [ownIdentity, unknownIdentity, otherEditor] {
    precondition(!workflowPolicy.admits(practice: false, shortcut: true, received: editorIdentity, live: target, ownPID: 10))
}
precondition(!workflowPolicy.admits(practice: false, shortcut: true, received: nil, live: editorIdentity, ownPID: 10)) // evicted/stale receipt
workflowPolicy.excluded = ["com.example.Editor"]
precondition(!workflowPolicy.admits(practice: false, shortcut: true, received: editorIdentity, live: editorIdentity, ownPID: 10))

var fakeLogin = "not_registered"
var registrations = 0
var removals = 0
func fakeRegister() { registrations += 1; fakeLogin = "approval_required" }
func fakeUnregister() { removals += 1; fakeLogin = "not_registered" }
precondition(loginChange(true, status: { fakeLogin }, register: fakeRegister, unregister: fakeUnregister).status == "approval_required")
precondition(loginChange(true, status: { fakeLogin }, register: fakeRegister, unregister: fakeUnregister).error == nil)
precondition(registrations == 1)
fakeLogin = "enabled"
precondition(loginChange(true, status: { fakeLogin }, register: fakeRegister, unregister: fakeUnregister).status == "enabled")
precondition(registrations == 1)
precondition(loginChange(false, status: { fakeLogin }, register: fakeRegister, unregister: fakeUnregister).status == "not_registered")
precondition(removals == 1)
struct FakeLoginError: Error {}
let failedLogin = loginChange(true, status: { "not_found" }, register: { throw FakeLoginError() }, unregister: fakeUnregister)
precondition(failedLogin.status == "not_found" && failedLogin.error != nil)
print("Workflow receipt/admission/finish and fake login registration policy passed without capture or registration")

// A revoked observation never opens an engine, checks consent or starts capture.
precondition(inputLevel(42, 9, { _ in false }) == -1)
precondition(PillView.timerText(elapsed: 0, limit: 120) == "0:00 / 2:00")
precondition(PillView.timerText(elapsed: 61.99, limit: 300) == "1:01 / 5:00")
precondition(PillView.timerText(elapsed: 999, limit: 120) == "2:00 / 2:00")
precondition(PillView.timerText(elapsed: .infinity, limit: 120) == "0:00 / 2:00")

// Production physical-edge recognizer only: no event tap, mic, or playback.
// The actual event router receives synthetic CGEvents and own-process window
// snapshots. External menus are absent from NSApp.windows, not broadly exempted
// by their screen position or level. Include a secondary display left/above main.
let trayFrame = NSRect(x: 900, y: 876, width: 24, height: 24)
let menuFrame = NSRect(x: 780, y: 650, width: 160, height: 226)
let secondaryTray = NSRect(x: -500, y: 1176, width: 24, height: 24)
let controlWindows = [
    HoldControlWindow(frame: trayFrame, level: .statusBar, visible: true),
    HoldControlWindow(frame: menuFrame, level: .popUpMenu, visible: true),
    HoldControlWindow(frame: secondaryTray, level: .statusBar, visible: true),
    HoldControlWindow(frame: NSRect(x: 100, y: 650, width: 160, height: 226), level: .popUpMenu, visible: false),
    HoldControlWindow(frame: NSRect(x: 300, y: 650, width: 160, height: 226), level: .normal, visible: true)
]
func routed(_ type: CGEventType, _ point: NSPoint = .zero, gesture: inout HoldGesture,
            allowed: Bool = true, repeatEvent: Bool = false) -> Int32? {
    let event = CGEvent(source: nil)!
    event.type = type
    event.flags = [] // No dependence on the operator's current physical modifiers.
    event.location = CGPoint(x: point.x, y: 900 - point.y)
    event.setIntegerValueField(.keyboardEventKeycode, value: 9)
    event.setIntegerValueField(.keyboardEventAutorepeat, value: repeatEvent ? 1 : 0)
    return routeHoldEvent(type, event, gesture: &gesture, shortcutCode: 9, shortcutModifiers: 0,
        otherHeld: { false }, allowed: { allowed }, ownControl: {
            HoldControls.contains(type, quartzPoint: event.location, screenTop: 900,
                capsule: NSRect(x: 500, y: 20, width: 150, height: 44), windows: controlWindows)
        })
}
for cueWaiting in [false, true] {
    for button: CGEventType in [.leftMouseDown, .rightMouseDown, .otherMouseDown] {
        var accepted = HoldGesture()
        var watched = HoldFocusWatch()
        var epochCurrent = true
        precondition(routed(.keyDown, gesture: &accepted) == 1)
        let token = accepted.token
        watched.press(token)
        // Menu opens on down, then Pause mutates future admission; neither can
        // interrupt accepted recording or its delayed cue-capture handoff.
        precondition(routed(button, NSPoint(x: 912, y: 888), gesture: &accepted) == nil)
        precondition(routed(.leftMouseUp, NSPoint(x: 912, y: 888), gesture: &accepted) == nil)
        var futurePolicy = WorkflowPolicy()
        precondition(routed(button, NSPoint(x: 850, y: 750), gesture: &accepted) == nil)
        futurePolicy.paused = true
        precondition(!futurePolicy.shortcut(bundle: "com.example.Editor", own: false, recording: false))
        precondition(routed(button, NSPoint(x: -488, y: 1188), gesture: &accepted) == nil)
        // Repeats cannot rearm, including after Pause; release still finishes.
        precondition(routed(.keyDown, gesture: &accepted, allowed: false, repeatEvent: true) == nil)
        if cueWaiting { precondition(CuePolicy.canCapture(current: true, allowed: epochCurrent)) }
        precondition(routed(.keyUp, gesture: &accepted, allowed: false) == 2)
        precondition(accepted.token == token && watched.tokens == [token])
        // Focus surveillance outlives release and remains capable of revoking.
        for _ in watched.tokens { epochCurrent = false }
        precondition(!CuePolicy.canCapture(current: true, allowed: epochCurrent))
        watched.complete(token)
        precondition(watched.tokens.isEmpty)
    }
}
// Ordinary external clicks (including another tray/menu), hidden menus and
// dashboard windows must still emit edge 3, once, before physical release.
for point in [NSPoint(x: 700, y: 888), NSPoint(x: 600, y: 750),
              NSPoint(x: 180, y: 750), NSPoint(x: 380, y: 750)] {
    for button: CGEventType in [.leftMouseDown, .rightMouseDown, .otherMouseDown] {
        var held = HoldGesture()
        precondition(routed(.keyDown, gesture: &held) == 1)
        precondition(routed(button, point, gesture: &held) == 3)
        precondition(routed(button, point, gesture: &held) == nil)
        precondition(routed(.keyDown, gesture: &held, repeatEvent: true) == nil)
        precondition(routed(.keyUp, gesture: &held) == 2)
        precondition(routed(.keyDown, gesture: &held) == 1)
    }
}
for type: CGEventType in [.scrollWheel, .flagsChanged] {
    var held = HoldGesture()
    precondition(routed(.keyDown, gesture: &held) == 1)
    precondition(routed(type, NSPoint(x: 912, y: 888), gesture: &held) == 3)
}
var capsuleHold = HoldGesture()
precondition(routed(.keyDown, gesture: &capsuleHold) == 1)
precondition(routed(.leftMouseDown, NSPoint(x: 550, y: 40), gesture: &capsuleHold) == nil)
precondition(capsuleHold.finish() == 2) // Explicit native Finish, still latched.
precondition(routed(.keyDown, gesture: &capsuleHold, repeatEvent: true) == nil)
precondition(routed(.keyUp, gesture: &capsuleHold) == nil)
print("Production hold event routing: own tray/menu and cue-wait retained; external clicks, repeats, release and focus watch passed without UI")

for cancel in [false, true] {
    var hold = HoldGesture()
    precondition(hold.key(down: true, valid: true) == 1)
    let first = hold.token
    for _ in 0..<100 { precondition(hold.key(down: true, valid: true) == nil) }
    if cancel { precondition(hold.interrupt() == 3); precondition(hold.interrupt() == nil) }
    precondition(hold.finish() == 2) // First required modifier released / HUD finish.
    precondition(hold.key(down: true, valid: true) == nil)
    precondition(hold.key(down: false, valid: true) == nil)
    precondition(hold.key(down: true, valid: true) == 1 && hold.token > first)
    precondition(hold.key(down: false, valid: true) == 2)
}
var quarantined = HoldGesture()
quarantined.held = true
precondition(quarantined.key(down: true, valid: true) == nil)
precondition(quarantined.key(down: false, valid: true) == nil)

// Focus surveillance is independent of primary release and rejected presses.
var focusWatch = HoldFocusWatch()
var processingHold = HoldGesture()
precondition(processingHold.key(down: true, valid: true) == 1)
let processingToken = processingHold.token
focusWatch.press(processingToken)
precondition(processingHold.key(down: false, valid: true) == 2)
precondition(focusWatch.tokens == [processingToken]) // Away, then back: both observed.
precondition(processingHold.key(down: true, valid: true) == 1)
let rejectedToken = processingHold.token
focusWatch.press(rejectedToken)
focusWatch.complete(rejectedToken)
precondition(focusWatch.tokens == [processingToken])
focusWatch.complete(processingToken) // Actual session completion, not release.
precondition(focusWatch.tokens.isEmpty)
precondition(processingHold.key(down: false, valid: true) == 2)
precondition(processingHold.key(down: true, valid: true) == 1)
focusWatch.press(processingHold.token)
focusWatch.complete(processingToken) // Old completion cannot retire a newer hold.
precondition(focusWatch.tokens == [processingHold.token])
precondition(quarantined.key(down: true, valid: false) == nil)
precondition(quarantined.key(down: true, valid: true) == nil)
precondition(quarantined.key(down: false, valid: true) == nil)
import AVFoundation
import CryptoKit

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let points = CapsuleGeometry.checkmark(in: NSRect(x: 0, y: 0, width: 34, height: 34))
precondition(points[0].x < points[1].x && points[1].x < points[2].x)
precondition(points[1].y > points[0].y && points[1].y > points[2].y, "Check vertex must point down in flipped coordinates")
precondition(points[2].y < points[0].y, "Check must have a longer rising right arm")
do {
    let resourceRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("src-tauri/native/assets")
    let data = EndCue.data(resourceRoot: resourceRoot)!
    precondition(EndCue.data(resourceRoot: nil) == nil, "Missing resources never substitute another cue")
    precondition(String(data: data.prefix(4), encoding: .ascii) == "RIFF")
    precondition(String(data: data[36..<40], encoding: .ascii) == "data")
    let samples = stride(from: 44, to: data.count, by: 2).map { Int16(bitPattern: UInt16(data[$0]) | UInt16(data[$0 + 1]) << 8) }
    let player = try! AVAudioPlayer(data: data) // Decode only: never play audio.
    precondition(abs(player.duration - EndCue.duration) < 0.000001)
    precondition(player.format.sampleRate == Double(StartCue.rate) && player.numberOfChannels == 1)
    precondition(samples.count == Int(EndCue.duration * Double(StartCue.rate)))
    precondition(EndCue.duration == 0.240)
    precondition(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() == "a1eb8aeadfc425a5a217e3d35732762571c16d7e03969a5f3b0bfe41dbde6856", "Exact user-approved Clean pair audition bytes")
    let startData = StartCue.data(resourceRoot: resourceRoot)!
    let startPlayer = try! AVAudioPlayer(data: startData) // Decode only, never play.
    precondition(abs(startPlayer.duration - StartCue.duration) < 0.000001)
    precondition(StartCue.data(resourceRoot: nil) == nil)
    precondition(startData[44 + 1920..<44 + 9600] == data[44 + 1920..<44 + 9600], "Start uses identical first grain PCM")
    precondition(startData.suffix(1920).allSatisfy { $0 == 0 })
    precondition(samples[960..<4800] == samples[5760..<9600])
    precondition(samples[4800..<5760].allSatisfy { $0 == 0 }, "No overlap")
    precondition(data == EndCue.data(resourceRoot: resourceRoot), "Exact deterministic bundled PCM")
    for profile in ["clean", "warm"] {
        let start = StartCue.data(profile: profile, resourceRoot: resourceRoot)!
        let end = EndCue.data(profile: profile, resourceRoot: resourceRoot)!
        precondition(abs(try! AVAudioPlayer(data: start).duration - 0.120) < 0.000001)
        precondition(abs(try! AVAudioPlayer(data: end).duration - 0.240) < 0.000001)
        precondition(start[44 + 1920..<44 + 9600] == end[44 + 1920..<44 + 9600])
    }
    precondition(samples.first == 0 && samples.last == 0)
    let peak = samples.map { abs(Int($0)) }.max()!
    precondition(peak == 10362, "Approved -10 dBFS peak; no gain changes")
    let steps = zip(samples, samples.dropFirst()).map { abs(Int($0) - Int($1)) }
    precondition(steps.max()! < 4200, "Bounded original synthetic tap transient")
    func rms(_ from: Double, _ to: Double) -> Double {
        let window = samples[Int(from * Double(StartCue.rate))..<Int(to * Double(StartCue.rate))]
        return sqrt(window.reduce(0) { $0 + pow(Double($1) / 32768, 2) } / Double(window.count))
    }
    let level = rms(0, EndCue.duration)
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
    precondition((0.035...0.12).contains(level), "Moderate RMS, not a nearly silent or over-loud impulse")
    func peakIndex(_ from: Double, _ to: Double) -> Int {
        let range = Int(from * Double(StartCue.rate))..<Int(to * Double(StartCue.rate))
        return range.max { abs(Int(samples[$0])) < abs(Int(samples[$1])) }!
    }
    let firstPeak = peakIndex(0.020, 0.120), secondPeak = peakIndex(0.120, 0.220)
    precondition(secondPeak - firstPeak == 4800, "Identical grain onsets exactly 100 ms apart")
    precondition((0.025...0.035).contains(Double(firstPeak) / Double(StartCue.rate)))
    let attackDelta = 20 * log10(Double(abs(Int(samples[secondPeak]))) / Double(abs(Int(samples[firstPeak]))))
    precondition(abs(attackDelta) < 1, "Equal-gain grains; only the approved natural overlap affects attack peaks")
    precondition((0.94...1.02).contains(rms(0.120, 0.180) / rms(0.020, 0.080)), "Uniform strikes, no stronger second accent")
    precondition(rms(0, 0.020) == 0 && rms(0.200, 0.240) == 0, "Exact silent endpoints")
    for start in [0.020, 0.120] {
        precondition(rms(start, start + 0.001) < rms(start + 0.002, start + 0.006) * 0.4, "Soft attack")
        precondition(rms(start + 0.002, start + 0.015) * 0.5 > 0.04, "Short body at unchanged default 50% volume")
    }
    precondition(rms(0.180, 0.200) < 0.001, "Smooth short decay before final silence")
    precondition(magnitude(820, 0.120, 0.200) > magnitude(1450, 0.120, 0.200) * 8, "Approved Clean fundamental")
    // Full-window DFT bins give an approximate power spectrum without audio I/O.
    let powers = (1...Int(Double(StartCue.rate) * EndCue.duration / 2)).map { bin in pow(magnitude(Double(bin) / EndCue.duration, 0, EndCue.duration), 2) }
    let total = powers.reduce(0, +)
    func power(_ low: Double, _ high: Double) -> Double {
        powers.enumerated().filter { (low..<high).contains(Double($0.offset + 1) / EndCue.duration) }.reduce(0) { $0 + $1.element }
    }
    precondition(power(300, 4000) / total > 0.95, "Preserve approved glass grain spectrum")
    precondition(power(8000, 24000) / total < 0.01, "Bounded dry-tap high-frequency energy")
    precondition(power(0, 300) / total < 0.015, "No heavy bass thump")
    precondition(powers.max()! > powers.min()! * 100, "Filtered, nonconstant spectrum")
    print("Cue: \(samples.count) samples / \(EndCue.duration)s, peak \(peak), RMS \(level), max step \(steps.max()!), strongest bin \(powers.max()! / total)")
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
// Production labels, visibility and NSButton target/actions, with only the
// callback replaced. AX press/traversal requires a real application session and
// is not established by this command-line harness.
overlay(1)
let axPill = app.windows.first { $0 is NSPanel }!.contentView as! PillView
var axActions: [Int32] = []
let productionAction = axPill.onAction
axPill.onAction = { axActions.append($0) }
axPill.setPhase(1)
precondition(axPill.accessibilityRole() == .group)
precondition(axPill.accessibilityLabel() == "HandsFree listening")
precondition(axPill.accessibilityHelp()?.contains("shortcut again") == true)
let axButtons = axPill.subviews.compactMap { $0 as? NSButton }
precondition(axButtons.count == 2)
for (button, name) in zip(axButtons, ["Cancel dictation", "Finish dictation"]) {
    precondition(button.accessibilityLabel() == name && !button.isHidden)
    button.performClick(nil)
    precondition(axActions.last == (name == "Cancel dictation" ? 4 : 5))
}
precondition(axActions == [4, 5])
for phase in [2, 3, 4, 5, 0] {
    axPill.setPhase(1)
    axPill.setAccessibilityValue("0:12 / 2:00")
    axPill.setPhase(phase)
    precondition(axPill.accessibilityValue() == nil, "Recording timer must not leak into another phase")
    precondition(axPill.subviews.allSatisfy { $0.isHidden })
}
axPill.onAction = productionAction
overlay(0)
func luminance(_ color: NSColor) -> CGFloat {
    let c = color.usingColorSpace(.sRGB)!
    func linear(_ v: CGFloat) -> CGFloat { v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * linear(c.redComponent) + 0.7152 * linear(c.greenComponent) + 0.0722 * linear(c.blueComponent)
}
func contrast(_ a: NSColor, _ b: NSColor) -> CGFloat {
    let x = luminance(a), y = luminance(b)
    return (max(x, y) + 0.05) / (min(x, y) + 0.05)
}
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
    let previousFrame = app.windows.first { $0 is NSPanel }?.frame
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
    if phase == 2, let previousFrame = previousFrame {
        // Processing deliberately stays on the recording screen. Sampling the
        // live pointer after the 300 ms run-loop wait races real mouse movement
        // between monitors and incorrectly rejects this required behavior.
        precondition(panel.frame.origin == previousFrame.origin, "Processing must preserve the recording screen")
    } else {
        let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main!
        precondition(abs(panel.frame.midX - screen.visibleFrame.midX) < 0.01, "Capsule must be centered on the current screen")
    }
    // Exercise drawing and text layout for every state without starting capture.
    let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds)!
    view.cacheDisplay(in: view.bounds, to: bitmap)
    for appearance in [NSAppearance.Name.aqua, .darkAqua] {
        view.appearance = NSAppearance(named: appearance)
        view.cacheDisplay(in: view.bounds, to: bitmap)
        var lightPixels = 0, darkPixels = 0, redPixels = 0
        for y in 0..<bitmap.pixelsHigh {
            for x in 0..<bitmap.pixelsWide {
                guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.sRGB), color.alphaComponent > 0.8 else { continue }
                if color.redComponent > 0.9 && color.greenComponent > 0.9 && color.blueComponent > 0.85 { lightPixels += 1 }
                if max(color.redComponent, color.greenComponent, color.blueComponent) < 0.6 { darkPixels += 1 }
                if color.redComponent > color.blueComponent + 0.15 { redPixels += 1 }
            }
        }
        let dark = appearance == .darkAqua
        let palette = CapsulePalette(appearance: view.effectiveAppearance)
        precondition(contrast(palette.text, palette.surface) >= 4.5)
        precondition(contrast(palette.primaryText, palette.primary) >= 4.5)
        precondition(contrast(palette.text, palette.button) >= 4.5)
        precondition(contrast(palette.accent, palette.surface) >= 3)
        precondition(dark ? darkPixels > 500 : lightPixels > 500, "Rendered capsule must follow effective appearance")
        if phase == 1 { precondition(redPixels > 20, "Recording waveform uses muted red, not blue or lime") }
        if phase == 3 || phase == 4 || phase == 5 { precondition(dark ? lightPixels > 10 : darkPixels > 10, "Rendered status text must contrast with the actual capsule paint") }
    }
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
precondition(dashboardVisible(true))
precondition(activationPolicy() == Int32(NSApplication.ActivationPolicy.regular.rawValue))
precondition(dashboardVisible(false))
precondition(activationPolicy() == Int32(NSApplication.ActivationPolicy.accessory.rawValue))
overlay(1)
precondition(activationPolicy() == Int32(NSApplication.ActivationPolicy.accessory.rawValue), "Recording must not change Dock presence")
precondition(!app.windows.first { $0 is NSPanel }!.isKeyWindow)
overlay(0)
app.setActivationPolicy(.prohibited)
print("Native capsule geometry, state layout, nonactivation, shortcut matching and Clean cues passed without capture")
