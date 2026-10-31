#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod cancellation;
mod logic;
mod platform;
mod shortcut;
mod storage;
mod streaming;
mod transcript;
use futures_util::StreamExt;
use platform::*;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    ffi::CString,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tokio::io::AsyncWriteExt;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const MODEL_SIZE: u64 = 147_964_211;
const MODEL_HASH: &str = "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002";
const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static GESTURE: Mutex<logic::FnGesture> = Mutex::new(logic::FnGesture::new());
static CANCELLATION: cancellation::CancellationEpoch = cancellation::CancellationEpoch::new();
static CONTROLS: OnceLock<std::sync::mpsc::Sender<(Control, u64)>> = OnceLock::new();
static DIAGNOSTIC_WRITE: Mutex<()> = Mutex::new(());
static EXECUTABLE_HASH: OnceLock<String> = OnceLock::new();
static PERMISSION_REQUESTS: AtomicU32 = AtomicU32::new(0);
// Separate from Inner: native conversion callbacks must never acquire app state.
static INGRESS: Mutex<streaming::Slot> = Mutex::new(streaming::Slot::new());
extern "C" fn capture_audio(generation: u64, epoch: u64, samples: *const f32, count: i32) {
    let Some(session) = INGRESS.lock().unwrap().get(generation, epoch) else {
        return;
    };
    if !CANCELLATION.allows(epoch) {
        return;
    }
    if count < 0 {
        session.finish(Some(
            "Microphone capture failed. Please check your input device.".into(),
        ));
        enqueue_at(Control::Finish(Some(generation)), epoch);
    } else if count > 0 && !samples.is_null() {
        // Native owns this slice only for the duration of the callback.
        if session.push(unsafe { std::slice::from_raw_parts(samples, count as usize) }) {
            enqueue_at(Control::Finish(Some(generation)), epoch);
        }
    }
}
extern "C" fn delivery_allowed(epoch: u64) -> bool {
    CANCELLATION.allows(epoch)
}
enum Control {
    Toggle,
    Cancel,
    Finish(Option<u64>),
    Complete(Arc<streaming::Session>, Result<String, String>),
}
fn enqueue(control: Control) {
    // Invalidate before touching the state mutex or waiting for FIFO execution.
    let epoch = if matches!(control, Control::Cancel) {
        CANCELLATION.cancel()
    } else {
        CANCELLATION.current()
    };
    enqueue_at(control, epoch);
}
fn enqueue_at(control: Control, epoch: u64) {
    if let Some(sender) = CONTROLS.get() {
        let _ = sender.send((control, epoch));
    }
}

#[derive(Clone, Serialize)]
struct Status {
    platform: &'static str,
    phase: String,
    message: String,
    progress: f32,
    model_ready: bool,
    microphone: bool,
    accessibility: bool,
    input_monitoring: bool,
    hotkey: bool,
    transcript: String,
    sounds: bool,
    sound_volume: f32,
    sound_style: String,
    recording_limit: u32,
    shortcut: shortcut::Shortcut,
    shortcut_label: String,
    stats: storage::Stats,
    persistence_error: String,
    permission_requests: u32,
}
struct Inner {
    status: Status,
    generation: u64,
    session_epoch: u64,
    store: storage::Store,
}
struct AppState {
    inner: Mutex<Inner>,
    directory: PathBuf,
}
fn state() -> tauri::State<'static, AppState> {
    APP.get().unwrap().state::<AppState>()
}
fn cstring(s: &str) -> Result<CString, String> {
    CString::new(s).map_err(|_| "Unexpected NUL in text".into())
}
fn model_path(s: &AppState) -> PathBuf {
    s.directory.join("ggml-base.en.bin")
}
fn recording_path(s: &AppState) -> PathBuf {
    s.directory.join("recording.wav")
}
fn verified_model(path: &Path) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    if file.metadata().map(|m| m.len()).unwrap_or(0) != MODEL_SIZE {
        return false;
    }
    let mut hash = Sha256::new();
    let mut bytes = [0u8; 65536];
    loop {
        match file.read(&mut bytes) {
            Ok(0) => break,
            Ok(n) => hash.update(&bytes[..n]),
            Err(_) => return false,
        }
    }
    format!("{:x}", hash.finalize()) == MODEL_HASH
}
extern "C" fn native_event(event: i32) {
    route_native_event(event, &GESTURE, &CANCELLATION, enqueue_at);
}
fn route_native_event(
    event: i32,
    gesture: &Mutex<logic::FnGesture>,
    cancellation: &cancellation::CancellationEpoch,
    mut send: impl FnMut(Control, u64),
) {
    if event == 7 {
        send(Control::Toggle, cancellation.current());
        return;
    }
    let receipt_epoch = cancellation.current();
    if event == 4 {
        send(Control::Cancel, cancellation.cancel());
    }
    let toggle = gesture
        .lock()
        .unwrap()
        .event_with_epoch(event, Instant::now(), receipt_epoch);
    if let Some(epoch) = toggle {
        send(Control::Toggle, epoch);
    }
    if event == 5 {
        send(Control::Finish(None), cancellation.current());
    }
}

