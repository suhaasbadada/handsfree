use std::time::{Duration, Instant};

#[derive(Default, Debug, PartialEq)]
pub struct PermissionRequests {
    pub microphone: bool,
    pub accessibility: bool,
}
pub fn permission_requests(args: &[String]) -> PermissionRequests {
    PermissionRequests {
        microphone: args
            .iter()
            .skip(1)
            .any(|a| matches!(a.as_str(), "--setup-permissions" | "--request-microphone")),
        accessibility: args.iter().skip(1).any(|a| {
            matches!(
                a.as_str(),
                "--setup-permissions" | "--request-accessibility"
            )
        }),
    }
}
pub fn setup_message(permissions: i32, model_ready: bool, hotkey: bool) -> Option<String> {
    let mut missing = Vec::new();
    if permissions & 1 == 0 {
        missing.push("Microphone: click Allow in HandsFree Settings, then Allow in the macOS dialog (if previously denied, enable HandsFree in Privacy & Security → Microphone)");
    }
    if permissions & 2 == 0 {
        missing.push("Accessibility: enable /Applications/HandsFree.app in Privacy & Security → Accessibility");
    }
    if permissions & 4 == 0 {
        missing.push("Input Monitoring: enable /Applications/HandsFree.app in Privacy & Security → Input Monitoring");
    }
    if permissions & 4 != 0 && !hotkey {
        missing.push("Fn event connection: reopen /Applications/HandsFree.app");
    }
    if !model_ready {
        missing.push("Local model: click Download in HandsFree Settings");
    }
    (!missing.is_empty()).then(|| format!("Not ready: {}.", missing.join("; ")))
}

pub const NO_SPEECH_MESSAGE: &str =
    "Couldn’t hear you. Try again — move closer to your microphone and speak after the cue.";

#[cfg(test)]
mod permission_tests {
    use super::*;
    #[test]
    fn consent_only_for_explicit_arguments() {
        let args = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            permission_requests(&args(&["app"])),
            PermissionRequests::default()
        );
        assert_eq!(
            permission_requests(&args(&["app", "--setup-permissions"])),
            PermissionRequests {
                microphone: true,
                accessibility: true
            }
        );
        assert_eq!(
            permission_requests(&args(&["app", "--request-microphone"])),
            PermissionRequests {
                microphone: true,
                accessibility: false
            }
        );
        assert_eq!(
            permission_requests(&args(&["app", "--request-accessibility"])),
            PermissionRequests {
                microphone: false,
                accessibility: true
            }
        );
        assert_eq!(
            permission_requests(&args(&["app", "--setup-permissions=no"])),
            PermissionRequests::default()
        );
    }
    #[test]
    fn setup_lists_only_current_missing_steps() {
        let missing = setup_message(4, false, true).unwrap();
        assert!(missing.contains("Microphone: click Allow"));
        assert!(missing.contains("Accessibility:"));
        assert!(missing.contains("Local model:"));
        assert!(!missing.contains("Input Monitoring:"));
        assert!(!missing.contains("Fn event connection:"));
        assert_eq!(setup_message(7, true, true), None);
        assert_eq!(setup_message(5, true, true).unwrap(), "Not ready: Accessibility: enable /Applications/HandsFree.app in Privacy & Security → Accessibility.");
    }
}

#[derive(Default)]
pub struct FnGesture {
    pressed: Option<Instant>,
    blocked: bool,
    epoch: u64,
}
impl FnGesture {
    pub const fn new() -> Self {
        Self {
            pressed: None,
            blocked: false,
            epoch: 0,
        }
    }
    /// Bind the tap to Fn-down receipt, not eventual worker execution or release.
    /// A cancel received while Fn is held must invalidate the pending tap too.
    pub fn event_with_epoch(&mut self, event: i32, now: Instant, epoch: u64) -> Option<u64> {
        if event == 1 && self.pressed.is_none() {
            self.epoch = epoch;
        }
        self.event(event, now).then_some(self.epoch)
    }
    /// 1=Fn down, 2=Fn up, 3=other key/modifier, 4=cancel, 5=finish, 6=hook reset.
    /// Repeats, chords, and a release after an overlay action never toggle.
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
            3..=5 => self.blocked = true,
            6 => {
                self.pressed = None;
                self.blocked = false;
            }
            _ => {}
        }
        false
    }
}

