import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import './style.css';
import './typography.css';
import { defaultShortcut, ShortcutRecorder, shortcutLabel, type Shortcut } from './shortcut';
import { phaseLabel, canCancel, formatTime, readiness, readinessDetail } from './presentation';
import { Practice } from './practice';
import { PracticeInputs, type PracticeInput } from './practice-input.ts';
import { Updates, updateBusy } from './updates';
import { phasePolicy, updateInstalling, type DictationPhase } from './state.ts';

type Status = { platform?: 'windows' | 'macos'; compatibility_paste?: boolean; phase: DictationPhase; message: string; progress: number; model_ready: boolean; microphone: boolean; accessibility: boolean; input_monitoring: boolean; hotkey: boolean; transcript: string; sounds: boolean; sound_volume: number; sound_style: 'clean' | 'warm'; recording_limit: number; recording_mode?: 'toggle' | 'push_to_talk'; shortcut: Shortcut; shortcut_label: string; stats: { transcriptions: number; words: number; speech_seconds: number; saved_seconds: number }; persistence_error: string };
const logo = new URL('../src-tauri/icons/icon.png', import.meta.url).href;
const glyphs: Record<string,string> = {
 mic:'<rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
 check:'<path d="m5 12 4 4L19 6"/>', close:'<path d="m6 6 12 12M18 6 6 18"/>',
 clear:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 words:'<path d="M4 5h16M4 10h12M4 15h16M4 20h9"/>',
 wave:'<path d="M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4"/>',
 update:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
 play:'<path d="m9 5 10 7-10 7Z"/>', chevron:'<path d="m8 10 4 4 4-4"/>'
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${glyphs[name]}</svg>`;
document.querySelector('#app')!.innerHTML = `
<div class="shell">
 <aside><a class="brand" href="#overview" aria-label="HandsFree menu" aria-haspopup="menu" aria-expanded="false" aria-controls="brand-menu"><img src="${logo}" alt="" width="36" height="36"><span>HandsFree</span>${icon('chevron')}</a>
  <div id="brand-menu" class="brand-menu" role="menu" aria-label="HandsFree" hidden><button id="brand-overview" role="menuitem">Overview</button><button id="brand-settings" role="menuitem">Settings</button><button id="brand-updates" role="menuitem">App updates…</button></div>
  <div class="header-right"><nav aria-label="Main navigation"><button id="nav-overview" class="nav active" aria-label="Overview" title="Overview" aria-current="page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7v9h-6v-6h-4v6H4Z"/></svg></button><button id="nav-settings" class="nav" aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg></button></nav><section class="status" aria-label="App status"><span id="dot" aria-hidden="true"></span><strong id="phase" aria-live="polite">Connecting…</strong><button id="cancel" hidden aria-label="Cancel dictation" title="Cancel dictation">×</button></section></div></aside>
 <main>
 <section id="overview" aria-labelledby="overview-title">
    <div class="hero"><span class="eyebrow">A little less typing</span><h1 id="overview-title">Make room for your thoughts.</h1><p><span id="recording-action">Press</span> <kbd id="overview-shortcut">…</kbd> <span id="recording-instruction">to dictate in any app</span></p></div>
    <section class="card readiness"><div><h2 id="ready-title">Finish setting up</h2><p id="ready-detail">Connecting to HandsFree…</p></div><button id="setup" class="primary" disabled>Open settings</button></section>
   <section id="overview-model" class="card readiness" hidden aria-label="English model"><div><h2>English model</h2><p id="overview-model-state">One-time download · Works offline afterward</p></div><button id="overview-download" class="primary" disabled>Download English model (~148 MB)</button></section>
   <section id="practice" class="card practice" aria-labelledby="practice-title" hidden>
    <div class="card-heading"><div><h2 id="practice-title">A space to try it</h2><p class="practice-instruction">Use the microphone or your shortcut. Your words appear right here.</p></div><span class="test-badge">${icon('shield')}Private test</span></div>
    <p class="practice-sample">“A little less typing. A little more thinking.”</p>
    <label for="practice-text" class="sr-only">Practice dictation</label>
    <textarea id="practice-text" rows="4" autocomplete="off" spellcheck="false" aria-describedby="practice-privacy" placeholder="Speak freely. This space is just for you."></textarea>
    <div class="practice-bottom"><div class="practice-actions"><button id="practice-start" class="primary" disabled>${icon('mic')}<span>Start test</span></button><button id="practice-finish" class="primary" disabled hidden>${icon('check')}<span>Finish</span></button><button id="practice-cancel" class="icon-action" aria-label="Cancel practice" title="Cancel practice" disabled hidden>${icon('close')}</button><button id="practice-clear" class="icon-action" aria-label="Clear practice" title="Clear practice">${icon('clear')}</button><button id="practice-setup" class="icon-action" aria-label="Practice setup help" title="Practice setup help">${icon('settings')}</button></div><p id="practice-privacy" class="subtle">No clipboard. No usage counted.<br>Clears when you leave this view.</p></div>
    <p id="practice-message" role="status" aria-live="polite"></p>
   </section>
   <section class="activity" aria-labelledby="activity-title"><h2 id="activity-title">Your activity</h2><div class="metrics" aria-label="Real dictation only; practice tests excluded"><article><span>${icon('words')}Words</span><strong id="words">0</strong></article><article><span tabindex="0" title="Estimate per dictation: typing at 40 words/minute, minus recording time, never below zero. Not a productivity measurement.">${icon('clock')}Time saved<small>Estimated</small></span><strong id="saved">0 sec</strong></article><article><span>${icon('wave')}Dictations</span><strong id="count">0</strong></article></div></section>
 </section>
 <section id="settings" hidden aria-labelledby="settings-title">
  <div class="settings-intro"><h1 id="settings-title">Settings</h1></div>
   <section class="card preferences" aria-labelledby="preferences-title"><h2 id="preferences-title">Preferences</h2>
    <div class="setting-row"><div><h3><label for="recording-mode">Recording mode</label></h3><p id="recording-mode-help" hidden>Hold the shortcut; release to finish. Other keys or focus changes cancel.</p></div><select id="recording-mode" aria-describedby="recording-mode-help"><option value="toggle">Toggle</option><option value="push_to_talk">Push to talk</option></select></div>
    <div id="compatibility-row" class="setting-row" hidden><div><h3>Compatibility paste</h3><p id="compatibility-help">For apps that hide their text field. Pastes once into the same active app/window; the exact field cannot be verified.</p></div><label class="switch"><input id="compatibility-paste" type="checkbox" role="switch" aria-label="Compatibility paste" aria-describedby="compatibility-help"><span aria-hidden="true"></span></label></div>
     <div class="setting-row shortcut-row"><div><h3>Shortcut</h3></div><div class="shortcut-value"><button id="change-shortcut" aria-label="Record shortcut" title="Record shortcut" aria-pressed="false" aria-describedby="shortcut-feedback"><span id="saved-shortcut">…</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/></svg></button><button id="stop-shortcut" hidden>Cancel</button><button id="shortcut-fn" class="text-action" hidden>Use default</button></div><p id="shortcut-feedback" role="status" hidden></p></div>
    <div class="setting-row"><div><h3><label for="recording-limit">Recording limit</label></h3></div><select id="recording-limit" title="Applies to the next recording"><option value="120">2 minutes</option><option value="180">3 minutes</option><option value="240">4 minutes</option><option value="300">5 minutes</option></select></div>
    <div class="setting-row listening-row"><div><h3>Sound</h3></div><select id="sound-style" aria-label="Sound"><option value="clean">Clean</option><option value="warm">Warm</option></select><span id="sound-state" class="state">Off</span><label class="switch"><input id="sounds" type="checkbox" role="switch" aria-label="Recording sounds"><span aria-hidden="true"></span></label></div>
    <div class="setting-row volume-row"><h3><label for="sound-volume">Volume</label></h3><div class="sound-controls"><input id="sound-volume" type="range" min="0" max="100" step="1" value="50" aria-describedby="volume-percent"><output id="volume-percent" for="sound-volume">50%</output></div><button id="preview-sound" class="icon-action" aria-label="Preview sound" title="Preview sound" disabled>${icon('play')}</button></div>
  </section>
  <section class="card setup-card" aria-labelledby="setup-title"><div class="card-heading"><h2 id="setup-title">Setup</h2><span id="setup-state" class="subtle" role="status">Checking…</span></div>
   <div id="setup-missing">
     <div id="mic-row" class="setting-row"><div><h3>Microphone</h3><p id="mic-state">Allow access to record your voice.</p></div><button id="mic">Allow</button></div>
     <div id="permissions-row" class="setting-row" hidden><div><h3>Shortcuts & paste</h3><p id="permission-state">Checking…</p></div><button id="permissions">Open settings</button></div>
     <div id="hotkey-row" class="setting-row" hidden><div><h3 id="hotkey-title">Shortcut disconnected</h3><p id="hotkey-detail">Checking shortcut…</p></div></div>
    </div>
     <div id="model-row" class="setting-row" tabindex="-1"><div><h3>English model <span id="model-ready" class="subtle" hidden>· Ready</span></h3><p id="model-state">148 MB · One-time download</p><progress id="progress" max="100" value="0" hidden aria-label="Model download progress"></progress></div><button id="download">Download</button></div>
  </section>
    <section class="local-data" aria-labelledby="data-title"><div class="setting-row"><div><h2 id="data-title">Usage totals</h2></div><button id="reset" class="danger" aria-haspopup="dialog">Reset totals</button></div><p id="privacy-detail" class="subtle">Audio and transcription stay on this device.</p></section>
 </section>
 <p id="message" class="status-detail" aria-live="polite" hidden></p>
 <p id="feedback" class="feedback" role="status" hidden></p><p id="storage-error" class="feedback" role="status" hidden></p>
  </main>
  <footer><span class="footer-privacy">${icon('shield')}On-device · English</span><div class="footer-meta"><span class="footer-brand"><span class="sr-only">HandsFree</span><span id="app-version">0.1.1</span><span class="beta-badge">BETA</span></span><button id="updates-open" class="text-action" hidden>${icon('update')}Updates</button></div></footer>
</div>
<dialog id="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">Reset usage totals?</h2><p>Totals will return to zero. Your preferences and language model won’t change.</p><div class="dialog-actions"><button id="keep-stats" autofocus>Keep totals</button><button id="confirm-reset" class="danger">Reset totals</button></div></dialog>`;
const el = (id: string) => document.getElementById(id)!;
const button = (id: string) => el(id) as HTMLButtonElement;
document.body.insertAdjacentHTML('beforeend', `<dialog id="updates-dialog" aria-labelledby="updates-title">
 <h2 id="updates-title" tabindex="-1" autofocus>App updates</h2><p>Installed release: <strong id="installed-release">Connecting…</strong></p>
 <p id="updates-message" role="status" aria-live="polite"></p><p id="updates-version" hidden></p>
 <p id="updates-notes" class="update-notes" hidden></p><progress id="updates-progress" max="100" hidden aria-label="Update download progress"></progress>
 <p>Checks contact the HandsFree release server only when you ask. Updates are signature-verified. Your model, settings and usage totals are kept.</p>
 <div class="dialog-actions"><button id="updates-close">Close</button><button id="updates-check">Check for updates</button><button id="updates-install" class="primary" hidden>Download &amp; restart…</button></div>
 </dialog>
 <dialog id="update-confirm-dialog" aria-labelledby="update-confirm-title"><h2 id="update-confirm-title" tabindex="-1" autofocus>Update HandsFree?</h2>
 <p id="update-confirm-detail"></p><p>HandsFree will download, verify, install and restart. Finish dictation first. macOS may ask for administrator approval. Unsaved last-transcript text is not retained across restart.</p>
 <div class="dialog-actions"><button id="update-keep">Not now</button><button id="update-confirm" class="primary">Download &amp; restart</button></div></dialog>`);
// Avoid presenting native actions as ready before the first backend response.
for (const id of ['change-shortcut', 'mic', 'permissions', 'download', 'reset', 'sounds', 'sound-style', 'sound-volume', 'recording-limit', 'recording-mode']) {
  (el(id) as HTMLInputElement | HTMLButtonElement).disabled = true;
}
let current: Status | undefined;
const displayShortcut = (status: Status) => status.platform === 'windows' ? shortcutLabel(status.shortcut, 'windows') : status.shortcut_label;
let refreshTask: Promise<void> | undefined;
let soundsPending = false;
let stylePending = false;
let volumePending = false;
let limitPending = false;
let modePending = false;
let volumeEditing = false;
let previewPending = false;
let shortcutPending = false;
let downloadPending = false;
let capturing = false;
let captureTimer: ReturnType<typeof setTimeout> | undefined;
let captureStart: Promise<unknown> | undefined;
let captureStopping = false;
let activationHeld = false;
const installingUpdate = () => updateInstalling(updates.view.phase);
const canEditShortcut = () => !installingUpdate() && phasePolicy(current?.phase).editConfiguration;
const isIdle = () => !installingUpdate() && phasePolicy(current?.phase).previewSound;
let seenPermissionRequests = 0;
function navigate(tab: 'overview' | 'settings') {
  if (tab !== 'overview') clearPractice();
  if (capturing && tab !== 'settings') void stopCapture();
  for (const name of ['overview', 'settings']) {
    el(name).hidden = name !== tab;
    el(`nav-${name}`).classList.toggle('active', name === tab);
    if (name === tab) el(`nav-${name}`).setAttribute('aria-current', 'page');
    else el(`nav-${name}`).removeAttribute('aria-current');
  }
  renderPractice();
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
const brand = document.querySelector('.brand') as HTMLAnchorElement;
function closeBrandMenu(restore = false) {
  el('brand-menu').hidden = true; brand.setAttribute('aria-expanded','false');
  if (restore) brand.focus();
  renderPractice();
}
function openBrandMenu() {
  el('brand-menu').hidden = false; brand.setAttribute('aria-expanded','true'); renderPractice();
}
brand.addEventListener('click', e => { e.preventDefault(); if(el('brand-menu').hidden) openBrandMenu(); else closeBrandMenu(); });
brand.onkeydown = e => { if(e.key==='ArrowDown'){e.preventDefault();openBrandMenu();button('brand-overview').focus();} };
el('brand-menu').onkeydown = e => {
  if(e.key==='Escape'){e.preventDefault();closeBrandMenu(true);return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp') {
    e.preventDefault(); const items=Array.from(el('brand-menu').querySelectorAll<HTMLButtonElement>('button:not([hidden])'));
    const index=items.indexOf(document.activeElement as HTMLButtonElement); items[(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
  }
};
document.addEventListener('pointerdown', e => { if(!brand.contains(e.target as Node)&&!el('brand-menu').contains(e.target as Node)) closeBrandMenu(); });
el('brand-overview').onclick=()=>{closeBrandMenu();navigate('overview');};
el('brand-settings').onclick=()=>{closeBrandMenu();navigate('settings');};
el('brand-updates').onclick=()=>{closeBrandMenu();button('updates-open').click();};
el('setup').onclick = () => {
  if (!current) return;
  navigate('settings');
  const target = el(!current.model_ready ? 'model-row' : !current.microphone ? 'mic-row' : current.platform === 'windows' ? 'change-shortcut' : !current.accessibility || !current.input_monitoring ? 'permissions-row' : 'hotkey-row');
  target.scrollIntoView({ block: 'center' });
  target.setAttribute('tabindex', '-1'); target.focus();
};
const practiceField = el('practice-text') as HTMLTextAreaElement;
let windowActive = document.hasFocus();
const practiceVisible = () => windowActive && !el('overview').hidden && !document.hidden && document.hasFocus() && !document.querySelector('dialog[open]') && el('brand-menu').hidden;
let practiceContext = 0;
let contextRevision = Date.now()*1000;
function syncPracticeContext() {
  const active = current?.platform === 'macos' && practiceVisible() && !capturing && !captureStopping && !installingUpdate();
  if (active === Boolean(practiceContext)) return;
  const revision = contextRevision = Math.max(contextRevision+1, Date.now()*1000);
  practiceContext = active ? revision : 0;
  void invoke('practice_context',{revision,active}).catch(()=>{if(practiceContext===revision) practiceContext=0;});
  if (!active) clearPractice();
}
const practice = new Practice(invoke, view => {
  // Assign a value, never HTML; no normal dictation payload is read here.
  if (practiceField.value !== view.text) practiceField.value = view.text;
  el('practice-message').textContent = view.message;
  renderPractice();
}, practiceVisible);
const practiceInputs = new PracticeInputs(practice, practiceVisible);
function clearPractice() { practiceInputs.reset(); void practice.clear(); }
function renderPractice() {
  el('practice').hidden = current?.platform !== 'macos';
  const active = ['starting', 'recording', 'processing'].includes(practice.view.phase);
  button('practice-start').disabled = !current || !readiness(current) || !canEditShortcut() || capturing || captureStopping || shortcutPending || modePending || downloadPending || !practiceVisible() || !['idle', 'error','complete','empty'].includes(practice.view.phase);
  button('practice-start').hidden = active || practice.view.phase==='cancelling';
  button('practice-start').querySelector('span')!.textContent = ['complete','empty'].includes(practice.view.phase) ? 'Record again' : 'Start test';
  button('practice-finish').disabled = practice.view.phase !== 'recording';
  button('practice-finish').hidden = practice.view.phase !== 'recording';
  button('practice-cancel').disabled = !active;
  button('practice-cancel').hidden = !active;
  button('practice-clear').hidden = active || practice.view.phase==='cancelling';
  button('practice-setup').hidden = Boolean(current && readiness(current));
  syncPracticeContext();
}
practiceField.oninput = () => practice.edit(practiceField.value);
el('practice-start').onclick = () => { if (!button('practice-start').disabled) void practiceInputs.start(); };
el('practice-finish').onclick = () => void practice.finish();
el('practice-cancel').onclick = clearPractice;
el('practice-clear').onclick = clearPractice;
el('practice-setup').onclick = () => button('setup').click();
window.addEventListener('blur', () => { windowActive=false; syncPracticeContext(); clearPractice(); });
window.addEventListener('pagehide', () => { windowActive=false; syncPracticeContext(); clearPractice(); });
window.addEventListener('focus', () => { windowActive=true; renderPractice(); });
// WebKit does not always dispatch pagehide when a native window is hidden.
void listen('practice-cleared', () => { practiceContext=0; clearPractice(); }).catch(() => { /* Browser-only preview has no native events. */ });
void listen<PracticeInput>('practice-input', ({payload}) => {
  if(payload.context!==practiceContext || !practiceVisible() || capturing || captureStopping || installingUpdate()) return;
  void practiceInputs.receive(payload);
}).catch(()=>{});
void listen<string>('dashboard-navigate', ({payload}) => {
  closeBrandMenu();
  if(payload==='updates') button('updates-open').click();
  else { navigate(payload==='settings'?'settings':'overview'); if(payload==='practice') practiceField.focus(); }
}).catch(()=>{});
const updatesDialog = el('updates-dialog') as HTMLDialogElement;
const updateConfirmDialog = el('update-confirm-dialog') as HTMLDialogElement;
let confirmedUpdate: string | undefined;
const canInstallUpdate = () => current?.platform === 'macos'
  && phasePolicy(current.phase).installUpdate
  && practice.view.phase === 'idle' && !capturing && !captureStopping && !shortcutPending && !downloadPending && !modePending;
const updates = new Updates(invoke, () => { renderUpdates(); renderPractice(); renderShortcut(); }, canInstallUpdate);
function renderUpdates() {
  const view = updates.view;
  el('installed-release').textContent = view.installed_version || 'Connecting…';
  el('updates-message').textContent = view.message;
  el('updates-version').hidden = !view.available_version;
  el('updates-version').textContent = view.available_version ? `Available release: ${view.available_version}` : '';
  el('updates-notes').hidden = !view.notes;
  el('updates-notes').textContent = view.notes;
  button('updates-check').disabled = updateBusy(view) || updateConfirmDialog.open;
  el('updates-check').hidden = view.phase === 'available' || ['downloading', 'installing'].includes(view.phase);
  el('updates-install').hidden = view.phase !== 'available';
  button('updates-install').disabled = !canInstallUpdate();
  button('update-confirm').disabled = !canInstallUpdate() || view.phase !== 'available' || confirmedUpdate !== view.available_version;
  const progress = el('updates-progress') as HTMLProgressElement;
  progress.hidden = !['downloading', 'installing'].includes(view.phase);
  if (view.total_bytes && view.total_bytes > 0) progress.value = Math.min(100, view.downloaded_bytes / view.total_bytes * 100);
  else progress.removeAttribute('value');
}
el('updates-open').onclick = () => { if (current?.platform !== 'macos') return; updatesDialog.showModal(); renderPractice(); renderUpdates(); void updates.refresh(); };
updatesDialog.onclose = () => renderPractice();
el('updates-close').onclick = () => updatesDialog.close();
el('updates-check').onclick = () => { if (!updateConfirmDialog.open && current?.platform === 'macos') void updates.check(); };
el('updates-install').onclick = () => {
  if (!canInstallUpdate() || updates.view.phase !== 'available') return;
  confirmedUpdate = updates.view.available_version;
  el('update-confirm-detail').textContent = `Install ${confirmedUpdate}?`;
  updateConfirmDialog.showModal(); renderPractice(); renderUpdates();
};
el('update-keep').onclick = () => updateConfirmDialog.close();
updateConfirmDialog.onclose = () => { confirmedUpdate = undefined; renderPractice(); renderUpdates(); };
el('update-confirm').onclick = () => {
  const version = confirmedUpdate;
  if (!version || !canInstallUpdate() || version !== updates.view.available_version) return;
  updateConfirmDialog.close(); confirmedUpdate = undefined;
  void updates.install(version);
};
el('mic').onclick = () => void action('request_microphone');
el('permissions').onclick = () => { if (current && current.platform !== 'windows') void action('request_permissions'); };
const recorder = button('change-shortcut');
const recordedKeys = new ShortcutRecorder();
let captureGeneration = 0;
function shortcutFeedback(message: string) {
  el('shortcut-feedback').hidden = !message; el('shortcut-feedback').textContent = message;
}
function renderShortcut() {
  recorder.setAttribute('aria-pressed', String(capturing));
  recorder.disabled = modePending || shortcutPending || captureStopping || !canEditShortcut();
  renderMode();
  if (!shortcutPending) el('saved-shortcut').textContent = capturing ? 'Press shortcut…' : current ? displayShortcut(current) : '…';
  el('stop-shortcut').hidden = !capturing;
  button('stop-shortcut').disabled = shortcutPending;
  const fallback = defaultShortcut(current?.platform);
  el('shortcut-fn').hidden = capturing || !current || (current.shortcut.code === fallback.code && current.shortcut.modifiers === fallback.modifiers);
  el('shortcut-fn').textContent = current?.platform === 'windows' ? 'Use default' : 'Use Fn';
  button('shortcut-fn').disabled = modePending || shortcutPending || captureStopping || !canEditShortcut();
}
function renderMode() {
  const select = el('recording-mode') as HTMLSelectElement;
  select.disabled = modePending || capturing || captureStopping || shortcutPending || !canEditShortcut();
  if (!modePending) select.value = current?.recording_mode ?? 'toggle';
  el('compatibility-row').hidden = current?.platform !== 'macos';
  const compatibility = el('compatibility-paste') as HTMLInputElement;
  compatibility.disabled = select.disabled;
  if (!modePending) compatibility.checked = current?.compatibility_paste ?? false;
  const hold = current?.recording_mode === 'push_to_talk';
  el('recording-mode-help').hidden = !hold;
  el('recording-action').textContent = hold ? 'Hold' : 'Press';
  el('recording-instruction').textContent = hold ? 'to dictate · Release to finish' : 'to dictate in any app';
}
el('recording-mode').onchange = async () => {
  if (modePending || capturing || captureStopping || shortcutPending || !canEditShortcut()) { renderMode(); return; }
  const select = el('recording-mode') as HTMLSelectElement;
  const mode = select.value;
  modePending = true; renderShortcut();
  await action('set_recording_mode', { mode });
  modePending = false; renderShortcut();
};
el('compatibility-paste').onchange = async () => {
  if (current?.platform !== 'macos' || modePending || capturing || captureStopping || shortcutPending || !canEditShortcut()) { renderMode(); return; }
  const enabled = (el('compatibility-paste') as HTMLInputElement).checked;
  modePending = true; renderShortcut();
  await action('set_compatibility_paste', { enabled });
  modePending = false; renderShortcut();
};
async function stopCapture() {
  if (!capturing || captureStopping) return;
  const restoreFocus = document.activeElement === recorder;
  capturing = false; captureGeneration++; recordedKeys.reset(); captureStopping = true; clearTimeout(captureTimer); renderShortcut();
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
el('shortcut-fn').onclick = () => { if (current) void saveShortcut(defaultShortcut(current.platform)); };
el('stop-shortcut').onclick = () => void stopCapture();
recorder.onclick = async e => {
  if (!canEditShortcut() || modePending || shortcutPending || capturing || captureStopping) return;
  capturing = true; captureGeneration++; recordedKeys.reset(); activationHeld = e.detail === 0; shortcutFeedback(''); renderShortcut(); recorder.focus();
  const generation = captureGeneration;
  try {
    captureStart = invoke('capture_shortcut', {active: true});
    await captureStart;
    if (!capturing || generation !== captureGeneration) return;
    if (!canEditShortcut()) { await stopCapture(); return; }
    captureTimer = setTimeout(() => {
      if (!capturing || generation !== captureGeneration) return;
      void stopCapture(); shortcutFeedback('Shortcut recording timed out.');
    }, 15000);
  } catch (e) {
    if (generation !== captureGeneration) return;
    capturing = false; captureGeneration++; recordedKeys.reset(); renderShortcut(); shortcutFeedback(String(e));
  }
};
recorder.onkeydown = e => {
  if (!capturing || shortcutPending) return;
  if (e.code === 'Tab') { void stopCapture(); return; }
  e.preventDefault(); e.stopPropagation();
  if (e.code === 'Escape') { void stopCapture(); return; }
  if (activationHeld && (e.code === 'Enter' || (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey))) return;
  if (captureStart && captureStopping) return;
   try { queueRecordedShortcut(recordedKeys.key(e, true, current?.platform)); }
  catch (error) { shortcutFeedback(String(error)); }
};
function queueRecordedShortcut(shortcut: Shortcut | undefined) {
  if (!shortcut) return;
  const generation = captureGeneration;
  void captureStart?.then(() => { if (capturing && generation === captureGeneration && !captureStopping) void saveShortcut(shortcut); }).catch(error => shortcutFeedback(String(error)));
}
recorder.onkeyup = e => {
  activationHeld = false;
  if (!capturing || shortcutPending || captureStopping) return;
  e.preventDefault(); e.stopPropagation();
  queueRecordedShortcut(recordedKeys.key(e, false, current?.platform));
};
window.addEventListener('pointerdown', () => recordedKeys.interrupt());
window.addEventListener('wheel', () => recordedKeys.interrupt(), { passive: true });
window.addEventListener('pagehide', () => { recordedKeys.reset(); if (capturing) void stopCapture(); });
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
     const windows = current.platform === 'windows';
      el('updates-open').hidden = current.platform !== 'macos';
      el('brand-updates').hidden = current.platform !== 'macos';
     if (updatesDialog.open) { renderUpdates(); void updates.refresh(); void updates.progress(); }
     button('setup').disabled = false;
    button('reset').disabled = false;
    if (!soundsPending) sounds.disabled = false;
    if (!volumePending) volume.disabled = false;
    if (!limitPending) { recordingLimit.disabled = false; recordingLimit.value = String(current.recording_limit ?? 120); }
    const requests = (current as Status & { permission_requests?: number }).permission_requests ?? 0;
    if (requests !== seenPermissionRequests) { seenPermissionRequests = requests; navigate('settings'); }
    el('phase').textContent = current.phase === 'idle' && !readiness(current) ? 'Setup needed' : phaseLabel(current.phase);
    // Keep diagnostics outside the compact header; never render dictation payloads.
    const idleHint = `Select a text field and press ${current.shortcut_label}.`;
    const message = current.message.startsWith('Copied.') ? 'Text copied. Switch to your app and paste when you’re ready.' : current.message.startsWith('Paste shortcut sent') ? 'Paste sent to your app. Check the original field.' : current.message;
    el('message').textContent = current.phase === 'idle' && current.message === idleHint ? '' : message;
    el('message').title = current.message;
    el('message').hidden = !el('message').textContent;
    el('dot').className = current.phase;
    button('mic').disabled = current.microphone;
     el('mic').textContent = windows ? 'Open settings' : current.microphone ? 'Allowed' : 'Allow';
     el('mic-state').textContent = windows ? 'Connect a microphone and enable microphone access.' : 'Allow access to record your voice.';
     el('privacy-detail').textContent = windows ? 'Audio and transcription stay on this device.' : 'Audio and transcription stay on this Mac.';
    el('permission-state').textContent = !current.accessibility ? 'Allow Accessibility for automatic paste.' : 'Allow Input Monitoring for the shortcut.';
    el('mic-row').hidden = current.microphone;
     el('permissions-row').hidden = windows || (current.accessibility && current.input_monitoring);
     el('hotkey-row').hidden = current.hotkey;
     el('hotkey-title').textContent = windows ? 'Shortcut unavailable' : 'Shortcut disconnected';
     el('hotkey-detail').textContent = windows ? 'Choose another shortcut above. Another app may already use it.' : 'Quit and reopen HandsFree to reconnect.';
    el('model-ready').hidden = !current.model_ready;
     button('permissions').disabled = windows || (current.accessibility && current.input_monitoring);
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
     el('overview-shortcut').textContent = displayShortcut(current);
    if (capturing && !canEditShortcut() && !shortcutPending) void stopCapture();
     renderShortcut();
    renderPractice();
    void practice.poll();
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
document.addEventListener('visibilitychange', () => { if (document.hidden) { syncPracticeContext(); clearPractice(); if (capturing) void stopCapture(); } else void refresh(); });
