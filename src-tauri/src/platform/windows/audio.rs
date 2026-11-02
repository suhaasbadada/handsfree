use super::{cues, ACTIVE, POWER};
use crate::platform::resample::{downmix, Resampler};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
};
type Sink = extern "C" fn(u64, u64, *const f32, i32);
type Allowed = extern "C" fn(u64) -> bool;
fn queue_packet<T: cpal::Sample>(
    data: &[T],
    channels: usize,
    sender: &mpsc::SyncSender<Vec<f32>>,
    failed: &AtomicBool,
) where
    f32: cpal::FromSample<T>,
{
    if failed.load(Ordering::Acquire) {
        return;
    }
    if data.len() > 65_536 || !data.len().is_multiple_of(channels) {
        failed.store(true, Ordering::Release);
        return;
    }
    if data.is_empty() {
        return;
    }
    let owned = data
        .iter()
        .map(|sample| sample.to_sample::<f32>())
        .collect();
    if sender.try_send(owned).is_err() {
        failed.store(true, Ordering::Release);
    }
}
fn drain_after_stop(
    stream: impl Sized,
    receiver: &mpsc::Receiver<Vec<f32>>,
    mut process: impl FnMut(Vec<f32>),
) {
    drop(stream);
    for packet in receiver.try_iter() {
        process(packet);
    }
}
struct Capture {
    stop: mpsc::Sender<()>,
    thread: thread::JoinHandle<bool>,
}
static CAPTURE: Mutex<Option<Capture>> = Mutex::new(None);
// Serializes start/stop, not callbacks or UI. The app's FIFO is the usual caller.
static LIFECYCLE: Mutex<()> = Mutex::new(());
pub fn start(generation: u64, epoch: u64, allowed: Allowed, sink: Sink) -> bool {
    let _guard = LIFECYCLE.lock().unwrap();
    stop_inner();
    if !allowed(epoch) {
        return false;
    }
    let profile = cues::snapshot();
    cues::session(profile);
    if !cues::start(profile, epoch, move |e| {
        allowed(e) && super::capture_start_allowed(generation)
    }) {
        return false;
    }
    let (stop, stopped) = mpsc::channel();
    let (ready, result) = mpsc::sync_channel(1);
    let handle = thread::spawn(move || {
        // WASAPI COM/thread-bound stream is created, played and dropped here.
        let host = cpal::default_host();
        let Some(device) = host.default_input_device() else {
            let _ = ready.send(false);
            return false;
        };
        let Ok(config) = device.default_input_config() else {
            let _ = ready.send(false);
            return false;
        };
        let rate = config.sample_rate().0;
        let channels = config.channels() as usize;
        if !(8_000..=384_000).contains(&rate) || channels == 0 || channels > 64 {
            let _ = ready.send(false);
            return false;
        }
        // At most 16 * 65,536 input samples (~4 MiB), plus one owned packet.
        // The RT callback never waits or calls the app, UI or inference.
        let (sender, receiver) = mpsc::sync_channel::<Vec<f32>>(16);
        let failed = Arc::new(AtomicBool::new(false));
        let make_error = || {
            let failed = failed.clone();
            move |_| {
                failed.store(true, Ordering::Release);
            }
        };
        let stream_config = config.clone().into();
        macro_rules! build {
            ($ty:ty) => {{
                let failed = failed.clone();
                device.build_input_stream(
                    &stream_config,
                    move |data: &[$ty], _| {
                        queue_packet(data, channels, &sender, &failed);
                    },
                    make_error(),
                    None,
                )
            }};
        }
        let stream = match config.sample_format() {
            cpal::SampleFormat::I8 => build!(i8),
            cpal::SampleFormat::I16 => build!(i16),
            cpal::SampleFormat::I32 => build!(i32),
            cpal::SampleFormat::I64 => build!(i64),
            cpal::SampleFormat::U8 => build!(u8),
            cpal::SampleFormat::U16 => build!(u16),
            cpal::SampleFormat::U32 => build!(u32),
            cpal::SampleFormat::U64 => build!(u64),
            cpal::SampleFormat::F32 => build!(f32),
            cpal::SampleFormat::F64 => build!(f64),
            _ => {
                let _ = ready.send(false);
                return false;
            }
        };
        let Ok(stream) = stream else {
            let _ = ready.send(false);
            return false;
        };
        if !allowed(epoch) || !super::capture_start_allowed(generation) || stream.play().is_err() {
            let _ = ready.send(false);
            return false;
        }
        let _ = ready.send(true);
        let mut resampler = Resampler::new(rate);
        let process = |data: Vec<f32>, resampler: &mut Resampler| {
            if !allowed(epoch) {
                return;
            }
            let mono = downmix(&data, channels);
            let rms = (mono.iter().map(|s| s * s).sum::<f32>() / mono.len().max(1) as f32).sqrt();
            POWER.store(rms.to_bits(), Ordering::Relaxed);
            let output = resampler.push(&mono, false);
            if !output.is_empty() {
                sink(generation, epoch, output.as_ptr(), output.len() as i32);
            }
        };
        loop {
            if stopped.try_recv().is_ok() || !allowed(epoch) || failed.load(Ordering::Acquire) {
                break;
            }
            match receiver.recv_timeout(std::time::Duration::from_millis(10)) {
                Ok(data) => process(data, &mut resampler),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(_) => break,
            }
        }
        // Drop stops the producer before FIFO drain and final filter flush.
        drain_after_stop(stream, &receiver, |data| process(data, &mut resampler));
        if allowed(epoch) {
            if failed.load(Ordering::Acquire) {
                sink(generation, epoch, std::ptr::null(), -1);
            } else {
                let tail = resampler.push(&[], true);
                if !tail.is_empty() {
                    sink(generation, epoch, tail.as_ptr(), tail.len() as i32);
                }
            }
        }
        POWER.store(0f32.to_bits(), Ordering::Relaxed);
        !failed.load(Ordering::Acquire) && allowed(epoch)
    });
    let started = result.recv().unwrap_or(false);
    if started {
        ACTIVE.store(true, Ordering::Release);
        *CAPTURE.lock().unwrap() = Some(Capture {
            stop,
            thread: handle,
        });
    } else {
        let _ = handle.join();
    }
    started
}
fn stop_inner() -> bool {
    if let Some(capture) = CAPTURE.lock().unwrap().take() {
        let _ = capture.stop.send(());
        return capture.thread.join().unwrap_or(false);
    }
    false
}
pub fn stop() -> bool {
    let _guard = LIFECYCLE.lock().unwrap();
    stop_inner()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn packet_formats_overflow_and_failed_producer_are_bounded() {
        let (sender, receiver) = mpsc::sync_channel(1);
        let failed = AtomicBool::new(false);
        queue_packet(&[i16::MIN, 0, i16::MAX, 0], 2, &sender, &failed);
        let packet = receiver.try_recv().unwrap();
        assert_eq!(packet[0], -1.);
        assert!(packet[2] > 0.99);
        queue_packet(&[0u16, 32768], 2, &sender, &failed);
        assert_eq!(receiver.try_recv().unwrap(), [-1., 0.]);
        queue_packet(&[0.25f64, -0.5], 2, &sender, &failed);
        queue_packet(&[0.1f32, 0.2], 2, &sender, &failed); // overflow, never waits
        assert!(failed.load(Ordering::Acquire));
        assert_eq!(receiver.try_recv().unwrap(), [0.25, -0.5]);
        queue_packet(&[0.3f32, 0.4], 2, &sender, &failed);
        assert!(receiver.try_recv().is_err());
    }
    #[test]
    fn stop_drops_producer_before_draining_final_packet_and_filter() {
        struct Producer(mpsc::SyncSender<Vec<f32>>);
        impl Drop for Producer {
            fn drop(&mut self) {
                self.0.try_send(vec![1.; 32]).unwrap();
            }
        }
        let (sender, receiver) = mpsc::sync_channel(4);
        sender.send(vec![0.; 32]).unwrap();
        let mut resampler = Resampler::new(48_000);
        let mut output = Vec::new();
        let mut packets = 0;
        drain_after_stop(Producer(sender), &receiver, |packet| {
            packets += 1;
            output.extend(resampler.push(&packet, false));
        });
        output.extend(resampler.push(&[], true));
        assert_eq!(packets, 2);
        assert_eq!(output.len(), 22);
    }
}
