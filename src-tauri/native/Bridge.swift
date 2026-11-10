import AppKit
import AVFoundation
import ApplicationServices
import QuartzCore
import Carbon

// All AppKit / recorder / AX state is confined to the main thread.
private func main<T>(_ body: () -> T) -> T {
    if Thread.isMainThread { return body() }
    return DispatchQueue.main.sync(execute: body)
}
// Only the dashboard lifecycle changes Dock presence. Recording never calls this.
@_cdecl("hf_dashboard_visible") public func dashboardVisible(_ visible: Bool) -> Bool {
    main {
        let app = NSApplication.shared
        if visible, let name = Bundle.main.object(forInfoDictionaryKey: "CFBundleIconFile") as? String {
            let path = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources").appendingPathComponent(name.hasSuffix(".icns") ? name : name + ".icns")
            if let icon = NSImage(contentsOf: path) { app.applicationIconImage = icon }
        }
        // No activate()/makeKey(): only an explicit dashboard open may focus UI.
        return app.setActivationPolicy(visible ? .regular : .accessory)
    }
}
@_cdecl("hf_activation_policy") public func activationPolicy() -> Int32 {
    main { Int32(NSApplication.shared.activationPolicy().rawValue) }
}
private typealias Callback = @convention(c) (Int32) -> Void
private var callback: Callback?
private var tap: CFMachPort?
private var source: CFRunLoopSource?
private var hookReason: Int32 = 0 // 0 unattempted, 1 connected, 2 permission, 3 port, 4 source, 5 disabled
private var recorder: AudioCapture?
private var recordingElapsed: (() -> Double)?
private var recordingLimit: UInt32 = 120

@_cdecl("hf_microphones") public func microphones(_ buffer: UnsafeMutablePointer<UInt8>?, _ capacity: Int32) -> Int32 {
    main {
        guard let buffer, capacity > 0 else { return -1 }
        do {
            struct Snapshot: Encodable { let devices: [MicrophoneDevice]; let default_uid: String? }
            let data = try JSONEncoder().encode(Snapshot(devices: Microphones.devices(), default_uid: Microphones.defaultUID()))
            guard data.count <= Int(capacity) else { return -1 }
            data.copyBytes(to: buffer, count: data.count)
            return Int32(data.count)
        } catch { return -1 }
    }
}
private var meter: Timer?
private var panel: NSPanel?
private var pill: PillView?
private var targetPID: pid_t = 0
private var target: AXUIElement?
private var targetFailure: PasteResult = .originalFocusUnavailable
private var compatibilityEnabled = false
private var deliverySession: DeliverySession?
private var targetWindow: AXUIElement?
@_cdecl("hf_compatibility") public func configureCompatibility(_ enabled: Bool) -> Bool {
    main { compatibilityEnabled = enabled; return true }
}
private var focusObserver: AXObserver?
private var overlayGeneration = 0
private var clipboardGeneration = 0
private var restoreClipboard: (() -> Void)?
private var soundsEnabled = false
private var cue: AVAudioPlayer?
private var endCue: AVAudioPlayer?
private var cueVolume: Float = 0.5
private var audioBusy = false
private var shortcutCode: Int64 = 63
private var shortcutModifiers: UInt32 = 0
private var captureUntil = Date.distantPast
private var shortcutDown = false
// Physical lifetime remains latched after cancellation, limit or HUD Finish.
struct HoldGesture {
    var held = false
    private var active = false
    private var cancelled = false
    private(set) var token: UInt64 = 0
    mutating func key(down: Bool, valid: Bool) -> Int32? {
        if down {
            guard !held else { return nil }
            held = true
            guard valid else { return nil }
            token &+= 1; active = true; cancelled = false; return 1
        }
        held = false
        return finish()
    }
    mutating func finish() -> Int32? {
        guard active else { return nil }
        active = false; return 2
    }
    mutating func interrupt() -> Int32? {
        guard active && !cancelled else { return nil }
        cancelled = true; return 3
    }
}
private var holdGesture = HoldGesture()
struct HoldFocusWatch {
    private(set) var tokens = Set<UInt64>()
    mutating func press(_ token: UInt64) { tokens.insert(token) }
    mutating func complete(_ token: UInt64) { tokens.remove(token) }
}
private var holdFocusWatch = HoldFocusWatch()
private func interruptHoldFocus() {
    for token in holdFocusWatch.tokens { gestureCallback?(3, 1, token) }
}
@_cdecl("hf_gesture_complete") public func gestureComplete(_ token: UInt64) {
    main { holdFocusWatch.complete(token) }
}
private var pushToTalk = false
private var startGate: (@convention(c) (UInt64) -> Bool)?
@_cdecl("hf_start_gate") public func configureStartGate(_ cb: @escaping @convention(c) (UInt64) -> Bool) { main { startGate = cb } }
private var gestureCallback: (@convention(c) (Int32, Int32, UInt64) -> Void)?
private var activationObserver: NSObjectProtocol?
private func emitHold(_ edge: Int32?) {
    if edge == 1 { holdFocusWatch.press(holdGesture.token) }
    if let edge { gestureCallback?(edge, 1, holdGesture.token) }
}
private func resetHold() {
    interruptHoldFocus()
    emitHold(holdGesture.interrupt())
    emitHold(holdGesture.finish())
    holdGesture.held = CGEventSource.keyState(.combinedSessionState, key: CGKeyCode(shortcutCode))
}
@_cdecl("hf_gesture_hook") public func gestureHook(_ cb: @escaping @convention(c) (Int32, Int32, UInt64) -> Void) { main { gestureCallback = cb } }
@_cdecl("hf_mode") public func recordingMode(_ mode: Int32) -> Bool {
    main { resetHold(); pushToTalk = mode == 1; callback?(6); return true }
}
private func holdEvent(_ type: CGEventType, _ event: CGEvent) {
    let code = event.getIntegerValueField(.keyboardEventKeycode)
    var mods: UInt32 = 0
    for (flag, bit): (CGEventFlags, UInt32) in [(.maskControl, 1), (.maskAlternate, 2), (.maskShift, 4), (.maskCommand, 8)] {
        if event.flags.contains(flag) { mods |= bit }
    }
    let fn = shortcutCode == 63
    let primaryEvent = code == shortcutCode && (fn ? type == .flagsChanged : type == .keyDown || type == .keyUp)
    if primaryEvent {
        let down = fn ? event.flags.contains(.maskSecondaryFn) : type == .keyDown
        let otherHeld = (0..<128).contains { key in
            key != Int(shortcutCode) && ![54,55,56,57,58,59,60,61,62,63].contains(key) && CGEventSource.keyState(.combinedSessionState, key: CGKeyCode(key))
        }
        let valid = mods == (fn ? 0 : shortcutModifiers) && !otherHeld && (fn || !event.flags.contains(.maskSecondaryFn)) && event.getIntegerValueField(.keyboardEventAutorepeat) == 0
        emitHold(holdGesture.key(down: down, valid: valid))
    } else if type == .flagsChanged && !fn && (mods & shortcutModifiers) != shortcutModifiers {
        // Release of the first required modifier finishes, but primary stays latched.
        emitHold(holdGesture.finish())
    } else if type == .keyDown || type == .flagsChanged || type == .leftMouseDown || type == .rightMouseDown || type == .otherMouseDown || type == .scrollWheel {
        // Native Finish/Cancel remain usable without first cancelling Finish.
        if !(type == .leftMouseDown && panel?.isVisible == true && panel?.frame.contains(NSEvent.mouseLocation) == true) {
            emitHold(holdGesture.interrupt())
        }
    }
    if type == .keyDown && code == 53 { callback?(4) }
}
enum ShortcutPolicy {
    static func matches(code: Int64, modifiers: UInt32, expectedCode: Int64, expectedModifiers: UInt32, repeatEvent: Bool, alreadyDown: Bool) -> Bool {
        code == expectedCode && modifiers == expectedModifiers && !repeatEvent && !alreadyDown
    }
}
@_cdecl("hf_shortcut") public func configureShortcut(_ code: Int32, _ modifiers: UInt32) {
    main { resetHold(); shortcutCode = Int64(code); shortcutModifiers = modifiers; resetHold(); shortcutDown = false; callback?(6) }
}
@_cdecl("hf_capture_shortcut") public func captureShortcut(_ active: Bool) {
    main { resetHold(); captureUntil = active ? Date().addingTimeInterval(30) : .distantPast; shortcutDown = false; callback?(6) }
}

