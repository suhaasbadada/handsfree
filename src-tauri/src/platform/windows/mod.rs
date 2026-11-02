//! Windows 10/11 desktop backend. No Swift or macOS permission dependencies.
// Internal facade deliberately mirrors the unsafe macOS FFI. Pointer-taking
// calls require a live NUL-terminated UTF-8 string until return; callbacks must
// remain valid for the process lifetime and be thread-safe/nonblocking.
#![allow(clippy::missing_safety_doc)]
mod audio;
mod clipboard_window;
mod cues;
mod delivery;
mod ui;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use windows::{
    core::{w, PCWSTR},
    Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
};
static ACTIVE: AtomicBool = AtomicBool::new(false);
static POWER: AtomicU32 = AtomicU32::new(0);
// Dock activation policy is a macOS-only capability, not a Windows operation.
pub unsafe fn hf_dashboard_visible(_visible: bool) -> bool {
    false
}
pub unsafe fn hf_activation_policy() -> i32 {
    -1
}
pub unsafe fn hf_permissions() -> i32 {
    use cpal::traits::HostTrait;
    // Device presence only. Windows desktop microphone consent is not exposed
    // by CPAL; actual access is tested only by an explicit recording attempt.
    i32::from(cpal::default_host().default_input_device().is_some())
}
pub unsafe fn hf_microphone_status() -> i32 {
    -1
} // authorization unknown, not granted
unsafe fn settings(uri: PCWSTR) {
    let _ = ShellExecuteW(None, w!("open"), uri, None, None, SW_SHOWNORMAL);
}
pub unsafe fn hf_request_microphone() {
    settings(w!("ms-settings:privacy-microphone"));
}
pub unsafe fn hf_request_permissions() {
    settings(w!("ms-settings:privacy-microphone"));
}
pub unsafe fn hf_request_accessibility() {
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK};
    let _ = MessageBoxW(None,
        w!("Windows does not require macOS Accessibility or Input Monitoring consent. HandsFree uses Windows UI Automation and copies the transcript if your editor cannot safely accept Paste. Microphone access is configured separately in Windows Settings."),
        w!("HandsFree · Windows permissions"), MB_OK | MB_ICONINFORMATION);
}
pub unsafe fn hf_keyboard() {
    settings(w!("ms-settings:typing"));
}
pub unsafe fn hf_hook(callback: extern "C" fn(i32)) -> bool {
    ui::hook(callback)
}
pub unsafe fn hf_mode(mode: i32) -> bool {
    ui::mode(mode == 1)
}
static START_GATE: std::sync::Mutex<Option<extern "C" fn(u64) -> bool>> =
    std::sync::Mutex::new(None);
pub unsafe fn hf_start_gate(callback: extern "C" fn(u64) -> bool) {
    *START_GATE.lock().unwrap() = Some(callback);
}
fn capture_start_allowed(generation: u64) -> bool {
    START_GATE.lock().unwrap().is_none_or(|cb| cb(generation))
}
pub unsafe fn hf_gesture_hook(callback: extern "C" fn(i32, i32, u64)) {
    ui::gesture_hook(callback);
}
pub unsafe fn hf_hook_state() -> i32 {
    if ui::REASON.load(Ordering::Acquire) == 1 {
        1
    } else {
        0
    }
}
pub unsafe fn hf_hook_reason() -> i32 {
    ui::REASON.load(Ordering::Acquire)
}
pub unsafe fn hf_shortcut(code: i32, modifiers: u32) {
    let _ = ui::bind(code, modifiers);
}
pub unsafe fn hf_try_shortcut(code: i32, modifiers: u32) -> bool {
    ui::bind(code, modifiers)
}
pub unsafe fn hf_capture_shortcut(active: bool) {
    ui::capture(active);
}
pub unsafe fn hf_record(
    generation: u64,
    epoch: u64,
    allowed: extern "C" fn(u64) -> bool,
    sink: extern "C" fn(u64, u64, *const f32, i32),
) -> bool {
    if !allowed(epoch) {
        return false;
    }
    // Arm Escape before any potentially blocking UIA work or start cue.
    ACTIVE.store(true, Ordering::Release);
    // Snapshot before the start cue, never activate or relocate the target.
    delivery::capture();
    if audio::start(generation, epoch, allowed, sink) {
        true
    } else {
        ACTIVE.store(false, Ordering::Release);
        false
    }
}
pub unsafe fn hf_stop() {
    let _ = audio::stop();
}
pub unsafe fn hf_finish(epoch: u64, allowed: extern "C" fn(u64) -> bool) {
    if audio::stop() && allowed(epoch) {
        cues::finish(epoch, allowed);
    }
}
pub unsafe fn hf_cancel_audio() {
    cues::cancel();
    audio::stop();
    ACTIVE.store(false, Ordering::Release);
}
pub unsafe fn hf_discard_target() {
    delivery::discard();
    ACTIVE.store(false, Ordering::Release);
}
pub unsafe fn hf_overlay(phase: i32) {
    if phase == 0 || phase >= 3 {
        ACTIVE.store(false, Ordering::Release);
    }
    ui::overlay(phase);
}
pub unsafe fn hf_sounds(enabled: bool) {
    cues::enabled(enabled);
}
pub unsafe fn hf_sound_volume(volume: f32) {
    cues::volume(volume);
}
pub unsafe fn hf_sound_style(style: i32) {
    cues::style(style);
}
pub unsafe fn hf_preview_sound() -> bool {
    cues::preview()
}
pub unsafe fn hf_paste(
    text: *const std::ffi::c_char,
    epoch: u64,
    allowed: extern "C" fn(u64) -> bool,
) -> i32 {
    delivery::paste(text, epoch, allowed)
}
#[allow(dead_code)] // Mirrors the Mac facade; Windows UI uses checked copy.
pub unsafe fn hf_copy(text: *const std::ffi::c_char) {
    let _ = delivery::copy(text, None);
}
pub unsafe fn hf_copy_checked(text: *const std::ffi::c_char) -> i32 {
    delivery::copy(text, None)
}
pub unsafe fn hf_copy_fallback(
    text: *const std::ffi::c_char,
    epoch: u64,
    allowed: extern "C" fn(u64) -> bool,
) -> i32 {
    delivery::copy(text, Some((epoch, allowed)))
}
pub unsafe fn hf_cleanup() {
    hf_cancel_audio();
    delivery::cleanup();
    ui::cleanup();
}
