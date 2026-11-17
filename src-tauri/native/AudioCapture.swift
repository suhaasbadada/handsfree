import AVFoundation
import CoreAudio
import AudioToolbox

// Metadata only: enumeration never creates an engine or requests permission.
struct MicrophoneDevice: Codable, Equatable {
    let uid: String
    let name: String
}
enum Microphones {
    static func selectedUID(saved: String?, available: [MicrophoneDevice], defaultUID: () throws -> String?) throws -> String {
        guard let uid = try saved ?? defaultUID(), available.contains(where: { $0.uid == uid }) else {
            throw NSError(domain: "Selected microphone unavailable", code: 1)
        }
        return uid
    }
    static func property(_ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
    }
    static func checked(_ status: OSStatus) throws {
        guard status == noErr else { throw NSError(domain: "Microphone unavailable", code: Int(status)) }
    }
    static func string(_ id: AudioDeviceID, _ selector: AudioObjectPropertySelector) throws -> String {
        var address = property(selector), value: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<CFString>.size)
        try checked(AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value))
        guard let value else { throw NSError(domain: "Microphone metadata unavailable", code: 1) }
        return value.takeRetainedValue() as String
    }
    static func devices() throws -> [MicrophoneDevice] {
        var address = property(kAudioHardwarePropertyDevices), size: UInt32 = 0
        try checked(AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size))
        var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
        if ids.isEmpty { return [] }
        try ids.withUnsafeMutableBytes { bytes in
            try checked(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, bytes.baseAddress!))
        }
        return ids.compactMap { id in
            var input = property(kAudioDevicePropertyStreamConfiguration, scope: kAudioDevicePropertyScopeInput), bytes: UInt32 = 0
            guard AudioObjectGetPropertyDataSize(id, &input, 0, nil, &bytes) == noErr, bytes >= MemoryLayout<AudioBufferList>.size else { return nil }
            let data = UnsafeMutableRawPointer.allocate(byteCount: Int(bytes), alignment: MemoryLayout<AudioBufferList>.alignment)
            defer { data.deallocate() }
            guard AudioObjectGetPropertyData(id, &input, 0, nil, &bytes, data) == noErr,
                  UnsafeMutableAudioBufferListPointer(data.assumingMemoryBound(to: AudioBufferList.self)).contains(where: { $0.mNumberChannels > 0 }),
                  let uid = try? string(id, kAudioDevicePropertyDeviceUID), !uid.isEmpty,
                  let name = try? string(id, kAudioObjectPropertyName) else { return nil }
            return MicrophoneDevice(uid: uid, name: name)
        }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
    static func defaultUID() throws -> String? {
        var address = property(kAudioHardwarePropertyDefaultInputDevice), id = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        try checked(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &id))
        return id == 0 ? nil : try string(id, kAudioDevicePropertyDeviceUID)
    }
    static func resolve(_ uid: String?) throws -> AudioDeviceID {
        let uid = try selectedUID(saved: uid, available: devices(), defaultUID: defaultUID)
        var address = property(kAudioHardwarePropertyTranslateUIDToDevice), id = AudioDeviceID(0)
        let value = uid as CFString
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        try withUnsafePointer(to: value) { pointer in
            try checked(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, UInt32(MemoryLayout<CFString>.size), pointer, &size, &id))
        }
        guard id != 0 else { throw NSError(domain: "Selected microphone unavailable", code: 2) }
        return id
    }
}

// Injectable production ordering contract; synthetic tests never open hardware.
enum MicrophoneBinding {
    static func prepare<T>(resolve: () throws -> AudioDeviceID, bind: (AudioDeviceID) throws -> Void, format: () throws -> T) throws -> (AudioDeviceID, T) {
        let id = try resolve()
        try bind(id)
        return (id, try format())
    }
    static func revalidate(expected: AudioDeviceID, resolve: () throws -> AudioDeviceID) throws {
        guard try resolve() == expected else { throw NSError(domain: "Microphone changed before capture", code: 1) }
    }
}

typealias AudioSink = @convention(c) (UInt64, UInt64, UnsafePointer<Float>?, Int32) -> Void

// Hardware-rate tap -> owned bounded buffers -> one persistent converter.
// No files, inference, AppKit calls, or Rust callbacks on the realtime tap.
final class CapturePipeline {
    private let queue = DispatchQueue(label: "handsfree.capture.converter")
    private let slots = DispatchSemaphore(value: 128)
    private let converter: AVAudioConverter
    private let inputFormat: AVAudioFormat
    private let output: AVAudioFormat
    var convertedFormat: AVAudioFormat { output }
    private let sink: (UnsafePointer<Float>?, Int32) -> Void
    // A dedicated producer gate, never held across conversion/inference/AppKit calls.
    // Closing it makes the enqueue -> EOS barrier valid even for an in-flight tap.
    private let producer = NSLock()
    private var accepting = true
    private var enabled: Bool
    private var failed = false // conversion queue only
    private var db: Float = -60 // conversion queue only
    init(input: AVAudioFormat, enabled: Bool = true, sink: @escaping (UnsafePointer<Float>?, Int32) -> Void) throws {
        self.sink = sink
        self.enabled = enabled
        inputFormat = input
        guard input.sampleRate.isFinite, input.sampleRate > 0, input.channelCount > 0,
              let output = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false),
              let converter = AVAudioConverter(from: input, to: output) else {
            throw NSError(domain: "HandsFree capture format", code: 1)
        }
        // AVAudioConverter otherwise selects channel zero for stereo -> mono,
        // silently losing speech present only on the right input channel.
        converter.downmix = true
        self.output = output; self.converter = converter
    }
    func enqueue(_ buffer: AVAudioPCMBuffer) {
        producer.lock(); defer { producer.unlock() }
        guard accepting && enabled else { return }
        guard buffer.format == inputFormat else { accepting = false; queue.async { self.fail() }; return }
        guard slots.wait(timeout: .now()) == .success else {
            accepting = false; queue.async { self.fail() }; return
        }
        guard let owned = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength) else {
            accepting = false; slots.signal(); queue.async { self.fail() }; return
        }
        owned.frameLength = buffer.frameLength
        let source = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
        let destination = UnsafeMutableAudioBufferListPointer(owned.mutableAudioBufferList)
        for i in 0..<source.count {
            if let src = source[i].mData, let dst = destination[i].mData {
                memcpy(dst, src, Int(source[i].mDataByteSize))
            }
        }
        queue.async { defer { self.slots.signal() }; self.convert(owned, final: false) }
    }
    private func fail() {
        guard !failed else { return }; failed = true
        sink(nil, -1)
    }
    private func convert(_ input: AVAudioPCMBuffer?, final: Bool) {
        guard !failed else { return }
        var supplied = false
        while true {
            guard let buffer = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: 4096) else { fail(); return }
            var error: NSError?
            let status = converter.convert(to: buffer, error: &error) { _, status in
                if let input = input, !supplied { supplied = true; status.pointee = .haveData; return input }
                status.pointee = final ? .endOfStream : .noDataNow; return nil
            }
            if error != nil || status == .error { fail(); return }
            if buffer.frameLength > 0, let data = buffer.floatChannelData?[0] {
                let n = Int(buffer.frameLength)
                var power: Float = 0
                for i in 0..<n { power += data[i] * data[i] }
                db = 10 * log10(max(0.000000001, power / Float(n)))
                sink(data, Int32(n))
            }
            if status == .endOfStream || status == .inputRanDry { return }
        }
    }
    func close() { producer.lock(); accepting = false; producer.unlock() }
    func enable() { producer.lock(); enabled = true; producer.unlock() }
    // Startup has no accepted audio. The Bridge's startup catch owns its one
    // generation/epoch error; do not emit another failure or a final PCM tail.
    func discardStartup() { close(); queue.sync { failed = true } }
    @discardableResult func drain(failed: Bool = false) -> Bool {
        close()
        return queue.sync {
            if failed { self.fail() }
            self.convert(nil, final: true); return !self.failed
        }
    }
    func captureFailed(beforeFailure: (() -> Void)? = nil) {
        producer.lock(); defer { producer.unlock() }
        guard accepting else { return }
        accepting = false; queue.async { beforeFailure?(); self.fail() }
    }
    func level() -> Float { queue.sync { db } }
}