// Shared geometry is exercised without displaying UI or capturing microphone audio.
enum CapsuleGeometry {
    static let size = NSSize(width: 150, height: 44)
    static let processingSize = NSSize(width: 54, height: 28)
    static func rect(phase: Int) -> NSRect {
        let s = phase == 2 ? processingSize : size
        // Keep the visible bottom edge and horizontal center fixed while shrinking.
        return NSRect(x: (size.width - s.width) / 2, y: 0, width: s.width, height: s.height)
    }
    static func transition(from: NSRect, to: NSRect, progress: CGFloat) -> NSRect {
        let t = min(1, max(0, progress))
        let eased = t * t * (3 - 2 * t)
        return NSRect(x: from.minX + (to.minX - from.minX) * eased,
                      y: from.minY + (to.minY - from.minY) * eased,
                      width: from.width + (to.width - from.width) * eased,
                      height: from.height + (to.height - from.height) * eased)
    }
    static let hitSize: CGFloat = 34
    // Screen coordinates: NSButton draws flipped (positive y points down).
    static func checkmark(in bounds: NSRect) -> [NSPoint] {
        let c = NSPoint(x: bounds.midX, y: bounds.midY)
        return [NSPoint(x: c.x - 5, y: c.y), NSPoint(x: c.x - 1.5, y: c.y + 3.5), NSPoint(x: c.x + 5.5, y: c.y - 4)]
    }
}
enum StartCue {
    static let rate = 48000
    static let duration = 0.120
    static func data(profile: String = "clean", resourceRoot: URL? = Bundle.main.resourceURL) -> Data? {
        guard ["clean", "warm"].contains(profile), let url = resourceRoot?.appendingPathComponent("sounds/\(profile)-start.wav") else { return nil }
        return try? Data(contentsOf: url)
    }
}
enum EndCue {
    static let duration = 0.240
    static func data(profile: String = "clean", resourceRoot: URL? = Bundle.main.resourceURL) -> Data? {
        guard ["clean", "warm"].contains(profile), let url = resourceRoot?.appendingPathComponent("sounds/\(profile)-end.wav") else { return nil }
        return try? Data(contentsOf: url)
    }
}
private var cueProfile = "clean"
private var recordingCueProfile = "clean"
@_cdecl("hf_sound_style") public func soundStyle(_ style: Int32) {
    // Only selects the next session. Never mutates an active player's profile.
    main { cueProfile = style == 1 ? "warm" : "clean" }
}
private func makeCue(ending: Bool = false) -> AVAudioPlayer? {
    let profile = ending ? recordingCueProfile : cueProfile
    guard let data = ending ? EndCue.data(profile: profile) : StartCue.data(profile: profile) else {
        NSLog("HandsFree: missing bundled %@ %@ sound", profile, ending ? "end" : "start")
        return nil
    }
    let player = try? AVAudioPlayer(data: data)
    player?.volume = cueVolume
    player?.prepareToPlay()
    return player
}
@_cdecl("hf_sound_volume") public func soundVolume(_ volume: Float) {
    main { cueVolume = volume.isFinite ? min(1, max(0, volume)) : 0.5; cue?.volume = cueVolume; endCue?.volume = cueVolume }
}
enum CuePolicy {
    static func canPreview(idle: Bool, busy: Bool, recording: Bool, playing: Bool) -> Bool {
        idle && !busy && !recording && !playing
    }
    static func canCapture(current: Bool, allowed: Bool) -> Bool { current && allowed }
}
@_cdecl("hf_preview_sound") public func previewSound() -> Bool {
    main {
        guard CuePolicy.canPreview(idle: true, busy: audioBusy, recording: recorder != nil, playing: cue?.isPlaying == true || endCue?.isPlaying == true) else { return false }
        guard let data = EndCue.data(profile: cueProfile), let player = try? AVAudioPlayer(data: data) else { return false }
        endCue = player; player.volume = cueVolume
        return player.play()
    }
}
@_cdecl("hf_sounds") public func sounds(_ enabled: Bool) {
    main {
        soundsEnabled = enabled
        if !enabled { cue?.stop(); endCue?.stop() }
    }
}

