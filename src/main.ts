import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import './style.css';
import './typography.css';
import { shortcutFromEvent, type Shortcut } from './shortcut';
import { phaseLabel, canCancel, formatTime, readiness, readinessDetail } from './presentation';

type Status = { phase: string; message: string; progress: number; model_ready: boolean; microphone: boolean; accessibility: boolean; input_monitoring: boolean; hotkey: boolean; transcript: string; sounds: boolean; sound_volume: number; sound_style: 'clean' | 'warm'; recording_limit: number; shortcut: Shortcut; shortcut_label: string; stats: { transcriptions: number; words: number; speech_seconds: number; saved_seconds: number }; persistence_error: string };
const logo = new URL('../src-tauri/icons/icon.png', import.meta.url).href;
document.querySelector('#app')!.innerHTML = `
<div class="shell">
 <aside><a class="brand" href="#overview" aria-label="HandsFree overview"><img src="${logo}" alt="" width="36" height="36"><span>HandsFree</span></a>
  <div class="header-right"><nav aria-label="Main navigation"><button id="nav-overview" class="nav active" aria-label="Overview" title="Overview" aria-current="page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7v9h-6v-6h-4v6H4Z"/></svg></button><button id="nav-settings" class="nav" aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg></button></nav><section class="status" aria-label="App status"><span id="dot" aria-hidden="true"></span><strong id="phase" aria-live="polite">Connecting…</strong><button id="cancel" hidden aria-label="Cancel dictation" title="Cancel dictation">×</button></section></div></aside>
 <main>
 <section id="overview" aria-labelledby="overview-title">
   <div class="hero"><h1 id="overview-title">Your activity</h1><p>Press <kbd id="overview-shortcut">Fn</kbd> to dictate</p></div>
   <section class="card readiness"><div><h2 id="ready-title">Finish setting up</h2><p id="ready-detail">Checking permissions and model…</p></div><button id="setup" class="primary">Open settings</button></section>
   <section id="overview-model" class="card readiness" hidden aria-label="English model"><div><h2>English model</h2><p id="overview-model-state">One-time download · Works offline afterward</p></div><button id="overview-download" class="primary" disabled>Download English model (~148 MB)</button></section>
   <div class="metrics" aria-label="Local usage since tracking began"><article><strong id="words">0</strong><span>Words</span></article><article><strong id="saved">0 sec</strong><span tabindex="0" title="Estimate per dictation: typing at 40 words/minute, minus recording time, never below zero. Not a productivity measurement.">Time saved<small>Estimated</small></span></article><article><strong id="count">0</strong><span>Dictations</span></article></div>
 </section>
 <section id="settings" hidden aria-labelledby="settings-title">
  <div class="settings-intro"><h1 id="settings-title">Settings</h1></div>
   <section class="card preferences" aria-labelledby="preferences-title"><h2 id="preferences-title">Preferences</h2>
    <div class="setting-row shortcut-row"><div><h3>Shortcut</h3></div><div class="shortcut-value"><button id="change-shortcut" aria-label="Record shortcut" title="Record shortcut" aria-pressed="false" aria-describedby="shortcut-feedback"><span id="saved-shortcut">Fn</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/></svg></button><button id="stop-shortcut" hidden>Cancel</button><button id="shortcut-fn" class="text-action" hidden>Use Fn</button></div><p id="shortcut-feedback" role="status" hidden></p></div>
    <div class="setting-row"><div><h3><label for="recording-limit">Recording limit</label></h3></div><select id="recording-limit" title="Applies to the next recording"><option value="120">2 minutes</option><option value="180">3 minutes</option><option value="240">4 minutes</option><option value="300">5 minutes</option></select></div>
    <div class="setting-row listening-row"><div><h3>Sound</h3></div><select id="sound-style" aria-label="Sound"><option value="clean">Clean</option><option value="warm">Warm</option></select><span id="sound-state" class="state">Off</span><label class="switch"><input id="sounds" type="checkbox" role="switch" aria-label="Recording sounds"><span aria-hidden="true"></span></label></div>
    <div class="setting-row volume-row"><h3><label for="sound-volume">Volume</label></h3><div class="sound-controls"><input id="sound-volume" type="range" min="0" max="100" step="1" value="50" aria-describedby="volume-percent"><output id="volume-percent" for="sound-volume">50%</output></div><button id="preview-sound" title="Preview sound" disabled>Preview</button></div>
  </section>
  <section class="card setup-card" aria-labelledby="setup-title"><div class="card-heading"><h2 id="setup-title">Setup</h2><span id="setup-state" class="subtle" role="status">Checking…</span></div>
   <div id="setup-missing">
     <div id="mic-row" class="setting-row"><div><h3>Microphone</h3><p id="mic-state">Allow access to record your voice.</p></div><button id="mic">Allow</button></div>
    <div id="permissions-row" class="setting-row"><div><h3>Shortcuts & paste</h3><p id="permission-state">Checking…</p></div><button id="permissions">Open settings</button></div>
    <div id="hotkey-row" class="setting-row" hidden><div><h3>Shortcut disconnected</h3><p>Quit and reopen HandsFree to reconnect.</p></div></div>
    </div>
     <div id="model-row" class="setting-row" tabindex="-1"><div><h3>English model <span id="model-ready" class="subtle" hidden>· Ready</span></h3><p id="model-state">148 MB · One-time download</p><progress id="progress" max="100" value="0" hidden aria-label="Model download progress"></progress></div><button id="download">Download</button></div>
  </section>
   <section class="local-data" aria-labelledby="data-title"><div class="setting-row"><div><h2 id="data-title">Usage totals</h2></div><button id="reset" class="danger" aria-haspopup="dialog">Reset totals</button></div><p class="subtle">Audio and transcription stay on this Mac.</p></section>
 </section>
 <p id="message" class="status-detail" aria-live="polite" hidden></p>
 <p id="feedback" class="feedback" role="status" hidden></p><p id="storage-error" class="feedback" role="status" hidden></p>
  </main>
  <footer><span class="footer-brand">HandsFree <span id="app-version">0.1.1</span> <span class="beta-badge">BETA</span></span><span>English · On-device transcription</span></footer>
</div>
<dialog id="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">Reset usage totals?</h2><p>Totals will return to zero. Your preferences and language model won’t change.</p><div class="dialog-actions"><button id="keep-stats" autofocus>Keep totals</button><button id="confirm-reset" class="danger">Reset totals</button></div></dialog>`;
const el = (id: string) => document.getElementById(id)!;
const button = (id: string) => el(id) as HTMLButtonElement;
// Avoid presenting native actions as ready before the first backend response.
for (const id of ['change-shortcut', 'mic', 'permissions', 'download', 'reset', 'sounds', 'sound-style', 'sound-volume', 'recording-limit']) {
  (el(id) as HTMLInputElement | HTMLButtonElement).disabled = true;
}
let current: Status | undefined;
let refreshTask: Promise<void> | undefined;
let soundsPending = false;
let stylePending = false;
let volumePending = false;
let limitPending = false;
let volumeEditing = false;
let previewPending = false;
let shortcutPending = false;
let downloadPending = false;
let capturing = false;
let captureTimer: ReturnType<typeof setTimeout> | undefined;
let captureStart: Promise<unknown> | undefined;
let captureStopping = false;
let activationHeld = false;
const canEditShortcut = () => ['idle', 'copied', 'setup_required', 'not_pasted', 'error'].includes(current?.phase ?? '');
const isIdle = () => ['idle', 'copied'].includes(current?.phase ?? '');
let seenPermissionRequests = 0;
function navigate(tab: 'overview' | 'settings') {
  if (capturing && tab !== 'settings') void stopCapture();
  for (const name of ['overview', 'settings']) {
    el(name).hidden = name !== tab;
    el(`nav-${name}`).classList.toggle('active', name === tab);
    if (name === tab) el(`nav-${name}`).setAttribute('aria-current', 'page');
    else el(`nav-${name}`).removeAttribute('aria-current');
  }
}
function feedback(message: string) {
  el('feedback').hidden = !message; el('feedback').textContent = message;
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
const recorder = button('change-shortcut');
function shortcutFeedback(message: string) {
  el('shortcut-feedback').hidden = !message; el('shortcut-feedback').textContent = message;
}
function renderShortcut() {
  recorder.setAttribute('aria-pressed', String(capturing));
  recorder.disabled = shortcutPending || captureStopping || !canEditShortcut();
  if (!shortcutPending) el('saved-shortcut').textContent = capturing ? 'Press shortcut…' : current?.shortcut_label ?? 'Fn';
  el('stop-shortcut').hidden = !capturing;
  button('stop-shortcut').disabled = shortcutPending;
  el('shortcut-fn').hidden = capturing || !current || current.shortcut.code === 'Fn';
  button('shortcut-fn').disabled = shortcutPending || captureStopping || !canEditShortcut();
}
async function stopCapture() {
  if (!capturing || captureStopping) return;
  const restoreFocus = document.activeElement === recorder;
  capturing = false; captureStopping = true; clearTimeout(captureTimer); renderShortcut();
  try { await captureStart; await invoke('capture_shortcut', { active: false }); }
  catch (e) { shortcutFeedback(String(e)); }
  finally { captureStopping = false; renderShortcut(); if (restoreFocus) restoreRecorderFocus(); }
}
function restoreRecorderFocus() {
  if (!el('settings').hidden && document.hasFocus() && document.activeElement === document.body && !recorder.disabled) recorder.focus();
}
async function saveShortcut(shortcut: Shortcut) {
  if (shortcutPending || captureStopping || !canEditShortcut()) return;
  const restoreFocus = document.activeElement === recorder;
  shortcutPending = true; clearTimeout(captureTimer); renderShortcut();
  try { await invoke('set_shortcut', { shortcut }); await refresh(); shortcutFeedback(''); }
  catch (e) { shortcutFeedback(String(e)); }
  finally {
    await stopCapture(); await refresh(); shortcutPending = false; renderShortcut();
    if (restoreFocus) restoreRecorderFocus();
  }
}
el('shortcut-fn').onclick = () => void saveShortcut({code: 'Fn', modifiers: 0});
el('stop-shortcut').onclick = () => void stopCapture();
recorder.onclick = async e => {
  if (!canEditShortcut() || shortcutPending || capturing || captureStopping) return;
  capturing = true; activationHeld = e.detail === 0; shortcutFeedback(''); renderShortcut(); recorder.focus();
  try {
    captureStart = invoke('capture_shortcut', {active: true});
    await captureStart;
    if (!capturing || !canEditShortcut()) { await stopCapture(); return; }
    captureTimer = setTimeout(() => { void stopCapture(); shortcutFeedback('Shortcut recording timed out.'); }, 15000);
  } catch (e) { capturing = false; renderShortcut(); shortcutFeedback(String(e)); }
};
recorder.onkeydown = e => {
  if (!capturing || shortcutPending) return;
  if (e.code === 'Tab') { void stopCapture(); return; }
  e.preventDefault(); e.stopPropagation();
  if (e.repeat || e.isComposing) return;
  if (e.code === 'Escape') { void stopCapture(); return; }
  if (activationHeld && (e.code === 'Enter' || (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey))) return;
  if (captureStart && captureStopping) return;
  if (/^(Control|Alt|Shift|Meta)/.test(e.code)) return;
  try { const shortcut = shortcutFromEvent(e); void captureStart?.then(() => { if (capturing) void saveShortcut(shortcut); }).catch(error => shortcutFeedback(String(error))); }
  catch (error) { shortcutFeedback(String(error)); }
};
recorder.onkeyup = () => { activationHeld = false; };
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
const sounds = el('sounds') as HTMLInputElement;
const soundStyle = el('sound-style') as HTMLSelectElement;
soundStyle.onchange = async () => {
  if (stylePending || previewPending || !isIdle()) return;
  const previous = current?.sound_style ?? 'clean';
  stylePending = true; soundStyle.disabled = true; button('preview-sound').disabled = true;
  const success = await action('set_sound_style', { style: soundStyle.value });
  if (!success) soundStyle.value = previous;
  stylePending = false; soundStyle.disabled = !isIdle() || previewPending;
};
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
  if (previewPending || stylePending || volumePending || volumeEditing || !isIdle()) return;
  previewPending = true; soundStyle.disabled = true; button('preview-sound').disabled = true;
  await action('preview_sound');
  // One explicit click, one cue. Prevent rapid repeated previews.
  setTimeout(() => { previewPending = false; soundStyle.disabled = !isIdle() || stylePending; button('preview-sound').disabled = !isIdle() || stylePending || volumePending || volumeEditing; }, 400);
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
function refresh(): Promise<void> {
  if (!refreshTask) refreshTask = refreshStatus().finally(() => { refreshTask = undefined; });
  return refreshTask;
}
async function refreshStatus() {
  try {
    current = await invoke<Status>('status');
    button('reset').disabled = false;
    if (!soundsPending) sounds.disabled = false;
    if (!volumePending) volume.disabled = false;
    if (!limitPending) { recordingLimit.disabled = false; recordingLimit.value = String(current.recording_limit ?? 120); }
    const requests = (current as Status & { permission_requests?: number }).permission_requests ?? 0;
    if (requests !== seenPermissionRequests) { seenPermissionRequests = requests; navigate('settings'); }
    el('phase').textContent = current.phase === 'idle' && !readiness(current) ? 'Setup needed' : phaseLabel(current.phase);
    // Keep diagnostics outside the compact header; never render dictation payloads.
    const idleHint = `Select a text field and press ${current.shortcut_label}.`;
    el('message').textContent = current.phase === 'idle' && current.message === idleHint ? '' : current.message;
    el('message').hidden = !el('message').textContent;
    el('dot').className = current.phase;
    button('mic').disabled = current.microphone;
    el('mic').textContent = current.microphone ? 'Allowed' : 'Allow';
    el('mic-state').textContent = 'Allow access to record your voice.';
    el('permission-state').textContent = !current.accessibility ? 'Allow Accessibility for automatic paste.' : 'Allow Input Monitoring for the shortcut.';
    el('mic-row').hidden = current.microphone;
    el('permissions-row').hidden = current.accessibility && current.input_monitoring;
    el('hotkey-row').hidden = current.hotkey;
    el('model-ready').hidden = !current.model_ready;
    button('permissions').disabled = current.accessibility && current.input_monitoring;
    el('permissions').textContent = current.accessibility && current.input_monitoring ? 'Allowed' : 'Open settings';
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
    if (!soundsPending) {
      sounds.checked = current.sounds;
      el('sound-state').textContent = current.sounds ? 'On' : 'Off';
    }
    el('overview-shortcut').textContent = current.shortcut_label;
    if (capturing && !canEditShortcut() && !shortcutPending) void stopCapture();
    renderShortcut();
    if (!volumePending && !volumeEditing) { volume.value = String(current.sound_volume); showVolume(); }
    if (!stylePending) soundStyle.value = current.sound_style;
    soundStyle.disabled = !isIdle() || stylePending || previewPending;
    button('preview-sound').disabled = !isIdle() || stylePending || previewPending || volumePending || volumeEditing;
    el('words').textContent = current.stats.words.toLocaleString();
    el('count').textContent = current.stats.transcriptions.toLocaleString();
    el('saved').textContent = formatTime(current.stats.saved_seconds);
    const ready = readiness(current);
    el('setup-state').textContent = ready ? 'Ready' : 'Needs attention';
    el('setup-missing').hidden = ready;
    document.querySelector<HTMLElement>('.readiness')!.hidden = ready;
    el('ready-title').textContent = ready ? 'Ready' : 'Finish setting up';
    el('ready-detail').textContent = readinessDetail(current);
    el('setup').textContent = 'Open settings';
    el('storage-error').hidden = !current.persistence_error;
    el('storage-error').textContent = current.persistence_error;
  } catch (e) { feedback(`Couldn’t connect to HandsFree: ${String(e)}`); }
}
void refresh();
void getVersion().then(version => { el('app-version').textContent = version; }).catch(() => { /* Packaged version fallback for browser previews. */ });
setInterval(() => { if (!document.hidden) void refresh(); }, 800);
document.addEventListener('visibilitychange', () => { if (document.hidden && capturing) void stopCapture(); else if (!document.hidden) void refresh(); });