// Serial-owner lifecycle with an independently locked route revision: engine
// notifications can arrive on any thread, including during install/prepare/start.
// Tests inject these same operations without constructing an AVAudioEngine.
final class CaptureStartup {
    enum PreparationFailure: Error { case initialConfigurationChange }
    struct Operations {
        var observe: (@escaping () -> Void) -> () -> Void
        var validate: () throws -> Void
        var format: () throws -> AVAudioFormat
        var outputFormat: () throws -> AVAudioFormat
        var install: (AVAudioFormat, CapturePipeline) throws -> Void
        var prepare: () throws -> Void
        var start: () throws -> Void
        var stop: () throws -> Void
        var remove: () throws -> Void
        var running: () throws -> Bool = { true }
    }
    private let operations: Operations
    private let sink: (UnsafePointer<Float>?, Int32) -> Void
    private let routeLock = NSLock()
    private var invalidated = false
    private var revoked = false
    private var initialConfigurationChange = false
    private var negotiating = false
    private(set) var cleanupHealthy = true
    private var pipeline: CapturePipeline?
    private var unobserve: (() -> Void)?
    private var tapAttempted = false
    private var attempted = false
    private var starting = false // hardware owner; defer reentrant teardown until adapter returns
    private var drained = false
    private var negotiatedFormat: AVAudioFormat?
    private var configurationRevision: UInt64 = 0
    private var accepted = false
    private var drainHealthy = false
    private var drainCertified = false
    var routeFailed: (() -> Void)?
    var validationRequested: (() -> Void)?
    private(set) var started = false
    init(operations: Operations, sink: @escaping (UnsafePointer<Float>?, Int32) -> Void) {
        self.operations = operations; self.sink = sink
    }
    private func invalidate() {
        routeLock.lock()
        guard !revoked else { routeLock.unlock(); return }
        // A notification is not proof of changed hardware. Only the serial
        // owner reads OS facts; all live notifications advance its revision.
        if started && !drainCertified {
            configurationRevision &+= 1
            let request = accepted ? validationRequested : nil
            if !accepted || request != nil {
                routeLock.unlock()
                request?() // Never acquire the session lock while holding routeLock.
                return
            }
            // Legacy standalone startup has no session validator: fail closed.
        }
        invalidated = true
        // Profile negotiation can notify anywhere from observer installation to
        // startup commit, not only inside prepare(). Revocation never grants retry.
        if negotiating && !started && !revoked { initialConfigurationChange = true }
        let deferFailure = negotiating && !started
        // Linearize route failure with startup commit and stop. These producer
        // methods only close/enqueue; they never call a sink under routeLock.
        // Also deliver the cause before the converter's generic failure sink if
        // its queue wins the race with the synchronous notification disposition.
        if started { pipeline?.captureFailed(beforeFailure: routeFailed) } else { pipeline?.close() }
        routeLock.unlock()
        if !deferFailure { routeFailed?() }
    }
    private func check() throws {
        routeLock.lock(); defer { routeLock.unlock() }
        try checkLocked()
    }
    // Call under routeLock, including the final startup commit, so a late
    // notification gets the same typed classification as an earlier checkpoint.
    private func checkLocked() throws {
        if invalidated && initialConfigurationChange && !revoked { throw PreparationFailure.initialConfigurationChange }
        guard !invalidated else { throw NSError(domain: "Microphone changed during capture startup", code: 1) }
    }
    private func checkFormats(_ format: AVAudioFormat) throws {
        let hardware = try operations.format(), output = try operations.outputFormat()
        try check() // a notification during format reads still belongs to precommit negotiation
        guard hardware == format, output == format else {
            throw NSError(domain: "Microphone hardware/output/tap format changed", code: 1)
        }
    }
    func start(acceptAudio: Bool = true, negotiate: Bool = false) throws {
        guard !attempted else { throw NSError(domain: "Capture startup already retired", code: 1) }
        attempted = true
        starting = true
        routeLock.lock(); negotiating = negotiate; routeLock.unlock()
        defer { starting = false }
        unobserve = operations.observe { [weak self] in self?.invalidate() }
        do {
            try check()
            try operations.validate()
            try check()
            let format = try operations.format() // fresh after engine-local device binding
            negotiatedFormat = format
            try check()
            let pipeline = try CapturePipeline(input: format, enabled: false, sink: sink)
            routeLock.lock(); self.pipeline = pipeline; routeLock.unlock()
            try check()
            tapAttempted = true // installation may throw after partially attaching
            try operations.install(format, pipeline)
            try check()
            try checkFormats(format)
            // A thrown generic/ObjC failure is never negotiation authority,
            // even when a configuration notification was also observed.
            try operations.prepare()
            try check()
            try checkFormats(format)
            do {
                try operations.start()
                try check() // classify observed negotiation before stale-format errors
                try operations.validate()
                try check()
                try checkFormats(format)
                routeLock.lock()
                defer { routeLock.unlock() }
                try checkLocked()
                started = true; if acceptAudio { accepted = true; pipeline.enable() }
            } catch PreparationFailure.initialConfigurationChange {
                throw PreparationFailure.initialConfigurationChange
            } catch let error as AudioStageFailure {
                throw error
            } catch {
                throw AudioStageFailure("input_start", error)
            }
        } catch {
            starting = false
            pipeline?.discardStartup()
            stop()
            throw error
        }
    }
    func validatePrepared(acceptAudio: Bool = false) throws {
        routeLock.lock()
        let revision = configurationRevision
        let live = started && !invalidated && !revoked && !drained
        routeLock.unlock()
        guard live else { throw NSError(domain: "Capture retired", code: 1) }
        try operations.validate()
        guard let format = negotiatedFormat else { throw NSError(domain: "Capture not prepared", code: 1) }
        try checkFormats(format)
        guard try operations.running() else { throw NSError(domain: "Input engine stopped before acceptance", code: 1) }
        routeLock.lock(); defer { routeLock.unlock() }
        guard started && !invalidated && !revoked && !drained && configurationRevision == revision else {
            throw NSError(domain: "Input configuration changed during validation", code: 1)
        }
        if acceptAudio { accepted = true; pipeline?.enable() }
    }
    func enable() throws { try validatePrepared(acceptAudio: true) }
    // OS reads happen on the owner, outside locks. The returned short closure is
    // invoked under the session lock: session -> route -> producer is the only
    // lock order. It certifies the revision and session drain in one boundary.
    func prepareValidationCertificate(draining: Bool = false) throws -> () -> Bool {
        routeLock.lock()
        let revision = configurationRevision
        let live = started && accepted && (draining ? drained && drainHealthy : !drained) && !invalidated && !revoked && !drainCertified
        routeLock.unlock()
        guard live, let format = negotiatedFormat else { throw NSError(domain: "Capture not live for certification", code: 1) }
        try operations.validate()
        try checkFormats(format)
        guard try operations.running() else { throw NSError(domain: "Input engine stopped during capture", code: 1) }
        return { [self] in
            routeLock.lock(); defer { routeLock.unlock() }
            guard started && accepted && (draining ? drained && drainHealthy : !drained) && !invalidated && !revoked && !drainCertified,
                  configurationRevision == revision else { return false }
            if draining { drainCertified = true }
            return true
        }
    }
    func prepareDrainCertificate() throws -> () -> Bool { try prepareValidationCertificate(draining: true) }
    // Close the producer and drain transcription while keeping the established
    // input/output route alive for the end cue. No cue-period PCM is copied.
    func closeAndDrain() -> Bool {
        guard started && !drained else { return false }
        drained = true
        drainHealthy = pipeline?.drain() ?? false
        return drainHealthy
    }
    func closeAcceptance() {
        routeLock.lock(); pipeline?.close(); routeLock.unlock()
    }
    func revoke() {
        routeLock.lock(); revoked = true; invalidated = true; pipeline?.close(); routeLock.unlock()
    }
    @discardableResult func stop() -> Bool {
        // Also tombstones reentrant cancellation during a pending startup.
        routeLock.lock(); let wasStarted = started; started = false; revoked = true
        invalidated = true; let pipeline = pipeline; routeLock.unlock()
        pipeline?.close()
        // Never stop/remove underneath a reentrant AV install/prepare/start.
        // Its caller sees the tombstone and completes teardown in startup catch.
        if starting { return false }
        unobserve?(); unobserve = nil
        var healthy = true
        if tapAttempted {
            // Both operations must be attempted even if one raises an exception.
            do { try operations.stop() } catch { healthy = false }
            do { try operations.remove() } catch { healthy = false }
            tapAttempted = false
        }
        let result = drained ? healthy : (pipeline?.drain(failed: !healthy) ?? true)
        cleanupHealthy = cleanupHealthy && healthy
        drained = true
        return wasStarted && healthy && result
    }
    func level() -> Float { pipeline?.level() ?? -60 }
    var inputFormat: AVAudioFormat? { negotiatedFormat }
    var convertedFormat: AVAudioFormat? { pipeline?.convertedFormat }
}