private class OverlayPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
private class CapsuleButton: NSButton {
    override var isFlipped: Bool { true }
    var hovered = false
    var finish = false
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func updateTrackingAreas() {
        for area in trackingAreas { removeTrackingArea(area) }
        addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
        super.updateTrackingAreas()
    }
    override func mouseEntered(with event: NSEvent) { hovered = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovered = false; needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        (finish ? NSColor(white: hovered ? 0.20 : 0.27, alpha: 1) : NSColor(white: hovered ? 0.84 : 0.90, alpha: 1)).setFill()
        NSBezierPath(ovalIn: bounds.insetBy(dx: 3, dy: 3)).fill()
        (finish ? NSColor.white : NSColor(white: 0.26, alpha: 1)).setStroke()
        let path = NSBezierPath(); path.lineWidth = 1.8; path.lineCapStyle = .round; path.lineJoinStyle = .round
        if finish {
            let points = CapsuleGeometry.checkmark(in: bounds)
            path.move(to: points[0]); path.line(to: points[1]); path.line(to: points[2])
        } else {
            let x = bounds.midX, y = bounds.midY
            path.move(to: NSPoint(x: x - 3.5, y: y - 3.5)); path.line(to: NSPoint(x: x + 3.5, y: y + 3.5))
            path.move(to: NSPoint(x: x - 3.5, y: y + 3.5)); path.line(to: NSPoint(x: x + 3.5, y: y - 3.5))
        }
        path.stroke()
    }
}

class PillView: NSView {
    var phase = 0
    var level: CGFloat = 0
    var tick: CGFloat = 0
    var elapsed: Double = 0
    var limit: UInt32 = 120
    static func timerText(elapsed: Double, limit: UInt32) -> String {
        let seconds = elapsed.isFinite ? Int(min(Double(limit), max(0, elapsed))) : 0
        return String(format: "%d:%02d / %d:%02d", seconds / 60, seconds % 60, limit / 60, limit % 60)
    }
    private var shrinkFrom = CapsuleGeometry.rect(phase: 1)
    private var shrinkStarted: CFTimeInterval?
    var capsuleRect: NSRect {
        let target = CapsuleGeometry.rect(phase: phase)
        guard let start = shrinkStarted, !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { return target }
        return CapsuleGeometry.transition(from: shrinkFrom, to: target, progress: CGFloat((CACurrentMediaTime() - start) / 0.22))
    }
    private let cancelButton = CapsuleButton(frame: NSRect(x: 5, y: 5, width: CapsuleGeometry.hitSize, height: CapsuleGeometry.hitSize))
    private let finishButton = CapsuleButton(frame: NSRect(x: 111, y: 5, width: CapsuleGeometry.hitSize, height: CapsuleGeometry.hitSize))
    override init(frame: NSRect) {
        super.init(frame: frame)
        setAccessibilityElement(true); setAccessibilityRole(.group)
        cancelButton.title = ""; cancelButton.isBordered = false
        cancelButton.target = self; cancelButton.action = #selector(cancelRecording)
        cancelButton.setAccessibilityLabel("Cancel dictation"); cancelButton.toolTip = "Cancel · Escape"; cancelButton.setAccessibilityIdentifier("handsfree-cancel")
        finishButton.title = ""; finishButton.isBordered = false; finishButton.finish = true
        finishButton.target = self; finishButton.action = #selector(finishRecording)
        finishButton.setAccessibilityLabel("Finish dictation"); finishButton.toolTip = "Finish dictation"; finishButton.setAccessibilityIdentifier("handsfree-finish")
        addSubview(cancelButton); addSubview(finishButton)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    @objc private func cancelRecording() { callback?(4) }
    @objc private func finishRecording() { callback?(5) }
    func setPhase(_ value: Int) {
        let previous = phase
        shrinkFrom = capsuleRect
        phase = value
        shrinkStarted = previous == 1 && value == 2 ? CACurrentMediaTime() : nil
        tick = 0
        cancelButton.isHidden = value != 1
        finishButton.isHidden = value != 1
        setAccessibilityLabel(value == 1 ? "HandsFree listening" : value == 2 ? "Transcribing" : value == 4 ? "No speech" : value == 5 ? "Copied" : "HandsFree needs attention. Open settings")
        setAccessibilityHelp(value == 1 && pushToTalk ? "Release the shortcut to finish. Escape cancels." : value == 2 ? "Press Escape or use Cancel in HandsFree to cancel dictation." : nil)
    }
    override func draw(_ dirtyRect: NSRect) {
        let capsule = capsuleRect
        NSColor(calibratedRed: 0.985, green: 0.981, blue: 0.969, alpha: 0.97).setFill()
        NSBezierPath(roundedRect: capsule.insetBy(dx: 1, dy: 1), xRadius: capsule.height / 2, yRadius: capsule.height / 2).fill()
        NSColor(white: 0.25, alpha: 0.12).setStroke()
        NSBezierPath(roundedRect: capsule.insetBy(dx: 1, dy: 1), xRadius: capsule.height / 2, yRadius: capsule.height / 2).stroke()
        let reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        if phase == 1 {
            NSColor(calibratedRed: 0.65, green: 0.29, blue: 0.27, alpha: 1).setFill()
            for i in 0..<9 {
                let shape = CGFloat([0.35, 0.6, 0.85, 0.65, 1, 0.7, 0.9, 0.5, 0.3][i])
                // Amplitude comes only from the recorder, never a fake sine wave.
                let h = 3 + level * 16 * shape
                NSBezierPath(roundedRect: NSRect(x: 49.5 + CGFloat(i) * 6, y: 28-h/2, width: 3, height: h), xRadius: 1.5, yRadius: 1.5).fill()
            }
            let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center
            (Self.timerText(elapsed: elapsed, limit: limit) as NSString).draw(in: NSRect(x: 40, y: 6, width: 70, height: 12), withAttributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: 9, weight: .medium), .foregroundColor: NSColor(white: 0.25, alpha: 1), .paragraphStyle: paragraph])
        } else if phase == 2 {
            for i in 0..<3 {
                let breath = reduceMotion ? 0.65 : 0.45 + 0.4 * (0.5 + 0.5 * sin(tick / 30 * 2 * .pi / 1.4 - CGFloat(i) * 0.8))
                NSColor(white: 0.35, alpha: breath).setFill()
                NSBezierPath(ovalIn: NSRect(x: capsule.midX - 12 + CGFloat(i) * 10, y: capsule.midY - 2, width: 4, height: 4)).fill()
            }
        } else {
            let text = phase == 4 ? "No speech" : phase == 5 ? "Copied" : "Needs attention\nOpen HandsFree"
            let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center
            let x: CGFloat = 9
            let height: CGFloat = phase == 4 || phase == 5 ? 14 : 28
            (text as NSString).draw(in: NSRect(x: x, y: (bounds.height-height)/2, width: bounds.width-x-9, height: height), withAttributes: [.font: NSFont.systemFont(ofSize: 10.5, weight: .medium), .foregroundColor: NSColor(white: 0.22, alpha: 1), .paragraphStyle: paragraph])
        }
    }
}

