use std::time::{Duration, Instant};

#[derive(Default)]
pub struct FnGesture {
    pressed: Option<Instant>,
    blocked: bool,
}
impl FnGesture {
    pub const fn new() -> Self {
        Self {
            pressed: None,
            blocked: false,
        }
    }
    /// 1=Fn down, 2=Fn up, 3=other key/modifier. Repeats and chords never toggle.
    pub fn event(&mut self, event: i32, now: Instant) -> bool {
        match event {
            1 => {
                if self.pressed.is_none() {
                    self.pressed = Some(now);
                    self.blocked = false;
                }
            }
            2 => {
                let fire = self
                    .pressed
                    .take()
                    .is_some_and(|t| now.duration_since(t) <= Duration::from_millis(450))
                    && !self.blocked;
                self.blocked = false;
                return fire;
            }
            3 => self.blocked = true,
            _ => {}
        }
        false
    }
}

pub fn usable_audio(samples: &[f32]) -> bool {
    if samples.len() < 6400 {
        return false;
    }
    // Require at least 120ms above the quiet-room noise floor, not just one click.
    samples
        .chunks(320)
        .filter(|chunk| {
            (chunk.iter().map(|s| s * s).sum::<f32>() / chunk.len() as f32).sqrt() > 0.008
        })
        .count()
        >= 6
}

/// Dictation inserts one line, never terminal control sequences or pasted Return.
/// Do not rewrite words, repetitions, punctuation, or fillers.
pub fn insertion_text(text: &str) -> String {
    text.chars()
        .map(|c| {
            if c.is_control() || matches!(c, '\u{2028}' | '\u{2029}') {
                ' '
            } else {
                c
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tap_toggles_once() {
        let mut f = FnGesture::default();
        let t = Instant::now();
        assert!(!f.event(1, t));
        assert!(!f.event(1, t));
        assert!(f.event(2, t + Duration::from_millis(90)));
        assert!(!f.event(2, t));
    }
    #[test]
    fn hold_and_chord_do_not_toggle() {
        let mut f = FnGesture::default();
        let t = Instant::now();
        f.event(1, t);
        assert!(!f.event(2, t + Duration::from_secs(1)));
        f.event(1, t);
        f.event(3, t);
        assert!(!f.event(2, t));
        f.event(1, t);
        assert!(f.event(2, t));
    }
    #[test]
    fn rejects_silence_clicks_and_short_audio() {
        assert!(!usable_audio(&vec![0.0; 16000]));
        assert!(!usable_audio(&vec![0.1; 1000]));
        let mut click = vec![0.0; 16000];
        click[100] = 1.;
        assert!(!usable_audio(&click));
        assert!(usable_audio(&vec![0.02; 16000]));
    }
    #[test]
    fn insertion_preserves_fillers_but_never_control_characters() {
        assert_eq!(
            insertion_text(" Um, uh, I, I mean…\nwell.\tOkay.\r\0\u{1b}"),
            "Um, uh, I, I mean… well. Okay."
        );
        assert_eq!(insertion_text("a\u{2028}b\u{2029}c"), "a b c");
    }
}