// One preparation transaction, not a recording retry. The engine/binding stay
// owned by the same session; only the retired observer, tap and converter change.
// Cancellation is a permanent fact across attempt replacement.
final class CapturePreparation {
    private let lock = NSLock()
    private let make: () -> CaptureStartup
    private(set) var current: CaptureStartup
    private var closed = false
    private(set) var attempts = 0
    private(set) var initialRate: Double = 0
    private(set) var initialConfigChange = false
    var routeFailed: (() -> Void)? {
        didSet { wire(current) }
    }
    var validationRequested: (() -> Void)? {
        didSet { wire(current) }
    }
    init(make: @escaping () -> CaptureStartup) { self.make = make; current = make(); wire(current) }
    private func wire(_ attempt: CaptureStartup) {
        attempt.routeFailed = { [weak self, weak attempt] in
            guard let self, let attempt else { return }
            self.lock.lock(); let active = !self.closed && self.current === attempt; self.lock.unlock()
            if active { self.routeFailed?() }
        }
        attempt.validationRequested = validationRequested == nil ? nil : { [weak self, weak attempt] in
            guard let self, let attempt else { return }
            self.lock.lock(); let active = !self.closed && self.current === attempt; self.lock.unlock()
            if active { self.validationRequested?() }
        }
    }
    func revoke() {
        lock.lock(); closed = true; current.revoke(); lock.unlock()
    }
    private func check(_ allowed: () -> Bool) throws {
        lock.lock(); let live = !closed; lock.unlock()
        guard live && allowed() else { throw NSError(domain: "Capture preparation revoked", code: 1) }
    }
    func prepare(allowed: () -> Bool) throws {
        try check(allowed)
        attempts = 1
        do { try current.start(acceptAudio: false, negotiate: true) }
        catch CaptureStartup.PreparationFailure.initialConfigurationChange {
            initialConfigChange = true; initialRate = current.inputFormat?.sampleRate ?? 0
            guard current.cleanupHealthy else { throw NSError(domain: "Initial configuration cleanup failed", code: 1) }
            try check(allowed)
            let replacement = make() // constructs only the controller, no hardware effects
            lock.lock()
            guard !closed else { lock.unlock(); throw NSError(domain: "Capture preparation revoked", code: 1) }
            current = replacement; wire(replacement)
            lock.unlock()
            try check(allowed)
            attempts = 2
            try current.start(acceptAudio: false, negotiate: true)
        }
        try check(allowed)
    }
}