@_cdecl("hf_permissions") public func permissions() -> Int32 {
    var value: Int32 = 0
    if AVCaptureDevice.authorizationStatus(for: .audio) == .authorized { value |= 1 }
    if AXIsProcessTrusted() { value |= 2 }
    if CGPreflightListenEventAccess() { value |= 4 }
    return value
}
// AVAuthorizationStatus: 0 not determined, 1 restricted, 2 denied, 3 authorized.
@_cdecl("hf_microphone_status") public func microphoneStatus() -> Int32 {
    Int32(AVCaptureDevice.authorizationStatus(for: .audio).rawValue)
}
@_cdecl("hf_request_microphone") public func requestMicrophone() {
    main {
        NSApp.activate(ignoringOtherApps: true)
        if AVCaptureDevice.authorizationStatus(for: .audio) == .denied {
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone") { NSWorkspace.shared.open(url) }
        } else {
            AVCaptureDevice.requestAccess(for: .audio) { _ in }
        }
    }
}
@_cdecl("hf_request_accessibility") public func requestAccessibility() {
    main {
        guard !AXIsProcessTrusted() else { return }
        NSApp.activate(ignoringOtherApps: true)
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") { NSWorkspace.shared.open(url) }
    }
}
@_cdecl("hf_request_permissions") public func requestPermissions() {
    main {
        if !AXIsProcessTrusted() { requestAccessibility() }
        else if !CGPreflightListenEventAccess() {
            _ = CGRequestListenEventAccess()
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent") { NSWorkspace.shared.open(url) }
        }
    }
}
@_cdecl("hf_keyboard") public func keyboard() {
    main { if let url = URL(string: "x-apple.systempreferences:com.apple.Keyboard-Settings.extension") { NSWorkspace.shared.open(url) } }
}

@_cdecl("hf_hook") public func hook(_ cb: @escaping @convention(c) (Int32) -> Void) -> Bool {
    main {
        callback = cb
        if activationObserver == nil {
            activationObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { _ in
                interruptHoldFocus()
                if deliverySession?.compatibility == true { deliverySession?.interrupted = true }
            }
        }
        // A retained port is not proof of permission or a live event stream.
        // Updates/revocation can leave it invalid or disabled indefinitely.
        guard CGPreflightListenEventAccess() else { removeHook(); hookReason = 2; return false }
        if let t = tap {
            if CFMachPortIsValid(t) {
                if !CGEvent.tapIsEnabled(tap: t) { callback?(6); CGEvent.tapEnable(tap: t, enable: true) }
                if CGEvent.tapIsEnabled(tap: t) { hookReason = 1; return true }
            }
            removeHook()
        }
        resetHold()
        let mask = (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue) | (1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.rightMouseDown.rawValue) | (1 << CGEventType.otherMouseDown.rawValue) | (1 << CGEventType.scrollWheel.rawValue)
        tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: CGEventMask(mask), callback: { _, type, event, _ in
            if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                resetHold()
                shortcutDown = false
                if let t = tap { CGEvent.tapEnable(tap: t, enable: true) }
                callback?(6) // Reset a gesture whose release may have been lost.
            } else if Date() < captureUntil {
                resetHold()
                return Unmanaged.passUnretained(event)
            } else if pushToTalk {
                holdEvent(type, event)
            } else if type == .keyUp {
                if event.getIntegerValueField(.keyboardEventKeycode) == shortcutCode { shortcutDown = false }
            } else if type == .flagsChanged && shortcutCode == 63 {
                let code = event.getIntegerValueField(.keyboardEventKeycode)
                let others: CGEventFlags = [.maskShift, .maskControl, .maskAlternate, .maskCommand]
                if !event.flags.intersection(others).isEmpty { callback?(3) }
                else if code == 63 { callback?(event.flags.contains(.maskSecondaryFn) ? 1 : 2) }
                else { callback?(3) } // Caps Lock and other modifier-only chords.
            } else if type == .keyDown {
                callback?(3)
                let code = event.getIntegerValueField(.keyboardEventKeycode)
                if code == 53 { callback?(4) }
                if shortcutCode != 63 {
                    var mods: UInt32 = 0
                    for (flag, bit): (CGEventFlags, UInt32) in [(.maskControl, 1), (.maskAlternate, 2), (.maskShift, 4), (.maskCommand, 8)] {
                        if event.flags.contains(flag) { mods |= bit }
                    }
                    // Caps Lock does not change physical bindings. Fn does.
                    if !event.flags.contains(.maskSecondaryFn) && ShortcutPolicy.matches(code: code, modifiers: mods, expectedCode: shortcutCode, expectedModifiers: shortcutModifiers, repeatEvent: event.getIntegerValueField(.keyboardEventAutorepeat) != 0, alreadyDown: shortcutDown) {
                        shortcutDown = true; callback?(7)
                    }
                }
            }
            return Unmanaged.passUnretained(event)
        }, userInfo: nil)
        guard let t = tap else { hookReason = 3; return false }
        guard let s = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, t, 0) else { removeHook(); hookReason = 4; return false }
        source = s
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: t, enable: true)
        let connected = CGEvent.tapIsEnabled(tap: t)
        hookReason = connected ? 1 : 5
        return connected
    }
}

