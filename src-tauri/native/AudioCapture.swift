import AVFoundation

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
    private let engine = AVAudioEngine()
    private let pipeline: CapturePipeline
    private var started = false // main thread only
    private var routeObserver: NSObjectProtocol?
    init(generation: UInt64, epoch: UInt64, sink: @escaping AudioSink) throws {
        pipeline = try CapturePipeline(input: engine.inputNode.outputFormat(forBus: 0)) { data, count in
            sink(generation, epoch, data, count)
        }
    }
    func start() throws {
        let input = engine.inputNode.outputFormat(forBus: 0)
        let pipeline = self.pipeline
        engine.inputNode.installTap(onBus: 0, bufferSize: 2048, format: input) { buffer, _ in pipeline.enqueue(buffer) }
        started = true
        do { try engine.start() } catch { stop(); throw error }
        // A format/route reset cannot silently turn into an endless recording.
        routeObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { _ in pipeline.captureFailed() }
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
}

// Shared production/test barrier: producer closed, engine stopped, tap removed,
// converter drained BEFORE playback. Cancellation is rechecked after draining.
enum CaptureEnd {
    static func finish(stop: () -> Bool, allowed: () -> Bool, play: () -> Void) {
        let captured = stop()
        if captured && allowed() { play() }
    }
}
