import Foundation
import Dispatch
import AppKit

// Exercise the actual Bridge.swift main-thread paste closure. No permissions,
// AX reads, microphone, clipboard publication, or keyboard events are reached:
// the receipt-time token is revoked while the worker waits for the main queue.
private let tokenLock = NSLock()
private var epoch: UInt64 = 7
private var checkedOnMain = false
private func permitted(_ ticket: UInt64) -> Bool {
    precondition(Thread.isMainThread, "Delivery guard must run inside main closure")
    tokenLock.lock(); defer { tokenLock.unlock() }
    checkedOnMain = true
    return ticket == epoch
}
private let resultLock = NSLock()
private var result: Int32?
private var copyResult: Int32?
let originalChangeCount = NSPasteboard.general.changeCount
private let waiting = DispatchSemaphore(value: 0)
DispatchQueue.global().async {
    waiting.signal()
    let code = "must never be delivered".withCString { paste($0, 7, permitted) }
    let copied = "must never be copied".withCString { copyFallback($0, 7, permitted) }
    resultLock.lock(); result = code; copyResult = copied; resultLock.unlock()
}
precondition(waiting.wait(timeout: .now() + 5) == .success)
// Main is deliberately not servicing its queue until after cancellation.
tokenLock.lock(); epoch = 8; tokenLock.unlock()
let deadline = Date().addingTimeInterval(5)
while Date() < deadline {
    resultLock.lock(); let done = result != nil; resultLock.unlock()
    if done { break }
    RunLoop.current.run(until: Date().addingTimeInterval(0.01))
}
precondition(result == PasteResult.cancelled.rawValue, "Cancelled delivery reached native validation/publication")
precondition(checkedOnMain, "Missing actual main-thread delivery gate")
precondition(copyResult == PasteResult.cancelled.rawValue)
precondition(NSPasteboard.general.changeCount == originalChangeCount, "Cancelled copy changed system clipboard")

// Actual publication/restore helpers on an isolated pasteboard: no system
// clipboard replacement, permissions, AX target, keyboard event, or capture.
let board = NSPasteboard.withUniqueName()
defer { board.releaseGlobally() }
func savedItem(_ text: String) -> NSPasteboardItem {
    let item = NSPasteboardItem(); item.setString(text, forType: .string); return item
}
func waitForRestore() { RunLoop.current.run(until: Date().addingTimeInterval(1.2)) }
board.setString("submitted transcript", forType: .string)
schedulePasteRestore(board: board, saved: [savedItem("old clipboard")], generation: board.changeCount)
waitForRestore()
precondition(board.string(forType: .string) == "old clipboard", "Submitted paste did not restore")
board.clearContents(); board.setString("earlier paste", forType: .string)
schedulePasteRestore(board: board, saved: [savedItem("stale snapshot")], generation: board.changeCount)
precondition(publishCopy("fallback transcript", board: board, allowed: { true }) == 0)
waitForRestore()
precondition(board.string(forType: .string) == "fallback transcript", "Old timer clobbered fallback")
cleanup()
precondition(board.string(forType: .string) == "fallback transcript", "Quit restored stale clipboard")
let unchanged = board.changeCount
precondition(publishCopy("", board: board, allowed: { true }) == 10)
precondition(publishCopy("cancelled", board: board, allowed: { false }) == 16)
precondition(board.changeCount == unchanged)
var checks = 0
precondition(publishCopy("cancel at publication", board: board, allowed: { checks += 1; return checks < 3 }) == 16)
precondition(board.string(forType: .string) == "fallback transcript", "Final guard lost previous clipboard")
print("Native queued-main cancellation boundary passed without permissions or delivery")
print("Native lasting fallback copy, sent-paste restoration, stale timer/quit and empty/cancel guards passed")

// The additive C ABI copies a bounded cached JSON snapshot, with no live AX read.
var diagnosticBuffer = [UInt8](repeating: 0x7f, count: 4096)
precondition(focusDiagnostic(nil, 4096) == 0)
precondition(diagnosticBuffer.withUnsafeMutableBufferPointer { focusDiagnostic($0.baseAddress, -1) } == 0)
precondition(diagnosticBuffer.withUnsafeMutableBufferPointer { focusDiagnostic($0.baseAddress, 1) } == 0)
precondition(diagnosticBuffer.allSatisfy { $0 == 0x7f })
let diagnosticLength = diagnosticBuffer.withUnsafeMutableBufferPointer { focusDiagnostic($0.baseAddress, Int32($0.count)) }
precondition(diagnosticLength == 2)
let diagnosticJSON = try JSONSerialization.jsonObject(with: Data(diagnosticBuffer.prefix(Int(diagnosticLength))))
precondition((diagnosticJSON as? [String: Any])?.isEmpty == true)
precondition(diagnosticBuffer[Int(diagnosticLength)] == 0x7f)
print("Native cached focus diagnostic bounded C ABI passed without AX")