private func removeHook() {
    resetHold()
    if let s = source { CFRunLoopRemoveSource(CFRunLoopGetMain(), s, .commonModes) }
    if let t = tap { CFMachPortInvalidate(t) }
    source = nil; tap = nil
    callback?(6)
}

// Read-only, in-process diagnostic: no prompt, tap creation, audio, or AX values.
// Bits: port present, port valid, event tap enabled. Permissions are hf_permissions.
@_cdecl("hf_hook_state") public func hookState() -> Int32 {
    main {
        guard let t = tap else { return 0 }
        return 1 | (CFMachPortIsValid(t) ? 2 : 0) | (CGEvent.tapIsEnabled(tap: t) ? 4 : 0)
    }
}
@_cdecl("hf_hook_reason") public func hookDiagnosticReason() -> Int32 { main { hookReason } }

// Cached technical metadata only: no AX content, roles, identifiers or app names.
// Target cleanup must preserve the start snapshot for subsequent diagnostics.
private var focusDiagnostics: [String: [[String: Any]]] = [:]
private var safelyMissingFocus: [String: Bool] = [:]
@_cdecl("hf_focus_diagnostic") public func focusDiagnostic(_ buffer: UnsafeMutablePointer<UInt8>?, _ capacity: Int32) -> Int32 {
    main {
        guard let buffer, let data = try? JSONSerialization.data(withJSONObject: focusDiagnostics),
              data.count <= Int(capacity) else { return 0 }
        data.copyBytes(to: buffer, count: data.count)
        return Int32(data.count)
    }
}
private func focused(_ pid: pid_t, stage: String) -> AXUIElement? {
    var events: [[String: Any]] = []
    var safelyMissing = true
    defer { focusDiagnostics[stage] = events; safelyMissingFocus[stage] = safelyMissing && !events.isEmpty }
    guard pid > 0, pid != ProcessInfo.processInfo.processIdentifier else {
        safelyMissing = false
        events.append(["source": "guard", "outcome": "invalid_or_own_application", "trusted": AXIsProcessTrusted()]); return nil
    }
    return resolveFocus(trusted: { AXIsProcessTrusted() }, foregroundMatches: {
        NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
    }, query: { systemwide in
        var value: CFTypeRef?
        let root = systemwide ? AXUIElementCreateSystemWide() : AXUIElementCreateApplication(pid)
        let error = AXUIElementCopyAttributeValue(root, kAXFocusedUIElementAttribute as CFString, &value)
        func failure(_ name: String) -> FocusLookup<AXUIElement> {
            FocusLookup(element: nil, error: error.rawValue, classification: name)
        }
        guard error == .success else {
            switch error {
            case .apiDisabled: return failure("api_disabled")
            case .noValue: return failure("no_value")
            case .attributeUnsupported: return failure("attribute_unsupported")
            case .cannotComplete: return failure("cannot_complete")
            default: return failure("ax_error")
            }
        }
        guard let value else { return failure("nil_value") }
        guard CFGetTypeID(value) == AXUIElementGetTypeID() else { return failure("wrong_type") }
        let element = value as! AXUIElement
        var owner: pid_t = 0
        let ownerError = AXUIElementGetPid(element, &owner)
        guard ownerError == .success else {
            return FocusLookup(element: nil, error: ownerError.rawValue, classification: "pid_query_failed")
        }
        guard owner == pid else { return failure("pid_mismatch") }
        return FocusLookup(element: element, error: error.rawValue, classification: "valid")
    }, equal: { CFEqual($0, $1) }, report: { source, lookup in
        if let lookup { if !lookup.mayFallback { safelyMissing = false } }
        else { safelyMissing = false }
        var event: [String: Any] = ["source": lookup == nil ? "guard" : source, "trusted": AXIsProcessTrusted()]
        if let lookup {
            event["ax_error"] = lookup.error; event["outcome"] = lookup.classification
            if lookup.classification == "valid" { event["pid_matches"] = true }
            if lookup.classification == "pid_mismatch" { event["pid_matches"] = false }
        } else { event["outcome"] = source }
        events.append(event)
    })
}
private func attribute(_ element: AXUIElement, _ name: String) -> String? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value as? String
}
private func booleanAttribute(_ element: AXUIElement, _ name: String) -> Bool? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value as? Bool
}
private func fieldStatus(_ element: AXUIElement) -> PasteResult {
    // Some editors focus an inner text element of a secure field. Never broaden
    // support based on writable text without first inspecting its ancestors.
    var node = element
    var ancestryChecked = false
    for _ in 0..<32 {
        var subrole: CFTypeRef?
        let subroleResult = AXUIElementCopyAttributeValue(node, kAXSubroleAttribute as CFString, &subrole)
        guard subroleResult == .success || subroleResult == .attributeUnsupported || subroleResult == .noValue else { return .unsupportedField }
        if subrole as? String == kAXSecureTextFieldSubrole { return .secureField }
        if attribute(node, kAXRoleAttribute) == kAXApplicationRole { ancestryChecked = true; break }
        var parent: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(node, kAXParentAttribute as CFString, &parent)
        if result == .noValue || result == .attributeUnsupported { ancestryChecked = true; break }
        guard result == .success, let p = parent, CFGetTypeID(p) == AXUIElementGetTypeID() else { return .unsupportedField }
        node = p as! AXUIElement
    }
    guard ancestryChecked else { return .unsupportedField }
    let role = attribute(element, kAXRoleAttribute) ?? ""
    var writable = DarwinBoolean(false)
    let canSetText = AXUIElementIsAttributeSettable(element, kAXSelectedTextAttribute as CFString, &writable) == .success && writable.boolValue
    return fieldPolicy(secure: false,
                       enabled: booleanAttribute(element, kAXEnabledAttribute) != false,
                       explicitlyReadOnly: booleanAttribute(element, "AXEditable") == false,
                       standardTextRole: [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole].contains(role),
                       selectedTextWritable: canSetText)
}
private func clearTarget() {
    if let observer = focusObserver { CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes) }
    focusObserver = nil
    target = nil; targetWindow = nil; targetPID = 0; targetFailure = .originalFocusUnavailable
}
private func focusedWindow(_ pid: pid_t) -> AXUIElement? {
    guard pid > 0, pid != ProcessInfo.processInfo.processIdentifier, AXIsProcessTrusted(),
          NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { return nil }
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(AXUIElementCreateApplication(pid), kAXFocusedWindowAttribute as CFString, &value) == .success,
          let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    let window = value as! AXUIElement
    var owner: pid_t = 0
    guard AXUIElementGetPid(window, &owner) == .success, owner == pid,
          attribute(window, kAXRoleAttribute) == kAXWindowRole else { return nil }
    return window
}
private func observeTargetFocus() {
    guard pushToTalk || deliverySession?.compatibility == true, targetPID != 0 else { return }
    var observer: AXObserver?
    guard AXObserverCreate(targetPID, { observer, _, notification, _ in
        guard let current = focusObserver, CFEqual(current, observer) else { return }
        if notification as String == kAXFocusedWindowChangedNotification {
            deliverySession?.interrupted = true
        } else { interruptHoldFocus() }
    }, &observer) == .success, let observer else { return }
    let application = AXUIElementCreateApplication(targetPID)
    if pushToTalk { _ = AXObserverAddNotification(observer, application, kAXFocusedUIElementChangedNotification as CFString, nil) }
    if deliverySession?.compatibility == true {
        let windowWatch = AXObserverAddNotification(observer, application, kAXFocusedWindowChangedNotification as CFString, nil) == .success
        deliverySession?.watchingWindow = windowWatch && activationObserver != nil
    }
    focusObserver = observer
    CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
}
@_cdecl("hf_discard_target") public func discardTarget() { main { clearTarget() } }
private func validateTarget() -> PasteResult {
    if !AXIsProcessTrusted() {
        focusDiagnostics["current"] = [["source": "guard", "outcome": "untrusted", "trusted": false]]
        return .accessibilityDenied
    }
    if targetFailure != .sent { return targetFailure }
    guard targetPID != 0, let original = target else { return .originalFocusUnavailable }
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == targetPID else {
        focusDiagnostics["current"] = [["source": "guard", "outcome": "application_changed", "trusted": true]]
        return .applicationChanged
    }
    guard let now = focused(targetPID, stage: "current") else { return .currentFocusUnavailable }
    // Do NOT fall back to PID, role, title, coordinates, or AXIdentifier: these
    // cannot establish that a recreated element is the original text field.
    guard CFEqual(original, now) else { return .fieldChanged }
    return fieldStatus(now)
}

