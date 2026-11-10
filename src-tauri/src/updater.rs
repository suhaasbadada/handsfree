//! Explicit, Rust-owned update flow. No startup checks, WebView updater capability,
//! persistence migration, model access or background installation.
use base64::Engine;
use futures_util::StreamExt;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri_plugin_updater::{Update, UpdaterExt};

const FEED: &str = "https://suhaasbadada.github.io/handsfree/updates/macos-arm64.json";
const TARGET: &str = "darwin-aarch64";
const MAX_FEED_BYTES: usize = 256 * 1024;
const MAX_AGE: Duration = Duration::from_secs(10 * 60);
const DISTRIBUTION: &str = include_str!("../distribution.json");
fn metadata_fresh(checked_at: Instant, now: Instant) -> bool {
    now.saturating_duration_since(checked_at) < MAX_AGE
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Distribution {
    schema_version: u32,
    version: String,
}

pub fn installed_version() -> String {
    let distribution: Distribution =
        serde_json::from_str(DISTRIBUTION).expect("embedded distribution metadata");
    assert_eq!(distribution.schema_version, 1);
    Version::parse(&distribution.version).expect("embedded distribution semver");
    distribution.version
}

#[derive(Clone, Serialize, Debug)]
pub struct View {
    installed_version: String,
    phase: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    available_version: Option<String>,
    notes: String,
    downloaded_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_bytes: Option<u64>,
    message: String,
}
impl Default for View {
    fn default() -> Self {
        Self {
            installed_version: installed_version(),
            phase: "idle",
            available_version: None,
            notes: String::new(),
            downloaded_bytes: 0,
            total_bytes: None,
            message: "Choose Check for updates to contact the release server.".into(),
        }
    }
}
#[derive(Default)]
struct State {
    view: View,
    running: bool,
    pending: Option<(Update, Instant)>,
}
impl State {
    fn clear_offer(&mut self) {
        self.pending = None;
        self.view.available_version = None;
        self.view.notes.clear();
        self.view.downloaded_bytes = 0;
        self.view.total_bytes = None;
    }
    fn expire(&mut self, now: Instant) {
        if !self.running
            && self.view.phase == "available"
            && !self
                .pending
                .as_ref()
                .is_some_and(|(_, at)| metadata_fresh(*at, now))
        {
            self.clear_offer();
            self.view.phase = "idle";
            self.view.message =
                "The previous offer expired. Choose Check for updates to refresh it.".into();
        }
    }
    fn begin(&mut self, check: bool) -> bool {
        if self.running {
            return false;
        }
        self.running = true;
        if check {
            self.clear_offer();
            self.view = View {
                phase: "checking",
                message: "Checking the HandsFree release feed…".into(),
                ..View::default()
            };
        }
        true
    }
    fn finish(&mut self, result: Result<(), String>) {
        if let Err(error) = result {
            self.clear_offer();
            self.view.phase = "error";
            self.view.message = format!("{error} Choose Check for updates to retry.");
        }
        self.running = false;
    }
}
static STATE: std::sync::OnceLock<Mutex<State>> = std::sync::OnceLock::new();
fn state() -> &'static Mutex<State> {
    STATE.get_or_init(|| Mutex::new(State::default()))
}

// Separate from normal dictation phase. Acquisition is on the control FIFO while
// Inner is locked; all recording/model/config starts check it under that same
// lock or on that FIFO. Exit receipt is serialized against acquisition here.
#[derive(Default)]
struct Lifecycle {
    installing: bool,
    exiting: bool,
    restart_ready: bool,
}
impl Lifecycle {
    fn acquire(&mut self) -> Result<(), String> {
        if self.installing || self.exiting {
            return Err("HandsFree is updating or quitting. Please try again.".into());
        }
        self.installing = true;
        Ok(())
    }
    fn accept_exit(&mut self) -> bool {
        if self.installing {
            false
        } else {
            self.exiting = true;
            true
        }
    }
}
static LIFECYCLE: Mutex<Lifecycle> = Mutex::new(Lifecycle {
    installing: false,
    exiting: false,
    restart_ready: false,
});
pub fn busy() -> bool {
    LIFECYCLE.lock().unwrap().installing
}
pub fn accept_exit_code(code: Option<i32>) -> bool {
    let mut gate = LIFECYCLE.lock().unwrap();
    if gate.restart_ready && code == Some(tauri::RESTART_EXIT_CODE) {
        return true;
    }
    gate.accept_exit()
}
pub fn idle_allowed(phase: &str, practice: bool, shortcut_capture: bool, session: bool) -> bool {
    matches!(phase, "idle" | "setup_required" | "copied" | "error")
        && !practice
        && !shortcut_capture
        && !session
}
pub struct InstallLease;
impl InstallLease {
    pub fn acquire() -> Result<Self, String> {
        LIFECYCLE.lock().unwrap().acquire()?;
        Ok(Self)
    }
}
impl Drop for InstallLease {
    fn drop(&mut self) {
        LIFECYCLE.lock().unwrap().installing = false;
    }
}
pub fn ensure_not_busy() -> Result<(), String> {
    if busy() {
        Err(
            "An update is in progress. Wait for HandsFree to restart or retry after an error."
                .into(),
        )
    } else {
        Ok(())
    }
}

