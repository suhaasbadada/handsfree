use std::sync::atomic::{AtomicU64, Ordering};

/// Receipt-time cancellation, independent of the control worker / UI-state lock.
/// Controls carry an immutable epoch captured at receipt: a queued start must
/// never re-arm a session invalidated by a later Escape.
pub struct CancellationEpoch(AtomicU64);
impl CancellationEpoch {
    pub const fn new() -> Self {
        Self(AtomicU64::new(0))
    }
    pub fn current(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
    pub fn cancel(&self) -> u64 {
        self.0.fetch_add(1, Ordering::SeqCst).wrapping_add(1)
    }
    pub fn allows(&self, epoch: u64) -> bool {
        self.current() == epoch
    }
    /// Final local-result acceptance boundary. Cancellation after this check
    /// cannot undo a delivery already submitted to macOS.
    pub fn accept<T>(&self, epoch: u64, commit: impl FnOnce() -> T) -> Option<T> {
        self.allows(epoch).then(commit)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc, Mutex};
    #[test]
    fn queued_start_cannot_clear_a_later_cancel() {
        let epoch = CancellationEpoch::new();
        let fn_start = epoch.current();
        let fn_finish = epoch.current();
        epoch.cancel(); // Escape arrives before either queued Fn is executed.
        assert!(!epoch.allows(fn_start));
        assert!(!epoch.allows(fn_finish));
        assert!(epoch.allows(epoch.current())); // A genuinely new tap may start.
        assert!(!epoch.allows(fn_start)); // No start/reset operation re-arms it.
    }
    #[test]
    fn fn_held_across_command_cancellation_keeps_its_original_epoch() {
        let epoch = CancellationEpoch::new();
        let mut gesture = crate::logic::FnGesture::new();
        let now = std::time::Instant::now();
        gesture.event_with_epoch(1, now, epoch.current());
        epoch.cancel(); // IPC cancel needn't wait to acquire the gesture lock.
        gesture.event_with_epoch(1, now, epoch.current()); // repeated Fn-down
        let old_tap = gesture.event_with_epoch(2, now, epoch.current()).unwrap();
        assert!(!epoch.allows(old_tap));
        gesture.event_with_epoch(1, now, epoch.current());
        let new_tap = gesture.event_with_epoch(2, now, epoch.current()).unwrap();
        assert!(epoch.allows(new_tap));
    }
    #[test]
    fn native_fn_sequence_still_toggles_after_escape_and_chords() {
        let epoch = CancellationEpoch::new();
        let mut gesture = crate::logic::FnGesture::new();
        let now = std::time::Instant::now();
        assert_eq!(gesture.event_with_epoch(1, now, epoch.current()), None);
        let tap = gesture.event_with_epoch(2, now, epoch.current()).unwrap();
        assert!(epoch.allows(tap));
        // Native keyDown emits 3, then 4 for Escape; native_event advances epoch.
        gesture.event_with_epoch(3, now, epoch.current());
        let receipt_epoch = epoch.current();
        epoch.cancel();
        gesture.event_with_epoch(4, now, receipt_epoch);
        for _ in 0..2 {
            gesture.event_with_epoch(1, now, epoch.current());
            let tap = gesture.event_with_epoch(2, now, epoch.current()).unwrap();
            assert!(epoch.allows(tap));
        }
        gesture.event_with_epoch(1, now, epoch.current());
        gesture.event_with_epoch(3, now, epoch.current());
        assert_eq!(gesture.event_with_epoch(2, now, epoch.current()), None);
    }
    #[test]
    fn cancellation_while_ui_lock_is_held_suppresses_delivery_and_commit() {
        let epoch = Arc::new(CancellationEpoch::new());
        let ticket = epoch.current();
        let state = Arc::new(Mutex::new((false, 0))); // transcript committed, stats
        let (waiting, queued) = mpsc::channel();
        let (resume, main_ready) = mpsc::channel();
        let worker_epoch = epoch.clone();
        let worker_state = state.clone();
        let worker = std::thread::spawn(move || {
            let mut inner = worker_state.lock().unwrap();
            waiting.send(()).unwrap(); // inference owns inner; main paste pending
            main_ready.recv().unwrap();
            // Same lock-free gate as the callback inside the native main closure.
            let published = worker_epoch.allows(ticket);
            worker_epoch.accept(ticket, || {
                inner.0 = true;
                inner.1 += 1;
            });
            published
        });
        queued.recv().unwrap();
        assert!(state.try_lock().is_err());
        epoch.cancel(); // Must not require that mutex or the FIFO worker.
        resume.send(()).unwrap();
        assert!(!worker.join().unwrap());
        assert_eq!(*state.lock().unwrap(), (false, 0));
    }
    #[test]
    fn cancellation_between_clipboard_and_event_or_result_rejects_both() {
        let epoch = CancellationEpoch::new();
        let ticket = epoch.current();
        assert!(epoch.allows(ticket)); // clipboard checkpoint
        epoch.cancel();
        assert!(!epoch.allows(ticket)); // event checkpoint: restore clipboard
        assert_eq!(epoch.accept(ticket, || "commit transcript and stats"), None);
        let next = epoch.current();
        assert_eq!(epoch.accept(next, || "new session"), Some("new session"));
    }
}
