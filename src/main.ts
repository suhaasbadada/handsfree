import { invoke } from '@tauri-apps/api/core';
import './style.css';
import './typography.css';
import { shortcutFromEvent, type Shortcut } from './shortcut';
import { phaseLabel, canCancel, formatTime, readiness, readinessDetail } from './presentation';

type Status = { phase: string; message: string; progress: number; model_ready: boolean; microphone: boolean; accessibility: boolean; input_monitoring: boolean; hotkey: boolean; transcript: string; sounds: boolean; sound_volume: number; sound_style: string; shortcut: Shortcut; shortcut_label: string; stats: { transcriptions: number; words: number; speech_seconds: number; saved_seconds: number }; persistence_error: string };
const logo = new URL('../src-tauri/icons/icon.png', import.meta.url).href;
document.querySelector('#app')!.innerHTML = `
<div class="shell">
 <aside><a class="brand" href="#overview" aria-label="HandsFree overview"><img src="${logo}" alt="" width="36" height="36"><span>HandsFree</span></a>
 <nav aria-label="Main navigation"><button id="nav-overview" class="nav active" aria-current="page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7v9h-6v-6h-4v6H4Z"/></svg>Overview</button><button id="nav-settings" class="nav"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg>Settings</button></nav></aside>
 <main>
 <header><span id="page-label">Overview</span><span class="badge"><i></i> On this Mac</span></header>
 <section id="overview" aria-labelledby="overview-title">
  <div class="hero"><h1 id="overview-title">Ready when you are.</h1><p>Choose a text field, press <kbd id="overview-shortcut">Fn</kbd> and speak.<br>Press again to finish. Escape cancels.</p></div>
  <section class="card readiness"><div><h2 id="ready-title">Finish setting up</h2><p id="ready-detail">Checking permissions and model…</p></div><button id="setup" class="primary">Open settings</button></section>
  <div class="metrics" aria-label="Local usage since tracking began"><article><strong id="words">0</strong><span>Words dictated</span></article><article><strong id="saved">0 min</strong><span>Estimated time saved</span></article><article><strong id="count">0</strong><span>Dictations</span><small id="duration">0 sec recorded</small></article></div>
  <p class="metric-note">Local totals · Time saved estimates typing at 40 words/min, minus recording time.</p>
  <section class="card transcript-card"><div class="card-heading"><h2>Last transcript</h2><span class="subtle">This session</span></div><p id="transcript" class="transcript empty">No transcript yet. Your next dictation will appear here.</p><div class="transcript-footer"><span class="subtle">Only held in memory until you quit.</span><button id="copy" disabled>Copy text</button></div></section>
 </section>
 <section id="settings" hidden aria-labelledby="settings-title">
  <div class="settings-intro"><h1 id="settings-title">Settings</h1><p>A little more personal. Still entirely local.</p></div>
  <section class="card"><h2>Keyboard shortcut</h2><div class="setting-row"><div><h3>Start and finish dictation</h3><p>Works even when HandsFree is in the background. Escape cancels.</p></div><kbd id="saved-shortcut">Fn</kbd></div><div class="shortcut-options"><button id="shortcut-fn">Fn</button><button id="shortcut-option">Option + Space</button><button id="shortcut-control">Control + Shift + Space</button><button id="record-shortcut">Record shortcut…</button></div><input id="shortcut-recorder" readonly hidden aria-label="Record shortcut" placeholder="Press your shortcut. Escape cancels." aria-describedby="shortcut-help"><p id="shortcut-help" class="subtle">Use Control, Option or Command with a letter, number or Space. Bindings use physical US key positions on all layouts. Shortcuts also reach the foreground app; choose one it doesn’t use. System and common editing shortcuts are blocked.</p><div class="setting-row"><p>For Fn, set the Globe key action to Do Nothing and disable macOS Dictation’s Fn shortcut.</p><button id="keyboard">Keyboard settings</button></div></section>
  <section class="card"><h2>Listening sound</h2><div class="setting-row"><div><h3>Play a cue before listening</h3><p>A short, original sound. Audio capture starts after it finishes.</p></div><label class="switch"><input id="sounds" type="checkbox" role="switch" aria-label="Listening sound"><span aria-hidden="true"></span></label></div><div class="setting-row"><div><label for="sound-style">Sound</label><p>Selection is silent. Use Preview to listen.</p></div><select id="sound-style"><option value="tap">Soft tap</option><option value="bell">Soft bell</option></select></div></section>
   <section class="card"><div class="card-heading"><h2>Permissions & model</h2><span class="subtle">One-time setup</span></div>
   <div class="setting-row"><div><h3>Microphone <span id="mic-state" class="state"></span></h3><p>Your Mac’s default input. If previously denied, enable HandsFree in System Settings → Privacy & Security → Microphone.</p></div><button id="mic">Allow</button></div>
    <div class="setting-row"><div><h3>Accessibility & Input Monitoring</h3><p id="permission-state">Checking…</p><p>Enable /Applications/HandsFree.app in the missing pane. Already-allowed permissions do not need to be repeated. Used for shortcuts and safe paste, not background logging.</p></div><button id="permissions">Open settings</button></div>
   <div class="setting-row"><div><h3>English language model <span id="model-state" class="state"></span></h3><p>Whisper base.en · 148 MB · verified one-time download from Hugging Face. After setup, inference works offline.</p><progress id="progress" max="100" value="0" hidden aria-label="Model download progress"></progress></div><button id="download">Download</button></div>
  </section>
  <section class="card"><h2>Private by design</h2><p class="body-copy">Audio is processed on this Mac and deleted after each attempt. The last transcript lives in memory until you quit. No accounts, telemetry, cloud transcription, or stored transcript history. Paste briefly uses the system clipboard; clipboard managers may see it.</p><div class="setting-row"><div><h3>Local usage totals</h3><p>Only counts, recording duration, and time-saved estimates are saved. Silence, failures, and cancellations don’t count. Successful transcripts count even when paste is unavailable.</p></div><button id="reset" class="danger">Reset totals</button></div><p class="subtle">Time saved = max(0, words ÷ 40 × 60 − recording seconds), per dictation. An estimate, not a productivity measurement. Login startup is not enabled; open HandsFree when you need it.</p></section>
 </section>
 <section class="status" aria-label="App status"><span id="dot"></span><div><strong id="phase">Connecting…</strong><p id="message" aria-live="polite"></p></div><button id="cancel" hidden>Cancel</button></section>
 <p id="feedback" class="feedback" role="status" hidden></p><p id="storage-error" class="feedback" role="status" hidden></p>
  <footer><span>HandsFree · 0.1</span><span>English · On-device transcription</span></footer>
 </main>
</div>
<dialog id="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">Reset usage totals?</h2><p>This permanently resets your local usage totals to zero. Your shortcut, sound preferences and language model stay as they are.</p><div class="dialog-actions"><button id="keep-stats" autofocus>Keep my totals</button><button id="confirm-reset" class="danger">Reset totals</button></div></dialog>`;
const el = (id: string) => document.getElementById(id)!;
const button = (id: string) => el(id) as HTMLButtonElement;
let current: Status | undefined;
let refreshing = false;
let soundsPending = false;
let volumePending = false;
let volumeEditing = false;
let previewPending = false;
let stylePending = false;
let shortcutPending = false;
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
function feedback(message: string) { el('feedback').hidden = !message; el('feedback').textContent = message; }
async function action(command: string, args?: Record<string, unknown>): Promise<boolean> {
  try { await invoke(command, args); feedback(''); await refresh(); return true; }
  catch (e) { feedback(String(e)); return false; }
}
el('nav-overview').onclick = () => navigate('overview');
el('nav-settings').onclick = () => navigate('settings');
document.querySelector('.brand')!.addEventListener('click', e => { e.preventDefault(); navigate('overview'); });
el('setup').onclick = () => navigate('settings');
el('mic').onclick = () => void action('request_microphone');
el('permissions').onclick = () => void action('request_permissions');
el('keyboard').onclick = () => void action('open_keyboard');
const recorder = el('shortcut-recorder') as HTMLInputElement;
async function stopCapture() {
  capturing = false; clearTimeout(captureTimer); recorder.hidden = true;
  try { await invoke('capture_shortcut', { active: false }); } catch (e) { feedback(String(e)); }
}
async function saveShortcut(shortcut: Shortcut) {
  if (shortcutPending) return;
  shortcutPending = true;
  await action('set_shortcut', { shortcut });
  await stopCapture(); shortcutPending = false;
}
el('shortcut-fn').onclick = () => void saveShortcut({code: 'Fn', modifiers: 0});
el('shortcut-option').onclick = () => void saveShortcut({code: 'Space', modifiers: 2});
el('shortcut-control').onclick = () => void saveShortcut({code: 'Space', modifiers: 5});
el('record-shortcut').onclick = async () => {
  if (!canEditShortcut() || shortcutPending || capturing) return;
  try {
    await invoke('capture_shortcut', {active: true});
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
const style = el('sound-style') as HTMLSelectElement;
style.onchange = async () => {
  stylePending = true; style.disabled = true;
  if (!await action('set_sound_style', {style: style.value})) style.value = current?.sound_style ?? 'tap';
  stylePending = false; style.disabled = false;
};
el('download').onclick = () => void action('download_model');
el('cancel').onclick = () => void action('cancel');
el('copy').onclick = async () => { if (await action('copy_transcript')) feedback('Copied. Paste it wherever you need it.'); };
const sounds = el('sounds') as HTMLInputElement;
// Commit once on release/key change, not on every pointer movement. Keep the
// percentage local during a drag so background status polls cannot reset it.
const soundRow = sounds.closest('.setting-row')!;
soundRow.parentElement!.insertAdjacentHTML('beforeend', `<div class="setting-row sound-controls"><div><label for="sound-volume">Volume <output id="volume-percent" for="sound-volume">50%</output></label><p>Bluetooth adds a short settling pause. For delayed outputs, turn sound off. Preview works even with sound off.</p><input id="sound-volume" type="range" min="0" max="100" step="1" value="50" aria-describedby="volume-percent"></div><button id="preview-sound" disabled>Preview sound</button></div>`);
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
  if (!success) sounds.checked = current?.sounds ?? true;
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
    const requests = (current as Status & { permission_requests?: number }).permission_requests ?? 0;
    if (requests !== seenPermissionRequests) { seenPermissionRequests = requests; navigate('settings'); }
    el('phase').textContent = current.phase === 'idle' && !readiness(current) ? 'Setup needed' : phaseLabel(current.phase);
    el('message').textContent = current.message;
    el('dot').className = current.phase;
    button('mic').disabled = current.microphone;
    el('mic').textContent = current.microphone ? 'Allowed' : 'Allow';
    el('mic-state').textContent = current.microphone ? 'Ready' : 'Needs access';
    el('permission-state').textContent = `Accessibility: ${current.accessibility ? 'allowed' : 'needs access'} · Input Monitoring: ${current.input_monitoring ? 'allowed' : 'needs access'} · Shortcut: ${current.hotkey ? 'connected' : 'restart after granting access'}`;
    button('permissions').disabled = current.accessibility && current.input_monitoring;
    el('permissions').textContent = !current.accessibility ? 'Allow Accessibility ↗' : !current.input_monitoring ? 'Allow Input Monitoring ↗' : 'Allowed';
    el('model-state').textContent = current.model_ready ? 'Ready' : 'Not installed';
    button('download').disabled = current.model_ready || current.phase === 'downloading';
    el('download').textContent = current.model_ready ? 'Ready offline' : current.phase === 'downloading' ? `${Math.round(current.progress)}%` : 'Download';
    el('progress').hidden = current.phase !== 'downloading';
    (el('progress') as HTMLProgressElement).value = current.progress;
    el('cancel').hidden = !canCancel(current.phase);
    button('copy').disabled = !current.transcript;
    el('transcript').textContent = current.transcript || `No transcript yet. Choose a text field in another app and press ${current.shortcut_label} to begin.`;
    el('transcript').classList.toggle('empty', !current.transcript);
    if (!soundsPending) sounds.checked = current.sounds;
    if (!stylePending) style.value = current.sound_style;
    style.disabled = stylePending || !isIdle();
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