struct Operation {
    finished: bool,
}
impl Operation {
    fn begin(check: bool) -> Option<Self> {
        let mut state = state().lock().unwrap();
        if !state.begin(check) {
            return None;
        }
        Some(Self { finished: false })
    }
    fn finish(mut self, result: Result<(), String>) -> View {
        let mut state = state().lock().unwrap();
        state.finish(result);
        self.finished = true;
        state.view.clone()
    }
}
impl Drop for Operation {
    fn drop(&mut self) {
        if !self.finished {
            let mut state = state().lock().unwrap();
            state.finish(Err("The update operation stopped unexpectedly.".into()));
        }
    }
}

#[tauri::command]
pub fn update_status() -> View {
    let mut state = state().lock().unwrap();
    state.expire(Instant::now());
    state.view.clone()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Feed {
    version: String,
    #[serde(default)]
    notes: String,
    #[serde(default, rename = "pub_date")]
    _pub_date: Option<String>,
    platforms: std::collections::HashMap<String, Platform>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Platform {
    url: String,
    signature: String,
}

fn canonical_asset(version: &str) -> String {
    format!("https://github.com/suhaasbadada/handsfree/releases/download/v{version}/HandsFree-{version}-macos-arm64.app.tar.gz")
}
// Structural screening is NOT signature verification. The official plugin
// authenticates the trusted comment and binds it to the version again, before
// any installation. Screening avoids offering malformed/legacy metadata.
fn signature_binding(signature: &str, version: &str) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(signature)
        .map_err(|_| "The release signature is not valid base64.")?;
    let text =
        std::str::from_utf8(&bytes).map_err(|_| "The release signature is not valid text.")?;
    let signature = minisign_verify::Signature::decode(text)
        .map_err(|_| "The release signature is malformed.")?;
    let fields: Vec<_> = signature
        .trusted_comment()
        .split('\t')
        .filter_map(|field| field.strip_prefix("version:"))
        .collect();
    if fields.len() != 1 || fields[0] != version {
        return Err("The release signature must bind the exact announced distribution version. The publisher must re-sign this release.".into());
    }
    Ok(())
}
fn plain_notes(notes: &str) -> String {
    let mut in_tag = false;
    notes
        .chars()
        .filter(|&ch| match ch {
            '<' => {
                in_tag = true;
                false
            }
            '>' => {
                in_tag = false;
                false
            }
            _ => !in_tag && (!ch.is_control() || ch == '\n' || ch == '\t'),
        })
        .take(4000)
        .collect()
}
fn validate_feed(raw: &serde_json::Value, installed: &str) -> Result<(Feed, bool), String> {
    let feed: Feed = serde_json::from_value(raw.clone()).map_err(|_| {
        "The release feed is malformed. Ask the publisher to repair macos-arm64.json."
    })?;
    // Also apply the official parser (including pub_date validation), even for
    // same-version responses. Reject ambiguous dynamic+static payloads above:
    // otherwise the plugin's dynamic-format precedence could bypass our URL policy.
    serde_json::from_value::<tauri_plugin_updater::RemoteRelease>(raw.clone())
        .map_err(|_| "The release feed is not valid Tauri static update metadata.")?;
    let version = Version::parse(&feed.version)
        .map_err(|_| "The release feed has an invalid distribution version.")?;
    if version.to_string() != feed.version || !version.build.is_empty() {
        return Err("The release version must be canonical semver without build metadata.".into());
    }
    let installed =
        Version::parse(installed).map_err(|_| "The installed distribution version is invalid.")?;
    if version < installed {
        return Err(
            "The release feed announces an older version. Downgrades are not allowed.".into(),
        );
    }
    if feed.platforms.len() != 1 || !feed.platforms.contains_key(TARGET) {
        return Err(
            "The release feed must contain only the Apple Silicon macOS target (darwin-aarch64)."
                .into(),
        );
    }
    let platform = &feed.platforms[TARGET];
    // Exact byte equality also rejects credentials, ports, percent escapes,
    // alternate hosts, queries, fragments, traversal and non-HTTPS URLs.
    if platform.url != canonical_asset(&feed.version) {
        return Err(
            "The release asset is not the canonical HandsFree GitHub macOS download.".into(),
        );
    }
    signature_binding(&platform.signature, &feed.version)?;
    Ok((feed, version > installed))
}

fn location_allowed(executable: &Path) -> Result<(), String> {
    let expected = Path::new("/Applications/HandsFree.app/Contents/MacOS/handsfree");
    if !cfg!(target_arch = "aarch64") || executable != expected {
        return Err("In-app updates require the Apple Silicon app installed at /Applications/HandsFree.app. Quit this copy and open that installed app.".into());
    }
    for path in [
        Path::new("/Applications"),
        Path::new("/Applications/HandsFree.app"),
        expected,
    ] {
        if path
            .canonicalize()
            .map_err(|_| "The installed app location cannot be verified.")?
            != path
        {
            return Err("In-app updates are unavailable for symlinked or translocated app copies. Open /Applications/HandsFree.app.".into());
        }
    }
    // Do not probe/change permissions or reject root-owned Applications copies.
    // Only the confirmed installation may invoke the official OS authorization
    // flow; checking metadata must never ask for administrator approval.
    Ok(())
}
fn preflight() -> Result<(), String> {
    location_allowed(
        &std::env::current_exe().map_err(|_| "The running app location cannot be determined.")?,
    )
}
async fn fetch_feed() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Cannot create the update connection: {e}"))?;
    let response = client.get(FEED).send().await.map_err(|_| "Cannot reach the update feed. Check your connection and try again; dictation still works offline.")?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            404 => "The update feed has not been published (HTTP 404). Try later or download the latest release from the HandsFree GitHub releases page.".into(),
            429 => "The release server is rate limiting requests (HTTP 429). Wait before checking again.".into(),
            code => format!("The release server returned HTTP {code}. Try again later."),
        });
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk
            .map_err(|_| "The update feed download was interrupted. Check your connection.")?;
        if bytes.len().saturating_add(chunk.len()) > MAX_FEED_BYTES {
            return Err("The release feed exceeds the metadata size limit.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| "The release feed is not valid JSON. Ask the publisher to repair it.".into())
}
async fn check() -> Result<(), String> {
    preflight()?;
    let raw = fetch_feed().await?;
    let (feed, newer) = validate_feed(&raw, &installed_version())?;
    let update = if newer {
        let updater = signed_updater_builder(crate::APP.get().unwrap())
            .build()
            .map_err(|e| format!("Cannot initialize the signed updater: {e}"))?;
        let mut update = updater
            .restore_update(raw)
            .map_err(|e| format!("The release metadata is not usable: {e}"))?
            .ok_or("The announced release is not newer than this distribution.")?;
        update.timeout = Some(Duration::from_secs(1800));
        Some((update, Instant::now()))
    } else {
        None
    };
    let mut state = state().lock().unwrap();
    state.pending = update;
    state.view.phase = if newer { "available" } else { "up_to_date" };
    state.view.available_version = newer.then_some(feed.version);
    state.view.notes = if newer {
        plain_notes(&feed.notes)
    } else {
        String::new()
    };
    state.view.message = if newer {
        "Update available. Download and restart only when you are ready; finish dictation first."
    } else {
        "This distribution is up to date."
    }
    .into();
    Ok(())
}
fn signed_updater_builder<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri_plugin_updater::UpdaterBuilder {
    // restore_update deliberately avoids a second network check. The plugin's
    // check() normally installs this provider, but restore_update does not.
    // reqwest 0.13 rustls-no-provider panics when building a download client
    // without it. Preserve any provider already chosen by the host process.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let installed = Version::parse(&installed_version()).unwrap();
    app.updater_builder()
        .target(TARGET)
        .version_comparator(move |_, release| release.version > installed)
        .configure_client(|client| client.https_only(true))
}
#[tauri::command]
pub async fn check_for_updates() -> View {
    let operation = match Operation::begin(true) {
        Some(operation) => operation,
        None => return update_status(),
    };
    // Own the operation independently of the WebView/invoke's lifetime.
    match tauri::async_runtime::spawn(async move {
        let result = check().await;
        operation.finish(result)
    })
    .await
    {
        Ok(view) => view,
        Err(_) => update_status(),
    }
}

enum InstallOutcome<T> {
    Completed,
    Review(Option<(T, Instant)>),
}
// The same owned operation spans refresh and the exact-version decision. Neither
// the FIFO idle lease nor any archive/installed bytes are touched before consent
// matches. Generic effects let tests use a fake clock/transport, never an app.
async fn install_confirmed<T, F, Fut, V, D, Done>(
    cached: Option<(T, Instant)>,
    expected: &str,
    now: Instant,
    fresh: F,
    version: V,
    download_install: D,
) -> Result<InstallOutcome<T>, String>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<Option<(T, Instant)>, String>>,
    V: Fn(&T) -> &str,
    D: FnOnce(T) -> Done,
    Done: std::future::Future<Output = Result<(), String>>,
{
    let offer = match cached {
        Some((update, at)) if metadata_fresh(at, now) => Some((update, at)),
        _ => fresh().await?,
    };
    match offer {
        Some((update, _)) if version(&update) == expected => {
            download_install(update).await?;
            Ok(InstallOutcome::Completed)
        }
        other => Ok(InstallOutcome::Review(other)),
    }
}

async fn install(expected_version: String) -> Result<(), String> {
    preflight()?;
    let cached = state().lock().unwrap().pending.take();
    let outcome = install_confirmed(
        cached,
        &expected_version,
        Instant::now(),
        || async {
            {
                let mut state = state().lock().unwrap();
                state.clear_offer();
                state.view.phase = "checking";
                state.view.message =
                    "Refreshing expired release metadata before downloading…".into();
            }
            check().await?;
            Ok(state().lock().unwrap().pending.take())
        },
        |update| &update.version,
        download_install,
    )
    .await?;
    if let InstallOutcome::Review(offer) = outcome {
        let mut state = state().lock().unwrap();
        state.pending = offer;
        if state.pending.is_some() {
            state.view.phase = "available";
            state.view.message = "The available release changed. Review the fresh offer and choose Download & restart again to confirm it.".into();
        }
    }
    Ok(())
}

async fn download_install(update: Update) -> Result<(), String> {
    if !validate_feed(&update.raw_json, &installed_version())?.1 {
        return Err(
            "The release is not newer than this distribution. Check again before installing."
                .into(),
        );
    }
    // A FIFO barrier, not a racy UI/phase snapshot. No data is cancelled or lost.
    let _lease = crate::acquire_update_idle().await?;
    {
        let mut state = state().lock().unwrap();
        state.view.phase = "downloading";
        state.view.downloaded_bytes = 0;
        state.view.total_bytes = None;
        state.view.message =
            "Downloading and verifying the signed update. Keep HandsFree open.".into();
    }
    let bytes = update
        .download(
            |chunk, total| {
                let mut state = state().lock().unwrap();
                state.view.downloaded_bytes =
                    state.view.downloaded_bytes.saturating_add(chunk as u64);
                state.view.total_bytes = total;
            },
            || {},
        )
        .await
        .map_err(|e| format!("Update download or signature verification failed: {e}"))?;
    preflight()?;
    {
        let mut state = state().lock().unwrap();
        state.view.phase = "installing";
        state.view.message =
            "Installing the verified update. HandsFree will restart after installation succeeds."
                .into();
    }
    // The plugin verifies the signature AND signed version again before changing
    // any installed bytes. Keep the idle lease through successful restart.
    tauri::async_runtime::spawn_blocking(move || update.install(bytes))
        .await
        .map_err(|e| format!("The update installer stopped: {e}"))?
        .map_err(|e| format!("The signed update could not be installed: {e}"))?;
    LIFECYCLE.lock().unwrap().restart_ready = true;
    crate::APP.get().unwrap().restart();
}
#[tauri::command]
pub async fn install_update(version: String) -> View {
    let operation = match Operation::begin(false) {
        Some(operation) => operation,
        None => return update_status(),
    };
    match tauri::async_runtime::spawn(async move {
        let result = install(version).await;
        operation.finish(result)
    })
    .await
    {
        Ok(view) => view,
        Err(_) => update_status(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restored_update_download_initializes_tls_in_a_fresh_process() {
        const CHILD: &str = "HANDSFREE_TLS_REGRESSION_CHILD";
        if std::env::var_os(CHILD).is_none() {
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "updater::tests::restored_update_download_initializes_tls_in_a_fresh_process",
                    "--nocapture",
                ])
                .env(CHILD, "1")
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            return;
        }
        // Building the metadata client's older reqwest stack is not enough to
        // initialize the download client's process-wide provider.
        let _metadata_client = reqwest::Client::builder().https_only(true).build().unwrap();
        assert!(rustls::crypto::CryptoProvider::get_default().is_none());
        // Restore metadata, exactly as production does, without updater.check().
        // A closed loopback port gives a bounded network error, never an install
        // or an external request. Client construction must not panic first.
        let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = port.local_addr().unwrap();
        drop(port);
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().plugins.0.insert(
            "updater".into(),
            serde_json::json!({"pubkey":"unused-no-install"}),
        );
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .build(context)
            .unwrap();
        let updater = signed_updater_builder(app.handle())
            .target(TARGET)
            .endpoints(vec![FEED.parse().unwrap()])
            .unwrap()
            .version_comparator(|_, _| true)
            .timeout(Duration::from_secs(2))
            .no_proxy()
            .build()
            .unwrap();
        let mut raw = feed("0.1.1-beta.9");
        raw["platforms"][TARGET]["url"] = format!("https://{address}/closed-loopback-only").into();
        let update = updater.restore_update(raw).unwrap().unwrap();
        let result = tauri::async_runtime::block_on(update.download(|_, _| {}, || {}));
        assert!(
            result.is_err(),
            "Closed loopback port must fail without changing any app"
        );
    }
    fn signature(version: &str) -> String {
        // Structurally valid fixture, deliberately NOT a cryptographic signature.
        // Never installed. Real signature acceptance is a packaging gate.
        let mut bytes = [0u8; 74];
        bytes[0] = b'E';
        bytes[1] = b'D';
        let b64 = &base64::engine::general_purpose::STANDARD;
        b64.encode(format!(
            "untrusted comment: test\n{}\ntrusted comment: timestamp:1\tversion:{version}\n{}\n",
            b64.encode(bytes),
            b64.encode([0u8; 64])
        ))
    }
    fn feed(version: &str) -> serde_json::Value {
        serde_json::json!({"version":version,"notes":"<b>Notes</b>","platforms":{TARGET:{"url":canonical_asset(version),"signature":signature(version)}}})
    }
    #[test]
    fn distribution_and_prerelease_ordering() {
        assert_eq!(installed_version(), "0.1.1-beta.15");
        assert!(
            validate_feed(&feed("0.1.1-beta.8"), "0.1.1-beta.7")
                .unwrap()
                .1
        );
        assert!(
            validate_feed(&feed("0.1.1-beta.7"), "0.1.1-beta.6")
                .unwrap()
                .1
        );
        assert!(
            !validate_feed(&feed("0.1.1-beta.7"), "0.1.1-beta.7")
                .unwrap()
                .1
        );
        assert!(validate_feed(&feed("0.1.1-beta.6"), "0.1.1-beta.7").is_err());
        assert!(validate_feed(&feed("0.1.1-beta.8"), "0.1.1").is_err());
    }
    #[test]
    fn canonical_urls_only() {
        let good = canonical_asset("0.1.1-beta.8");
        for bad in [
            good.replace("https:", "http:"),
            format!("{good}?x=1"),
            format!("{good}#x"),
            good.replace("github.com", "github.com.evil.test"),
            good.replace("github.com", "user@github.com"),
            good.replace("github.com", "github.com:443"),
            good.replace("/handsfree/", "/other/"),
            good.replace(".app.tar.gz", ".dmg"),
            good.replace("v0.1.1-beta.8/", "v0.1.1-beta.7/"),
            good.replace("macos-arm64", "windows-x64"),
            good.replace("/HandsFree-", "/../HandsFree-"),
        ] {
            let mut raw = feed("0.1.1-beta.8");
            raw["platforms"][TARGET]["url"] = bad.into();
            assert!(validate_feed(&raw, "0.1.1-beta.7").is_err());
        }
    }
    #[test]
    fn malformed_platform_and_replay_rejected() {
        for raw in [
            serde_json::json!({}),
            serde_json::json!({"version":"bad"}),
            serde_json::json!({"version":"0.1.1-beta.8","platforms":{}}),
            serde_json::json!({"version":"0.1.1-beta.8","platforms":{"windows-x64":{}}}),
        ] {
            assert!(validate_feed(&raw, "0.1.1-beta.7").is_err());
        }
        let mut raw = feed("0.1.1-beta.8");
        raw["platforms"][TARGET]["signature"] = signature("0.1.1-beta.6").into();
        assert!(validate_feed(&raw, "0.1.1-beta.7").is_err());
        for invalid in ["", "garbage", "dmVyc2lvbjowLjEuMS1iZXRhLjg="] {
            raw["platforms"][TARGET]["signature"] = invalid.into();
            assert!(validate_feed(&raw, "0.1.1-beta.7").is_err());
        }
        assert!(signature_binding(&signature(""), "0.1.1-beta.8").is_err());
        let encoded = signature("0.1.1-beta.8");
        let b64 = &base64::engine::general_purpose::STANDARD;
        let text = String::from_utf8(b64.decode(encoded).unwrap()).unwrap();
        let legacy = b64.encode(text.replace("\tversion:0.1.1-beta.8", ""));
        assert!(signature_binding(&legacy, "0.1.1-beta.8").is_err());
        // The official parser prefers dynamic format. Never let extra top-level
        // fields bypass our validated static platform URL/signature.
        let mut ambiguous = feed("0.1.1-beta.8");
        ambiguous["url"] = "https://evil.test/update.tar.gz".into();
        ambiguous["signature"] = signature("0.1.1-beta.8").into();
        assert!(validate_feed(&ambiguous, "0.1.1-beta.7").is_err());
        let mut invalid_date = feed("0.1.1-beta.7");
        invalid_date["pub_date"] = "not-a-date".into();
        assert!(validate_feed(&invalid_date, "0.1.1-beta.7").is_err());
    }
    #[test]
    fn notes_are_bounded_plain_text() {
        assert_eq!(plain_notes("<b>hello</b>\0\nthere"), "hello\nthere");
        assert_eq!(plain_notes(&"é".repeat(5000)).chars().count(), 4000);
    }
    #[test]
    fn lifecycle_excludes_duplicate_install_and_quit() {
        let mut gate = Lifecycle::default();
        gate.acquire().unwrap();
        assert!(gate.acquire().is_err());
        assert!(!gate.accept_exit());
        gate.installing = false; // lease release after an error
        gate.acquire().unwrap();
        gate.installing = false;
        assert!(gate.accept_exit());
        assert!(gate.acquire().is_err());
    }
    #[test]
    fn idle_barrier_never_interrupts_live_work() {
        for phase in [
            "recording",
            "processing",
            "downloading",
            "starting",
            "unknown",
            "not_pasted",
        ] {
            assert!(!idle_allowed(phase, false, false, false));
        }
        for phase in ["idle", "setup_required", "copied", "error"] {
            assert!(idle_allowed(phase, false, false, false));
            assert!(!idle_allowed(phase, true, false, false));
            assert!(!idle_allowed(phase, false, true, false));
            assert!(!idle_allowed(phase, false, false, true));
        }
    }
    #[test]
    fn unknown_app_path_rejected_without_filesystem_changes() {
        assert!(
            location_allowed(Path::new("/tmp/HandsFree.app/Contents/MacOS/handsfree")).is_err()
        );
    }
    #[test]
    fn failed_operations_clear_busy_and_can_retry() {
        let mut state = State::default();
        assert!(state.begin(true));
        assert!(!state.begin(true));
        assert!(!state.begin(false));
        state.finish(Err("Feed unavailable (HTTP 404).".into()));
        assert!(!state.running);
        assert_eq!(state.view.phase, "error");
        assert!(state.view.message.contains("404"));
        assert!(state.view.message.contains("retry"));
        assert!(state.begin(true));
        assert_eq!(state.view.phase, "checking");
        state.finish(Ok(()));
        assert!(!state.running);
        let lease = InstallLease::acquire().unwrap();
        assert!(ensure_not_busy().is_err());
        drop(lease);
        assert!(ensure_not_busy().is_ok());
    }
    #[test]
    fn metadata_expires_at_exactly_ten_minutes() {
        let now = Instant::now();
        assert!(metadata_fresh(now, now));
        assert!(!metadata_fresh(now, now + MAX_AGE));
        assert!(!metadata_fresh(now, now + MAX_AGE + Duration::from_secs(1)));
    }
    fn restored_fixture() -> Update {
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().plugins.0.insert(
            "updater".into(),
            serde_json::json!({"pubkey":"unused-no-download"}),
        );
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .build(context)
            .unwrap();
        signed_updater_builder(app.handle())
            .endpoints(vec![FEED.parse().unwrap()])
            .unwrap()
            .build()
            .unwrap()
            .restore_update(feed("1.0.0"))
            .unwrap()
            .unwrap()
    }
    #[test]
    fn local_status_expiry_and_failures_clear_offer_but_preserve_installed_version() {
        let at = Instant::now();
        let mut state = State {
            pending: Some((restored_fixture(), at)),
            ..State::default()
        };
        state.view.phase = "available";
        state.view.available_version = Some("1.0.0".into());
        state.view.notes = "Old notes".into();
        let installed = state.view.installed_version.clone();
        state.expire(at + MAX_AGE - Duration::from_nanos(1));
        assert_eq!(state.view.phase, "available");
        state.running = true;
        state.expire(at + MAX_AGE);
        assert!(
            state.pending.is_some(),
            "Status must not interfere with the owning operation"
        );
        state.running = false;
        state.expire(at + MAX_AGE);
        assert_eq!(state.view.phase, "idle");
        assert!(state.pending.is_none());
        assert!(state.view.available_version.is_none());
        assert!(state.view.notes.is_empty());
        assert_eq!(state.view.installed_version, installed);
        state.view.available_version = Some("stale".into());
        state.view.notes = "stale notes".into();
        state.running = true;
        state.finish(Err("offline".into()));
        assert!(state.view.available_version.is_none());
        assert!(state.view.notes.is_empty());
        assert_eq!(state.view.installed_version, installed);
        assert!(
            state.begin(true),
            "No restart needed after a failed operation"
        );
    }
    #[test]
    fn expired_confirmation_refreshes_before_any_download_or_idle_lease() {
        use std::cell::Cell;
        let at = Instant::now();
        // All effects below are injected: no network, app install, lease, or wait.
        for seconds in [600, 1800] {
            for latest in [Some("11"), Some("12"), None] {
                let checks = Cell::new(0);
                let downloads = Cell::new(0);
                let now = at + Duration::from_secs(seconds);
                let result = tauri::async_runtime::block_on(install_confirmed(
                    Some(("11".to_string(), at)),
                    "11",
                    now,
                    || async {
                        checks.set(checks.get() + 1);
                        assert_eq!(downloads.get(), 0);
                        Ok(latest.map(|version| (version.to_string(), now)))
                    },
                    |version| version.as_str(),
                    |version| {
                        let checks = &checks;
                        let downloads = &downloads;
                        async move {
                            assert_eq!(checks.get(), 1);
                            assert_eq!(
                                version, "11",
                                "Never substitute an unconfirmed newer version"
                            );
                            downloads.set(downloads.get() + 1);
                            Ok(())
                        }
                    },
                ))
                .unwrap();
                assert_eq!(checks.get(), 1);
                assert_eq!(downloads.get(), usize::from(latest == Some("11")));
                match (latest, result) {
                    (Some("11"), InstallOutcome::Completed)
                    | (None, InstallOutcome::Review(None)) => {}
                    (Some("12"), InstallOutcome::Review(Some((offer, checked_at)))) => {
                        assert_eq!(offer, "12");
                        assert_eq!(checked_at, now);
                    }
                    _ => panic!("Unexpected confirmation decision"),
                }
            }
        }
        let result = tauri::async_runtime::block_on(install_confirmed(
            Some(("11".to_string(), at)),
            "11",
            at + MAX_AGE,
            || async { Err("offline".to_string()) },
            |version| version.as_str(),
            |_| async { panic!("Offline must not acquire a lease/download/install") },
        ));
        assert!(matches!(result, Err(error) if error == "offline"));
        let result = tauri::async_runtime::block_on(install_confirmed(
            None::<(String, Instant)>,
            "11",
            at,
            || async { Ok(Some(("12".to_string(), at))) },
            |version| version.as_str(),
            |_| async {
                panic!("A locally expired/removed offer must still reconfirm a new version")
            },
        ))
        .unwrap();
        assert!(matches!(result, InstallOutcome::Review(Some((offer, _))) if offer == "12"));
        let downloads = Cell::new(0);
        let result = tauri::async_runtime::block_on(install_confirmed(
            Some(("11".to_string(), at)),
            "11",
            at + MAX_AGE - Duration::from_nanos(1),
            || async { panic!("Fresh exact metadata does not need a native network refresh") },
            |version| version.as_str(),
            |_| async {
                downloads.set(downloads.get() + 1);
                Ok(())
            },
        ))
        .unwrap();
        assert!(matches!(result, InstallOutcome::Completed));
        assert_eq!(downloads.get(), 1);
        // An offer changed during confirmation is retained for review, not used.
        let result = tauri::async_runtime::block_on(install_confirmed(
            Some(("12".to_string(), at)),
            "11",
            at,
            || async { panic!("A fresh cache need not be checked again natively") },
            |version| version.as_str(),
            |_| async { panic!("A different confirmed identity must not download") },
        ))
        .unwrap();
        assert!(matches!(result, InstallOutcome::Review(Some((offer, _))) if offer == "12"));
    }
    #[test]
    fn simultaneous_quit_and_install_cannot_both_win() {
        use std::sync::{Arc, Barrier};
        for _ in 0..32 {
            let gate = Arc::new(Mutex::new(Lifecycle::default()));
            let barrier = Arc::new(Barrier::new(2));
            let child_gate = gate.clone();
            let child_barrier = barrier.clone();
            let install = std::thread::spawn(move || {
                child_barrier.wait();
                child_gate.lock().unwrap().acquire().is_ok()
            });
            barrier.wait();
            let quit = gate.lock().unwrap().accept_exit();
            assert_ne!(quit, install.join().unwrap());
        }
    }
    #[test]
    #[ignore = "requires an explicitly packaged updater archive and signature; never installs"]
    fn signed_artifact_rejects_tampering_and_version_replay() {
        let archive = std::env::var("HANDSFREE_UPDATER_TEST_ARCHIVE").unwrap();
        let bytes = std::fs::read(&archive).unwrap();
        let encoded = std::fs::read_to_string(format!("{archive}.sig")).unwrap();
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.macos.conf.json")).unwrap();
        let b64 = &base64::engine::general_purpose::STANDARD;
        let key = String::from_utf8(
            b64.decode(config["plugins"]["updater"]["pubkey"].as_str().unwrap())
                .unwrap(),
        )
        .unwrap();
        let key = minisign_verify::PublicKey::decode(&key).unwrap();
        let signature_text = String::from_utf8(b64.decode(encoded.trim()).unwrap()).unwrap();
        let signature = minisign_verify::Signature::decode(&signature_text).unwrap();
        key.verify(&bytes, &signature, true).unwrap();
        signature_binding(encoded.trim(), &installed_version()).unwrap();
        let mut corrupt = bytes.clone();
        assert!(!corrupt.is_empty());
        corrupt[0] ^= 1;
        assert!(key.verify(&corrupt, &signature, true).is_err());
        assert!(signature_binding(encoded.trim(), "999.0.0").is_err());
        let tampered = signature_text.replace(
            &format!("version:{}", installed_version()),
            "version:999.0.0",
        );
        assert_ne!(tampered, signature_text);
        let tampered = minisign_verify::Signature::decode(&tampered).unwrap();
        assert!(
            key.verify(&bytes, &tampered, true).is_err(),
            "The trusted version must be authenticated, not merely parsed"
        );
    }

    #[test]
    #[ignore = "explicit public download and isolated temporary-bundle install; never replaces or launches the installed app"]
    fn public_download_and_isolated_install() {
        let reference =
            std::path::PathBuf::from(std::env::var("HANDSFREE_UPDATER_REFERENCE_APP").unwrap());
        assert!(reference.is_absolute());
        let temporary = tempfile::tempdir().unwrap();
        let target = temporary
            .path()
            .canonicalize()
            .unwrap()
            .join("HandsFree.app");
        assert!(target.starts_with(temporary.path().canonicalize().unwrap()));
        std::fs::create_dir_all(target.join("Contents/MacOS")).unwrap();
        std::fs::write(target.join("previous-bundle-marker"), b"old test bundle").unwrap();
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.macos.conf.json")).unwrap();
        context
            .config_mut()
            .plugins
            .0
            .insert("updater".into(), config["plugins"]["updater"].clone());
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .build(context)
            .unwrap();
        let raw = tauri::async_runtime::block_on(fetch_feed()).unwrap();
        validate_feed(&raw, "0.1.1-beta.7").unwrap();
        let updater = signed_updater_builder(app.handle())
            .version_comparator(|_, _| true)
            .executable_path(target.join("Contents/MacOS/handsfree"))
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap();
        let update = updater.restore_update(raw).unwrap().unwrap();
        let mut downloaded = 0;
        let bytes =
            tauri::async_runtime::block_on(update.download(|chunk, _| downloaded += chunk, || {}))
                .unwrap();
        assert_eq!(downloaded, bytes.len());
        update.verify(&bytes).unwrap();
        update.install(bytes).unwrap();
        assert!(!target.join("previous-bundle-marker").exists());
        assert_eq!(
            std::fs::read(target.join("Contents/MacOS/handsfree")).unwrap(),
            std::fs::read(reference.join("Contents/MacOS/handsfree")).unwrap()
        );
        assert!(std::process::Command::new("/usr/bin/codesign")
            .args(["--verify", "--deep", "--strict"])
            .arg(&target)
            .status()
            .unwrap()
            .success());
        // tempfile removes only this test-owned bundle, including on failure.
        let temporary_path = temporary.path().to_path_buf();
        drop(temporary);
        assert!(
            !temporary_path.exists(),
            "Isolated install left test artifacts"
        );
    }
}