private func validateDelivery() -> PasteResult {
    let strict = validateTarget()
    guard let session = deliverySession, session.compatibility,
          strict == .originalFocusUnavailable || strict == .currentFocusUnavailable else { return strict }
    let eligible = resolveCompatibility(session: session, failure: strict, originalWindow: targetWindow,
        trusted: { AXIsProcessTrusted() }, foregroundMatches: {
            targetPID > 0 && targetPID != ProcessInfo.processInfo.processIdentifier && NSWorkspace.shared.frontmostApplication?.processIdentifier == targetPID
        }, focusedWindow: { focusedWindow(targetPID) }, equal: { CFEqual($0, $1) },
        secureInput: { IsSecureEventInputEnabled() }, currentField: {
            let current = focused(targetPID, stage: "current")
            if let original = target, let current, !CFEqual(original, current) { return (.fieldChanged, false) }
            return (current.map { fieldStatus($0) }, safelyMissingFocus["current"] == true)
        })
    // AX calls can service application/observer work. A value snapshot must not
    // erase an interruption or session replacement observed during validation.
    guard eligible, let live = deliverySession, live.generation == session.generation,
          live.epoch == session.epoch, !live.interrupted, !live.attempted else { return strict }
    return .sent
}

@_cdecl("hf_record") public func record(_ generation: UInt64, _ epoch: UInt64, _ microphoneUID: UnsafePointer<CChar>?, _ limit: UInt32, _ elapsed: @escaping @convention(c) (UInt64, UInt64) -> Double, _ allowed: @escaping @convention(c) (UInt64) -> Bool, _ sink: @escaping @convention(c) (UInt64, UInt64, UnsafePointer<Float>?, Int32) -> Void) -> Bool {
    let uid = microphoneUID.map { String(cString: $0) }
    return main {
        guard allowed(epoch) else { return false }
        guard permissions() & 3 == 3, recorder == nil else { return false }
        guard deliverySession.map({ generation > $0.generation }) ?? true else { return false }
        clearTarget()
        deliverySession = DeliverySession(generation: generation, epoch: epoch, compatibility: compatibilityEnabled)
        focusDiagnostics = [:]
        targetPID = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
        if compatibilityEnabled { targetWindow = focusedWindow(targetPID) }
        target = focused(targetPID, stage: "start")
        deliverySession?.originalFocusMissing = safelyMissingFocus["start"] == true
        if targetPID == 0 { targetFailure = .noApplication }
        else if targetPID == ProcessInfo.processInfo.processIdentifier { targetFailure = .ownApplication }
        else if let original = target {
            switch fieldStatus(original) {
            case .secureField: targetFailure = .originalSecureField
            case .unsupportedField: targetFailure = .originalUnsupportedField
            case .disabledField: targetFailure = .originalDisabledField
            default: targetFailure = .sent
            }
        }
        if compatibilityEnabled && IsSecureEventInputEnabled() { targetFailure = .originalSecureField }
        observeTargetFocus()
        do {
            let r = try AudioCapture(generation: generation, epoch: epoch, microphoneUID: uid, sink: sink)
            guard allowed(epoch) else { clearTarget(); return false }
            let previewWasPlaying = cue?.isPlaying == true || endCue?.isPlaying == true
            cue?.stop(); endCue?.stop()
            recorder = r
            recordingLimit = limit
            recordingElapsed = { [weak r] in
                guard let r, recorder === r, allowed(epoch) else { return 0 }
                return elapsed(generation, epoch)
            }
            audioBusy = true
            recordingCueProfile = cueProfile
            if soundsEnabled {
                cue = makeCue()
                guard let player = cue, player.play() else {
                    recorder = nil; audioBusy = false; clearTarget(); return false
                }
            }
            let startPlayer = soundsEnabled ? cue : nil
            let cueLength = soundsEnabled ? (startPlayer?.duration ?? StartCue.duration) : 0
            let quietTail = soundsEnabled || previewWasPlaying ? 0.18 : 0
            func captureAllowed() -> Bool {
                guard CuePolicy.canCapture(current: recorder === r, allowed: allowed(epoch) && (startGate?(generation) ?? true)) else {
                    if recorder === r { r.stop(); recorder = nil; audioBusy = false; cue?.stop(); clearTarget() }
                    return false
                }
                return true
            }
            // Never block AppKit. Check actual player completion as well as PCM
            // duration: route startup/prebuffering must not eat into the quiet tail.
            // 180 ms covers common output buffering, not every Bluetooth route.
            func awaitCueCompletion() {
                guard captureAllowed() else { return }
                if startPlayer?.isPlaying == true {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.01, execute: awaitCueCompletion)
                    return
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + quietTail) {
                    guard captureAllowed() else { return }
                    do { try r.start() }
                    catch { recorder = nil; audioBusy = false; clearTarget(); sink(generation, epoch, nil, -1) }
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + cueLength, execute: awaitCueCompletion)
            return true
        } catch { clearTarget(); return false }
    }
}
// Observation only: reuse the one explicitly started capture. Never create an engine.
@_cdecl("hf_input_level") public func inputLevel(_ generation: UInt64, _ epoch: UInt64, _ allowed: @convention(c) (UInt64) -> Bool) -> Float {
    main {
        guard allowed(epoch), NSApp.isActive, NSApp.keyWindow?.isVisible == true,
              permissions() & 7 == 7, let r = recorder, r.isRecording,
              r.generation == generation, r.epoch == epoch else { return -1 }
        let db = r.level()
        guard allowed(epoch), db.isFinite else { return -1 }
        return min(1, max(0, (db + 60) / 60))
    }
}
@_cdecl("hf_stop") public func stop() {
    // Stopping capture is not cancellation: inference still needs the original
    // target. Discard explicitly only on cancel, failure, empty result, or paste.
    main { recorder?.stop(); recorder = nil; cue?.stop() }
}
// Only explicit normal Finish/toggle/limit calls this, never generic teardown.
@_cdecl("hf_finish") public func finish(_ epoch: UInt64, _ allowed: @convention(c) (UInt64) -> Bool) {
    main {
        CaptureEnd.finish(stop: {
            let captured = recorder?.stop() ?? false
            recorder = nil; cue?.stop()
            return captured
        }, allowed: { soundsEnabled && allowed(epoch) }, play: {
            endCue = makeCue(ending: true)
            endCue?.currentTime = 0; endCue?.play()
        })
    }
}
@_cdecl("hf_cancel_audio") public func cancelAudio() {
    main { stop(); endCue?.stop() }
}
@_cdecl("hf_overlay") public func overlay(_ phase: Int32) {
    main {
        audioBusy = phase == 1 || phase == 2
        overlayGeneration += 1
        let generation = overlayGeneration
        meter?.invalidate(); meter = nil
        if phase != 1 { recordingElapsed = nil }
        if phase == 0 { panel?.orderOut(nil); return }
        if panel == nil {
            let p = OverlayPanel(contentRect: NSRect(origin: .zero, size: CapsuleGeometry.size), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            p.level = .floating; p.isOpaque = false; p.backgroundColor = .clear; p.hasShadow = true
            p.becomesKeyOnlyIfNeeded = true
            p.hidesOnDeactivate = false; p.ignoresMouseEvents = false
            p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
            let v = PillView(frame: NSRect(origin: .zero, size: CapsuleGeometry.size))
            p.contentView = v; panel = p; pill = v
        }
        // Preserve the recording screen even if the pointer moves before inference.
        if phase != 2 || panel?.isVisible != true {
            let screen = NSScreen.screens.first(where: { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) }) ?? NSScreen.main
            if let frame = screen?.visibleFrame, let p = panel { p.setFrameOrigin(NSPoint(x: frame.midX - p.frame.width / 2, y: frame.minY + 24)) }
        }
        // The backing window stays fixed to avoid clipping during the shrink;
        // its transparent area never intercepts clicks while processing.
        panel?.ignoresMouseEvents = phase == 2
        pill?.setPhase(Int(phase)); pill?.level = 0; pill?.elapsed = 0; pill?.limit = recordingLimit; pill?.needsDisplay = true
        panel?.orderFrontRegardless()
        if phase == 1 || phase == 2 {
            meter = Timer.scheduledTimer(withTimeInterval: 1.0/30.0, repeats: true) { timer in
                guard overlayGeneration == generation else { timer.invalidate(); return }
                if phase == 1 {
                    let db = recorder?.level() ?? -60
                    pill?.level = CGFloat(max(0, min(1, (db + 55) / 45)))
                    pill?.elapsed = recordingElapsed?() ?? 0
                    if let pill { pill.setAccessibilityValue(PillView.timerText(elapsed: pill.elapsed, limit: pill.limit)) }
                } else if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
                    pill?.needsDisplay = true; timer.invalidate(); meter = nil; return
                }
                pill?.tick += 1; pill?.needsDisplay = true
            }
        }
        if phase == 3 || phase == 4 || phase == 5 {
            DispatchQueue.main.asyncAfter(deadline: .now() + (phase == 4 ? 3 : 5)) {
                if overlayGeneration == generation { overlay(0) }
            }
        }
    }
}

