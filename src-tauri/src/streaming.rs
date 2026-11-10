//! Bounded, memory-only capture ingress and nonoverlapping pause segmentation.
use std::collections::VecDeque;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Condvar, Mutex,
};
pub const RATE: usize = 16_000;
// Cancellation does not release this slot: only worker teardown may do so.
// Both receipt epoch and generation are necessary (epoch is cancel-only).
#[derive(Default)]
pub struct Slot(Option<Arc<Session>>);
impl Slot {
    pub const fn new() -> Self {
        Self(None)
    }
    pub fn start(&mut self, session: Arc<Session>) -> bool {
        if self.0.is_some() {
            return false;
        }
        self.0 = Some(session);
        true
    }
    pub fn current(&self) -> Option<Arc<Session>> {
        self.0.clone()
    }
    pub fn get(&self, generation: u64, epoch: u64) -> Option<Arc<Session>> {
        self.current()
            .filter(|s| s.generation == generation && s.epoch == epoch)
    }
    pub fn release(&mut self, generation: u64, epoch: u64) -> bool {
        if self.get(generation, epoch).is_none() {
            return false;
        }
        self.0 = None;
        true
    }
}
pub struct Session {
    pub generation: u64,
    pub epoch: u64,
    pub cancelled: AtomicBool,
    limit: usize,
    queue: Mutex<Queue>,
    wake: Condvar,
}
#[derive(Default)]
struct Queue {
    audio: VecDeque<Vec<f32>>,
    total: usize,
    done: bool,
    error: Option<String>,
    limit_reported: bool,
}
impl Session {
    pub fn new(generation: u64, epoch: u64, seconds: u32) -> Self {
        Self {
            generation,
            epoch,
            cancelled: AtomicBool::new(false),
            limit: seconds as usize * RATE,
            queue: Mutex::new(Queue::default()),
            wake: Condvar::new(),
        }
    }
    // Called only from the native conversion queue, never the realtime tap.
    // Returns true when the captured-sample limit is reached.
    pub fn push(&self, samples: &[f32]) -> bool {
        let mut q = self.queue.lock().unwrap();
        if q.done || self.cancelled.load(Ordering::Acquire) {
            return false;
        }
        let count = samples.len().min(self.limit - q.total);
        if count > 0 {
            q.audio.push_back(samples[..count].to_vec());
            q.total += count;
        }
        let full = q.total == self.limit && !q.limit_reported;
        q.limit_reported |= full;
        self.wake.notify_one();
        full
    }
    pub fn finish(&self, error: Option<String>) {
        let mut q = self.queue.lock().unwrap();
        q.done = true;
        if error.is_some() {
            q.error = error;
        }
        self.wake.notify_all();
    }
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        let mut q = self.queue.lock().unwrap();
        q.audio.clear();
        q.done = true;
        self.wake.notify_all();
    }
    pub fn next(&self) -> Result<Option<Vec<f32>>, String> {
        let mut q = self.queue.lock().unwrap();
        loop {
            if self.cancelled.load(Ordering::Acquire) {
                return Err("Cancelled.".into());
            }
            if let Some(error) = &q.error {
                return Err(error.clone());
            }
            if let Some(audio) = q.audio.pop_front() {
                return Ok(Some(audio));
            }
            if q.done {
                return Ok(None);
            }
            q = self.wake.wait(q).unwrap();
        }
    }
    pub fn seconds(&self) -> f64 {
        self.queue.lock().unwrap().total as f64 / RATE as f64
    }
    pub fn limit_seconds(&self) -> u32 {
        (self.limit / RATE) as u32
    }
    pub fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::Acquire) {
            return Err("Cancelled.".into());
        }
        match &self.queue.lock().unwrap().error {
            Some(error) => Err(error.clone()),
            None => Ok(()),
        }
    }
}
#[derive(Default)]
pub struct Segmenter {
    pending: Vec<f32>,
    quiet: usize,
    frame: Vec<f32>,
}
impl Segmenter {
    pub fn push(&mut self, samples: &[f32]) -> Vec<Vec<f32>> {
        let mut chunks = Vec::new();
        for &sample in samples {
            self.frame.push(sample);
            if self.frame.len() == 320 {
                let energy = self.frame.iter().map(|v| v * v).sum::<f32>() / 320.;
                self.quiet = if energy < 0.000_004 {
                    self.quiet + 320
                } else {
                    0
                };
                self.pending.append(&mut self.frame);
                if self.pending.len() >= 8 * RATE && self.quiet >= 11_200 {
                    chunks.push(std::mem::take(&mut self.pending));
                    self.quiet = 0;
                }
            }
        }
        chunks
    }
    pub fn finish(&mut self) -> Vec<f32> {
        self.pending.append(&mut self.frame);
        std::mem::take(&mut self.pending)
    }
}
// Reject empty audio / isolated clicks without imposing the old 400ms minimum
// on final words. Short voiced tails are zero-padded only for inference.
pub fn voiced(samples: &[f32]) -> bool {
    samples
        .chunks(320)
        .filter(|f| f.iter().map(|v| v * v).sum::<f32>() / f.len() as f32 > 0.000_004)
        .take(3)
        .count()
        >= 3
}
pub fn run<C, L, F>(session: &Session, load: L, mut infer: F) -> Result<String, String>
where
    L: FnOnce() -> Result<C, String>,
    F: FnMut(&mut C, &[f32]) -> Result<String, String>,
{
    let mut segmenter = Segmenter::default();
    let mut text = Vec::new();
    let mut load = Some(load);
    let mut context = None;
    let mut process = |mut audio: Vec<f32>| -> Result<(), String> {
        if voiced(&audio) {
            if session.cancelled.load(Ordering::Acquire) {
                return Err("Cancelled.".into());
            }
            audio.resize(audio.len().max(RATE), 0.);
            if context.is_none() {
                context = Some(load.take().unwrap()()?);
            }
            session.check()?;
            let part = infer(context.as_mut().unwrap(), &audio)?;
            session.check()?;
            if !part.trim().is_empty() {
                text.push(part.trim().to_owned());
            }
        }
        Ok(())
    };
    while let Some(audio) = session.next()? {
        for chunk in segmenter.push(&audio) {
            process(chunk)?;
        }
    }
    process(segmenter.finish())?;
    session.check()?;
    Ok(crate::transcript::clean(&text.join(" ")))
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};
    fn speech(n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| if i % 2 == 0 { 0.02 } else { -0.02 })
            .collect()
    }
    #[test]
    fn segmentation_unique_and_no_forced_cut() {
        let mut s = Segmenter::default();
        let audio = speech(20 * RATE);
        assert!(s.push(&audio).is_empty());
        assert_eq!(s.finish(), audio);
        let mut s = Segmenter::default();
        let mut audio = speech(8 * RATE);
        audio.extend(vec![0.; RATE]);
        audio.extend(speech(1600));
        let mut chunks = s.push(&audio);
        chunks.push(s.finish());
        assert_eq!(chunks.concat(), audio);
        assert!(chunks.len() > 1);
        assert!(voiced(chunks.last().unwrap()));
        assert!(!voiced(&vec![0.; RATE]));
        let mut click = vec![0.; RATE];
        click[0] = 1.;
        assert!(!voiced(&click));
        assert!(
            voiced(&speech(960)),
            "a 60ms voiced tail must not use the old 400ms rejection"
        );
    }
    #[test]
    fn inference_completes_before_finish_and_ordered_tail() {
        let session = Arc::new(Session::new(1, 2, 120));
        let worker = session.clone();
        let (tx, rx) = mpsc::channel();
        let loads = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let loaded = loads.clone();
        let join = std::thread::spawn(move || {
            run(
                &worker,
                || {
                    loaded.fetch_add(1, Ordering::SeqCst);
                    Ok(0)
                },
                |calls, audio| {
                    assert!(audio.len() >= RATE);
                    *calls += 1;
                    tx.send(*calls).unwrap();
                    Ok("word word".into())
                },
            )
        });
        session.push(&speech(8 * RATE));
        session.push(&vec![0.; RATE]);
        assert_eq!(
            rx.recv_timeout(std::time::Duration::from_secs(2)).unwrap(),
            1
        ); // inference completed; Finish not sent
        session.push(&speech(1600));
        session.finish(None);
        assert_eq!(join.join().unwrap().unwrap(), "word word word word");
        assert_eq!(rx.recv().unwrap(), 2);
        assert_eq!(loads.load(Ordering::SeqCst), 1);
        assert_eq!(session.seconds(), 9.1);
    }
    #[test]
    fn final_cleanup_discards_artifact_chunks_and_counts_only_final_words() {
        for tail in [
            "[NO_SPEECH].",
            "[WHISTLING] (HUMMING)! ♪♫",
            "Hello,world! [APPLAUSE] don't stop.",
        ] {
            let session = Session::new(1, 2, 120);
            session.push(&speech(8 * RATE));
            session.push(&vec![0.; RATE]);
            session.push(&speech(1600));
            session.finish(None);
            let mut calls = 0;
            let text = run(
                &session,
                || Ok(()),
                |_, _| {
                    calls += 1;
                    Ok(if calls == 1 { "[WHISTLING]" } else { tail }.into())
                },
            )
            .unwrap();
            assert_eq!(calls, 2);
            let mut stats = crate::storage::Stats::default();
            stats.record(&text, session.seconds());
            if !tail.starts_with("Hello") {
                assert!(text.is_empty());
                assert_eq!(crate::logic::insertion_text(&text), "");
                for paste_code in 0..=15 {
                    assert!(!crate::logic::should_copy_fallback(&text, paste_code));
                }
                assert_eq!(stats, crate::storage::Stats::default());
            } else {
                assert_eq!(text, "Hello,world!   don't stop.");
                assert_eq!(stats.words, 4);
                assert_eq!(stats.transcriptions, 1);
                assert_eq!(stats.speech_seconds, 9.1);
            }
        }
    }
    #[test]
    fn slow_backlog_finish_is_a_barrier_and_inference_stays_serial() {
        let session = Arc::new(Session::new(4, 2, 120));
        let worker = session.clone();
        let (entered, started) = mpsc::channel();
        let (release, wait) = mpsc::channel();
        let (completed, result) = mpsc::channel();
        let join = std::thread::spawn(move || {
            let output = run(
                &worker,
                || Ok(0),
                |calls, _| {
                    *calls += 1;
                    if *calls == 1 {
                        entered.send(()).unwrap();
                        wait.recv().unwrap();
                    }
                    Ok(format!("part{calls}"))
                },
            );
            completed.send(output).unwrap();
        });
        let mut chunk = speech(8 * RATE);
        chunk.extend(vec![0.; RATE]);
        session.push(&chunk);
        started
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        session.push(&chunk);
        session.push(&speech(1600));
        session.finish(None);
        assert!(matches!(result.try_recv(), Err(mpsc::TryRecvError::Empty)));
        release.send(()).unwrap();
        assert_eq!(
            result
                .recv_timeout(std::time::Duration::from_secs(2))
                .unwrap()
                .unwrap(),
            "part1 part2 part3"
        );
        join.join().unwrap();
        assert_eq!(session.seconds(), 18.1);
    }
    #[test]
    fn cancel_retains_slot_until_worker_ack_and_stale_callbacks_cannot_touch_restart() {
        let old = Arc::new(Session::new(4, 2, 120));
        let next = Arc::new(Session::new(5, 3, 300));
        let mut slot = Slot::new();
        assert!(slot.start(old.clone()));
        let worker = old.clone();
        let (entered, started) = mpsc::channel();
        let (release, wait) = mpsc::channel();
        let join = std::thread::spawn(move || {
            run(
                &worker,
                || Ok(()),
                |_, _| {
                    entered.send(()).unwrap();
                    wait.recv().unwrap();
                    Ok("private partial".into())
                },
            )
        });
        let mut audio = speech(8 * RATE);
        audio.extend(vec![0.; RATE]);
        old.push(&audio);
        started
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        old.cancel();
        assert!(
            !slot.start(next.clone()),
            "cancel is not teardown acknowledgement"
        );
        release.send(()).unwrap();
        assert!(join.join().unwrap().is_err());
        assert!(slot.release(4, 2));
        assert!(slot.start(next.clone()));
        assert!(slot.get(4, 2).is_none());
        assert!(!slot.release(4, 2));
        assert!(slot.get(5, 2).is_none()); // generation alone isn't sufficient
        assert!(slot.get(4, 3).is_none()); // epoch alone isn't sufficient
        old.finish(Some("late native error".into()));
        assert!(slot.get(5, 3).is_some());
        assert!(!next.cancelled.load(Ordering::Acquire));
        assert_eq!(next.seconds(), 0.);
    }
    #[test]
    fn failure_after_private_chunk_never_returns_partial_text() {
        let s = Session::new(6, 3, 120);
        let mut chunk = speech(8 * RATE);
        chunk.extend(vec![0.; RATE]);
        s.push(&chunk);
        s.push(&chunk);
        s.finish(None);
        let mut calls = 0;
        assert_eq!(
            run(
                &s,
                || Ok(()),
                |_, _| {
                    calls += 1;
                    if calls == 1 {
                        Ok("private".into())
                    } else {
                        Err("inference failed".into())
                    }
                }
            )
            .unwrap_err(),
            "inference failed"
        );
        assert_eq!(calls, 2);
    }
    #[test]
    fn capture_failure_during_final_inference_rejects_the_result() {
        let s = Session::new(7, 3, 120);
        s.push(&speech(RATE));
        s.finish(None);
        let result = run(
            &s,
            || Ok(()),
            |_, _| {
                s.finish(Some("capture failed during final inference".into()));
                Ok("must stay private".into())
            },
        );
        assert_eq!(result.unwrap_err(), "capture failed during final inference");
    }
    #[test]
    fn cancellation_during_context_load_skips_inference() {
        let s = Session::new(8, 3, 120);
        s.push(&speech(RATE));
        s.finish(None);
        assert!(run(
            &s,
            || {
                s.cancel();
                Ok(())
            },
            |_, _| panic!("cancelled model load must not start inference")
        )
        .is_err());
    }
    #[test]
    fn bounded_cancel_and_capture_failure() {
        let s = Session::new(1, 2, 120);
        assert!(s.push(&vec![0.; 121 * RATE]));
        assert_eq!(s.seconds(), 120.);
        s.cancel();
        assert!(s.next().is_err());
        let s = Session::new(2, 2, 120);
        s.finish(Some("capture failed".into()));
        assert!(run(&s, || Ok(()), |_, _| panic!()).is_err());
    }
    #[test]
    fn timer_observes_only_accepted_samples_and_the_sessions_frozen_limit() {
        let mut preference = 120;
        let first = Session::new(1, 7, preference);
        assert_eq!(first.seconds(), 0.0); // Pending cue/start does not tick.
        first.push(&vec![0.; RATE + RATE / 2]);
        preference = 300;
        assert_eq!(first.seconds(), 1.5);
        assert_eq!(first.limit_seconds(), 120);
        let next = Session::new(2, 7, preference);
        assert_eq!(next.limit_seconds(), 300);
        assert_eq!(next.seconds(), 0.0);
        first.push(&vec![0.; 121 * RATE]);
        assert_eq!(first.seconds(), f64::from(first.limit_seconds()));
        first.cancel();
        first.push(&vec![0.; RATE]);
        assert_eq!(first.seconds(), 120.0);
    }
}