private func captureChecked(_ error: Error?) throws {
    if let error { throw error }
}
private func makeAudioEngine() throws -> AVAudioEngine {
    var engine: AVAudioEngine?
    try captureChecked(HFAudioEngineCreate(&engine))
    guard let engine else { throw NSError(domain: "Audio engine unavailable", code: 1) }
    return engine
}
private func makeAudioPlayer() throws -> AVAudioPlayerNode {
    var player: AVAudioPlayerNode?
    try captureChecked(HFAudioPlayerCreate(&player))
    guard let player else { throw NSError(domain: "Cue player unavailable", code: 1) }
    return player
}

// Never retain OS descriptions (which can contain device names/UIDs).
struct AudioStageFailure: Error {
    let stage: String
    let domain: String
    let code: Int
    let exceptionName: String?
    init(_ stage: String, _ error: Error) {
        let ns = error as NSError
        self.stage = stage
        domain = String(ns.domain.prefix(64).map { $0.isASCII && ($0.isLetter || $0.isNumber || " ._-".contains($0)) ? $0 : "_" })
        code = ns.code
        exceptionName = ns.domain == "HandsFree capture exception" ? "NSException" : nil
    }
}
func audioStage<T>(_ stage: String, _ action: () throws -> T) throws -> T {
    do { return try action() }
    catch let error as AudioStageFailure { throw error }
    catch { throw AudioStageFailure(stage, error) }
}

final class AudioCapture {
    let generation: UInt64
    let epoch: UInt64
    let frozenUID: String
    // Weak lifetime observations only; never exposes control of the engine.
    var observedEngine: AnyObject { engine }
    private let engine: AVAudioEngine
    private let preparation: CapturePreparation
    private var startup: CaptureStartup { preparation.current }
    init(generation: UInt64, epoch: UInt64, microphoneUID: String? = nil, sink: @escaping (UInt64, UInt64, UnsafePointer<Float>?, Int32) -> Void) throws {
        self.generation = generation; self.epoch = epoch
        let engine = try makeAudioEngine()
        self.engine = engine
        var constructed = false
        defer { if !constructed { _ = HFCaptureStop(engine) } }
        var boundInput: AVAudioInputNode?
        let (device, _) = try MicrophoneBinding.prepare(resolve: { try Microphones.resolve(microphoneUID) }, bind: { id in
            try captureChecked(HFCaptureBindInput(engine, id, &boundInput))
        }, format: { () })
        let frozenUID = try Microphones.string(device, kAudioDevicePropertyDeviceUID)
        self.frozenUID = frozenUID
        guard let input = boundInput else { throw NSError(domain: "Microphone input unavailable", code: 1) }
        preparation = CapturePreparation { CaptureStartup(operations: .init(observe: { changed in
            let observer = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { _ in changed() }
            return { NotificationCenter.default.removeObserver(observer) }
        }, validate: {
            try MicrophoneBinding.revalidate(expected: device, resolve: { try Microphones.resolve(microphoneUID) })
            guard try Microphones.string(device, kAudioDevicePropertyDeviceUID) == frozenUID else {
                throw NSError(domain: "Microphone identity changed", code: 1)
            }
            var actual = AudioDeviceID(0)
            try captureChecked(HFCaptureInputDevice(input, &actual))
            try MicrophoneBinding.revalidate(expected: device, resolve: { actual })
        }, format: {
            var format: AVAudioFormat?
            try captureChecked(HFCaptureFormat(input, &format))
            guard let format else { throw NSError(domain: "Microphone format unavailable", code: 1) }
            return format
        }, outputFormat: {
            var format: AVAudioFormat?
            try captureChecked(HFCaptureOutputFormat(input, &format))
            guard let format else { throw NSError(domain: "Microphone output format unavailable", code: 1) }
            return format
        }, install: { format, pipeline in
            try captureChecked(HFCaptureInstall(input, format) { buffer, _ in pipeline.enqueue(buffer) })
        }, prepare: { try audioStage("input_prepare") { try captureChecked(HFCapturePrepare(engine)) } },
           start: { try audioStage("input_start") { try captureChecked(HFCaptureStart(engine)) } },
           stop: { try captureChecked(HFCaptureStop(engine)) },
           remove: { try captureChecked(HFCaptureRemove(input)) }, running: {
               var running = ObjCBool(false)
               try captureChecked(HFCaptureRunning(engine, &running))
               return running.boolValue
           })) { data, count in
            sink(generation, epoch, data, count)
        } }
        constructed = true
    }
    func start() throws {
        try startup.start()
    }
    func prepareSession(allowed: () -> Bool = { true }) throws { try preparation.prepare(allowed: allowed) }
    func enable() throws { try startup.enable() }
    func validatePrepared() throws { try startup.validatePrepared() }
    func closeAndDrain() -> Bool { startup.closeAndDrain() }
    func prepareDrainCertificate() throws -> () -> Bool { try startup.prepareDrainCertificate() }
    func prepareValidationCertificate() throws -> () -> Bool { try startup.prepareValidationCertificate() }
    func closeAcceptance() { startup.closeAcceptance() }
    func revoke() { preparation.revoke() }
    var routeFailed: (() -> Void)? {
        get { preparation.routeFailed }
        set { preparation.routeFailed = newValue }
    }
    var validationRequested: (() -> Void)? {
        get { preparation.validationRequested }
        set { preparation.validationRequested = newValue }
    }
    func formatMetadata() -> [String: Double] {
        var result: [String: Double] = [:]
        result["negotiationAttempts"] = Double(preparation.attempts)
        if let format = startup.convertedFormat {
            result["convertedRate"] = format.sampleRate
            result["convertedChannels"] = Double(format.channelCount)
        }
        if preparation.initialConfigChange {
            result["initial_config_change"] = 1
            result["initialInputRate"] = preparation.initialRate
        }
        if let input = startup.inputFormat {
            result["inputRate"] = input.sampleRate; result["inputChannels"] = Double(input.channelCount)
        }
        return result
    }
    @discardableResult func stop() -> Bool {
        preparation.revoke()
        return startup.stop()
    }
    func level() -> Float { startup.level() }
    var isRecording: Bool { startup.started }
}

