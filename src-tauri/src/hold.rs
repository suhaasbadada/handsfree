//! Receipt-time gesture identity, independent of cancellation epochs and sessions.
//! Never infer a release from UI phase: a press can still be waiting in the FIFO.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Key(pub i32, pub u64);
#[derive(Default)]
pub struct Coordinator {
    entries: std::collections::HashMap<Key, (bool, Option<u64>, bool)>,
    closed: Option<u64>,
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
        self.entries.entry(key).or_insert((false, None, false));
    }
    pub fn pending(&self, key: Key) -> bool {
        self.entries
            .get(&key)
            .is_some_and(|(cancelled, generation, _)| !cancelled && generation.is_none())
    }
    pub fn accept(&mut self, key: Key, generation: u64) -> bool {
        if !self.pending(key) {
            return false;
        }
        let entry = self.entries.get_mut(&key).unwrap();
        entry.1 = Some(generation);
        if entry.2 {
            self.closed = Some(generation);
        }
        true
    }
    pub fn cancel(&mut self, key: Key) -> Option<u64> {
        match self.entries.get_mut(&key) {
            Some((cancelled, generation, _)) if !*cancelled => {
                *cancelled = true;
                if generation.is_some() {
                    self.closed = *generation;
                }
                *generation
            }
            _ => None,
        }
    }
    pub fn release(&mut self, key: Key) -> Option<u64> {
        match self.entries.remove(&key) {
            Some((cancelled, generation, _)) => {
                if generation.is_some() {
                    self.closed = generation;
                }
                if cancelled {
                    None
                } else {
                    generation
                }
            }
            _ => None,
        }
    }
    pub fn receipt_release(&mut self, key: Key) {
        if let Some(entry) = self.entries.get_mut(&key) {
            entry.2 = true;
            if entry.1.is_some() {
                self.closed = entry.1;
            }
        }
    }
    pub fn can_start(&self, generation: u64) -> bool {
        self.closed != Some(generation)
            && !self
                .entries
                .values()
                .any(|(cancelled, accepted, released)| {
                    *accepted == Some(generation) && (*cancelled || *released)
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
}
