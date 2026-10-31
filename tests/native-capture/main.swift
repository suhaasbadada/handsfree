import Foundation
import AVFoundation

// Synthetic PCM only. Do not instantiate AVAudioEngine or request microphone.
for rate in [16000.0, 44100.0, 48000.0] {
    for interleaved in [false, true] {
      for (left, right) in [(Float(0.2), Float(0)), (Float(0), Float(0.2)), (Float(0.05), Float(0.15))] {
        let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 2, interleaved: interleaved)!
        var received = [Float]()
        var errors = 0
        let pipeline = try CapturePipeline(input: format) { data, count in
            if count < 0 { errors += 1 }
            else if let data = data { received.append(contentsOf: UnsafeBufferPointer(start: data, count: Int(count))) }
        }
        let frames = Int(rate * 2)
        var position = 0
        while position < frames {
            let count = min(2048, frames - position)
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count))!
            buffer.frameLength = AVAudioFrameCount(count)
            for i in 0..<count {
                let value = Float(sin(2 * Double.pi * 440 * Double(position + i) / rate))
                if interleaved { buffer.floatChannelData![0][2*i] = value * left; buffer.floatChannelData![0][2*i+1] = value * right }
                else { buffer.floatChannelData![0][i] = value * left; buffer.floatChannelData![1][i] = value * right }
            }
            pipeline.enqueue(buffer)
            // Mutate the producer's buffer immediately: queue must own a copy.
            for audio in UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList) {
                memset(audio.mData!, 0, Int(audio.mDataByteSize))
            }
            position += count
        }
        pipeline.close(); pipeline.drain()
        precondition(errors == 0)
        precondition(abs(received.count - 32000) <= 2, "\(rate) output duration \(received.count)")
        // Stereo -> mono must average BOTH channels. Either single-channel
        // fixture must yield 0.1-amplitude sine, not silence or channel-zero gain.
        let body = received.dropFirst(100).dropLast(100)
        let rms = sqrt(body.map { $0*$0 }.reduce(0,+) / Float(body.count))
        let expectedRMS = (left + right) / 2 / sqrt(Float(2))
        precondition(abs(rms - expectedRMS) < 0.001, "\(rate) interleaved=\(interleaved) L=\(left) R=\(right): RMS \(rms), expected \(expectedRMS)")
        let before = received.count
        let late = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2048)!
        late.frameLength = 2048; pipeline.enqueue(late); pipeline.drain()
        precondition(received.count == before, "late producer escaped stop barrier")
      }
    }
}
// Force bounded-queue overload without any real-time or microphone access.
let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
let entered = DispatchSemaphore(value: 0), release = DispatchSemaphore(value: 0)
var once = true, errors = 0
let pipeline = try CapturePipeline(input: format) { _, count in
    if count < 0 { errors += 1 }
    else if once { once = false; entered.signal(); release.wait() }
}
let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2048)!
buffer.frameLength = 2048
pipeline.enqueue(buffer)
precondition(entered.wait(timeout: .now()+2) == .success)
for _ in 0..<200 { pipeline.enqueue(buffer) }
release.signal(); pipeline.drain()
precondition(errors == 1, "overload must fail explicitly exactly once")
print("Synthetic 16/44.1/48 kHz stereo left-only/right-only/mixed RMS, owned buffers, EOS duration, stop barrier and bounded overload passed without microphone")
