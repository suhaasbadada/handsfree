//! Receipt-time dashboard input routing. A UI context is navigation state, not a
//! recording lease. The WebView revalidates it before invoking practice commands.
use std::collections::HashMap;
#[derive(Clone, Copy, serde::Serialize, Debug, PartialEq)]
pub struct Input {
    pub context: u64,
    pub action: &'static str,
    pub source: i32,
    pub token: u64,
}
#[derive(Default)]
pub struct Router {
    revision: u64,
    context: Option<u64>,
    held: HashMap<(i32, u64), Option<u64>>,
}
impl Router {
    pub fn context(&mut self, revision: u64, active: bool) {
        if revision > self.revision {
            self.revision = revision;
            self.context = active.then_some(revision);
        }
    }
    pub fn deactivate(&mut self) {
        self.context = None;
    }
    pub fn toggle(&self) -> Option<Input> {
        self.context.map(|context| Input {
            context,
            action: "toggle",
            source: 0,
            token: 0,
        })
    }
    // None means external input. Some(None) absorbs dashboard input even when
    // there is no eligible view. Its release cannot become an external press.
    pub fn physical(
        &mut self,
        edge: i32,
        source: i32,
        token: u64,
        dashboard: bool,
    ) -> Option<Option<Input>> {
        let key = (source, token);
        let context = match edge {
            1 if dashboard => *self.held.entry(key).or_insert(self.context),
            2 => self.held.remove(&key)?,
            3 => *self.held.get(&key)?,
            _ => return None,
        };
        Some(context.map(|context| Input {
            context,
            source,
            token,
            action: match edge {
                1 => "press",
                2 => "release",
                _ => "cancel",
            },
        }))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn context_revisions_reject_late_grants_and_holds_keep_their_receipt_context() {
        let mut r = Router::default();
        r.context(10, true);
        assert_eq!(r.physical(1, 1, 7, true).unwrap().unwrap().context, 10);
        r.context(12, false);
        r.context(11, true);
        assert!(r.toggle().is_none());
        r.context(13, true);
        assert_eq!(r.physical(2, 1, 7, false).unwrap().unwrap().context, 10);
        assert!(r.physical(2, 1, 7, false).is_none());
        assert_eq!(r.toggle().unwrap().context, 13);
        r.deactivate();
        r.context(13, true);
        assert!(r.toggle().is_none());
    }
    #[test]
    fn ineligible_dashboard_input_is_absorbed_but_external_input_is_not() {
        let mut r = Router::default();
        assert_eq!(r.physical(1, 1, 1, true), Some(None));
        r.context(5, true);
        assert_eq!(r.physical(3, 1, 1, false), Some(None));
        assert_eq!(r.physical(2, 1, 1, false), Some(None));
        assert!(r.physical(1, 1, 2, false).is_none());
        assert!(r.physical(2, 1, 2, true).is_none());
    }
}
