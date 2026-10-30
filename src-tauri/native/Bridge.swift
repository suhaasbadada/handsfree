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
private var recorder: AVAudioRecorder?
private var meter: Timer?
private var panel: NSPanel?
private var pill: PillView?
private var targetPID: pid_t = 0
private var target: AXUIElement?
private var overlayGeneration = 0
private var clipboardGeneration = 0
private var restoreClipboard: (() -> Void)?

private class PillView: NSView {
    var phase = 0
    var level: CGFloat = 0
    var tick: CGFloat = 0
    override func draw(_ dirtyRect: NSRect) {
        NSColor(calibratedRed: 0.08, green: 0.10, blue: 0.085, alpha: 0.97).setFill()
        NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 27, yRadius: 27).fill()
        NSColor(calibratedRed: 0.48, green: 0.60, blue: 0.40, alpha: 0.4).setStroke()
        NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 27, yRadius: 27).stroke()
        let reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        let color = phase == 1 ? NSColor(calibratedRed: 0.76, green: 0.91, blue: 0.66, alpha: 1) : NSColor.lightGray
        color.setFill()
        for i in 0..<5 {
            let wave = reduceMotion ? CGFloat(0.5) : abs(sin(tick * 0.15 + CGFloat(i) * 0.9))
            let h: CGFloat = phase == 1 ? 4 + level * 26 * (0.3 + wave * 0.7) : 5 + wave * 11
            NSBezierPath(roundedRect: NSRect(x: 24 + CGFloat(i) * 6, y: (54-h)/2, width: 3, height: h), xRadius: 1.5, yRadius: 1.5).fill()
        }
        let title = phase == 1 ? "Listening" : phase == 2 ? "Transcribing" : "Not pasted · see settings"
        (title as NSString).draw(at: NSPoint(x: 66, y: 27), withAttributes: [.font: NSFont.systemFont(ofSize: 12, weight: .medium), .foregroundColor: NSColor.white])
        let detail = phase == 1 ? "fn to finish · esc to cancel" : phase == 2 ? "On your Mac · esc to cancel" : "Open Handsfree from menu bar"
        (detail as NSString).draw(at: NSPoint(x: 66, y: 12), withAttributes: [.font: NSFont.systemFont(ofSize: 9), .foregroundColor: NSColor.gray])
    }
}

@_cdecl("hf_permissions") public func permissions() -> Int32 {
    var value: Int32 = 0
    if AVCaptureDevice.authorizationStatus(for: .audio) == .authorized { value |= 1 }
    if AXIsProcessTrusted() { value |= 2 }
    if CGPreflightListenEventAccess() { value |= 4 }
    return value
}
@_cdecl("hf_request_microphone") public func requestMicrophone() {
    AVCaptureDevice.requestAccess(for: .audio) { _ in }
}
@_cdecl("hf_request_permissions") public func requestPermissions() {
    main {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
        _ = CGRequestListenEventAccess()
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent") { NSWorkspace.shared.open(url) }
    }
}
@_cdecl("hf_keyboard") public func keyboard() {
    main { if let url = URL(string: "x-apple.systempreferences:com.apple.Keyboard-Settings.extension") { NSWorkspace.shared.open(url) } }
}

@_cdecl("hf_hook") public func hook(_ cb: @escaping @convention(c) (Int32) -> Void) -> Bool {
    main {
        callback = cb
        if tap != nil { return true }
        guard CGPreflightListenEventAccess() else { return false }
        let mask = (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue)
        tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: CGEventMask(mask), callback: { _, type, event, _ in
            if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                if let t = tap { CGEvent.tapEnable(tap: t, enable: true) }
                callback?(3)
            } else if type == .flagsChanged {
                let code = event.getIntegerValueField(.keyboardEventKeycode)
                let others: CGEventFlags = [.maskShift, .maskControl, .maskAlternate, .maskCommand]
                if !event.flags.intersection(others).isEmpty { callback?(3) }
                else if code == 63 { callback?(event.flags.contains(.maskSecondaryFn) ? 1 : 2) }
                else { callback?(3) } // Caps Lock and other modifier-only chords.
            } else if type == .keyDown {
                callback?(3)
                if event.getIntegerValueField(.keyboardEventKeycode) == 53 { callback?(4) }
            }
            return Unmanaged.passUnretained(event)
        }, userInfo: nil)
        guard let t = tap else { return false }
        source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, t, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: t, enable: true)
        return true
    }
}

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
private func editable(_ element: AXUIElement) -> Bool {
    if attribute(element, kAXSubroleAttribute) == kAXSecureTextFieldSubrole { return false }
    let role = attribute(element, kAXRoleAttribute) ?? ""
    return [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole].contains(role)
}