// An output-only engine: never touch inputNode, set a device, or change a rate.
// Created only AFTER accepted input has closed and drained on normal Finish.
final class SessionCueOutput {
    private let engine: AVAudioEngine
    private let player: AVAudioPlayerNode
    private let uid: String
    private let format: AVAudioFormat
    private var observer: NSObjectProtocol?
    private var outputFormat: AVAudioFormat?
    static func defaultDevice() throws -> AudioDeviceID {
        var address = Microphones.property(kAudioHardwarePropertyDefaultOutputDevice)
        var id = AudioDeviceID(0), size = UInt32(MemoryLayout<AudioDeviceID>.size)
        try Microphones.checked(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &id))
        guard id != 0 else { throw NSError(domain: "Output unavailable", code: 1) }
        return id
    }
    // Shared read-only identity check; never resolve a replacement default UID.
    static func validateIdentity(_ frozenUID: String, current: () throws -> String) throws {
        guard !frozenUID.isEmpty, try current() == frozenUID else {
            throw NSError(domain: "Output route changed", code: 1)
        }
    }
    init(format: AVAudioFormat, volume: Float, frozenUID: String) throws {
        self.format = format
        uid = frozenUID
        try Self.validateIdentity(uid) {
            try Microphones.string(Self.defaultDevice(), kAudioDevicePropertyDeviceUID)
        }
        engine = try makeAudioEngine()
        player = try makeAudioPlayer()
        var constructed = false
        defer { if !constructed { _ = HFCueStop(player); _ = HFCaptureStop(engine) } }
        try captureChecked(HFCueConnect(engine, player, format))
        try captureChecked(HFCueVolume(player, volume))
        constructed = true
    }
    private func validate() throws {
        let expected = try Self.defaultDevice()
        try Self.validateIdentity(uid) {
            try Microphones.string(expected, kAudioDevicePropertyDeviceUID)
        }
        var actual = AudioDeviceID(0)
        try captureChecked(HFCueOutputDevice(engine, &actual))
        guard actual == expected else { throw NSError(domain: "Output route mismatch", code: 1) }
        var current: AVAudioFormat?
        try captureChecked(HFCueOutputFormat(engine, &current))
        guard let current, current.sampleRate.isFinite, current.sampleRate > 0, current.channelCount > 0,
              outputFormat == nil || outputFormat == current else {
            throw NSError(domain: "Output format changed", code: 1)
        }
        outputFormat = current
    }
    func operations(routeFailure: @escaping () -> Void, cleanup: ((Bool) -> Void)? = nil) -> SessionAudioOwner.Output {
        .init(prepare: {
            self.observer = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: self.engine, queue: nil) { _ in routeFailure() }
            try audioStage("output_prepare") {
                try self.validate()
                try captureChecked(HFCapturePrepare(self.engine))
            }
            try audioStage("output_start") { try captureChecked(HFCaptureStart(self.engine)); try self.validate() }
        }, play: { buffer, allowed, completion in
            try Self.playIfAllowed(validate: { try self.validate() }, allowed: allowed) {
                try captureChecked(HFCuePlay(self.player, buffer, completion))
            }
        }, stopCue: { if HFCueStop(self.player) != nil { cleanup?(false) } }, stop: {
            if let observer = self.observer { NotificationCenter.default.removeObserver(observer); self.observer = nil }
            let cueError = HFCueStop(self.player)
            let engineError = HFCaptureStop(self.engine)
            cleanup?(cueError == nil && engineError == nil)
        }, formats: {
            guard let output = self.outputFormat else { return [:] }
            return ["outputRate": output.sampleRate, "outputChannels": Double(output.channelCount), "cueRate": self.format.sampleRate]
        })
    }
    static func playIfAllowed(validate: () throws -> Void, allowed: () -> Bool, play: () throws -> Void) throws {
        try validate()
        guard allowed() else { return }
        try play()
    }
}

// Production partial-start owner, injectable without constructing any hardware.
// Completion output is deferred until accepted input has closed and drained.
final class SessionAudioOwner {
    struct Output {
        var prepare: () throws -> Void
        var play: (AVAudioPCMBuffer, () -> Bool, @escaping () -> Void) throws -> Void
        var stopCue: () -> Void
        var stop: () -> Void
        var formats: () -> [String: Double]
    }
    private let input: AudioSession.Operations
    private let makeOutput: (() throws -> Output)?
    private let cue: (Bool) throws -> AVAudioPCMBuffer?
    private var output: Output?
    private var completionAllowed: () -> Bool = { false }
    init(input: AudioSession.Operations, makeOutput: (() throws -> Output)?, cue: @escaping (Bool) throws -> AVAudioPCMBuffer?) {
        self.input = input; self.makeOutput = makeOutput; self.cue = cue
    }
    func operations() -> AudioSession.Operations {
        .init(prepare: {
            try audioStage("input_prepare") { try self.input.prepare() }
            try audioStage("input_configuration") { try self.input.validatePrepared?() }
        }, enable: { try audioStage("input_revalidate") { try self.input.enable() } },
        close: { self.input.close() }, drain: { self.input.drain() },
        play: { ending, completed in
            guard ending else { throw NSError(domain: "Start cues are disabled", code: 1) }
            guard let output = self.output, let pcm = try self.cue(ending) else { throw NSError(domain: "Cue unavailable", code: 1) }
            try audioStage("end_cue") { try output.play(pcm, self.completionAllowed, completed) }
        }, stopCue: { self.output?.stopCue() }, stop: {
            self.input.close()
            _ = self.input.drain()
            self.output?.stop(); self.output = nil
            self.input.stop()
        }, level: { self.input.level() }, outputRate: { self.output?.formats()["outputRate"] ?? 0 },
        cancel: { (self.input.cancel ?? self.input.close)() }, formats: {
            self.input.formats().merging(self.output?.formats() ?? [:]) { _, output in output }
        }, prepareCompletion: { allowed in
            self.completionAllowed = allowed
            guard allowed() else { return }
            if let make = self.makeOutput {
                self.output = try audioStage("output_create", make)
                guard allowed() else { return }
                try audioStage("output_prepare") { try self.output?.prepare() }
            }
        }, prepareDrainCertificate: self.input.prepareDrainCertificate,
        prepareValidationCertificate: self.input.prepareValidationCertificate)
    }
}

