import { invoke } from '@tauri-apps/api/core';
import './style.css';
import './typography.css';
import { shortcutFromEvent, type Shortcut } from './shortcut';
import { phaseLabel, canCancel, formatTime, readiness, readinessDetail } from './presentation';

type Status = { phase: string; message: string; progress: number; model_ready: boolean; microphone: boolean; accessibility: boolean; input_monitoring: boolean; hotkey: boolean; transcript: string; sounds: boolean; sound_volume: number; sound_style: string; recording_limit: number; shortcut: Shortcut; shortcut_label: string; stats: { transcriptions: number; words: number; speech_seconds: number; saved_seconds: number }; persistence_error: string };
const logo = new URL('../src-tauri/icons/icon.png', import.meta.url).href;
document.querySelector('#app')!.innerHTML = `
<div class="shell">
 <aside><a class="brand" href="#overview" aria-label="HandsFree beta overview"><img src="${logo}" alt="" width="36" height="36"><span>HandsFree</span><sup class="beta-badge">BETA</sup></a>
 <nav aria-label="Main navigation"><button id="nav-overview" class="nav active" aria-current="page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7v9h-6v-6h-4v6H4Z"/></svg>Overview</button><button id="nav-settings" class="nav"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg>Settings</button></nav></aside>
 <main>
 <header><span id="page-label">Overview</span><span class="badge"><i></i> On this Mac</span></header>
 <section id="overview" aria-labelledby="overview-title">
  <div class="hero"><h1 id="overview-title">Dictation</h1><p>Choose a text field, press <kbd id="overview-shortcut">Fn</kbd> and speak.<br>Press again to finish. Escape cancels.</p></div>
   <section class="card readiness"><div><h2 id="ready-title">Finish setting up</h2><p id="ready-detail">Checking permissions and model…</p></div><button id="setup" class="primary">Open settings</button></section>
   <section id="overview-model" class="card readiness" hidden aria-label="English model"><div><h2>English model</h2><p id="overview-model-state">One-time download · Works offline afterward</p></div><button id="overview-download" class="primary" disabled>Download English model (~148 MB)</button></section>
  <div class="metrics" aria-label="Local usage since tracking began"><article><strong id="words">0</strong><span>Words dictated</span></article><article><strong id="saved">0 min</strong><span>Estimated time saved</span></article><article><strong id="count">0</strong><span>Dictations</span><small id="duration">0 sec recorded</small></article></div>
  <details class="metric-note"><summary title="Time saved is an estimate, not a productivity measurement.">About the estimate</summary><p>Assumes typing at 40 words/min, minus recording time: max(0, words ÷ 40 × 60 − recording seconds), per dictation. Totals stay on this Mac.</p></details>
  <section class="card transcript-card"><div class="card-heading"><h2>Last transcript</h2><span class="subtle">This session</span></div><p id="transcript" class="transcript empty">No transcript yet. Your next dictation will appear here.</p><div class="transcript-footer"><span class="subtle">Only held in memory until you quit.</span><button id="copy" disabled>Copy text</button></div></section>
 </section>
 <section id="settings" hidden aria-labelledby="settings-title">
  <div class="settings-intro"><h1 id="settings-title">Settings</h1></div>
  <section class="card preferences" aria-labelledby="preferences-title"><h2 id="preferences-title">Preferences</h2>
   <div class="setting-row"><div><h3>Shortcut</h3></div><kbd id="saved-shortcut">Fn</kbd><button id="change-shortcut" aria-haspopup="dialog">Change…</button></div>
   <div class="setting-row"><div><h3><label for="recording-limit">Recording limit</label> <small id="recording-limit-help" class="subtle">· Next recording</small></h3></div><select id="recording-limit" aria-describedby="recording-limit-help"><option value="120">2 minutes</option><option value="180">3 minutes</option><option value="240">4 minutes</option><option value="300">5 minutes</option></select></div>
    <div class="setting-row listening-row"><div><h3>Listening sound <span id="sound-state" class="state">Off</span></h3></div><div class="sound-selection"><button id="preview-sound" disabled>Preview</button></div><label class="switch"><input id="sounds" type="checkbox" role="switch" aria-label="Listening sound"><span aria-hidden="true"></span></label></div>
   <details class="sound-options"><summary>Sound options</summary><div class="sound-controls"><label for="sound-volume">Volume</label><input id="sound-volume" type="range" min="0" max="100" step="1" value="50" aria-describedby="volume-percent"><output id="volume-percent" for="sound-volume">50%</output></div><p class="subtle">If Bluetooth delays listening, turn the cue off.</p></details>
  </section>
  <section class="card setup-card" aria-labelledby="setup-title"><div class="card-heading"><h2 id="setup-title">Setup</h2><span id="setup-state" class="subtle" role="status">Checking…</span></div>
   <div id="setup-missing">
    <div id="mic-row" class="setting-row"><div><h3>Microphone</h3><p id="mic-state">Allow access to record your voice.</p></div><button id="mic">Allow</button></div>
    <div id="permissions-row" class="setting-row"><div><h3>Shortcuts & paste</h3><p id="permission-state">Checking…</p></div><button id="permissions">Open settings</button></div>
    <div id="hotkey-row" class="setting-row" hidden><div><h3>Shortcut disconnected</h3><p>Quit and reopen HandsFree to reconnect.</p></div></div>
    </div>
     <div id="model-row" class="setting-row" tabindex="-1"><div><h3>English model <span id="model-ready" class="subtle" hidden>· Ready</span></h3><p id="model-state">148 MB · One-time download</p><progress id="progress" max="100" value="0" hidden aria-label="Model download progress"></progress></div><button id="download">Download</button></div>
   <details class="setup-details"><summary>First dictation & setup help</summary><ol><li>Use the copy in Applications before allowing permissions.</li><li>Allow Microphone, Accessibility and Input Monitoring above; quit and reopen if needed.</li><li>Download the English model once (~148 MB); then dictation works offline.</li><li>Focus a text field in another app. Press your shortcut to start and again to finish. Escape cancels. If paste fails, use Copy text.</li></ol><p id="setup-detail" class="subtle">Checking…</p><p class="subtle">Whisper base.en · Checksum-verified download from Hugging Face. No Apple Developer membership or certificate installation needed.</p></details>
  </section>
    <section class="local-data" aria-labelledby="data-title"><h2 id="data-title">Local data</h2><div class="setting-row"><div><h3>Usage totals</h3><p>Counts and estimates, saved on this Mac.</p></div><button id="reset" class="danger">Reset totals…</button></div><details><summary>Privacy</summary><p class="subtle">Audio is processed in memory on this Mac, not saved as recordings. The last transcript stays in memory until you quit. No telemetry or transcript history. Paste briefly uses the clipboard; clipboard managers may retain it.</p></details></section>
 </section>
 <section class="status" aria-label="App status"><span id="dot" aria-hidden="true"></span><div><strong id="phase">Connecting…</strong><p id="message" aria-live="polite"></p></div><button id="cancel" hidden>Cancel</button></section>
 <p id="feedback" class="feedback" role="status" hidden></p><p id="storage-error" class="feedback" role="status" hidden></p>
   <footer><span>HandsFree · 0.1.0 beta</span><span>English · On-device transcription</span></footer>
 </main>
</div>
<dialog id="shortcut-dialog" aria-labelledby="shortcut-title"><h2 id="shortcut-title">Choose a shortcut</h2><div class="shortcut-options"><button id="shortcut-fn" autofocus>Fn</button><button id="shortcut-option">Option + Space</button><button id="shortcut-control">Control + Shift + Space</button><button id="record-shortcut">Custom shortcut…</button></div><input id="shortcut-recorder" readonly hidden aria-label="Record shortcut" placeholder="Press a shortcut. Escape cancels." aria-describedby="shortcut-help"><p id="shortcut-feedback" role="status" hidden></p><details><summary>More about shortcuts</summary><p id="shortcut-help">Use Control, Option or Command with a letter, number or Space. Uses physical US key positions. Shortcuts also reach the foreground app; avoid ones it uses. System and common editing shortcuts are blocked.</p><p>For Fn, set the Globe key to Do Nothing and disable macOS Dictation’s Fn shortcut.</p><button id="keyboard">Keyboard settings</button></details><div class="dialog-actions"><button id="close-shortcut">Done</button></div></dialog>
<dialog id="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">Reset usage totals?</h2><p>Totals will return to zero. Your preferences and language model won’t change.</p><div class="dialog-actions"><button id="keep-stats" autofocus>Keep totals</button><button id="confirm-reset" class="danger">Reset totals</button></div></dialog>`;
const el = (id: string) => document.getElementById(id)!;
const button = (id: string) => el(id) as HTMLButtonElement;
// Avoid presenting native actions as ready before the first backend response.
for (const id of ['change-shortcut', 'mic', 'permissions', 'download', 'reset', 'sounds', 'sound-volume', 'recording-limit']) {
  (el(id) as HTMLInputElement | HTMLButtonElement).disabled = true;
}
let current: Status | undefined;
let refreshing = false;
let soundsPending = false;
let volumePending = false;
let limitPending = false;
let volumeEditing = false;
let previewPending = false;
let shortcutPending = false;
let downloadPending = false;
let capturing = false;
let captureTimer: ReturnType<typeof setTimeout> | undefined;
const canEditShortcut = () => ['idle', 'copied', 'setup_required', 'not_pasted', 'error'].includes(current?.phase ?? '');
const isIdle = () => ['idle', 'copied'].includes(current?.phase ?? '');
let seenPermissionRequests = 0;
function navigate(tab: 'overview' | 'settings') {
  for (const name of ['overview', 'settings']) {
    el(name).hidden = name !== tab;
    el(`nav-${name}`).classList.toggle('active', name === tab);
    if (name === tab) el(`nav-${name}`).setAttribute('aria-current', 'page');
    else el(`nav-${name}`).removeAttribute('aria-current');
  }
  el('page-label').textContent = tab === 'overview' ? 'Overview' : 'Settings';
}
function feedback(message: string) {
  el('feedback').hidden = !message; el('feedback').textContent = message;
  el('shortcut-feedback').hidden = !message; el('shortcut-feedback').textContent = message;
}
async function action(command: string, args?: Record<string, unknown>): Promise<boolean> {
  try { await invoke(command, args); feedback(''); await refresh(); return true; }
  catch (e) { feedback(String(e)); return false; }
}
el('nav-overview').onclick = () => navigate('overview');
el('nav-settings').onclick = () => navigate('settings');
document.querySelector('.brand')!.addEventListener('click', e => { e.preventDefault(); navigate('overview'); });
el('setup').onclick = () => {
  navigate('settings');
  const target = el(!current?.model_ready ? 'model-row' : !current.microphone ? 'mic-row' : !current.accessibility || !current.input_monitoring ? 'permissions-row' : 'hotkey-row');
  target.scrollIntoView({ block: 'center' });
  target.setAttribute('tabindex', '-1'); target.focus();
};
el('mic').onclick = () => void action('request_microphone');
el('permissions').onclick = () => void action('request_permissions');
el('keyboard').onclick = () => void action('open_keyboard');
const recorder = el('shortcut-recorder') as HTMLInputElement;
const shortcutDialog = el('shortcut-dialog') as HTMLDialogElement;
el('change-shortcut').onclick = () => { feedback(''); shortcutDialog.showModal(); };
el('close-shortcut').onclick = () => shortcutDialog.close();
shortcutDialog.addEventListener('close', () => {
  // A queued close event must not interrupt a newly reopened dialog.
  if (shortcutDialog.open) return;
  void stopCapture(); button('change-shortcut').focus();
});
shortcutDialog.addEventListener('cancel', e => {
  if (capturing) { e.preventDefault(); void stopCapture(); feedback('Shortcut unchanged.'); }
});
async function stopCapture() {
  const wasCapturing = capturing;
  capturing = false; clearTimeout(captureTimer); recorder.hidden = true;
  if (wasCapturing && shortcutDialog.open) button('close-shortcut').focus();
  try { await invoke('capture_shortcut', { active: false }); } catch (e) { feedback(String(e)); }
}
async function saveShortcut(shortcut: Shortcut) {
  if (shortcutPending || !canEditShortcut()) return;
  shortcutPending = true;
  const saved = await action('set_shortcut', { shortcut });
  await stopCapture(); shortcutPending = false;
  button('change-shortcut').disabled = !canEditShortcut();
  if (saved) shortcutDialog.close();
}
el('shortcut-fn').onclick = () => void saveShortcut({code: 'Fn', modifiers: 0});
el('shortcut-option').onclick = () => void saveShortcut({code: 'Space', modifiers: 2});
el('shortcut-control').onclick = () => void saveShortcut({code: 'Space', modifiers: 5});
el('record-shortcut').onclick = async () => {
  if (!canEditShortcut() || shortcutPending || capturing) return;
  try {
    await invoke('capture_shortcut', {active: true});
    if (!shortcutDialog.open || !canEditShortcut()) { await stopCapture(); return; }
    capturing = true; recorder.hidden = false; recorder.value = ''; recorder.focus();
    feedback('Press a shortcut, or Escape to cancel.');
    captureTimer = setTimeout(() => { void stopCapture(); feedback('Shortcut recording timed out.'); }, 25000);
  } catch (e) { feedback(String(e)); }
};
recorder.onkeydown = e => {
  e.preventDefault(); e.stopPropagation();
  if (!capturing || shortcutPending) return;
  if (e.code === 'Escape') { void stopCapture(); feedback('Shortcut unchanged.'); return; }
  if (/^(Control|Alt|Shift|Meta)/.test(e.code)) return;
  try { void saveShortcut(shortcutFromEvent(e)); } catch (error) { feedback(String(error)); }
};
recorder.onblur = () => { if (capturing && !shortcutPending) void stopCapture(); };
window.addEventListener('blur', () => { if (capturing) void stopCapture(); });
async function downloadModel() {
  if (!current || current.model_ready || downloadPending || !canEditShortcut()) return;
  downloadPending = true;
  button('download').disabled = true; button('overview-download').disabled = true;
  await action('download_model');
  downloadPending = false;
  await refresh();
}
el('download').onclick = () => void downloadModel();
el('overview-download').onclick = () => void downloadModel();
el('cancel').onclick = () => void action('cancel');
el('copy').onclick = async () => { if (await action('copy_transcript')) feedback('Copied. Paste it wherever you need it.'); };
const sounds = el('sounds') as HTMLInputElement;
const recordingLimit = el('recording-limit') as HTMLSelectElement;
recordingLimit.onchange = async () => {
  if (limitPending) return;
  limitPending = true; recordingLimit.disabled = true;
  const success = await action('set_recording_limit', { seconds: Number(recordingLimit.value) });
  if (!success) recordingLimit.value = String(current?.recording_limit ?? 120);
  limitPending = false; recordingLimit.disabled = false;
};
// Commit once on release/key change, not on every pointer movement. Keep the
// percentage local during a drag so background status polls cannot reset it.
const volume = el('sound-volume') as HTMLInputElement;
const showVolume = () => { el('volume-percent').textContent = `${volume.value}%`; volume.setAttribute('aria-valuetext', `${volume.value} percent`); };
volume.oninput = () => { volumeEditing = true; showVolume(); button('preview-sound').disabled = true; };
volume.onblur = () => { if (!volumePending) { volumeEditing = false; void refresh(); } };
volume.onchange = async () => {
  volumePending = true; volume.disabled = true;
  const success = await action('set_sound_volume', { volume: Number(volume.value) });
  if (!success) { volume.value = String(current?.sound_volume ?? 50); showVolume(); }
  volumeEditing = false; volumePending = false; volume.disabled = false;
};
el('preview-sound').onclick = async () => {
  if (previewPending || volumePending || volumeEditing || !isIdle()) return;
  previewPending = true; button('preview-sound').disabled = true;
  await action('preview_sound');
  // One explicit click, one cue. Prevent rapid repeated previews.
  setTimeout(() => { previewPending = false; button('preview-sound').disabled = !isIdle() || volumePending || volumeEditing; }, 400);
};
sounds.onchange = async () => {
  soundsPending = true; sounds.disabled = true;
  const success = await action('set_sounds', { enabled: sounds.checked });
  if (!success) sounds.checked = current?.sounds ?? false;
  soundsPending = false; sounds.disabled = false;
};
const resetDialog = el('reset-dialog') as HTMLDialogElement;
el('reset').onclick = () => resetDialog.showModal();
el('keep-stats').onclick = () => resetDialog.close();
el('confirm-reset').onclick = async () => {
  button('confirm-reset').disabled = true;
  if (await action('reset_stats', { confirmed: true })) { resetDialog.close(); feedback('Usage totals reset. Your next dictation starts fresh.'); }
  button('confirm-reset').disabled = false;
};
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    current = await invoke<Status>('status');
    button('reset').disabled = false;
    if (!soundsPending) sounds.disabled = false;
    if (!volumePending) volume.disabled = false;
    if (!limitPending) { recordingLimit.disabled = false; recordingLimit.value = String(current.recording_limit ?? 120); }
    const requests = (current as Status & { permission_requests?: number }).permission_requests ?? 0;
    if (requests !== seenPermissionRequests) { seenPermissionRequests = requests; navigate('settings'); }
    el('phase').textContent = current.phase === 'idle' && !readiness(current) ? 'Setup needed' : phaseLabel(current.phase);
    el('message').textContent = current.message;
    el('dot').className = current.phase;
    button('mic').disabled = current.microphone;
    el('mic').textContent = current.microphone ? 'Allowed' : 'Allow';
    el('mic-state').textContent = 'Allow access in Privacy & Security → Microphone.';
    el('permission-state').textContent = !current.accessibility ? 'Allow Accessibility for automatic paste.' : 'Allow Input Monitoring for the shortcut.';
    el('setup-detail').textContent = `Microphone: ${current.microphone ? 'allowed' : 'needs access'} · Accessibility: ${current.accessibility ? 'allowed' : 'needs access'} · Input Monitoring: ${current.input_monitoring ? 'allowed' : 'needs access'} · Shortcut: ${current.hotkey ? 'connected' : 'disconnected'} · Model: ${current.model_ready ? 'ready' : 'not installed'}`;
    el('mic-row').hidden = current.microphone;
    el('permissions-row').hidden = current.accessibility && current.input_monitoring;
    el('hotkey-row').hidden = current.hotkey;
    el('model-ready').hidden = !current.model_ready;
    button('permissions').disabled = current.accessibility && current.input_monitoring;
    el('permissions').textContent = !current.accessibility ? 'Allow Accessibility ↗' : !current.input_monitoring ? 'Allow Input Monitoring ↗' : 'Allowed';
    const downloading = current.phase === 'downloading';
    const modelDetail = downloading ? `Downloading… ${Math.round(current.progress)}%` : '148 MB · One-time download · English only';
    el('model-state').textContent = modelDetail;
    el('model-state').hidden = current.model_ready;
    el('download').hidden = current.model_ready;
    button('download').disabled = current.model_ready || downloadPending || !canEditShortcut();
    el('overview-model').hidden = current.model_ready;
    el('overview-model-state').textContent = downloading ? modelDetail : 'One-time download · English only · Works offline afterward';
    button('overview-download').disabled = button('download').disabled;
    el('overview-download').textContent = downloading ? `Downloading… ${Math.round(current.progress)}%` : 'Download English model (~148 MB)';
    el('download').textContent = current.model_ready ? 'Ready offline' : current.phase === 'downloading' ? `${Math.round(current.progress)}%` : 'Download';
    el('progress').hidden = current.phase !== 'downloading';
    (el('progress') as HTMLProgressElement).value = current.progress;
    el('cancel').hidden = !canCancel(current.phase);
    button('copy').disabled = !current.transcript;
    el('transcript').textContent = current.transcript || `No transcript yet. Choose a text field in another app and press ${current.shortcut_label} to begin.`;
    el('transcript').classList.toggle('empty', !current.transcript);
    if (!soundsPending) {
      sounds.checked = current.sounds;
      el('sound-state').textContent = current.sounds ? 'On' : 'Off';
    }
    el('overview-shortcut').textContent = current.shortcut_label;
    el('saved-shortcut').textContent = current.shortcut_label;
    for (const id of ['shortcut-fn', 'shortcut-option', 'shortcut-control', 'record-shortcut']) button(id).disabled = shortcutPending || !canEditShortcut() || capturing;
    button('shortcut-fn').setAttribute('aria-pressed', String(current.shortcut.code === 'Fn'));
    button('shortcut-option').setAttribute('aria-pressed', String(current.shortcut.code === 'Space' && current.shortcut.modifiers === 2));
    button('shortcut-control').setAttribute('aria-pressed', String(current.shortcut.code === 'Space' && current.shortcut.modifiers === 5));
    if (!volumePending && !volumeEditing) { volume.value = String(current.sound_volume); showVolume(); }
    button('preview-sound').disabled = !isIdle() || previewPending || volumePending || volumeEditing;
    el('words').textContent = current.stats.words.toLocaleString();
    el('count').textContent = current.stats.transcriptions.toLocaleString();
    el('saved').textContent = formatTime(current.stats.saved_seconds);
    el('duration').textContent = `${formatTime(current.stats.speech_seconds)} recorded`;
    const ready = readiness(current);
    el('setup-state').textContent = ready ? 'Ready' : 'Needs attention';
    el('setup-missing').hidden = ready;
    button('change-shortcut').disabled = shortcutPending || !canEditShortcut();
    document.querySelector<HTMLElement>('.readiness')!.hidden = ready;
    el('ready-title').textContent = ready ? 'You’re ready for your next thought.' : 'A few steps to your first dictation.';
    el('ready-detail').textContent = readinessDetail(current);
    el('setup').textContent = ready ? 'Your settings ↗' : 'Finish setup ↗';
    el('storage-error').hidden = !current.persistence_error;
    el('storage-error').textContent = current.persistence_error;
  } catch (e) { feedback(`Couldn’t connect to HandsFree: ${String(e)}`); }
  finally { refreshing = false; }
}
void refresh();
setInterval(() => { if (!document.hidden) void refresh(); }, 800);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
