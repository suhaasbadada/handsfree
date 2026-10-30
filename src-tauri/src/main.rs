#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod logic;
use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    ffi::CString,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
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
unsafe extern "C" {
    fn hf_permissions() -> i32;
    fn hf_request_microphone();
    fn hf_request_permissions();
    fn hf_keyboard();
    fn hf_hook(callback: extern "C" fn(i32)) -> bool;
    fn hf_record(path: *const std::ffi::c_char) -> bool;
    fn hf_stop();
    fn hf_overlay(phase: i32);
    fn hf_paste(text: *const std::ffi::c_char) -> bool;
    fn hf_copy(text: *const std::ffi::c_char);
    fn hf_cleanup();
}
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static GESTURE: Mutex<logic::FnGesture> = Mutex::new(logic::FnGesture::new());
static CONTROLS: OnceLock<std::sync::mpsc::Sender<Control>> = OnceLock::new();
enum Control {
    Toggle,
    Cancel,
}
fn enqueue(control: Control) {
    if let Some(sender) = CONTROLS.get() {
        let _ = sender.send(control);
    }
}

#[derive(Clone, Serialize)]
struct Status {
    phase: String,
    message: String,
    progress: f32,
    model_ready: bool,
    microphone: bool,
    accessibility: bool,
    input_monitoring: bool,
    hotkey: bool,
    transcript: String,
}
struct Inner {
    status: Status,
    generation: u64,
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
    let toggle = GESTURE.lock().unwrap().event(event, Instant::now());
    if toggle {
        enqueue(Control::Toggle);
    }
    if event == 4 {
        enqueue(Control::Cancel);
    }
}

