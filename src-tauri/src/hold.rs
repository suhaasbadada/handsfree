//! Receipt-time gesture identity, independent of cancellation epochs and sessions.
//! Never infer a release from UI phase: a press can still be waiting in the FIFO.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Key(pub i32, pub u64);
#[derive(Default)]
pub struct Coordinator {
    entries: std::collections::HashMap<Key, Entry>,
    closed: Option<u64>,
}
#[derive(Default)]
struct Entry {
    cancelled: bool,
    generation: Option<u64>,
    released: bool,
    finished: bool,
}
/// Native focus surveillance outlives the physical key latch. A rejected second
/// press must not overwrite the accepted session's still-processing token.
#[cfg(any(windows, test))]
#[derive(Default)]
pub struct FocusWatch(std::collections::BTreeSet<u64>);
#[cfg(any(windows, test))]
impl FocusWatch {
    pub fn press(&mut self, token: u64) {
        self.0.insert(token);
    }
    pub fn complete(&mut self, token: u64) {
        self.0.remove(&token);
    }
    pub fn tokens(&self) -> Vec<u64> {
        self.0.iter().copied().collect()
    }
}
#[cfg(any(windows, test))]
#[derive(Default)]
pub struct Physical {
    pub held: bool,
    active: bool,
    cancelled: bool,
    pub token: u64,
}
#[cfg(any(windows, test))]
impl Physical {
    pub fn key(&mut self, down: bool, valid: bool) -> Option<i32> {
        if down {
            if self.held {
                return None;
            }
            self.held = true;
            if !valid {
                return None;
            }
            self.token = self.token.wrapping_add(1);
            self.active = true;
            self.cancelled = false;
            Some(1)
        } else {
            self.held = false;
            self.finish()
        }
    }
    pub fn finish(&mut self) -> Option<i32> {
        if !self.active {
            return None;
        }
        self.active = false;
        Some(2)
    }
    pub fn interrupt(&mut self) -> Option<i32> {
        if !self.active || self.cancelled {
            return None;
        }
        self.cancelled = true;
        Some(3)
    }
}
impl Coordinator {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn press(&mut self, key: Key) {
        self.entries.entry(key).or_default();
    }
    pub fn pending(&self, key: Key) -> bool {
        self.entries
            .get(&key)
            .is_some_and(|entry| !entry.cancelled && entry.generation.is_none())
    }
    pub fn accept(&mut self, key: Key, generation: u64) -> bool {
        if !self.pending(key) {
            return false;
        }
        let entry = self.entries.get_mut(&key).unwrap();
        entry.generation = Some(generation);
        if entry.released {
            self.closed = Some(generation);
        }
        true
    }
    pub fn cancel(&mut self, key: Key) -> Option<u64> {
        match self.entries.get_mut(&key) {
            Some(entry) if !entry.cancelled => {
                entry.cancelled = true;
                if entry.generation.is_some() {
                    self.closed = entry.generation;
                }
                entry.generation
            }
            _ => None,
        }
    }
    pub fn release(&mut self, key: Key) -> Option<u64> {
        let entry = self.entries.get_mut(&key)?;
        if entry.generation.is_none() {
            self.entries.remove(&key);
            return None;
        }
        if entry.finished {
            return None;
        }
        entry.finished = true;
        self.closed = entry.generation;
        if entry.cancelled {
            None
        } else {
            entry.generation
        }
    }
    pub fn accepted(&self, key: Key) -> bool {
        self.entries
            .get(&key)
            .is_some_and(|entry| entry.generation.is_some())
    }
    pub fn reject(&mut self, key: Key) {
        self.entries.remove(&key);
    }
    pub fn complete(&mut self, generation: u64) -> Vec<Key> {
        let keys: Vec<_> = self
            .entries
            .iter()
            .filter_map(|(key, entry)| (entry.generation == Some(generation)).then_some(*key))
            .collect();
        for key in &keys {
            self.entries.remove(key);
        }
        keys
    }
    pub fn receipt_release(&mut self, key: Key) {
        if let Some(entry) = self.entries.get_mut(&key) {
            entry.released = true;
            if entry.generation.is_some() {
                self.closed = entry.generation;
            }
        }
    }
    pub fn can_start(&self, generation: u64) -> bool {
        self.closed != Some(generation)
            && !self.entries.values().any(|entry| {
                entry.generation == Some(generation) && (entry.cancelled || entry.released)
            })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn physical_hold_has_no_tap_deadline_and_never_rearms_until_up() {
        for cancel in [false, true] {
            let mut p = Physical::default();
            assert_eq!(p.key(true, true), Some(1));
            let token = p.token;
            for _ in 0..100 {
                assert_eq!(p.key(true, true), None);
            }
            if cancel {
                assert_eq!(p.interrupt(), Some(3));
                assert_eq!(p.interrupt(), None);
            }
            // Modifier-first release/HUD finish/limit leaves primary latched.
            assert_eq!(p.finish(), Some(2));
            assert_eq!(p.key(true, true), None);
            assert_eq!(p.key(false, true), None);
            assert_eq!(p.key(true, true), Some(1));
            assert!(p.token > token);
            assert_eq!(p.key(false, true), Some(2));
        }
        let mut p = Physical {
            held: true,
            ..Default::default()
        };
        assert_eq!(p.key(true, true), None);
        assert_eq!(p.key(false, true), None);
        assert_eq!(p.key(true, false), None);
        assert_eq!(p.key(true, true), None);
        assert_eq!(p.key(false, true), None);
    }
    #[test]
    fn early_release_is_fifo_finish_but_closes_pending_capture_gate() {
        let mut c = Coordinator::new();
        let a = Key(1, 1);
        let b = Key(1, 2);
        // Both physical edges received before worker starts.
        c.press(a);
        c.receipt_release(a);
        c.press(b);
        c.receipt_release(b);
        assert!(c.accept(a, 1));
        assert!(!c.can_start(1));
        assert_eq!(c.release(a), Some(1));
        assert!(!c.can_start(1));
        assert_eq!(c.release(a), None);
        c.complete(1);
        // Rejected during processing: no generation ever gets mapped.
        assert_eq!(c.release(b), None);
        let d = Key(1, 3);
        c.press(d);
        assert!(c.accept(d, 2));
        assert!(c.can_start(2));
        assert_eq!(c.cancel(a), None);
        assert_eq!(c.release(a), None);
        assert!(c.can_start(2));
    }
    #[test]
    fn release_targets_actual_generation_not_epoch() {
        let mut c = Coordinator::new();
        let a = Key(1, 1);
        let b = Key(1, 2);
        c.press(a);
        assert!(c.accept(a, 10));
        assert_eq!(c.release(a), Some(10));
        c.complete(10);
        c.press(b);
        assert!(c.accept(b, 11));
        assert_eq!(c.release(a), None);
        assert_eq!(c.cancel(a), None);
        assert_eq!(c.release(b), Some(11));
    }
    #[test]
    fn cancellation_before_worker_and_rejected_press() {
        let mut c = Coordinator::new();
        let a = Key(2, 1);
        c.press(a);
        assert_eq!(c.cancel(a), None);
        assert!(!c.accept(a, 1));
        assert_eq!(c.release(a), None);
        c.press(Key(2, 2));
        assert_eq!(c.release(Key(2, 2)), None);
    }
    #[test]
    fn released_session_observes_focus_away_and_back_until_completion() {
        for source in [1, 2] {
            let mut coordinator = Coordinator::new();
            let mut watches = FocusWatch::default();
            let mut physical = Physical::default();
            assert_eq!(physical.key(true, true), Some(1));
            let key = Key(source, physical.token);
            watches.press(key.1);
            coordinator.press(key);
            assert!(coordinator.accept(key, 10));
            assert_eq!(physical.key(false, true), Some(2));
            coordinator.receipt_release(key);
            assert_eq!(coordinator.release(key), Some(10));
            assert_eq!(coordinator.release(key), None);
            // Focus away is observed after release; returning cannot undo it.
            for token in watches.tokens() {
                assert_eq!(coordinator.cancel(Key(source, token)), Some(10));
            }
            for token in watches.tokens() {
                assert_eq!(coordinator.cancel(Key(source, token)), None);
            }
            assert!(!coordinator.can_start(10));
            assert_eq!(coordinator.complete(10), vec![key]);
            watches.complete(key.1);
            assert!(watches.tokens().is_empty());
        }
    }
    #[test]
    fn rejected_new_press_does_not_replace_processing_focus_identity() {
        let mut c = Coordinator::new();
        let mut watches = FocusWatch::default();
        let old = Key(2, 1);
        let rejected = Key(2, 2);
        let new = Key(2, 3);
        c.press(old);
        watches.press(old.1);
        assert!(c.accept(old, 10));
        c.receipt_release(old);
        assert_eq!(c.release(old), Some(10));
        c.press(rejected);
        watches.press(rejected.1);
        c.reject(rejected);
        watches.complete(rejected.1);
        assert_eq!(watches.tokens(), vec![old.1]);
        assert_eq!(c.cancel(old), Some(10));
        c.complete(10);
        watches.complete(old.1);
        c.press(new);
        watches.press(new.1);
        assert!(c.accept(new, 11));
        assert_eq!(c.cancel(old), None);
        assert_eq!(c.release(old), None);
        c.complete(10);
        watches.complete(old.1); // Delayed old completion.
        assert_eq!(watches.tokens(), vec![new.1]);
        assert!(c.can_start(11));
    }
}