@_cdecl("hf_record") public func record(_ path: UnsafePointer<CChar>) -> Bool {
    let file = String(cString: path)
    return main {
        guard permissions() & 3 == 3, recorder == nil else { return false }
        targetPID = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
        target = focused(targetPID)
        do {
            let r = try AVAudioRecorder(url: URL(fileURLWithPath: file), settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 16000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false])
            r.isMeteringEnabled = true
            guard r.record() else { return false }
            recorder = r
            return true
        } catch { return false }
    }
}
@_cdecl("hf_stop") public func stop() {
    main { recorder?.stop(); recorder = nil }
}
@_cdecl("hf_overlay") public func overlay(_ phase: Int32) {
    main {
        overlayGeneration += 1
        let generation = overlayGeneration
        meter?.invalidate(); meter = nil
        if phase == 0 { panel?.orderOut(nil); return }
        if panel == nil {
            let p = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 252, height: 54), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            p.level = .floating; p.isOpaque = false; p.backgroundColor = .clear; p.hasShadow = true
            p.hidesOnDeactivate = false; p.ignoresMouseEvents = true
            p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
            let v = PillView(frame: NSRect(x: 0, y: 0, width: 252, height: 54))
            p.contentView = v; panel = p; pill = v
        }
        let screen = NSScreen.screens.first(where: { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) }) ?? NSScreen.main
        if let frame = screen?.visibleFrame { panel?.setFrameOrigin(NSPoint(x: frame.midX - 126, y: frame.minY + 24)) }
        pill?.phase = Int(phase); pill?.level = 0; pill?.needsDisplay = true
        panel?.orderFrontRegardless()
        meter = Timer.scheduledTimer(withTimeInterval: 1.0/30.0, repeats: true) { _ in
            recorder?.updateMeters()
            let db = recorder?.averagePower(forChannel: 0) ?? -60
            pill?.level = CGFloat(max(0, min(1, (db + 55) / 45)))
            pill?.tick += 1; pill?.needsDisplay = true
        }
        if phase == 3 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                if overlayGeneration == generation { overlay(0) }
            }
        }
    }
}

// Refuse to paste unless both app AND exact focused AX element still match.
// Clipboard is restored only if nobody changed it during the paste interval.
@_cdecl("hf_paste") public func paste(_ text: UnsafePointer<CChar>) -> Bool {
    let value = String(cString: text)
    return main {
        guard AXIsProcessTrusted(), targetPID != 0,
              NSWorkspace.shared.frontmostApplication?.processIdentifier == targetPID,
              let original = target, let now = focused(targetPID), CFEqual(original, now), editable(now) else { target = nil; return false }
        target = nil
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
        board.clearContents(); board.setString(value, forType: .string)
        let generation = board.changeCount
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 9, keyDown: true), let up = CGEvent(keyboardEventSource: nil, virtualKey: 9, keyDown: false) else { board.clearContents(); board.writeObjects(saved); return false }
        down.flags = .maskCommand; up.flags = .maskCommand
        down.post(tap: .cghidEventTap); up.post(tap: .cghidEventTap)
        restoreClipboard = {
            if board.changeCount == generation { board.clearContents(); board.writeObjects(saved) }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            if clipboardGeneration == token { restoreClipboard?(); restoreClipboard = nil }
        }
        return true
    }
}
@_cdecl("hf_copy") public func copyText(_ text: UnsafePointer<CChar>) {
    let value = String(cString: text)
    main { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(value, forType: .string) }
}
@_cdecl("hf_cleanup") public func cleanup() {
    main {
        restoreClipboard?(); restoreClipboard = nil
        recorder?.stop(); recorder = nil; target = nil
        meter?.invalidate(); meter = nil; panel?.orderOut(nil)
        if let t = tap { CGEvent.tapEnable(tap: t, enable: false); CFMachPortInvalidate(t) }
        if let s = source { CFRunLoopRemoveSource(CFRunLoopGetMain(), s, .commonModes) }
        tap = nil; source = nil
    }
}