// Strict delivery requires exact AX field identity; opt-in compatibility only
// relaxes missing-field proof, retaining actual app/window identity and guards.
// Clipboard is restored only if nobody changed it during the paste interval.
@_cdecl("hf_paste_generation") public func paste(_ text: UnsafePointer<CChar>, _ generation: UInt64, _ epoch: UInt64, _ allowed: @convention(c) (UInt64) -> Bool) -> Int32 {
    let value = String(cString: text)
    return main {
        guard allowed(epoch) else { return PasteResult.cancelled.rawValue }
        guard let session = deliverySession, session.generation == generation, session.epoch == epoch else { return PasteResult.cancelled.rawValue }
        guard !session.attempted else { return PasteResult.submissionUncertain.rawValue }
        defer {
            if deliverySession?.generation == generation && deliverySession?.epoch == epoch { clearTarget() }
        }
        // Lock-free Rust callback: cancellation is observable even when its
        // FIFO cleanup is blocked by inference's state lock / main.sync wait.
        guard allowed(epoch) else { return PasteResult.cancelled.rawValue }
        let validation = validateDelivery()
        guard validation == .sent else { return validation.rawValue }
        // Finish an earlier owned paste before saving a new clipboard snapshot.
        restoreClipboard?(); restoreClipboard = nil
        clipboardGeneration += 1
        let token = clipboardGeneration
        let board = NSPasteboard.general
        let saved = board.pasteboardItems?.map { item -> NSPasteboardItem in
            let copy = NSPasteboardItem()
            for type in item.types { if let data = item.data(forType: type) { copy.setData(data, forType: type) } }
            return copy
        } ?? []
        // Reading promised clipboard data can run another app. Revalidate after
        // snapshotting, before publishing the transcript or sending any event.
        let revalidation = validateDelivery()
        guard revalidation == .sent else { return revalidation.rawValue }
        guard allowed(epoch) else { return PasteResult.cancelled.rawValue }
        let cleared = board.clearContents()
        guard allowed(epoch) else {
            if board.changeCount == cleared { board.writeObjects(saved) }
            return PasteResult.cancelled.rawValue
        }
        guard board.setString(value, forType: .string) else {
            board.clearContents(); board.writeObjects(saved)
            return PasteResult.clipboardFailed.rawValue
        }
        let clipboardVersion = board.changeCount
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 9, keyDown: true), let up = CGEvent(keyboardEventSource: nil, virtualKey: 9, keyDown: false) else {
            if board.changeCount == clipboardVersion { board.clearContents(); board.writeObjects(saved) }
            return PasteResult.eventCreationFailed.rawValue
        }
        let finalValidation = validateDelivery()
        guard finalValidation == .sent else {
            if board.changeCount == clipboardVersion { board.clearContents(); board.writeObjects(saved) }
            return finalValidation.rawValue
        }
        down.flags = .maskCommand; up.flags = .maskCommand
        guard allowed(epoch) else {
            if board.changeCount == clipboardVersion { board.clearContents(); board.writeObjects(saved) }
            return PasteResult.cancelled.rawValue
        }
        // Target the validated PID, not a global event that could reach a newly
        // frontmost app. Focus within that app still requires manual verification.
        guard deliverySession?.claim(generation: generation, epoch: epoch) == true else {
            if board.changeCount == clipboardVersion { board.clearContents(); board.writeObjects(saved) }
            return PasteResult.submissionUncertain.rawValue
        }
        down.postToPid(targetPID)
        // Always release the key, even if cancellation arrives after key-down.
        up.postToPid(targetPID)
        schedulePasteRestore(board: board, saved: saved, generation: clipboardVersion, token: token)
        return PasteResult.sent.rawValue
    }
}
// Shared with the permission-free delivery harness; production calls this only
// after a Paste shortcut has actually been submitted.
func schedulePasteRestore(board: NSPasteboard, saved: [NSPasteboardItem], generation: Int, token: Int? = nil) {
    let ownedToken = token ?? clipboardGeneration
    restoreClipboard = {
        if board.changeCount == generation { board.clearContents(); board.writeObjects(saved) }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
        if clipboardGeneration == ownedToken { restoreClipboard?(); restoreClipboard = nil }
    }
}
@_cdecl("hf_copy") public func copyText(_ text: UnsafePointer<CChar>) {
    let value = String(cString: text)
    main { _ = publishCopy(value, board: .general, allowed: { true }) }
}

