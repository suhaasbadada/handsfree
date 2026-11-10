//! Ephemeral practice lease. Tokens are monotonic across WebView reloads; a
//! revoked/duplicate request can never start again, even if its IPC arrives late.
#[derive(Default)]
pub struct Gate {
    latest: u64,
    pub active: Option<u64>,
    pub epoch: Option<u64>,
    pub generation: Option<u64>,
    pub phase: String,
    pub text: String,
}
impl Gate {
    pub const fn new() -> Self {
        Self {
            latest: 0,
            active: None,
            epoch: None,
            generation: None,
            phase: String::new(),
            text: String::new(),
        }
    }
    pub fn reserve(&mut self, token: u64) -> bool {
        if token <= self.latest || self.active.is_some() {
            return false;
        }
        self.latest = token;
        self.active = Some(token);
        self.phase = "starting".into();
        true
    }
    pub fn revoke(&mut self, token: u64) -> Option<u64> {
        self.latest = self.latest.max(token);
        if self.active != Some(token) {
            return None;
        }
        self.active = None;
        self.generation = None;
        self.phase.clear();
        self.text.clear();
        self.epoch.take()
    }
    pub fn can_finish(&self, token: u64, generation: u64) -> bool {
        self.active == Some(token)
            && self.generation == Some(generation)
            && self.phase == "recording"
    }
    pub fn meter_identity(&self, token: u64) -> Option<(u64, u64)> {
        if self.active != Some(token) || self.phase != "recording" {
            return None;
        }
        Some((self.generation?, self.epoch?))
    }
    pub fn bind(&mut self, token: u64, generation: u64) -> bool {
        if self.active != Some(token) {
            return false;
        }
        self.generation = Some(generation);
        self.phase = "recording".into();
        true
    }
    pub fn complete(
        &mut self,
        token: u64,
        generation: u64,
        valid: bool,
        result: Result<String, String>,
    ) {
        if self.active != Some(token) || self.generation != Some(generation) {
            return;
        }
        if !valid {
            self.revoke(token);
            return;
        }
        self.epoch = None;
        match result {
            Ok(text) => {
                self.phase = if text.is_empty() { "empty" } else { "complete" }.into();
                self.text = text;
            }
            Err(_) => {
                self.phase = "error".into();
                self.text.clear();
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn meter_requires_current_recording_token_generation_and_epoch() {
        let mut g = Gate::new();
        assert_eq!(g.meter_identity(1), None);
        g.reserve(1);
        g.bind(1, 7);
        assert_eq!(g.meter_identity(1), None);
        g.epoch = Some(3);
        assert_eq!(g.meter_identity(1), Some((7, 3)));
        assert_eq!(g.meter_identity(2), None);
        g.phase = "processing".into();
        assert_eq!(g.meter_identity(1), None);
        g.complete(1, 7, true, Ok("private".into()));
        assert_eq!(g.meter_identity(1), None);
        g.revoke(1);
        assert_eq!(g.meter_identity(1), None);
    }
    #[test]
    fn revocation_precedes_late_start_and_never_cancels_another_lease() {
        let mut g = Gate::new();
        assert_eq!(g.revoke(10), None);
        assert!(!g.reserve(10));
        assert!(g.reserve(11));
        assert!(!g.reserve(11));
        assert!(!g.reserve(12));
        g.epoch = Some(7);
        g.generation = Some(3);
        g.phase = "recording".into();
        assert!(!g.can_finish(10, 3));
        assert!(!g.can_finish(11, 2));
        assert!(g.can_finish(11, 3));
        assert_eq!(g.revoke(10), None);
        assert!(g.can_finish(11, 3));
        g.text = "private".into();
        assert_eq!(g.revoke(11), Some(7));
        assert!(g.text.is_empty());
        assert!(!g.can_finish(11, 3));
        assert!(g.reserve(12));
    }
    #[test]
    fn results_are_generation_scoped_ephemeral_and_never_rearmed_after_cancel() {
        let mut g = Gate::new();
        assert!(g.reserve(1));
        assert!(g.bind(1, 8));
        g.complete(1, 7, true, Ok("stale".into()));
        assert!(g.text.is_empty());
        g.complete(1, 8, true, Ok("practice only".into()));
        assert_eq!(g.phase, "complete");
        assert_eq!(g.text, "practice only");
        assert!(!g.can_finish(1, 8));
        g.revoke(1);
        assert!(!g.bind(1, 8));
        g.complete(1, 8, true, Ok("late".into()));
        assert!(g.text.is_empty());
        assert!(g.reserve(2));
        assert!(g.bind(2, 9));
        g.complete(1, 8, true, Ok("old".into()));
        assert!(g.text.is_empty());
        g.complete(2, 9, false, Ok("lost focus or cancelled".into()));
        assert!(g.active.is_none());
        assert!(g.text.is_empty());
    }
    #[test]
    fn errors_and_silence_do_not_publish_error_payloads_as_text() {
        let mut g = Gate::new();
        g.reserve(1);
        g.bind(1, 1);
        g.complete(1, 1, true, Err("private error detail".into()));
        assert_eq!(g.phase, "error");
        assert!(g.text.is_empty());
        g.revoke(1);
        g.reserve(2);
        g.bind(2, 2);
        g.complete(2, 2, true, Ok(String::new()));
        assert_eq!(g.phase, "empty");
        assert!(g.text.is_empty());
    }
}
