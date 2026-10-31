use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(default)]
pub struct Shortcut {
    pub code: String,
    pub modifiers: u32, // Control 1, Option 2, Shift 4, Command 8
}
impl Default for Shortcut {
    fn default() -> Self {
        Self {
            code: "Fn".into(),
            modifiers: 0,
        }
    }
}
impl Shortcut {
    pub fn keycode(&self) -> Option<i32> {
        Some(match self.code.as_str() {
            "Fn" => 63,
            "Space" => 49,
            "KeyA" => 0,
            "KeyS" => 1,
            "KeyD" => 2,
            "KeyF" => 3,
            "KeyH" => 4,
            "KeyG" => 5,
            "KeyZ" => 6,
            "KeyX" => 7,
            "KeyC" => 8,
            "KeyV" => 9,
            "KeyB" => 11,
            "KeyQ" => 12,
            "KeyW" => 13,
            "KeyE" => 14,
            "KeyR" => 15,
            "KeyY" => 16,
            "KeyT" => 17,
            "Digit1" => 18,
            "Digit2" => 19,
            "Digit3" => 20,
            "Digit4" => 21,
            "Digit6" => 22,
            "Digit5" => 23,
            "Digit9" => 25,
            "Digit7" => 26,
            "Digit8" => 28,
            "Digit0" => 29,
            "KeyO" => 31,
            "KeyU" => 32,
            "KeyI" => 34,
            "KeyP" => 35,
            "KeyL" => 37,
            "KeyJ" => 38,
            "KeyK" => 40,
            "KeyN" => 45,
            "KeyM" => 46,
            _ => return None,
        })
    }
    pub fn validate(&self) -> Result<(), String> {
        if self.code == "Fn" && self.modifiers == 0 {
            return Ok(());
        }
        if self.code == "Fn"
            || self.keycode().is_none()
            || self.modifiers & !15 != 0
            || self.modifiers & 11 == 0
        {
            return Err("Use Control, Option or Command with a letter, number or Space. Fn must be used alone.".into());
        }
        // Avoid system shortcuts and common destructive/editing commands even
        // with additional modifiers (e.g. Command-Shift-Q and Command-Option-V).
        if (self.modifiers & 8 != 0
            && [
                "KeyA", "KeyC", "KeyV", "KeyX", "KeyZ", "KeyQ", "KeyW", "KeyH", "KeyM", "KeyN",
                "KeyO", "KeyP", "KeyS", "KeyF", "KeyT", "Space",
            ]
            .contains(&self.code.as_str()))
            || (self.code == "Space" && self.modifiers == 1)
            || (self.modifiers & 8 != 0
                && self.modifiers & 4 != 0
                && self.code.starts_with("Digit"))
        {
            return Err("That shortcut is reserved for macOS or common app actions. Try Option + Space or Control + Shift + Space.".into());
        }
        Ok(())
    }
    pub fn label(&self) -> String {
        if self.code == "Fn" {
            return "Fn".into();
        }
        let mut parts = Vec::new();
        for (mask, name) in [(1, "Control"), (2, "Option"), (4, "Shift"), (8, "Command")] {
            if self.modifiers & mask != 0 {
                parts.push(name);
            }
        }
        parts.push(
            self.code
                .trim_start_matches("Key")
                .trim_start_matches("Digit"),
        );
        parts.join(" + ")
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_physical_bindings() {
        assert!(Shortcut::default().validate().is_ok());
        for (code, modifiers, valid) in [
            ("Space", 2, true),
            ("Space", 5, true),
            ("Space", 1, false),
            ("Space", 8, false),
            ("KeyQ", 12, false),
            ("KeyV", 10, false),
            ("KeyJ", 8, true),
            ("KeyJ", 4, false),
            ("ShiftLeft", 3, false),
            ("Fn", 2, false),
            ("KeyJ", 32, false),
        ] {
            let s = Shortcut {
                code: code.into(),
                modifiers,
            };
            assert_eq!(s.validate().is_ok(), valid, "{s:?}");
        }
        assert_eq!(
            Shortcut {
                code: "Space".into(),
                modifiers: 5
            }
            .label(),
            "Control + Shift + Space"
        );
    }
}