// Explicit, lasting clipboard replacement, never a paste or an AX content read.
// Manual Copy shares this path so an older paste timer cannot clobber it.
func publishCopy(_ value: String, board: NSPasteboard, allowed: () -> Bool) -> Int32 {
    guard allowed() else { return PasteResult.cancelled.rawValue }
    guard !value.isEmpty else { return PasteResult.clipboardFailed.rawValue }
    let saved = board.pasteboardItems?.map { item -> NSPasteboardItem in
        let copy = NSPasteboardItem()
        for type in item.types { if let data = item.data(forType: type) { copy.setData(data, forType: type) } }
        return copy
    } ?? []
    guard allowed() else { return PasteResult.cancelled.rawValue }
    let cleared = board.clearContents()
    guard allowed() else {
        if board.changeCount == cleared { board.writeObjects(saved) }
        return PasteResult.cancelled.rawValue
    }
    guard board.setString(value, forType: .string) else {
        if board.changeCount == cleared { board.writeObjects(saved) }
        return PasteResult.clipboardFailed.rawValue
    }
    clipboardGeneration += 1
    restoreClipboard = nil
    return PasteResult.sent.rawValue
}

@_cdecl("hf_copy_fallback") public func copyFallback(_ text: UnsafePointer<CChar>, _ epoch: UInt64, _ allowed: @convention(c) (UInt64) -> Bool) -> Int32 {
    let value = String(cString: text)
    return main { publishCopy(value, board: .general, allowed: { allowed(epoch) }) }
}
@_cdecl("hf_cleanup") public func cleanup() {
    main {
        restoreClipboard?(); restoreClipboard = nil
        recorder?.stop(); recorder = nil; clearTarget()
        cue?.stop(); endCue?.stop()
        meter?.invalidate(); meter = nil; panel?.orderOut(nil)
        if let t = tap { CGEvent.tapEnable(tap: t, enable: false); CFMachPortInvalidate(t) }
        if let s = source { CFRunLoopRemoveSource(CFRunLoopGetMain(), s, .commonModes) }
        tap = nil; source = nil
    }
}
