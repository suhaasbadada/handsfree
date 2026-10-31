unsafe extern "C" {
    pub fn hf_dashboard_visible(visible: bool) -> bool;
    pub fn hf_activation_policy() -> i32;
    pub fn hf_permissions() -> i32;
    pub fn hf_microphone_status() -> i32;
    pub fn hf_request_microphone();
    pub fn hf_request_permissions();
    pub fn hf_request_accessibility();
    pub fn hf_keyboard();
    pub fn hf_hook(callback: extern "C" fn(i32)) -> bool;
    pub fn hf_hook_state() -> i32;
    pub fn hf_hook_reason() -> i32;
    pub fn hf_record(
        generation: u64,
        epoch: u64,
        allowed: extern "C" fn(u64) -> bool,
        sink: extern "C" fn(u64, u64, *const f32, i32),
    ) -> bool;
    pub fn hf_sounds(enabled: bool);
    pub fn hf_sound_volume(volume: f32);
    pub fn hf_preview_sound() -> bool;
    pub fn hf_sound_style(style: i32);
    pub fn hf_shortcut(code: i32, modifiers: u32);
    pub fn hf_capture_shortcut(active: bool);
    pub fn hf_stop();
    pub fn hf_finish(epoch: u64, allowed: extern "C" fn(u64) -> bool);
    pub fn hf_cancel_audio();
    pub fn hf_discard_target();
    pub fn hf_overlay(phase: i32);
    pub fn hf_paste(
        text: *const std::ffi::c_char,
        epoch: u64,
        allowed: extern "C" fn(u64) -> bool,
    ) -> i32;
    pub fn hf_copy(text: *const std::ffi::c_char);
    pub fn hf_copy_fallback(
        text: *const std::ffi::c_char,
        epoch: u64,
        allowed: extern "C" fn(u64) -> bool,
    ) -> i32;
    pub fn hf_cleanup();
}
