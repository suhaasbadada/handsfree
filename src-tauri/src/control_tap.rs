//! Platform-independent recognizer. The Win32 adapter supplies physical-key,
//! held-key and foreground snapshots; ordinary Ctrl messages are never consumed.
pub const MAX_TAP_MS: u64 = 400;

// Documented Win32 VK_RCONTROL and physical Ctrl scan code. Requiring all
// three excludes left/generic Control and right Alt (including AltGr).
pub fn is_right_control(vk: u32, scan: u32, extended: bool) -> bool {
    vk == 0xA3 && scan == 0x1d && extended
}

#[derive(Default)]
pub struct ControlTap {
    down: bool,
    armed: Option<(u64, usize)>,
}
impl ControlTap {
    pub const fn new() -> Self {
        Self {
            down: false,
            armed: None,
        }
    }
    pub fn reset(&mut self, held: bool) {
        self.down = held;
        self.armed = None;
    }
    pub fn interrupt(&mut self) {
        self.armed = None;
    }
    pub fn key(&mut self, down: bool, now: u64, foreground: usize, eligible: bool) -> bool {
        if down {
            if self.down {
                self.interrupt(); // autorepeat is never a tap
            } else if eligible {
                self.armed = Some((now, foreground));
            }
            self.down = true;
            false
        } else {
            self.down = false;
            self.armed.take().is_some_and(|(start, window)| {
                eligible && window == foreground && now.saturating_sub(start) <= MAX_TAP_MS
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn physical_right_modifier_is_exact() {
        assert!(is_right_control(0xA3, 0x1d, true));
        for vk in [0x11, 0xA2, 0xA4, 0xA5, 0x10, 0x5b, 0x41] {
            assert!(!is_right_control(vk, 0x1d, true));
        }
        assert!(!is_right_control(0xA3, 0x1d, false));
        assert!(!is_right_control(0xA3, 0x38, true));
    }
    #[test]
    fn only_short_isolated_same_focus_press_release_triggers_once() {
        let mut tap = ControlTap::new();
        assert!(!tap.key(false, 0, 1, true)); // stale release
        assert!(!tap.key(true, 10, 1, true));
        assert!(tap.key(false, 410, 1, true));
        assert!(!tap.key(false, 411, 1, true));
        assert!(!tap.key(true, 500, 1, true));
        assert!(!tap.key(false, 901, 1, true));
        assert!(!tap.key(true, 1000, 1, true));
        assert!(!tap.key(false, 1100, 2, true));
    }
    #[test]
    fn repeats_chords_injected_input_capture_and_reinstall_disarm() {
        for interruption in 0..6 {
            let mut tap = ControlTap::default();
            tap.key(true, 0, 1, true);
            match interruption {
                0 => {
                    tap.key(true, 10, 1, true);
                } // repeat
                1 | 2 => tap.interrupt(), // keyboard/mouse/injected input
                3 => tap.reset(true),     // capture or reinstall while held
                4 => {
                    tap.key(false, 10, 1, false);
                } // suppression
                _ => {
                    tap.key(false, 401, 1, true);
                } // lost/late release
            }
            assert!(!tap.key(false, 20, 1, true), "case {interruption}");
            tap.key(true, 30, 1, true);
            assert!(tap.key(false, 40, 1, true));
        }
        let mut tap = ControlTap::default();
        tap.key(true, 0, 1, false); // already-held key, AltGr or injection
        assert!(!tap.key(false, 10, 1, true));
        tap.reset(true);
        tap.key(true, 20, 1, true); // still-held repeated down after capture
        assert!(!tap.key(false, 30, 1, true));
    }
}
