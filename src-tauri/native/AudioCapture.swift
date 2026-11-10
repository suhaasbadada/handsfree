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
    private let sink: (UnsafePointer<Float>?, Int32) -> Void
    // A dedicated producer gate, never held across conversion/inference/AppKit calls.
    // Closing it makes the enqueue -> EOS barrier valid even for an in-flight tap.
    private let producer = NSLock()
    private var accepting = true
    private var failed = false // conversion queue only
    private var db: Float = -60 // conversion queue only
    init(input: AVAudioFormat, sink: @escaping (UnsafePointer<Float>?, Int32) -> Void) throws {
        self.sink = sink
        inputFormat = input
        guard input.sampleRate > 0, input.channelCount > 0,
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
        guard accepting else { return }
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
    @discardableResult func drain() -> Bool {
        close()
        return queue.sync { self.convert(nil, final: true); return !self.failed }
    }
    func captureFailed() {
        producer.lock(); defer { producer.unlock() }
        guard accepting else { return }
        accepting = false; queue.async { self.fail() }
    }
    func level() -> Float { queue.sync { db } }
}

final class AudioCapture {
    let generation: UInt64
    let epoch: UInt64
    private let engine: AVAudioEngine
    private let pipeline: CapturePipeline
    private var started = false // main thread only
    private var routeObserver: NSObjectProtocol?
    private let microphoneUID: String?
    private let device: AudioDeviceID
    init(generation: UInt64, epoch: UInt64, microphoneUID: String? = nil, sink: @escaping AudioSink) throws {
        self.generation = generation; self.epoch = epoch
        self.microphoneUID = microphoneUID
        let engine = AVAudioEngine()
        self.engine = engine
        let (device, format) = try MicrophoneBinding.prepare(resolve: { try Microphones.resolve(microphoneUID) }, bind: { id in
            guard let unit = engine.inputNode.audioUnit else { throw NSError(domain: "Microphone audio unit unavailable", code: 1) }
            var id = id
            try Microphones.checked(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &id, UInt32(MemoryLayout<AudioDeviceID>.size)))
        }, format: { engine.inputNode.outputFormat(forBus: 0) })
        self.device = device
        pipeline = try CapturePipeline(input: format) { data, count in
            sink(generation, epoch, data, count)
        }
    }
    func start() throws {
        try MicrophoneBinding.revalidate(expected: device, resolve: { try Microphones.resolve(microphoneUID) })
        let input = engine.inputNode.outputFormat(forBus: 0)
        let pipeline = self.pipeline
        engine.inputNode.installTap(onBus: 0, bufferSize: 2048, format: input) { buffer, _ in pipeline.enqueue(buffer) }
        started = true
        // A format/route reset cannot silently turn into an endless recording.
        routeObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { _ in pipeline.captureFailed() }
        do {
            try engine.start()
            // Close the validation/observer/start gap; never accept a silent HAL fallback.
            try MicrophoneBinding.revalidate(expected: device, resolve: { try Microphones.resolve(microphoneUID) })
            guard let unit = engine.inputNode.audioUnit else { throw NSError(domain: "Microphone audio unit unavailable", code: 1) }
            var actual = AudioDeviceID(0), size = UInt32(MemoryLayout<AudioDeviceID>.size)
            try Microphones.checked(AudioUnitGetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &actual, &size))
            try MicrophoneBinding.revalidate(expected: device, resolve: { actual })
        } catch { stop(); throw error }
    }
    @discardableResult func stop() -> Bool {
        let wasStarted = started
        if let observer = routeObserver { NotificationCenter.default.removeObserver(observer); routeObserver = nil }
        pipeline.close()
        if started { engine.inputNode.removeTap(onBus: 0); engine.stop(); started = false }
        let healthy = pipeline.drain()
        return wasStarted && healthy
    }
    func level() -> Float { pipeline.level() }
    var isRecording: Bool { started }
}

// Shared production/test barrier: producer closed, engine stopped, tap removed,
// converter drained BEFORE playback. Cancellation is rechecked after draining.
enum CaptureEnd {
    static func finish(stop: () -> Bool, allowed: () -> Bool, play: () -> Void) {
        let captured = stop()
        if captured && allowed() { play() }
    }
}