// Shared production/test barrier: producer closed, engine stopped, tap removed,
// converter drained BEFORE playback. Cancellation is rechecked after draining.
enum CaptureEnd {
    static func finish(stop: () -> Bool, allowed: () -> Bool, play: () -> Void) {
        let captured = stop()
        if captured && allowed() { play() }
    }
}

// Only the approved, uncompressed mono assets are decoded. No audio files are
// created; playback belongs to the admitted session's optional output owner.
enum SessionCuePCM {
    static func decode(_ data: Data) throws -> AVAudioPCMBuffer {
        let bytes = [UInt8](data)
        func u16(_ offset: Int) -> Int { Int(bytes[offset]) | Int(bytes[offset + 1]) << 8 }
        func u32(_ offset: Int) -> Int { u16(offset) | u16(offset + 2) << 16 }
        guard bytes.count >= 44, String(bytes: bytes[0..<4], encoding: .ascii) == "RIFF",
              String(bytes: bytes[8..<16], encoding: .ascii) == "WAVEfmt ",
              u32(16) == 16, u16(20) == 1, u16(22) == 1, u32(24) == 48000,
              u16(34) == 16, String(bytes: bytes[36..<40], encoding: .ascii) == "data",
              u32(40) == bytes.count - 44, u32(40) > 0, u32(40) <= 48000,
              u32(40) % 2 == 0,
              let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1),
              let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(u32(40) / 2)) else {
            throw NSError(domain: "Invalid bundled cue PCM", code: 1)
        }
        pcm.frameLength = pcm.frameCapacity
        for frame in 0..<Int(pcm.frameLength) {
            pcm.floatChannelData![0][frame] = Float(Int16(bitPattern: UInt16(u16(44 + frame * 2)))) / 32768
        }
        return pcm
    }
}

