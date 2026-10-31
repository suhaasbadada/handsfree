use serde::{Deserialize, Serialize};

/// Register before persisting; neither a collision nor a failed save may leave
/// the live binding different from the user's saved preference.
#[cfg(any(windows, test))]
pub fn replace_checked(
    old: &Shortcut,
    new: &Shortcut,
    mut apply: impl FnMut(&Shortcut) -> bool,
    persist: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let result = if apply(new) {
        persist()
    } else {
        Err("Windows could not register that shortcut. Another app may already use it.".into())
    };
    if let Err(mut error) = result {
        if !apply(old) {
            error.push_str(" The previous shortcut could not be restored; choose another binding.");
        }
        return Err(error);
    }
    Ok(())
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(default)]
pub struct Shortcut {
    pub code: String,
    pub modifiers: u32, // Control 1, Option 2, Shift 4, Command 8
}
impl Default for Shortcut {
    fn default() -> Self {
        Self {
            code: if cfg!(windows) { "Space" } else { "Fn" }.into(),
            modifiers: if cfg!(windows) { 5 } else { 0 },
        }
    }
}
impl Shortcut {
    pub fn keycode(&self) -> Option<i32> {
        #[cfg(windows)]
        {
            let code = self.code.as_bytes();
            match self.code.as_str() {
                "Space" => Some(0x20),
                _ if code.len() == 4
                    && code.starts_with(b"Key")
                    && code[3].is_ascii_uppercase() =>
                {
                    Some(code[3] as i32)
                }
                _ if code.len() == 6 && code.starts_with(b"Digit") && code[5].is_ascii_digit() => {
                    Some(code[5] as i32)
                }
                _ => None,
            }
        }
        #[cfg(not(windows))]
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
        #[cfg(windows)]
        {
            if self.keycode().is_none() || self.modifiers & !15 != 0 || self.modifiers & 11 == 0 {
                return Err(
                    "Use Control, Alt or Windows with a letter, number or Space. Fn is macOS-only."
                        .into(),
                );
            }
            // Plain Windows/Windows-Shift chords belong to the shell. Modified
            // Windows chords are allowed except known shell/desktop actions.
            let windows_reserved = self.modifiers & 8 != 0
                && (self.modifiers & 3 == 0
                    || ["Space", "KeyL", "KeyD", "KeyQ", "KeyB", "KeyR", "KeyK"]
                        .contains(&self.code.as_str()));
            if windows_reserved
                || (self.code == "Space" && [1, 2].contains(&self.modifiers))
                || (self.modifiers & 3 == 1
                    && [
                        "KeyA", "KeyC", "KeyV", "KeyX", "KeyZ", "KeyS", "KeyW", "KeyF", "KeyN",
                        "KeyO", "KeyP",
                    ]
                    .contains(&self.code.as_str()))
            {
                return Err("That shortcut is reserved for Windows or common app actions. Try Control + Shift + Space.".into());
            }
            Ok(())
        }
        #[cfg(not(windows))]
        {
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
    }
    pub fn label(&self) -> String {
        if self.code == "Fn" {
            return "Fn".into();
        }
        let mut parts = Vec::new();
        for (mask, name) in [
            (1, "Control"),
            (2, if cfg!(windows) { "Alt" } else { "Option" }),
            (4, "Shift"),
            (8, if cfg!(windows) { "Windows" } else { "Command" }),
        ] {
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
    fn collisions_and_denied_saves_restore_the_old_binding() {
        let old = Shortcut::default();
        let new = Shortcut {
            code: "KeyJ".into(),
            modifiers: 2,
        };
        let mut attempted = Vec::new();
        assert!(replace_checked(
            &old,
            &new,
            |binding| {
                attempted.push(binding.clone());
                binding == &old
            },
            || panic!("collision must not persist")
        )
        .is_err());
        assert_eq!(attempted, [new.clone(), old.clone()]);
        attempted.clear();
        assert_eq!(
            replace_checked(
                &old,
                &new,
                |binding| {
                    attempted.push(binding.clone());
                    true
                },
                || Err("denied".into())
            ),
            Err("denied".into())
        );
        assert_eq!(attempted, [new, old]);
    }
    #[test]
    #[cfg(not(windows))]
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
    #[test]
    #[cfg(windows)]
    fn windows_defaults_mapping_and_reservations() {
        assert_eq!(Shortcut::default().keycode(), Some(0x20));
        assert_eq!(Shortcut::default().modifiers, 5);
        assert!(Shortcut::default().validate().is_ok());
        assert!(Shortcut {
            code: "KeyJ".into(),
            modifiers: 9
        }
        .validate()
        .is_ok());
        for (code, modifiers) in [
            ("Fn", 0),
            ("KeyL", 8),
            ("Space", 2),
            ("KeyV", 1),
            ("KeyJ", 32),
        ] {
            assert!(Shortcut {
                code: code.into(),
                modifiers
            }
            .validate()
            .is_err());
        }
        assert_eq!(
            Shortcut {
                code: "KeyJ".into(),
                modifiers: 2
            }
            .keycode(),
            Some(0x4a)
        );
    }
}