#[tauri::command]
async fn status() -> Status {
    refresh_status()
}
fn refresh_status() -> Status {
    // Never hold the state mutex while synchronously dispatching to AppKit.
    let p = unsafe { hf_permissions() };
    let hotkey = unsafe { hf_hook(native_event) };
    let hook_state = unsafe { hf_hook_state() };
    let hook_reason = unsafe { hf_hook_reason() };
    let s = state();
    let mut inner = s.inner.lock().unwrap();
    inner.status.microphone = p & 1 != 0;
    inner.status.accessibility = p & 2 != 0;
    inner.status.input_monitoring = p & 4 != 0;
    inner.status.hotkey = hotkey;
    inner.status.permission_requests = PERMISSION_REQUESTS.load(Ordering::Relaxed);
    if ["idle", "setup_required"].contains(&inner.status.phase.as_str()) {
        if let Some(message) = logic::setup_message(p, inner.status.model_ready, hotkey) {
            inner.status.message = message;
        } else if inner.status.phase == "setup_required"
            || inner.status.message.starts_with("Not ready:")
        {
            inner.status.phase = "idle".into();
            inner.status.message = format!(
                "Select a text field and press {}.",
                inner.store.shortcut.label()
            );
        }
    }
    let snapshot = inner.status.clone();
    drop(inner);
    write_diagnostic(&s, &snapshot, p, hook_state, hook_reason);
    snapshot
}
fn write_diagnostic(
    s: &AppState,
    status: &Status,
    permissions: i32,
    hook_state: i32,
    hook_reason: i32,
) {
    // Deliberately exclude transcript, usage, focus, and all audio. This file is
    // readable without WebView/IPC and refreshed even when settings is hidden.
    let diagnostic = serde_json::json!({
        "schema": 1,
        "updated_unix_seconds": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        "pid": std::process::id(),
        "executable": std::env::current_exe().ok(),
        "executable_sha256": EXECUTABLE_HASH.get(),
        "bundle_identifier": "com.handsfree.local",
        "version": env!("CARGO_PKG_VERSION"),
        "permissions_bits": permissions,
        "permission_requests_bits": PERMISSION_REQUESTS.load(Ordering::Relaxed),
        "microphone": status.microphone,
        "microphone_authorization_status": unsafe { hf_microphone_status() },
        "accessibility": status.accessibility,
        "input_monitoring": status.input_monitoring,
        "hook_attempted": hook_reason != 0,
        "hook_connected": status.hotkey,
        "hook_state_bits": hook_state,
        "hook_reason": match hook_reason { 1 => "connected", 2 => "input_monitoring_preflight_denied", 3 => "event_tap_creation_failed", 4 => "run_loop_source_creation_failed", 5 => "event_tap_disabled", 101 => "windows_hotkey_registration_failed", 102 => "windows_escape_hook_failed", 103 => "windows_message_loop_failed", _ => "not_attempted" },
        "model_ready": status.model_ready,
        "model_path": model_path(s),
        "model_file_bytes": fs::metadata(model_path(s)).ok().map(|m| m.len()),
        "model_expected_bytes": MODEL_SIZE,
        "model_expected_sha256": MODEL_HASH,
        "phase": status.phase,
        "activation_policy": unsafe { hf_activation_policy() },
        "message": status.message,
    });
    let _writer = DIAGNOSTIC_WRITE.lock().unwrap();
    use std::io::Write;
    let result = (|| -> std::io::Result<()> {
        let temporary = s.directory.join("diagnostics.json.tmp");
        let mut file = storage::private_file(&temporary)?;
        file.write_all(serde_json::to_string_pretty(&diagnostic)?.as_bytes())?;
        drop(file);
        storage::replace_file(&temporary, &s.directory.join("diagnostics.json"))
    })();
    if let Err(error) = result {
        eprintln!("Cannot write local diagnostics: {error}");
    }
}
#[derive(Serialize)]
struct PermissionsDiagnostic {
    pid: u32,
    permissions: i32,
    hook_state: i32,
}
#[tauri::command]
async fn permissions_diagnostic() -> PermissionsDiagnostic {
    PermissionsDiagnostic {
        pid: std::process::id(),
        permissions: unsafe { hf_permissions() },
        hook_state: unsafe { hf_hook_state() },
    }
}
#[tauri::command]
async fn request_microphone() {
    PERMISSION_REQUESTS.fetch_or(1, Ordering::Relaxed);
    unsafe { hf_request_microphone() }
}
#[tauri::command]
async fn request_permissions() {
    PERMISSION_REQUESTS.fetch_or(2, Ordering::Relaxed);
    unsafe { hf_request_permissions() }
}
#[tauri::command]
async fn open_keyboard() {
    unsafe { hf_keyboard() }
}
#[tauri::command]
async fn cancel() {
    enqueue(Control::Cancel);
}
#[tauri::command]
async fn set_sounds(enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let s = state();
        let mut inner = s.inner.lock().unwrap();
        let mut updated = inner.store.clone();
        updated.sounds = enabled;
        storage::save(&s.directory.join("usage.json"), &updated)?;
        inner.store = updated;
        inner.status.sounds = enabled;
        inner.status.persistence_error.clear();
        drop(inner);
        unsafe {
            hf_sounds(enabled);
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn set_recording_limit(seconds: u32) -> Result<(), String> {
    storage::validate_recording_limit(seconds)?;
    tauri::async_runtime::spawn_blocking(move || {
        let s = state();
        let mut inner = s.inner.lock().unwrap();
        let mut updated = inner.store.clone();
        updated.recording_limit = seconds;
        storage::save(&s.directory.join("usage.json"), &updated)?;
        inner.store = updated;
        inner.status.recording_limit = seconds;
        inner.status.persistence_error.clear();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn capture_shortcut(active: bool) -> Result<(), String> {
    if active && !shortcut_edit_allowed(&state().inner.lock().unwrap().status.phase) {
        return Err("Finish dictation before recording a shortcut.".into());
    }
    tauri::async_runtime::spawn_blocking(move || unsafe { hf_capture_shortcut(active) })
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn set_shortcut(shortcut: shortcut::Shortcut) -> Result<(), String> {
    shortcut.validate()?;
    tauri::async_runtime::spawn_blocking(move || {
        let s = state();
        let mut inner = s.inner.lock().unwrap();
        if !shortcut_edit_allowed(&inner.status.phase) {
            return Err("Finish dictation before changing the shortcut.".into());
        }
        let mut updated = inner.store.clone();
        updated.shortcut = shortcut.clone();
        #[cfg(windows)]
        shortcut::replace_checked(
            &inner.store.shortcut,
            &shortcut,
            |binding| unsafe { hf_try_shortcut(binding.keycode().unwrap(), binding.modifiers) },
            || storage::save(&s.directory.join("usage.json"), &updated),
        )?;
        #[cfg(not(windows))]
        storage::save(&s.directory.join("usage.json"), &updated)?;
        inner.store = updated;
        inner.status.shortcut = shortcut.clone();
        inner.status.shortcut_label = shortcut.label();
        inner.status.message = format!("Select a text field and press {}.", shortcut.label());
        inner.status.persistence_error.clear();
        drop(inner);
        GESTURE
            .lock()
            .unwrap()
            .event_with_epoch(6, Instant::now(), CANCELLATION.current());
        #[cfg(not(windows))]
        unsafe {
            hf_shortcut(shortcut.keycode().unwrap(), shortcut.modifiers);
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn set_sound_style(style: String) -> Result<(), String> {
    storage::validate_sound_style(&style)?;
    tauri::async_runtime::spawn_blocking(move || {
        let s = state();
        let mut inner = s.inner.lock().unwrap();
        if !preview_allowed(&inner.status.phase) {
            return Err("Finish dictation before changing the sound.".into());
        }
        let mut updated = inner.store.clone();
        updated.sound_style = style.clone();
        storage::save(&s.directory.join("usage.json"), &updated)?;
        inner.store = updated;
        inner.status.sound_style = style.clone();
        inner.status.persistence_error.clear();
        drop(inner);
        unsafe {
            hf_sound_style(if style == "warm" { 1 } else { 0 });
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn set_sound_volume(volume: f32) -> Result<(), String> {
    storage::validate_volume(volume)?;
    tauri::async_runtime::spawn_blocking(move || {
        let s = state();
        let mut inner = s.inner.lock().unwrap();
        let mut updated = inner.store.clone();
        updated.sound_volume = volume;
        storage::save(&s.directory.join("usage.json"), &updated)?;
        inner.store = updated;
        inner.status.sound_volume = volume;
        inner.status.persistence_error.clear();
        drop(inner);
        unsafe {
            hf_sound_volume(volume / 100.0);
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
fn preview_allowed(phase: &str) -> bool {
    matches!(phase, "idle" | "copied")
}
fn shortcut_edit_allowed(phase: &str) -> bool {
    matches!(
        phase,
        "idle" | "setup_required" | "not_pasted" | "copied" | "error"
    )
}
#[tauri::command]
async fn preview_sound() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        if !preview_allowed(&state().inner.lock().unwrap().status.phase) {
            return Err("Preview is available only while idle.".into());
        }
        // Native checks again on AppKit's queue: recording may start after the
        // phase snapshot. No state lock is held while dispatching to AppKit.
        if unsafe { hf_preview_sound() } {
            Ok(())
        } else {
            Err("Sound is busy. Try again when idle.".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod sound_tests {
    #[test]
    fn native_finish_inputs_share_fifo_and_cancel_revokes_pending_finish() {
        use super::*;
        // Actual native-event routing, with a mock worker instead of AppKit,
        // microphone, global app state or audio playback.
        let (sender, receiver) = std::sync::mpsc::channel();
        let cancellation = cancellation::CancellationEpoch::new();
        let gesture = Mutex::new(logic::FnGesture::new());
        let event = |value| {
            route_native_event(value, &gesture, &cancellation, |control, epoch| {
                sender.send((control, epoch)).unwrap();
            });
        };
        for events in [&[1, 2][..], &[5][..], &[7][..]] {
            event(6);
            for value in events {
                event(*value);
            }
            let (control, epoch) = receiver.try_recv().unwrap();
            assert!(cancellation.allows(epoch));
            let request = match control {
                Control::Toggle => None,
                Control::Finish(generation) => Some(generation),
                _ => panic!("Not a recording command"),
            };
            assert!(request.is_none_or(|generation| logic::can_finish("recording", 1, generation)));
            // A mock worker changes phase before calling native Finish; a
            // repeated tick/limit cannot trigger the native stop/cue twice.
            assert!(!logic::can_finish("processing", 1, request.flatten()));
            assert!(receiver.try_recv().is_err());
        }
        sender
            .send((Control::Finish(Some(1)), cancellation.current()))
            .unwrap(); // Duration limit.
        event(4); // Receipt-time cancellation, before FIFO execution.
        let (finish, old_epoch) = receiver.try_recv().unwrap();
        assert!(matches!(finish, Control::Finish(Some(1))));
        assert!(!cancellation.allows(old_epoch));
        let (cancel, new_epoch) = receiver.try_recv().unwrap();
        assert!(matches!(cancel, Control::Cancel));
        assert!(cancellation.allows(new_epoch));
        // Finish while the start cue is pending uses the same request, but
        // native CaptureEnd suppresses playback when stop reports not started.
        event(1);
        event(5);
        event(2);
        assert!(matches!(
            receiver.try_recv().unwrap().0,
            Control::Finish(None)
        ));
        assert!(
            receiver.try_recv().is_err(),
            "Tick suppresses held Fn release"
        );
    }
    #[test]
    fn shortcut_setup_does_not_require_a_working_old_shortcut() {
        for phase in ["idle", "setup_required", "not_pasted", "copied", "error"] {
            assert!(super::shortcut_edit_allowed(phase));
        }
        for phase in ["recording", "processing", "downloading", "unknown"] {
            assert!(!super::shortcut_edit_allowed(phase));
        }
    }
    #[test]
    fn preview_only_while_idle() {
        assert!(super::preview_allowed("idle"));
        assert!(super::preview_allowed("copied"));
        for phase in [
            "recording",
            "processing",
            "downloading",
            "setup_required",
            "error",
            "not_pasted",
        ] {
            assert!(!super::preview_allowed(phase));
        }
    }
}
#[tauri::command]
async fn reset_stats(confirmed: bool) -> Result<(), String> {
    if !confirmed {
        return Err("Confirm before resetting usage totals.".into());
    }
    tauri::async_runtime::spawn_blocking(|| {
        let s = state();
        let mut inner = s.inner.lock().unwrap();
        let mut updated = inner.store.clone();
        updated.stats = storage::Stats::default();
        storage::save(&s.directory.join("usage.json"), &updated)?;
        inner.store = updated;
        inner.status.stats = inner.store.stats.clone();
        inner.status.persistence_error.clear();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn copy_transcript() -> Result<(), String> {
    let text = state().inner.lock().unwrap().status.transcript.clone();
    if text.is_empty() {
        return Err("No transcript to copy yet.".into());
    }
    #[cfg(windows)]
    if unsafe { hf_copy_checked(cstring(&text)?.as_ptr()) } != 0 {
        return Err(
            "Windows could not copy the transcript. The clipboard may be busy; try again.".into(),
        );
    }
    #[cfg(not(windows))]
    unsafe {
        hf_copy(cstring(&text)?.as_ptr());
    }
    Ok(())
}
fn cancel_inner() {
    let s = state();
    let mut inner = s.inner.lock().unwrap();
    // A cancellation enqueued earlier must not cancel a genuinely newer tap
    // whose receipt epoch already includes that cancellation.
    if CANCELLATION.allows(inner.session_epoch) {
        return;
    }
    if !["recording", "processing"].contains(&inner.status.phase.as_str()) {
        return;
    }
    inner.status.phase = "processing".into();
    inner.status.message = "Cancelling…".into();
    drop(inner);
    unsafe {
        hf_cancel_audio();
        hf_discard_target();
        hf_overlay(0);
    }
    if let Some(session) = INGRESS.lock().unwrap().current() {
        session.cancel();
    }
}
fn toggle_recording(finish: Option<Option<u64>>, epoch: u64) {
    if !CANCELLATION.allows(epoch) {
        return;
    }
    let s = state();
    let mut inner = s.inner.lock().unwrap();
    if !CANCELLATION.allows(epoch) {
        return;
    }
    if let Some(generation) = finish {
        if !logic::can_finish(&inner.status.phase, inner.generation, generation) {
            return;
        }
    }
    if inner.status.phase == "recording" {
        inner.status.phase = "processing".into();
        inner.status.message = "Transcribing locally…".into();
        drop(inner);
        unsafe {
            hf_finish(epoch, delivery_allowed);
            hf_overlay(2);
        }
        if let Some(session) = INGRESS.lock().unwrap().current() {
            session.finish(None);
        }
        return;
    }
    if ["processing", "downloading"].contains(&inner.status.phase.as_str()) {
        return;
    }
    if INGRESS.lock().unwrap().current().is_some() {
        return;
    }
    let permissions = unsafe { hf_permissions() };
    if !inner.status.model_ready
        || permissions & platform::REQUIRED_PERMISSIONS != platform::REQUIRED_PERMISSIONS
    {
        inner.status.phase = "setup_required".into();
        inner.status.message =
            logic::setup_message(permissions, inner.status.model_ready, inner.status.hotkey)
                .unwrap_or_default();
        unsafe {
            hf_overlay(3);
        }
        return;
    }
    inner.generation += 1;
    inner.session_epoch = epoch;
    let generation = inner.generation;
    let limit = inner.store.recording_limit;
    let session = Arc::new(streaming::Session::new(generation, epoch, limit));
    if !INGRESS.lock().unwrap().start(session.clone()) {
        return;
    }
    inner.status.phase = "recording".into();
    inner.status.message = format!(
        "Press {} to finish, Escape to cancel. Maximum {} minutes.",
        inner.store.shortcut.label(),
        limit / 60
    );
    drop(inner);
    let started = unsafe { hf_record(generation, epoch, delivery_allowed, capture_audio) };
    if started && CANCELLATION.allows(epoch) {
        unsafe {
            hf_overlay(1);
        }
    } else {
        session.finish(Some(
            "Microphone could not start. Check permissions and your input device.".into(),
        ));
    }
    std::thread::spawn(move || transcribe(session));
}
fn transcribe(session: Arc<streaming::Session>) {
    let s = state();
    let result = infer(&session, &model_path(&s));
    let epoch = session.epoch;
    enqueue_at(Control::Complete(session, result), epoch);
}
fn complete_transcription(session: Arc<streaming::Session>, result: Result<String, String>) {
    let s = state();
    let generation = session.generation;
    let epoch = session.epoch;
    {
        let inner = s.inner.lock().unwrap();
        if inner.generation != generation || inner.session_epoch != epoch {
            return;
        }
    }
    if INGRESS.lock().unwrap().get(generation, epoch).is_none() {
        return;
    }
    // All native teardown and final delivery execute on the same FIFO as
    // start/finish/cancel. An early failure cannot race Finish's overlay, and a
    // stale completion cannot stop or discard a newer session's native target.
    // Even early inference failure/cancellation must drain the native producer
    // before acknowledging teardown and allowing a new session.
    unsafe {
        if CANCELLATION.allows(epoch) {
            hf_stop(); // Preserve an already-playing normal finish cue.
        } else {
            hf_cancel_audio();
        }
    }
    session.finish(None);
    let result = session
        .check()
        .and(result)
        .map(|text| transcript::clean(&text));
    let seconds = session.seconds();
    let mut inner = s.inner.lock().unwrap();
    if inner.generation != generation {
        return;
    }
    INGRESS.lock().unwrap().release(generation, epoch);
    if !CANCELLATION.allows(epoch) {
        inner.status.phase = "idle".into();
        inner.status.message = "Cancelled.".into();
        unsafe {
            hf_discard_target();
            hf_overlay(0);
        }
        return;
    }
    match result {
        Ok(text) if text.is_empty() => {
            inner.status.phase = "idle".into();
            inner.status.message = logic::NO_SPEECH_MESSAGE.into();
            unsafe {
                hf_discard_target();
                hf_overlay(4);
            }
        }
        Ok(text) => {
            drop(inner);
            let result = match cstring(&text) {
                Ok(p) => unsafe { hf_paste(p.as_ptr(), epoch, delivery_allowed) },
                Err(_) => {
                    unsafe { hf_discard_target() };
                    -1
                }
            };
            // Submitted Paste is not acknowledged by macOS: never copy again
            // after submission. Refusals keep the same insertion-safe text.
            let copy_result = if logic::should_copy_fallback(&text, result) {
                match cstring(&text) {
                    Ok(p) => unsafe { hf_copy_fallback(p.as_ptr(), epoch, delivery_allowed) },
                    Err(_) => -1,
                }
            } else {
                -1
            };
            let mut inner = s.inner.lock().unwrap();
            if inner.generation != generation {
                return;
            }
            let mut completed_stats = inner.store.stats.clone();
            completed_stats.record(&text, seconds);
            // Cancellation can arrive while hf_paste waits for the main thread,
            // including while inner is locked. Never publish a cancelled result.
            if result == 16
                || copy_result == 16
                || CANCELLATION
                    .accept(epoch, || {
                        inner.store.stats = completed_stats;
                        inner.status.stats = inner.store.stats.clone();
                        inner.status.transcript = text;
                    })
                    .is_none()
            {
                inner.status.phase = "idle".into();
                inner.status.message = "Cancelled.".into();
                unsafe {
                    hf_discard_target();
                    hf_overlay(0);
                }
                return;
            }
            let pasted = result == 0;
            let copied = copy_result == 0;
            inner.status.phase = if pasted {
                "idle"
            } else if copied {
                "copied"
            } else {
                "not_pasted"
            }
            .into();
            inner.status.message = if copied {
                logic::copied_message(result)
            } else {
                logic::paste_message(result)
            };
            unsafe {
                hf_overlay(if pasted {
                    0
                } else if copied {
                    5
                } else {
                    3
                });
            }
            // Disk sync is deliberately after delivery, never between inference
            // completion and the final native focus / cancellation boundary.
            inner.status.persistence_error =
                storage::save(&s.directory.join("usage.json"), &inner.store)
                    .err()
                    .map(|e| format!("Usage couldn’t be saved: {e}"))
                    .unwrap_or_default();
        }
        Err(e) => {
            inner.status.phase = "error".into();
            inner.status.message = e;
            unsafe {
                hf_discard_target();
                hf_overlay(3);
            }
        }
    }
}
// whisper-rs 0.16.0's safe abort trampoline casts Box<Box<dyn FnMut()>>
// to the concrete closure type (and leaks it). Use a typed, borrowed session
// instead; whisper_full invokes this synchronously, and only atomics are read.
unsafe extern "C" fn inference_aborted(data: *mut std::ffi::c_void) -> bool {
    let session = unsafe { &*data.cast::<streaming::Session>() };
    !CANCELLATION.allows(session.epoch) || session.cancelled.load(Ordering::Acquire)
}

fn infer(session: &Arc<streaming::Session>, model: &Path) -> Result<String, String> {
    streaming::run(
        session,
        || {
            let mut context_params = WhisperContextParameters::default();
            context_params.use_gpu(cfg!(target_os = "macos"));
            WhisperContext::new_with_params(model, context_params)
                .map_err(|e| format!("Cannot load model: {e}"))
        },
        |context, samples| {
            let mut state = context.create_state().map_err(|e| e.to_string())?;
            let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
            params.set_language(Some("en"));
            params.set_translate(false);
            params.set_n_threads(4);
            params.set_print_special(false);
            params.set_print_progress(false);
            params.set_print_realtime(false);
            params.set_print_timestamps(false);
            params.set_no_context(true);
            params.set_suppress_blank(true);
            // SAFETY: session's Arc outlives this synchronous full() call.
            // The callback never mutates the pointee or retains its pointer.
            unsafe {
                params.set_abort_callback(Some(inference_aborted));
                params.set_abort_callback_user_data(Arc::as_ptr(session).cast_mut().cast());
            }
            // No rewriting, punctuation pass, or filler removal. Whisper can still omit disfluencies.
            params.set_initial_prompt("Um, uh, well, you know, I mean, like, hmm. This is a verbatim transcript, including hesitations and repeated words.");
            state
                .full(params, samples)
                .map_err(|e| {
                    if !CANCELLATION.allows(session.epoch)
                        || session.cancelled.load(Ordering::Acquire)
                    {
                        "Cancelled.".into()
                    } else {
                        format!("Transcription failed: {e}. Try again; if it continues, quit and reopen HandsFree.")
                    }
                })?;
            let mut output = String::new();
            for segment in state.as_iter() {
                if segment.no_speech_probability() > 0.6 {
                    continue;
                }
                output.push_str(segment.to_str().map_err(|e| e.to_string())?);
            }
            Ok(logic::insertion_text(&output))
        },
    )
}

#[cfg(test)]
#[test]
fn abort_callback_reads_the_actual_session() {
    let session = Arc::new(streaming::Session::new(1, CANCELLATION.current(), 120));
    let data = Arc::as_ptr(&session).cast_mut().cast();
    assert!(!unsafe { inference_aborted(data) });
    session.cancel();
    assert!(unsafe { inference_aborted(data) });
    let stale = streaming::Session::new(2, CANCELLATION.current().wrapping_sub(1), 120);
    assert!(unsafe { inference_aborted((&stale as *const streaming::Session).cast_mut().cast()) });
}

#[cfg(test)]
#[test]
#[ignore = "requires HANDSFREE_TEST_MODEL pointing at an existing model; no download or microphone"]
fn real_model_pipeline_smoke() {
    let model = std::env::var_os("HANDSFREE_TEST_MODEL").expect("existing local model path");
    let session = Arc::new(streaming::Session::new(1, CANCELLATION.current(), 300));
    // Synthetic signal only: tests backend execution, not recognition accuracy.
    let mut audio: Vec<f32> = (0..8 * streaming::RATE)
        .map(|i| (i as f32 * 0.0864).sin() * 0.02)
        .collect();
    audio.extend(vec![0.; streaming::RATE]);
    audio.extend(vec![0.02; 960]);
    let worker_session = session.clone();
    let worker = std::thread::spawn(move || infer(&worker_session, &PathBuf::from(model)));
    session.push(&audio);
    // The first pause chunk is available before Finish; the short tail is
    // delivered afterward using the same context and a fresh inference state.
    std::thread::sleep(std::time::Duration::from_secs(2));
    assert!(
        !worker.is_finished(),
        "worker waits for Finish after its early chunk"
    );
    session.finish(None);
    worker
        .join()
        .unwrap()
        .expect("real backend accepts pause chunk and short tail");
}

#[tauri::command]
async fn download_model() -> Result<(), String> {
    {
        let s = state();
        let mut inner = s.inner.lock().unwrap();
        if inner.status.model_ready {
            return Ok(());
        }
        if ["recording", "processing", "downloading"].contains(&inner.status.phase.as_str()) {
            return Err("Please wait for the current operation.".into());
        }
        inner.status.phase = "downloading".into();
        inner.status.progress = 0.;
        inner.status.message =
            "Downloading from Hugging Face. This is the only network operation.".into();
    }
    let result = download().await;
    let s = state();
    let mut inner = s.inner.lock().unwrap();
    match &result {
        Ok(_) => {
            inner.status.model_ready = true;
            inner.status.phase = "idle".into();
            inner.status.message =
                "Model verified. Finish permissions, then use your shortcut in a text field."
                    .into();
        }
        Err(e) => {
            inner.status.phase = "error".into();
            inner.status.message = format!("Download failed: {e}. You can retry.");
        }
    }
    result
}
async fn download() -> Result<(), String> {
    let s = state();
    let partial = s.directory.join("model.download");
    let result: Result<(), String> = async {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(1800))
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .get(MODEL_URL)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        let mut stream = response.bytes_stream();
        let mut file = tokio::fs::File::create(&partial)
            .await
            .map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut total = 0u64;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            total += chunk.len() as u64;
            if total > MODEL_SIZE {
                return Err("Unexpected model size".into());
            }
            hash.update(&chunk);
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            s.inner.lock().unwrap().status.progress = total as f32 / MODEL_SIZE as f32 * 100.;
        }
        file.sync_all().await.map_err(|e| e.to_string())?;
        drop(file);
        if total != MODEL_SIZE || format!("{:x}", hash.finalize()) != MODEL_HASH {
            return Err("Model checksum mismatch".into());
        }
        storage::replace_file(&partial, &model_path(&s)).map_err(|e| e.to_string())?;
        Ok(())
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(partial).await;
    }
    result
}
fn show_settings(app: &tauri::AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window("main") {
            unsafe { hf_dashboard_visible(true) };
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    });
}
fn handle_permission_args(app: &tauri::AppHandle, args: &[String]) {
    let requests = logic::permission_requests(args);
    if !requests.microphone && !requests.accessibility {
        return;
    }
    show_settings(app);
    // Only explicit setup arguments request consent; never start capture/download.
    if requests.accessibility {
        PERMISSION_REQUESTS.fetch_or(2, Ordering::Relaxed);
        unsafe { hf_request_accessibility() };
    }
    if requests.microphone {
        PERMISSION_REQUESTS.fetch_or(1, Ordering::Relaxed);
        unsafe { hf_request_microphone() };
    }
    refresh_status();
}
fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            show_settings(app);
            handle_permission_args(app, &args);
        }))
        .invoke_handler(tauri::generate_handler![
            status,
            permissions_diagnostic,
            request_microphone,
            request_permissions,
            open_keyboard,
            download_model,
            cancel,
            copy_transcript,
            set_sounds,
            set_recording_limit,
            set_sound_volume,
            set_sound_style,
            set_shortcut,
            capture_shortcut,
            preview_sound,
            reset_stats
        ])
        .setup(|app| {
            // The initial dashboard is visible; LSUIElement remains the quiet
            // background default after its window is closed.
            unsafe { hf_dashboard_visible(true) };
            let directory = app.path().app_local_data_dir()?;
            fs::create_dir_all(&directory)?;
            storage::private_directory(&directory)?;
            let _ = fs::remove_file(directory.join("recording.wav"));
            let _ = fs::remove_file(directory.join("model.download"));
            let ready = verified_model(&directory.join("ggml-base.en.bin"));
            let (store, persistence_error) = match storage::load(&directory.join("usage.json")) {
                Ok(store) => (store, String::new()),
                Err(e) => (
                    storage::Store::default(),
                    format!("Local usage/settings couldn’t be read: {e}"),
                ),
            };
            unsafe {
                hf_sounds(store.sounds);
                hf_sound_volume(store.sound_volume / 100.0);
                hf_sound_style(if store.sound_style == "warm" { 1 } else { 0 });
                hf_shortcut(store.shortcut.keycode().unwrap(), store.shortcut.modifiers);
            }
            app.manage(AppState {
                directory,
                inner: Mutex::new(Inner {
                    generation: 0,
                    session_epoch: CANCELLATION.current(),
                    status: Status {
                        platform: std::env::consts::OS,
                        phase: "idle".into(),
                        message: if ready {
                            format!("Select a text field and press {}.", store.shortcut.label())
                        } else {
                            "Welcome. Open Settings to finish setup.".into()
                        },
                        progress: 0.,
                        model_ready: ready,
                        microphone: false,
                        accessibility: false,
                        input_monitoring: false,
                        hotkey: false,
                        transcript: String::new(),
                        sounds: store.sounds,
                        sound_volume: store.sound_volume,
                        sound_style: store.sound_style.clone(),
                        recording_limit: store.recording_limit,
                        shortcut: store.shortcut.clone(),
                        shortcut_label: store.shortcut.label(),
                        stats: store.stats.clone(),
                        persistence_error,
                        permission_requests: 0,
                    },
                    store,
                }),
            });
            APP.set(app.handle().clone()).unwrap();
            let executable_hash = std::env::current_exe()
                .ok()
                .and_then(|p| fs::read(p).ok())
                .map(|bytes| format!("{:x}", Sha256::digest(bytes)))
                .unwrap_or_default();
            let _ = EXECUTABLE_HASH.set(executable_hash);
            let (sender, receiver) = std::sync::mpsc::channel();
            let _ = CONTROLS.set(sender);
            // Preserve Fn / Escape ordering; inference runs off this executor.
            std::thread::spawn(move || {
                for (control, epoch) in receiver {
                    match control {
                        Control::Toggle => toggle_recording(None, epoch),
                        Control::Cancel => cancel_inner(),
                        Control::Finish(generation) => toggle_recording(Some(generation), epoch),
                        Control::Complete(session, result) => {
                            complete_transcription(session, result)
                        }
                    }
                }
            });
            let settings = MenuItem::with_id(
                app,
                "settings",
                "Settings / Last transcript…",
                true,
                None::<&str>,
            )?;
            let cancel = MenuItem::with_id(app, "cancel", "Cancel dictation", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit HandsFree", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings, &cancel, &quit])?;
            TrayIconBuilder::new()
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../icons/tray.png"
                ))?)
                .icon_as_template(true)
                .tooltip("HandsFree · Dictation")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "settings" => show_settings(app),
                    "cancel" => {
                        enqueue(Control::Cancel);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_settings(tray.app_handle());
                    }
                })
                .build(app)?;
            unsafe {
                hf_hook(native_event);
            }
            refresh_status();
            handle_permission_args(app.handle(), &std::env::args().collect::<Vec<_>>());
            std::thread::spawn(|| loop {
                std::thread::sleep(Duration::from_secs(2));
                refresh_status();
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                if window.label() == "main" {
                    unsafe { hf_dashboard_visible(false) };
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Could not start HandsFree");
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            unsafe {
                hf_cleanup();
            }
            let _ = fs::remove_file(recording_path(&app.state::<AppState>()));
        }
    });
}

#[cfg(test)]
mod audio_tests {
    use super::*;
    #[test]
    fn resetting_without_confirmation_never_touches_state() {
        assert!(tauri::async_runtime::block_on(reset_stats(false)).is_err());
    }
    #[test]
    fn silence_never_loads_a_model() {
        let session = Arc::new(streaming::Session::new(1, CANCELLATION.current(), 120));
        session.push(&vec![0.; 16000]);
        session.finish(None);
        let result = infer(&session, Path::new("/nonexistent-model.bin"));
        assert_eq!(result.unwrap(), "");
    }
    #[test]
    fn missing_model_fails_verification() {
        assert!(!verified_model(Path::new("/nonexistent-model.bin")));
    }
}