// Small session controller, also used with synthetic operations in tests. All
// hardware operations run on its serial owner, never AppKit/main or the tap.
// The lock protects only cancellation/observation and the producer-close handle.
final class AudioSession {
    struct Operations {
        var prepare: () throws -> Void
        var enable: () throws -> Void
        var close: () -> Void
        var drain: () -> Bool
        var play: (Bool, @escaping () -> Void) throws -> Void
        var stopCue: () -> Void
        var stop: () -> Void
        var level: () -> Float
        var outputRate: () -> Double
        var cancel: (() -> Void)? = nil
        var formats: () -> [String: Double] = { [:] }
        var validatePrepared: (() throws -> Void)? = nil
        var prepareCompletion: ((_ allowed: @escaping () -> Bool) throws -> Void)? = nil
        var prepareDrainCertificate: (() throws -> (() -> Bool))? = nil
        var prepareValidationCertificate: (() throws -> (() -> Bool))? = nil
    }
    struct Observation: Codable {
        var reason = "starting"
        var audioReady = false
        var outputRate: Double = 0
        var formats: [String: Double] = [:]
        var events: [Event] = []
        var failureStage: String?
        var failureDomain: String?
        var failureCode: Int?
        var failureException: String?
    }
    struct Event: Codable {
        let name: String
        let milliseconds: Double
    }
    let generation: UInt64
    let epoch: UInt64
    private let queue = DispatchQueue(label: "handsfree.audio.session")
    private let lock = NSLock()
    private let origin = DispatchTime.now().uptimeNanoseconds
    private var cancelled = false
    private var captureFailed = false
    private var failureReported = false
    private var released = false
    private var firstPCM = false
    private enum StartupDeadline { case hardware, handoff }
    private var startupDeadline: StartupDeadline? = .hardware
    private var startRequested = false
    // Facts, not diagnostic strings: release closes admission, not the right to
    // report a failure of PCM already accepted by this generation.
    private var captureAccepted = false
    private var producerDrained = false
    private var validationTicket: UInt64 = 0
    private var validationPending = false
    private var completionExpired = false
    private var completionFailed = false
    private var cachedLevel: Float = -60
    private var levelPending = false
    private let retirement = DispatchGroup()
    private var closeProducer: (() -> Void)?
    private var observation = Observation()
    private var operations: Operations? // owner queue only
    private var cueTicket: UInt64 = 0
    private var terminal = false
    private var finishing = false
    private let authorized: () -> Bool
    private let epochAllowed: () -> Bool
    private let sounds: Bool
    private let failure: () -> Void
    private let retired: (AudioSession) -> Void
    private let scheduler: ((Double, @escaping () -> Void) -> Void)?
    init(generation: UInt64, epoch: UInt64, sounds: Bool, authorized: @escaping () -> Bool, epochAllowed: @escaping () -> Bool = { true },
         failure: @escaping () -> Void, retired: @escaping (AudioSession) -> Void = { _ in },
         scheduler: ((Double, @escaping () -> Void) -> Void)? = nil) {
        self.generation = generation; self.epoch = epoch; self.sounds = sounds
        self.authorized = authorized; self.failure = failure; self.retired = retired
        self.epochAllowed = epochAllowed
        self.scheduler = scheduler
        retirement.enter()
    }
    private func mark(_ name: String, ready: Bool = false) {
        lock.lock(); defer { lock.unlock() }
        markLocked(name, ready: ready)
    }
    private func markLocked(_ name: String, ready: Bool = false) {
        observation.reason = name; observation.audioReady = ready && !cancelled && !captureFailed
        if observation.audioReady { startupDeadline = nil; captureAccepted = true }
        if observation.events.count < 24 {
            observation.events.append(Event(name: name, milliseconds: Double(DispatchTime.now().uptimeNanoseconds - origin) / 1_000_000))
        }
    }
    func snapshot() -> Observation { lock.lock(); defer { lock.unlock() }; return observation }
    private func recordFailure(_ error: Error, stage: String) {
        let first = (error as? AudioStageFailure) ?? AudioStageFailure(stage, error)
        lock.lock(); defer { lock.unlock() }
        recordFailureLocked(first)
    }
    private func recordFailureLocked(_ first: AudioStageFailure) {
        guard !cancelled && !released && observation.failureStage == nil else { return }
        observation.failureStage = first.stage
        observation.failureDomain = first.domain
        observation.failureCode = first.code
        observation.failureException = first.exceptionName
    }
    // Owner queue only. Preserve available route metadata even when an async
    // callback invalidated startup before route_ready could be published.
    private func snapshotFormats() {
        let formats = operations?.formats() ?? [:]
        lock.lock(); defer { lock.unlock() }
        observation.formats = formats
        observation.outputRate = formats["outputRate"] ?? 0
    }
    func configurationFailure(_ stage: String) {
        recordFailure(NSError(domain: "Audio configuration notification", code: 1), stage: stage)
        captureFailure()
    }
    // PCM remains provisional while read-only certification is pending. Failed
    // certification rejects the entire transcription, including already queued PCM.
    func inputConfigurationChanged() {
        lock.lock()
        guard !cancelled && !released && !captureFailed && !producerDrained && !validationPending else { lock.unlock(); return }
        validationPending = true; validationTicket &+= 1
        let ticket = validationTicket
        lock.unlock()
        let deadline = { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let expired = self.validationPending && self.validationTicket == ticket && !self.cancelled && !self.released && !self.captureFailed && !self.producerDrained
            if expired {
                self.recordFailureLocked(AudioStageFailure("input_validation_timeout", NSError(domain: "Input validation deadline", code: 1)))
                self.validationPending = false; self.captureFailed = true; self.observation.audioReady = false
                self.closeProducer?()
            }
            self.lock.unlock()
            if expired { self.reportFailure(startGateRequired: false); self.queue.async { self.teardown("failed") } }
        }
        if let scheduler { scheduler(3, deadline) }
        else { DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 3, execute: deadline) }
        queue.async { [self] in
            lock.lock()
            let live = validationPending && validationTicket == ticket && !producerDrained && !cancelled && !captureFailed && !released
            lock.unlock()
            guard live else { return }
            do {
                guard let validate = operations?.prepareValidationCertificate else { throw NSError(domain: "Input validator unavailable", code: 1) }
                let certify = try validate() // No enable, retry, restart, or producer reopening.
                lock.lock()
                let live = validationPending && validationTicket == ticket && !producerDrained && !cancelled && !captureFailed && !released
                let certified = live && certify()
                if certified { validationPending = false }
                lock.unlock()
                if live && !certified { throw NSError(domain: "Input configuration changed during validation", code: 1) }
            } catch {
                lock.lock(); let live = !producerDrained && !cancelled && !released && !captureFailed; lock.unlock()
                if live { recordFailure(error, stage: "input_configuration"); captureFailure() }
            }
        }
    }
    private func valid() -> Bool {
        lock.lock(); let live = !cancelled && !captureFailed; lock.unlock()
        return live && epochAllowed() && (finishing || authorized())
    }
    private func armDeadline(_ phase: StartupDeadline) {
        let deadline = { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let expired = self.startupDeadline == phase && !self.cancelled && !self.released && !self.captureFailed
            if expired {
                let stage = phase == .hardware ? "hardware_startup_timeout" : "cue_handoff_timeout"
                self.recordFailureLocked(AudioStageFailure(stage, NSError(domain: "Audio startup deadline", code: 1)))
                self.startupDeadline = nil
                self.captureFailed = true; self.observation.audioReady = false
                self.markLocked(stage); self.closeProducer?()
            }
            self.lock.unlock()
            guard expired else { return }
            self.reportFailure()
            self.queue.async { self.teardown("failed") }
        }
        // Independent of the hardware owner: even a synchronous OS startup call
        // that returns late cannot subsequently open the PCM gate. OS calls
        // themselves cannot safely be forcibly interrupted.
        if let scheduler { scheduler(3, deadline) }
        else { DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 3, execute: deadline) }
    }
    func start(factory: @escaping (@escaping () -> Void) throws -> Operations) {
        lock.lock()
        guard !startRequested, !cancelled, !released else { lock.unlock(); return }
        startRequested = true
        lock.unlock()
        armDeadline(.hardware)
        queue.async { [self] in
            guard self.valid() else { self.teardown("cancelled"); return }
            do {
                let ops = try factory { [weak self] in
                    guard let self else { return }
                    self.recordFailure(NSError(domain: "Capture pipeline failed", code: 1), stage: "capture_pipeline")
                    self.captureFailure()
                }
                self.operations = ops
                self.lock.lock(); self.closeProducer = ops.cancel ?? ops.close; self.lock.unlock()
                guard self.valid() else { self.fail(); return }
                try ops.prepare()
                self.snapshotFormats()
                guard self.valid() else { self.fail(); return }
                let outputRate = ops.outputRate(), formats = ops.formats()
                self.lock.lock(); self.observation.outputRate = outputRate; self.observation.formats = formats; self.lock.unlock()
                // Transfer under the same lock used by both independent timers.
                // A queued/late hardware callback cannot revoke the handoff.
                self.lock.lock()
                guard self.startupDeadline == .hardware, !self.cancelled, !self.captureFailed, !self.released else {
                    self.lock.unlock(); self.fail(); return
                }
                self.startupDeadline = .handoff
                self.markLocked("route_ready")
                self.lock.unlock()
                self.armDeadline(.handoff)
                self.enable()
            } catch { self.recordFailure(error, stage: "session_create"); self.snapshotFormats(); self.fail() }
        }
    }
    func acceptedPCM() {
        lock.lock(); defer { lock.unlock() }
        guard !firstPCM, !cancelled, !captureFailed, !released else { return }
        firstPCM = true; captureAccepted = true
        if observation.events.count < 24 {
            observation.events.append(Event(name: "first_accepted_pcm", milliseconds: Double(DispatchTime.now().uptimeNanoseconds - origin) / 1_000_000))
        }
    }
    private func reportFailure(startGateRequired: Bool = true) {
        let permitted = epochAllowed() && (!startGateRequired || authorized())
        lock.lock()
        let report = permitted && !cancelled && !released && !failureReported
        if report { failureReported = true }
        lock.unlock()
        if report { failure() }
    }
    private func captureFailure() {
        lock.lock()
        guard !released else { lock.unlock(); return }
        if producerDrained {
            completionFailed = true
            lock.unlock()
            queue.async { self.teardown("end_cue_route_failed") }
            return
        }
        let accepted = captureAccepted
        captureFailed = true; startupDeadline = nil; observation.audioReady = false
        closeProducer?(); lock.unlock()
        // A converter/drain failure must defeat partial inference even during
        // Finish. Unlike an end-cue playback error this is not nonfatal.
        reportFailure(startGateRequired: !accepted)
        queue.async { self.teardown("failed") }
    }
    private func enable() {
        guard valid(), !terminal, !finishing else { fail(); return }
        do {
            try operations?.enable()
            // Cancellation closes the producer independently of the owner queue.
            guard valid() else { operations?.close(); teardown("cancelled"); return }
            mark("listening", ready: true)
        } catch { recordFailure(error, stage: "input_revalidate"); fail() }
    }
    private func play(ending: Bool) {
        guard valid(), !terminal, let ops = operations else { teardown("cancelled"); return }
        cueTicket &+= 1
        let ticket = cueTicket
        mark("end_cue")
        // Arm before deferred construction/prepare, which may block the owner.
        let deadline = { [weak self] in
            guard let self else { return }
            self.lock.lock()
            guard !self.released else { self.lock.unlock(); return }
            self.completionExpired = true
            self.lock.unlock()
            self.queue.async {
                guard ticket == self.cueTicket, !self.terminal else { return }
                self.teardown("end_cue_timeout")
            }
        }
        if let scheduler { scheduler(3, deadline) }
        else { DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 3, execute: deadline) }
        do {
            try ops.prepareCompletion? { [weak self] in
                guard let self else { return false }
                self.lock.lock(); let live = !self.completionExpired && !self.completionFailed; self.lock.unlock()
                return live && self.valid()
            }
            lock.lock(); let expired = completionExpired, failed = completionFailed; lock.unlock()
            guard !expired else { teardown("end_cue_timeout"); return }
            guard !failed else { teardown("end_cue_route_failed"); return }
            guard valid(), !terminal else { teardown("cancelled"); return }
            try ops.play(ending) { [weak self] in
                guard let self else { return }
                self.queue.async {
                    guard ticket == self.cueTicket, !self.terminal else { return }
                    guard self.valid() else { self.teardown("cancelled"); return }
                    self.cueTicket &+= 1 // completion is once-only; retire deadline
                    self.mark("end_cue_completed")
                    self.teardown("finished")
                }
            }
        } catch {
            recordFailure(error, stage: "end_cue")
            teardown("end_cue_failed")
        }
    }
    private func fail() {
        guard !terminal else { return }
        lock.lock(); startupDeadline = nil; lock.unlock()
        if !finishing { reportFailure() }
        lock.lock(); let reported = failureReported; lock.unlock()
        teardown(reported ? "failed" : "cancelled")
    }
    private func teardown(_ reason: String) {
        guard !terminal else { return }
        terminal = true; cueTicket &+= 1
        snapshotFormats()
        lock.lock(); startupDeadline = nil; closeProducer = nil; released = true; lock.unlock()
        operations?.close(); operations?.stopCue(); operations?.stop(); operations = nil
        mark(reason); retired(self); retirement.leave()
    }
    // Synchronous drain is the Rust EOS barrier, not a playback wait. The engine
    // remains owned through deferred completion preparation/playback and teardown.
    func finish() {
        lock.lock(); observation.audioReady = false; lock.unlock()
        queue.sync {
            guard !terminal, !finishing else { return }
            finishing = true
            lock.lock(); let wasReady = captureAccepted && !captureFailed && !cancelled; lock.unlock()
            mark("draining")
            operations?.close()
            var healthy = operations?.drain() ?? false
            var certificate: (() -> Bool)?
            if wasReady && healthy {
                do {
                    guard let prepareCertificate = operations?.prepareDrainCertificate else {
                        throw NSError(domain: "Input drain validator unavailable", code: 1)
                    }
                    certificate = try prepareCertificate()
                }
                catch { recordFailure(error, stage: "input_configuration"); healthy = false }
            }
            lock.lock()
            // A notification can race the final OS reads. Its revision must be
            // certified under this lock before EOS can become successful.
            healthy = healthy && !captureFailed && !cancelled && (certificate?() ?? false)
            if healthy { producerDrained = true; validationPending = false; validationTicket &+= 1 }
            let hasPCM = firstPCM
            lock.unlock()
            if wasReady && !healthy {
                recordFailure(NSError(domain: "Input drain certification failed", code: 1), stage: "input_configuration")
                captureFailure()
            }
            guard valid(), wasReady, healthy else { teardown("finished_without_cue"); return }
            guard hasPCM else { teardown("finished_without_cue"); return }
            if sounds { queue.async { self.play(ending: true) } } else { teardown("finished") }
        }
    }
    func cancel() {
        lock.lock(); cancelled = true; startupDeadline = nil; observation.audioReady = false
        closeProducer?(); lock.unlock()
        queue.async { self.teardown("cancelled") }
    }
    // Generic worker cleanup must preserve an already-owned normal finish cue.
    func stop() {
        lock.lock(); observation.audioReady = false; lock.unlock()
        queue.sync { if !finishing { teardown("stopped") } }
        retirement.wait()
    }
    func level() -> Float {
        lock.lock()
        let ready = observation.audioReady
        let value = cachedLevel
        let refresh = ready && !levelPending
        if refresh { levelPending = true }
        lock.unlock()
        guard ready else { return -60 }
        if refresh { queue.async {
            let value = self.operations?.level() ?? -60
            self.lock.lock(); self.cachedLevel = value; self.levelPending = false; self.lock.unlock()
        } }
        return value
    }
    var isRecording: Bool { snapshot().audioReady }
}
