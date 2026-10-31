import AppKit
import AVFoundation
import ApplicationServices
import QuartzCore

// All AppKit / recorder / AX state is confined to the main thread.
private func main<T>(_ body: () -> T) -> T {
    if Thread.isMainThread { return body() }
    return DispatchQueue.main.sync(execute: body)
}
private typealias Callback = @convention(c) (Int32) -> Void
private var callback: Callback?
private var tap: CFMachPort?
private var source: CFRunLoopSource?
private var hookReason: Int32 = 0 // 0 unattempted, 1 connected, 2 permission, 3 port, 4 source, 5 disabled
private var recorder: AVAudioRecorder?
private var meter: Timer?
private var panel: NSPanel?
private var pill: PillView?
private var targetPID: pid_t = 0
private var target: AXUIElement?
private var targetFailure: PasteResult = .originalFocusUnavailable
private var overlayGeneration = 0
private var clipboardGeneration = 0
private var restoreClipboard: (() -> Void)?
private var soundsEnabled = true
private var cue: AVAudioPlayer?
private var cueVolume: Float = 0.5
private var audioBusy = false
private var shortcutCode: Int64 = 63
private var shortcutModifiers: UInt32 = 0
private var captureUntil = Date.distantPast
private var shortcutDown = false
enum ShortcutPolicy {
    static func matches(code: Int64, modifiers: UInt32, expectedCode: Int64, expectedModifiers: UInt32, repeatEvent: Bool, alreadyDown: Bool) -> Bool {
        code == expectedCode && modifiers == expectedModifiers && !repeatEvent && !alreadyDown
    }
}
@_cdecl("hf_shortcut") public func configureShortcut(_ code: Int32, _ modifiers: UInt32) {
    main { shortcutCode = Int64(code); shortcutModifiers = modifiers; shortcutDown = false; callback?(6) }
}
@_cdecl("hf_capture_shortcut") public func captureShortcut(_ active: Bool) {
    main { captureUntil = active ? Date().addingTimeInterval(30) : .distantPast; shortcutDown = false; callback?(6) }
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
    static let rate = 44100
    static var style = 0
    static var duration: Double { style == 1 ? 0.15 : 0.09 }
    static var samples: [Int16] { samples(style: style) }
    static func samples(style: Int) -> [Int16] {
      let duration = style == 1 ? 0.15 : 0.09
      return (0..<Int(Double(rate) * duration)).map { i in
        let t = Double(i) / Double(rate)
        // Original single-tone profiles, with zero-slope endpoints. Tap is a
        // short, warm downward pulse; bell has a faint inharmonic overtone.
        let window = pow(sin(.pi * t / duration), 2) * exp(-t * (style == 1 ? 14 : 24))
        let phase = style == 1 ? 2 * .pi * 620 * t : 2 * .pi * (370 * t - 650 * t * t)
        let tone = sin(phase) + (style == 1 ? 0.15 * sin(2 * .pi * 1430 * t) : 0)
        return Int16(window * tone * 12000)
      }
    }
}
@_cdecl("hf_sound_style") public func soundStyle(_ style: Int32) {
    main { StartCue.style = style == 1 ? 1 : 0; cue?.stop(); cue = nil }
}
// Original short cues, synthesized locally (no borrowed audio).
private func makeCue() -> AVAudioPlayer? {
    let rate = StartCue.rate
    let count = StartCue.samples.count
    var data = Data()
    func tag(_ value: String) { data.append(contentsOf: value.utf8) }
    func number<T: FixedWidthInteger>(_ value: T) {
        var little = value.littleEndian
        withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
    }
    tag("RIFF"); number(UInt32(36 + count * 2)); tag("WAVEfmt ")
    number(UInt32(16)); number(UInt16(1)); number(UInt16(1)); number(UInt32(rate))
    number(UInt32(rate * 2)); number(UInt16(2)); number(UInt16(16))
    tag("data"); number(UInt32(count * 2))
    for sample in StartCue.samples { number(sample) }
    let player = try? AVAudioPlayer(data: data)
    player?.volume = cueVolume
    player?.prepareToPlay()
    return player
}
@_cdecl("hf_sound_volume") public func soundVolume(_ volume: Float) {
    main { cueVolume = volume.isFinite ? min(1, max(0, volume)) : 0.5; cue?.volume = cueVolume }
}
enum CuePolicy {
    static func canPreview(idle: Bool, busy: Bool, recording: Bool, playing: Bool) -> Bool {
        idle && !busy && !recording && !playing
    }
    static func canCapture(current: Bool, allowed: Bool) -> Bool { current && allowed }
}
@_cdecl("hf_preview_sound") public func previewSound() -> Bool {
    main {
        guard CuePolicy.canPreview(idle: true, busy: audioBusy, recording: recorder != nil, playing: cue?.isPlaying == true) else { return false }
        if cue == nil { cue = makeCue() }
        cue?.currentTime = 0
        return cue?.play() ?? false
    }
}
@_cdecl("hf_sounds") public func sounds(_ enabled: Bool) {
    main { soundsEnabled = enabled; if enabled && cue == nil { cue = makeCue() } }
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
        (finish ? NSColor(calibratedRed: 0.24, green: 0.53, blue: 1, alpha: hovered ? 1 : 0.9) : NSColor(white: hovered ? 0.28 : 0.17, alpha: 1)).setFill()
        NSBezierPath(ovalIn: bounds.insetBy(dx: 3, dy: 3)).fill()
        NSColor.white.setStroke()
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
        setAccessibilityLabel(value == 1 ? "HandsFree listening" : value == 2 ? "Transcribing" : value == 4 ? "Couldn’t hear you. Try again" : value == 5 ? "Copied — paste anywhere" : "HandsFree needs attention. Open settings")
        setAccessibilityHelp(value == 2 ? "Press Escape or use Cancel in HandsFree to cancel dictation." : nil)
    }
    override func draw(_ dirtyRect: NSRect) {
        let capsule = capsuleRect
        NSColor(white: 0.035, alpha: 0.98).setFill()
        NSBezierPath(roundedRect: capsule.insetBy(dx: 1, dy: 1), xRadius: capsule.height / 2, yRadius: capsule.height / 2).fill()
        NSColor(white: 1, alpha: 0.12).setStroke()
        NSBezierPath(roundedRect: capsule.insetBy(dx: 1, dy: 1), xRadius: capsule.height / 2, yRadius: capsule.height / 2).stroke()
        let reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        if phase == 1 {
            NSColor(calibratedRed: 0.77, green: 0.96, blue: 0.43, alpha: 1).setFill()
            for i in 0..<9 {
                let shape = CGFloat([0.35, 0.6, 0.85, 0.65, 1, 0.7, 0.9, 0.5, 0.3][i])
                // Amplitude comes only from the recorder, never a fake sine wave.
                let h = 3 + level * 23 * shape
                NSBezierPath(roundedRect: NSRect(x: 49.5 + CGFloat(i) * 6, y: (bounds.height-h)/2, width: 3, height: h), xRadius: 1.5, yRadius: 1.5).fill()
            }
        } else if phase == 2 {
            for i in 0..<3 {
                let breath = reduceMotion ? 0.65 : 0.45 + 0.4 * (0.5 + 0.5 * sin(tick / 30 * 2 * .pi / 1.4 - CGFloat(i) * 0.8))
                NSColor(calibratedRed: 0.77, green: 0.96, blue: 0.43, alpha: breath).setFill()
                NSBezierPath(ovalIn: NSRect(x: capsule.midX - 12 + CGFloat(i) * 10, y: capsule.midY - 2, width: 4, height: 4)).fill()
            }
        } else {
            let text = phase == 4 ? "Couldn’t hear you.\nTry again" : phase == 5 ? "Copied\nPaste anywhere" : "Needs attention\nOpen HandsFree"
            let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center
            let x: CGFloat = 9
            let height: CGFloat = 28
            (text as NSString).draw(in: NSRect(x: x, y: (bounds.height-height)/2, width: bounds.width-x-9, height: height), withAttributes: [.font: NSFont.systemFont(ofSize: 10.5, weight: .medium), .foregroundColor: NSColor.white, .paragraphStyle: paragraph])
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
        let mask = (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue)
        tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: CGEventMask(mask), callback: { _, type, event, _ in
            if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                shortcutDown = false
                if let t = tap { CGEvent.tapEnable(tap: t, enable: true) }
                callback?(6) // Reset a gesture whose release may have been lost.
            } else if Date() < captureUntil {
                return Unmanaged.passUnretained(event)
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

private func focused(_ pid: pid_t) -> AXUIElement? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(AXUIElementCreateApplication(pid), kAXFocusedUIElementAttribute as CFString, &value) == .success, let v = value, CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
    return (v as! AXUIElement)
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
    target = nil; targetPID = 0; targetFailure = .originalFocusUnavailable
}
@_cdecl("hf_discard_target") public func discardTarget() { main { clearTarget() } }
private func validateTarget() -> PasteResult {
    if !AXIsProcessTrusted() { return .accessibilityDenied }
    if targetFailure != .sent { return targetFailure }
    guard targetPID != 0, let original = target else { return .originalFocusUnavailable }
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == targetPID else { return .applicationChanged }
    guard let now = focused(targetPID) else { return .currentFocusUnavailable }
    // Do NOT fall back to PID, role, title, coordinates, or AXIdentifier: these
    // cannot establish that a recreated element is the original text field.
    guard CFEqual(original, now) else { return .fieldChanged }
    return fieldStatus(now)
}

@_cdecl("hf_record") public func record(_ path: UnsafePointer<CChar>, _ epoch: UInt64, _ allowed: @convention(c) (UInt64) -> Bool) -> Bool {
    let file = String(cString: path)
    return main {
        guard allowed(epoch) else { return false }
        guard permissions() & 3 == 3, recorder == nil else { return false }
        clearTarget()
        targetPID = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
        target = focused(targetPID)
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
        do {
            let r = try AVAudioRecorder(url: URL(fileURLWithPath: file), settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 16000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false])
            r.isMeteringEnabled = true
            guard r.prepareToRecord() else { clearTarget(); return false }
            guard allowed(epoch) else { clearTarget(); return false }
            let previewWasPlaying = cue?.isPlaying == true
            cue?.stop()
            recorder = r
            audioBusy = true
            if soundsEnabled {
                if cue == nil { cue = makeCue() }
                cue?.currentTime = 0; cue?.play()
            }
            // Never block AppKit. The tail accommodates common Bluetooth output
            // buffering; unusually high-latency routes may need sound disabled.
            let delay = soundsEnabled ? StartCue.duration + 0.18 : (previewWasPlaying ? 0.18 : 0)
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                guard CuePolicy.canCapture(current: recorder === r, allowed: allowed(epoch)) else {
                    if recorder === r { r.stop(); recorder = nil; audioBusy = false; cue?.stop(); clearTarget() }
                    return
                }
                if !r.record() { recorder = nil; audioBusy = false; clearTarget(); callback?(4) }
            }
            return true
        } catch { clearTarget(); return false }
    }
}
@_cdecl("hf_stop") public func stop() {
    // Stopping capture is not cancellation: inference still needs the original
    // target. Discard explicitly only on cancel, failure, empty result, or paste.
    main { recorder?.stop(); recorder = nil; cue?.stop() }
}
@_cdecl("hf_overlay") public func overlay(_ phase: Int32) {
    main {
        audioBusy = phase == 1 || phase == 2
        overlayGeneration += 1
        let generation = overlayGeneration
        meter?.invalidate(); meter = nil
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
        pill?.setPhase(Int(phase)); pill?.level = 0; pill?.needsDisplay = true
        panel?.orderFrontRegardless()
        if phase == 1 || phase == 2 {
            meter = Timer.scheduledTimer(withTimeInterval: 1.0/30.0, repeats: true) { timer in
                guard overlayGeneration == generation else { timer.invalidate(); return }
                if phase == 1 {
                    recorder?.updateMeters()
                    let db = recorder?.averagePower(forChannel: 0) ?? -60
                    pill?.level = CGFloat(max(0, min(1, (db + 55) / 45)))
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

// Refuse to paste unless both app AND exact focused AX element still match.
// Clipboard is restored only if nobody changed it during the paste interval.
@_cdecl("hf_paste") public func paste(_ text: UnsafePointer<CChar>, _ epoch: UInt64, _ allowed: @convention(c) (UInt64) -> Bool) -> Int32 {
    let value = String(cString: text)
    return main {
        defer { clearTarget() }
        // Lock-free Rust callback: cancellation is observable even when its
        // FIFO cleanup is blocked by inference's state lock / main.sync wait.
        guard allowed(epoch) else { return PasteResult.cancelled.rawValue }
        let validation = validateTarget()
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
        let revalidation = validateTarget()
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
        let generation = board.changeCount
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 9, keyDown: true), let up = CGEvent(keyboardEventSource: nil, virtualKey: 9, keyDown: false) else {
            if board.changeCount == generation { board.clearContents(); board.writeObjects(saved) }
            return PasteResult.eventCreationFailed.rawValue
        }
        let finalValidation = validateTarget()
        guard finalValidation == .sent else {
            if board.changeCount == generation { board.clearContents(); board.writeObjects(saved) }
            return finalValidation.rawValue
        }
        down.flags = .maskCommand; up.flags = .maskCommand
        guard allowed(epoch) else {
            if board.changeCount == generation { board.clearContents(); board.writeObjects(saved) }
            return PasteResult.cancelled.rawValue
        }
        // Target the validated PID, not a global event that could reach a newly
        // frontmost app. Focus within that app still requires manual verification.
        down.postToPid(targetPID); up.postToPid(targetPID)
        schedulePasteRestore(board: board, saved: saved, generation: generation, token: token)
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
        meter?.invalidate(); meter = nil; panel?.orderOut(nil)
        if let t = tap { CGEvent.tapEnable(tap: t, enable: false); CFMachPortInvalidate(t) }
        if let s = source { CFRunLoopRemoveSource(CFRunLoopGetMain(), s, .commonModes) }
        tap = nil; source = nil
    }
}
