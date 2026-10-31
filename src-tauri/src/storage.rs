use serde::{Deserialize, Serialize};
use std::{fs, io::Write, os::unix::fs::OpenOptionsExt, path::Path};

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(default)]
pub struct Stats {
    pub transcriptions: u64,
    pub words: u64,
    pub speech_seconds: f64,
    pub saved_seconds: f64,
}
impl Stats {
    pub fn record(&mut self, text: &str, seconds: f64) {
        let words = text.split_whitespace().count() as u64;
        if words == 0 || !seconds.is_finite() || seconds < 0.0 {
            return;
        }
        self.transcriptions = self.transcriptions.saturating_add(1);
        self.words = self.words.saturating_add(words);
        self.speech_seconds += seconds;
        self.saved_seconds += (words as f64 * 60.0 / 40.0 - seconds).max(0.0);
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(default)]
pub struct Store {
    #[serde(deserialize_with = "read_shortcut")]
    pub shortcut: crate::shortcut::Shortcut,
    pub sound_style: String,
    pub sounds: bool,
    pub sound_volume: f32,
    pub stats: Stats,
}
fn read_shortcut<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<crate::shortcut::Shortcut, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    let shortcut: crate::shortcut::Shortcut = serde_json::from_value(value).unwrap_or_default();
    Ok(if shortcut.validate().is_ok() {
        shortcut
    } else {
        Default::default()
    })
}
impl Default for Store {
    fn default() -> Self {
        Self {
            shortcut: crate::shortcut::Shortcut::default(),
            sound_style: "tap".into(),
            sounds: true,
            sound_volume: 50.0,
            stats: Stats::default(),
        }
    }
}
pub fn load(path: &Path) -> Result<Store, String> {
    match fs::read(path) {
        Ok(bytes) => {
            let mut store: Store = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            store.sound_volume = store.sound_volume.clamp(0.0, 100.0);
            if store.shortcut.validate().is_err() {
                store.shortcut = Default::default();
            }
            if !["tap", "bell"].contains(&store.sound_style.as_str()) {
                store.sound_style = "tap".into();
            }
            if !store.stats.speech_seconds.is_finite()
                || store.stats.speech_seconds < 0.0
                || !store.stats.saved_seconds.is_finite()
                || store.stats.saved_seconds < 0.0
            {
                return Err("Invalid usage totals".into());
            }
            Ok(store)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Store::default()),
        Err(e) => Err(e.to_string()),
    }
}
pub fn save(path: &Path, store: &Store) -> Result<(), String> {
    let temporary = path.with_extension("json.tmp");
    let write = || -> Result<(), String> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec(store).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())?;
        fs::File::open(path.parent().ok_or("Missing storage directory")?)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())
    };
    let result = write();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

pub fn validate_volume(volume: f32) -> Result<(), String> {
    if !volume.is_finite() || !(0.0..=100.0).contains(&volume) {
        return Err("Sound volume must be between 0 and 100.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn volume_validation_and_legacy_preferences() {
        let legacy: Store = serde_json::from_str(r#"{"sounds":false}"#).unwrap();
        assert!(!legacy.sounds);
        assert_eq!(legacy.sound_volume, 50.0);
        assert_eq!(legacy.shortcut, Default::default());
        assert_eq!(legacy.sound_style, "tap");
        for value in [f32::NAN, f32::INFINITY, -1.0, 101.0] {
            assert!(validate_volume(value).is_err());
        }
        for value in [0.0, 50.0, 100.0] {
            assert!(validate_volume(value).is_ok());
        }
    }
    #[test]
    fn corrupt_shortcut_preserves_usage_and_legacy_sound() {
        for binding in [
            r#"{"code":"Space","modifiers":8}"#,
            r#"{"code":12}"#,
            "null",
            "42",
        ] {
            let store: Store = serde_json::from_str(&format!(
                r#"{{"shortcut":{binding},"sounds":false,"sound_volume":24,"stats":{{"words":7}}}}"#
            ))
            .unwrap();
            assert_eq!(store.shortcut, Default::default());
            assert_eq!(store.stats.words, 7);
            assert!(!store.sounds);
            assert_eq!(store.sound_volume, 24.0);
            assert_eq!(store.sound_style, "tap");
        }
        let store: Store = serde_json::from_str(
            r#"{"shortcut":{"code":"Space","modifiers":5},"sound_style":"bell"}"#,
        )
        .unwrap();
        assert_eq!(store.shortcut.label(), "Control + Shift + Space");
        assert_eq!(store.sound_style, "bell");
    }
    #[test]
    fn counts_only_nonempty_and_clamps_estimate() {
        let mut stats = Stats::default();
        stats.record("  ", 4.0);
        stats.record("cancelled", f64::NAN);
        assert_eq!(stats, Stats::default());
        stats.record("one two three four", 2.0);
        stats.record("slow", 20.0);
        assert_eq!(stats.transcriptions, 2);
        assert_eq!(stats.words, 5);
        assert_eq!(stats.speech_seconds, 22.0);
        assert_eq!(stats.saved_seconds, 4.0);
    }
    #[test]
    fn private_atomic_round_trip_and_reset() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("handsfree-store-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("usage.json");
        assert_eq!(load(&path).unwrap(), Store::default());
        let mut store = Store {
            sounds: false,
            sound_volume: 42.0,
            ..Store::default()
        };
        store.stats.record("hello there", 1.0);
        save(&path, &store).unwrap();
        assert_eq!(load(&path).unwrap(), store);
        let json = fs::read_to_string(&path).unwrap();
        assert!(!json.contains("hello there"));
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(value.get("transcript").is_none());
        assert_eq!(value["stats"].as_object().unwrap().len(), 4);
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        store.stats = Stats::default();
        save(&path, &store).unwrap();
        assert_eq!(load(&path).unwrap().stats, Stats::default());
        assert!(!load(&path).unwrap().sounds);
        assert_eq!(load(&path).unwrap().sound_volume, 42.0);
        fs::write(&path, b"broken").unwrap();
        assert!(load(&path).is_err());
        fs::write(&path, br#"{"stats":{"speech_seconds":-1}}"#).unwrap();
        assert!(load(&path).is_err());
        fs::write(&path, b"{}").unwrap();
        assert_eq!(load(&path).unwrap(), Store::default());
        fs::write(&path, br#"{"sounds":false,"sound_volume":200}"#).unwrap();
        assert_eq!(load(&path).unwrap().sound_volume, 100.0);
        assert!(!load(&path).unwrap().sounds);
        fs::write(&path, br#"{"sound_volume":-3}"#).unwrap();
        assert_eq!(load(&path).unwrap().sound_volume, 0.0);
        let directory_target = dir.join("not-a-file");
        fs::create_dir(&directory_target).unwrap();
        assert!(save(&directory_target, &store).is_err());
        assert!(directory_target.is_dir());
        assert!(!directory_target.with_extension("json.tmp").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
