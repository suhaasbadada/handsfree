unsafe extern "C" {
    pub fn hf_appearance(mode: i32) -> bool;
    pub fn hf_input_level(generation: u64, epoch: u64, allowed: extern "C" fn(u64) -> bool) -> f32;
    pub fn hf_compatibility(enabled: bool) -> bool;
    fn hf_focus_diagnostic(buffer: *mut u8, capacity: i32) -> i32;
    pub fn hf_mode(mode: i32) -> bool;
    pub fn hf_start_gate(callback: extern "C" fn(u64) -> bool);
    pub fn hf_gesture_hook(callback: extern "C" fn(i32, i32, u64));
    pub fn hf_gesture_complete(token: u64);
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
        practice: bool,
        receipt: u64,
        microphone_uid: *const std::ffi::c_char,
        limit: u32,
        elapsed: extern "C" fn(u64, u64) -> f64,
        allowed: extern "C" fn(u64) -> bool,
        sink: extern "C" fn(u64, u64, *const f32, i32),
    ) -> bool;
    fn hf_microphones(buffer: *mut u8, capacity: i32) -> i32;
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
    pub fn hf_paste_generation(
        text: *const std::ffi::c_char,
        generation: u64,
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

unsafe extern "C" {
    pub fn hf_paused(paused: bool);
    pub fn hf_is_paused() -> bool;
    pub fn hf_shortcut_ticket() -> u64;
    pub fn hf_excluded(json: *const std::ffi::c_char);
    fn hf_workflow_status(buffer: *mut u8, capacity: i32) -> i32;
    fn hf_running_apps(buffer: *mut u8, capacity: i32) -> i32;
    fn hf_login(enabled: bool, buffer: *mut u8, capacity: i32) -> i32;
    pub fn hf_login_settings();
}
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LoginState {
    Enabled,
    ApprovalRequired,
    NotRegistered,
    NotFound,
    Unknown,
}
#[derive(serde::Deserialize, serde::Serialize)]
pub struct LoginStatus {
    pub status: LoginState,
    pub error: Option<String>,
}
#[derive(serde::Deserialize, serde::Serialize)]
pub struct WorkflowStatus {
    pub paused: bool,
    pub excluded_bundle_ids: Vec<String>,
    pub login: LoginStatus,
}
#[derive(serde::Deserialize, serde::Serialize)]
pub struct RunningApp {
    pub bundle_id: String,
    pub name: String,
}
fn read_json<T: serde::de::DeserializeOwned>(
    read: impl FnOnce(*mut u8, i32) -> i32,
) -> Result<T, String> {
    let mut buffer = vec![0; 262144];
    let length = read(buffer.as_mut_ptr(), buffer.len() as i32);
    if length <= 0 || length as usize > buffer.len() {
        return Err("Native workflow metadata unavailable.".into());
    }
    serde_json::from_slice(&buffer[..length as usize]).map_err(|e| e.to_string())
}
pub fn workflow_snapshot() -> Result<WorkflowStatus, String> {
    read_json(|buffer, capacity| unsafe { hf_workflow_status(buffer, capacity) })
}
pub fn running_app_metadata() -> Result<Vec<RunningApp>, String> {
    read_json(|buffer, capacity| unsafe { hf_running_apps(buffer, capacity) })
}
pub fn change_login(enabled: bool) -> Result<LoginStatus, String> {
    read_json(|buffer, capacity| unsafe { hf_login(enabled, buffer, capacity) })
}

pub fn microphones() -> Result<serde_json::Value, String> {
    let mut buffer = vec![0u8; 65536];
    let length = unsafe { hf_microphones(buffer.as_mut_ptr(), buffer.len() as i32) };
    if length <= 0 || length as usize > buffer.len() {
        return Err("Could not list microphones. Try again.".into());
    }
    serde_json::from_slice(&buffer[..length as usize])
        .map_err(|_| "Invalid microphone list.".into())
}

// Main-thread cached metadata only; no live AX requests on status polling.
pub fn focus_diagnostic() -> Option<serde_json::Value> {
    let mut buffer = [0u8; 4096];
    let length = unsafe { hf_focus_diagnostic(buffer.as_mut_ptr(), buffer.len() as i32) };
    if length <= 0 || length as usize > buffer.len() {
        return None;
    }
    serde_json::from_slice(&buffer[..length as usize]).ok()
}