#[tauri::command]
async fn status() -> Status {
    let s = state();
    let mut inner = s.inner.lock().unwrap();
    let p = unsafe { hf_permissions() };
    inner.status.microphone = p & 1 != 0;
    inner.status.accessibility = p & 2 != 0;
    inner.status.input_monitoring = p & 4 != 0;
    inner.status.hotkey = unsafe { hf_hook(native_event) };
    inner.status.clone()
}
#[tauri::command]
async fn request_microphone() {
    unsafe { hf_request_microphone() }
}
#[tauri::command]
async fn request_permissions() {
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
async fn copy_transcript() -> Result<(), String> {
    let text = state().inner.lock().unwrap().status.transcript.clone();
    unsafe {
        hf_copy(cstring(&text)?.as_ptr());
    }
    Ok(())
}
fn cancel_inner() {
    let s = state();
    let mut inner = s.inner.lock().unwrap();
    if !["recording", "processing"].contains(&inner.status.phase.as_str()) {
        return;
    }
    inner.generation += 1;
    unsafe {
        hf_stop();
        hf_overlay(0);
    }
    let _ = fs::remove_file(recording_path(&s));
    // Inference cannot be interrupted safely by freeing its context. Keep busy
    // until it returns, but its generation can no longer paste anything.
    if inner.status.phase == "recording" {
        inner.status.phase = "idle".into();
    }
    inner.status.message = "Cancelled. No text was pasted.".into();
}
fn toggle_recording() {
    let s = state();
    let mut inner = s.inner.lock().unwrap();
    if inner.status.phase == "recording" {
        unsafe {
            hf_stop();
            hf_overlay(2);
        }
        inner.status.phase = "processing".into();
        inner.status.message = "Transcribing locally…".into();
        let generation = inner.generation;
        drop(inner);
        std::thread::spawn(move || transcribe(generation));
        return;
    }
    if ["processing", "downloading"].contains(&inner.status.phase.as_str()) {
        return;
    }
    let permissions = unsafe { hf_permissions() };
    if !inner.status.model_ready || permissions & 7 != 7 {
        inner.status.phase = "error".into();
        inner.status.message =
            "Open Handsfree from the menu bar to finish permissions and model setup.".into();
        unsafe {
            hf_overlay(3);
        }
        return;
    }
    let path = recording_path(&s);
    // Precreate with owner-only permissions before handing it to AVAudioRecorder.
    use std::os::unix::fs::OpenOptionsExt;
    if fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&path)
        .is_err()
    {
        inner.status.phase = "error".into();
        inner.status.message = "Cannot create private recording file.".into();
        return;
    }
    let started = cstring(&path.to_string_lossy()).is_ok_and(|p| unsafe { hf_record(p.as_ptr()) });
    if !started {
        let _ = fs::remove_file(path);
        inner.status.phase = "error".into();
        inner.status.message =
            "Microphone could not start. Check permissions and your input device.".into();
        return;
    }
    inner.generation += 1;
    let generation = inner.generation;
    inner.status.phase = "recording".into();
    inner.status.message = "Tap Fn to finish, Escape to cancel. Maximum 2 minutes.".into();
    unsafe {
        hf_overlay(1);
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(120)).await;
        tauri::async_runtime::spawn_blocking(move || {
            let s = state();
            let mut inner = s.inner.lock().unwrap();
            if inner.generation == generation && inner.status.phase == "recording" {
                unsafe {
                    hf_stop();
                    hf_overlay(2);
                }
                inner.status.phase = "processing".into();
                drop(inner);
                transcribe(generation);
            }
        });
    });
}
fn transcribe(generation: u64) {
    let s = state();
    let result = infer(&recording_path(&s), &model_path(&s));
    let _ = fs::remove_file(recording_path(&s));
    let mut inner = s.inner.lock().unwrap();
    if inner.generation != generation {
        inner.status.phase = "idle".into();
        unsafe {
            hf_overlay(0);
        }
        return;
    }
    match result {
        Ok(text) if text.is_empty() => {
            inner.status.phase = "idle".into();
            inner.status.message = "No speech detected. Nothing pasted.".into();
            unsafe {
                hf_overlay(0);
            }
        }
        Ok(text) => {
            inner.status.transcript = text.clone();
            let pasted = cstring(&text).is_ok_and(|p| unsafe { hf_paste(p.as_ptr()) });
            inner.status.phase = "idle".into();
            inner.status.message = if pasted { "Text sent to your original field. Ready for the next thought." } else { "Focus changed or the field is unsupported. Your transcript is saved below; use Copy text." }.into();
            unsafe {
                hf_overlay(if pasted { 0 } else { 3 });
            }
        }
        Err(e) => {
            inner.status.phase = "error".into();
            inner.status.message = e;
            unsafe {
                hf_overlay(3);
            }
        }
    }
}
fn infer(audio: &Path, model: &Path) -> Result<String, String> {
    let mut reader =
        hound::WavReader::open(audio).map_err(|e| format!("Cannot read microphone audio: {e}"))?;
    let spec = reader.spec();
    if spec.sample_rate != 16000 || spec.channels != 1 || spec.bits_per_sample != 16 {
        return Err("Microphone did not produce 16 kHz mono PCM.".into());
    }
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / 32768.))
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    if !logic::usable_audio(&samples) {
        return Ok(String::new());
    }
    let mut context_params = WhisperContextParameters::default();
    context_params.use_gpu(true);
    let context = WhisperContext::new_with_params(model, context_params)
        .map_err(|e| format!("Cannot load model: {e}"))?;
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
    // No rewriting, punctuation pass, or filler removal. Whisper can still omit disfluencies.
    params.set_initial_prompt("Um, uh, well, you know, I mean, like, hmm. This is a verbatim transcript, including hesitations and repeated words.");
    state
        .full(params, &samples)
        .map_err(|e| format!("Transcription failed: {e}"))?;
    let mut output = String::new();
    for segment in state.as_iter() {
        if segment.no_speech_probability() > 0.6 {
            continue;
        }
        output.push_str(segment.to_str().map_err(|e| e.to_string())?);
    }
    Ok(logic::insertion_text(&output))
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
                "Model verified. Finish permissions, then select a text field and tap Fn.".into();
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
        tokio::fs::rename(&partial, model_path(&s))
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(partial).await;
    }
    result
}
fn show_settings(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_settings(app)
        }))
        .invoke_handler(tauri::generate_handler![
            status,
            request_microphone,
            request_permissions,
            open_keyboard,
            download_model,
            cancel,
            copy_transcript
        ])
        .setup(|app| {
            let directory = app.path().app_local_data_dir()?;
            fs::create_dir_all(&directory)?;
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))?;
            let _ = fs::remove_file(directory.join("recording.wav"));
            let _ = fs::remove_file(directory.join("model.download"));
            let ready = verified_model(&directory.join("ggml-base.en.bin"));
            app.manage(AppState {
                directory,
                inner: Mutex::new(Inner {
                    generation: 0,
                    status: Status {
                        phase: "idle".into(),
                        message: if ready {
                            "Select a text field and tap Fn."
                        } else {
                            "Welcome. Complete the four steps below to begin."
                        }
                        .into(),
                        progress: 0.,
                        model_ready: ready,
                        microphone: false,
                        accessibility: false,
                        input_monitoring: false,
                        hotkey: false,
                        transcript: String::new(),
                    },
                }),
            });
            APP.set(app.handle().clone()).unwrap();
            let (sender, receiver) = std::sync::mpsc::channel();
            let _ = CONTROLS.set(sender);
            // Preserve Fn / Escape ordering; inference runs off this executor.
            std::thread::spawn(move || {
                for control in receiver {
                    match control {
                        Control::Toggle => toggle_recording(),
                        Control::Cancel => cancel_inner(),
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
            let quit = MenuItem::with_id(app, "quit", "Quit Handsfree", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings, &cancel, &quit])?;
            TrayIconBuilder::new()
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../icons/tray.png"
                ))?)
                .icon_as_template(true)
                .tooltip("Handsfree · Fn to dictate")
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
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("Could not start Handsfree");
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
    fn silence_never_loads_a_model() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join(format!("target/silent-{}.wav", std::process::id()));
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        for _ in 0..16000 {
            writer.write_sample(0i16).unwrap();
        }
        writer.finalize().unwrap();
        let result = infer(&path, Path::new("/nonexistent-model.bin"));
        fs::remove_file(path).unwrap();
        assert_eq!(result.unwrap(), "");
    }
    #[test]
    fn missing_model_fails_verification() {
        assert!(!verified_model(Path::new("/nonexistent-model.bin")));
    }
}