/// Explicit overlay/timeout finish can never toggle an idle session back on.
pub fn can_finish(phase: &str, current: u64, requested: Option<u64>) -> bool {
    phase == "recording" && requested.is_none_or(|generation| generation == current)
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

/// Native PasteResult codes. Diagnostics intentionally exclude AX values,
/// field labels, app names, clipboard data, and transcript text.
pub fn should_copy_fallback(text: &str, paste_code: i32) -> bool {
    !text.is_empty() && matches!(paste_code, 1..=15)
}

pub fn copied_message(paste_code: i32) -> String {
    let diagnostic = paste_message(paste_code);
    let reason = diagnostic.split("]").next().unwrap_or("Not pasted");
    format!("Copied. Automatic paste skipped: {reason}].")
}

pub fn paste_message(code: i32) -> String {
    if code == 0 {
        return "Paste shortcut sent to your original field (insertion not confirmed). If nothing appeared, use Copy text on Overview.".into();
    }
    let (reason, action) = match code {
        1 => ("accessibility-denied", "Accessibility access is unavailable. Enable HandsFree in Privacy & Security → Accessibility, then restart the same app copy."),
        2 => ("no-original-app", "No original app was available. Select a text field in another app before tapping Fn."),
        3 => ("no-original-focus", "The app did not expose a focused Accessibility element when recording started. Click inside its text field before tapping Fn; custom editors may not support Accessibility."),
        4 => ("app-changed", "The frontmost app changed. Stay in the original app until transcription finishes."),
        5 => ("no-current-focus", "The app no longer exposes its focused field. Keep the original text field focused until transcription finishes."),
        6 => ("field-changed", "The focused Accessibility element changed or was recreated by the app. Keep the same field focused; dynamic editors may require manual Copy text."),
        7 | 12 => ("secure-field", "Password/secure fields cannot receive dictation. Choose a non-password text field before starting."),
        8 | 13 => ("unsupported-field", "The field does not expose supported text editing through Accessibility. Select an editable text field before starting; this editor may require manual Copy text."),
        9 | 14 => ("read-only-field", "The field is disabled or read-only. Choose an enabled, editable field before starting."),
        10 => ("clipboard-write-failed", "macOS could not put the transcript on the clipboard. Try Copy text on Overview."),
        11 => ("paste-event-failed", "macOS could not create the Paste shortcut. Try Copy text on Overview."),
        15 => ("handsfree-focused", "HandsFree was focused when recording started. Close settings and select a text field in another app before tapping Fn."),
        _ => ("invalid-paste-result", "The paste request could not be completed. Try Copy text on Overview."),
    };
    let stage = match code {
        2 | 3 | 12..=15 => "start",
        _ => "finish",
    };
    format!("Not pasted [{stage}:{reason}]. {action} Your transcript is kept on Overview for this session; use Copy text.")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finish_after_cancel_or_old_timeout_never_restarts() {
        assert!(can_finish("recording", 4, None));
        assert!(can_finish("recording", 4, Some(4)));
        assert!(!can_finish("recording", 5, Some(4)));
        assert!(!can_finish("idle", 5, None));
        assert!(!can_finish("processing", 5, None));
    }
    #[test]
    fn no_speech_has_a_friendly_distinct_retry_message() {
        assert!(NO_SPEECH_MESSAGE.starts_with("Couldn’t hear you. Try again"));
        assert!(!NO_SPEECH_MESSAGE.contains("Not pasted"));
    }
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
    fn hook_reset_recovers_a_lost_release_without_firing() {
        let mut f = FnGesture::new();
        let t = Instant::now();
        f.event_with_epoch(1, t, 0);
        assert_eq!(f.event_with_epoch(6, t, 1), None);
        assert_eq!(f.event_with_epoch(2, t, 1), None);
        f.event_with_epoch(1, t, 1);
        assert_eq!(
            f.event_with_epoch(2, t + Duration::from_millis(90), 1),
            Some(1)
        );
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
    fn overlay_actions_suppress_a_pending_fn_release() {
        for action in [4, 5] {
            let mut gesture = FnGesture::default();
            let now = Instant::now();
            gesture.event(1, now);
            assert!(!gesture.event(action, now));
            assert!(!gesture.event(2, now + Duration::from_millis(100)));
            gesture.event(1, now);
            assert!(gesture.event(2, now + Duration::from_millis(100)));
        }
    }
    #[test]
    fn insertion_preserves_fillers_but_never_control_characters() {
        assert_eq!(
            insertion_text(" Um, uh, I, I mean…\nwell.\tOkay.\r\0\u{1b}"),
            "Um, uh, I, I mean… well. Okay."
        );
        assert_eq!(insertion_text("a\u{2028}b\u{2029}c"), "a b c");
    }
    #[test]
    fn paste_results_are_actionable_and_do_not_claim_insertion() {
        assert!(paste_message(0).contains("insertion not confirmed"));
        for code in 1..=15 {
            let message = paste_message(code);
            assert!(message.starts_with("Not pasted ["));
            assert!(message.contains("Copy text"));
            assert!(!message.contains("invalid-paste-result"));
        }
        assert!(paste_message(3).contains("start:no-original-focus"));
        assert!(paste_message(6).contains("finish:field-changed"));
        assert!(paste_message(12).contains("start:secure-field"));
        assert!(paste_message(-1).contains("invalid-paste-result"));
    }
    #[test]
    fn copy_only_nonempty_refusals_never_submitted_or_cancelled() {
        assert_eq!(
            copied_message(3),
            "Copied. Automatic paste skipped: Not pasted [start:no-original-focus]."
        );
        for code in 1..=15 {
            assert!(should_copy_fallback("final text", code));
        }
        for code in [0, 16, -1, 17] {
            assert!(!should_copy_fallback("final text", code));
        }
        for code in 0..=16 {
            assert!(!should_copy_fallback("", code));
        }
    }
}
