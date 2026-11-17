import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import './style.css';
import './typography.css';
import { defaultShortcut, ShortcutRecorder, shortcutLabel, type Shortcut } from './shortcut';
import { phaseLabel, canCancel, formatTime, readiness, readinessDetail } from './presentation';
import { Practice } from './practice';
import { setupChecklist, shortcutTutorial } from './onboarding.ts';
import { PracticeInputs, type PracticeInput } from './practice-input.ts';
import { Workflow } from './workflow.ts';
import { AppearancePreference, appearanceValue, type Appearance } from './appearance.ts';
import { Updates, updateBusy, updateIndicator } from './updates';
import { phasePolicy, updateInstalling, type DictationPhase } from './state.ts';

type Status = { appearance?: Appearance; microphone_uid?: string | null; platform?: 'windows' | 'macos'; compatibility_paste?: boolean; phase: DictationPhase; message: string; progress: number; model_ready: boolean; microphone: boolean; accessibility: boolean; input_monitoring: boolean; hotkey: boolean; transcript: string; sounds: boolean; sound_volume: number; sound_style: 'clean' | 'warm'; recording_limit: number; recording_mode?: 'toggle' | 'push_to_talk'; shortcut: Shortcut; shortcut_label: string; stats: { transcriptions: number; words: number; speech_seconds: number; saved_seconds: number }; persistence_error: string };
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
  play:'<path d="m9 5 10 7-10 7Z"/>', pause:'<path d="M8 5v14M16 5v14"/>', plus:'<path d="M12 5v14M5 12h14"/>', chevron:'<path d="m8 10 4 4 4-4"/>'
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${glyphs[name]}</svg>`;
document.querySelector('#app')!.innerHTML = `
<div class="shell">
 <aside><button class="brand" aria-label="HandsFree menu" aria-haspopup="menu" aria-expanded="false" aria-controls="brand-menu"><img src="${logo}" alt="" width="36" height="36"><span>HandsFree</span>${icon('chevron')}</button>
   <div id="brand-menu" class="brand-menu" role="menu" aria-label="HandsFree" hidden><button id="brand-overview" role="menuitem">Overview</button><button id="brand-started" role="menuitem" hidden>Get started</button><button id="brand-settings" role="menuitem">Settings</button><button id="brand-pause" role="menuitem" disabled hidden>Pause shortcuts</button><button id="brand-updates" role="menuitem">App updates…</button></div>
   <div class="header-right"><nav aria-label="Main navigation"><button id="nav-overview" class="nav active" aria-label="Overview" title="Overview" aria-current="page">${icon('words')}<span>Overview</span></button><button id="nav-practice-page" class="nav" aria-label="Practice" title="Practice">${icon('mic')}<span>Practice</span></button><button id="nav-settings" class="nav" aria-label="Settings" title="Settings">${icon('settings')}<span>Settings</span></button></nav></div></aside>
 <header class="product-header"><section class="status" aria-label="App status"><button id="product-status" aria-haspopup="dialog" aria-controls="health-dialog" title="View product status and resolve problems"><span id="dot" aria-hidden="true"></span><strong id="phase" aria-live="polite">Connecting…</strong>${icon('chevron')}</button><button id="cancel" hidden aria-label="Cancel dictation" title="Cancel dictation">×</button></section></header>
 <main>
 <section id="overview" aria-labelledby="overview-title">
     <div class="page-heading"><h1 id="overview-title">Overview</h1><p>Voice typing, without the busywork.</p></div>
     <div class="hero"><div class="hero-mark">${icon('wave')}</div><h2>Write wherever you work.</h2><p>Select a text field in another app.</p><p class="shortcut-instruction"><span id="recording-action">Press</span> <kbd id="overview-shortcut">…</kbd> <span id="recording-instruction">to dictate in any app</span></p><div class="hero-caption">${icon('shield')}Processed on this device. Never sent to a cloud.</div></div>
    <section class="card readiness"><div><h2 id="ready-title">Finish setting up</h2><p id="ready-detail">Connecting to HandsFree…</p></div><button id="setup" class="primary" disabled>Open settings</button></section>
   <section id="overview-model" class="card readiness" hidden aria-label="English model"><div><h2>English model</h2><p id="overview-model-state">One-time download · Works offline afterward</p></div><button id="overview-download" class="primary" disabled>Download English model (~148 MB)</button></section>
    <section class="activity" aria-labelledby="activity-title"><div class="section-heading"><h2 id="activity-title">All-time activity</h2><span class="subtle">Private tests excluded</span></div><div class="metrics" aria-label="Real dictation only; practice tests excluded"><article><span>Words</span><strong id="words">0</strong></article><article><span tabindex="0" title="Estimate per dictation: typing at 40 words/minute, minus recording time, never below zero. Not a productivity measurement.">Time saved<small>Estimated</small></span><strong id="saved">0 sec</strong></article><article><span>Dictations</span><strong id="count">0</strong></article></div></section>
    <button id="overview-practice" class="practice-link"><span>${icon('mic')}<span><strong>Find your rhythm</strong><small>Try your microphone and shortcut in a private space.</small></span></span><span aria-hidden="true">→</span></button>
  </section>
  <section id="practice-page" hidden aria-labelledby="practice-page-title">
     <div class="page-heading"><h1 id="practice-page-title">Practice</h1></div>
     <section id="get-started" class="card" aria-labelledby="get-started-title" hidden>
      <div class="card-heading"><div><h2 id="get-started-title" tabindex="-1">Get started</h2><p>Checks never request access or start recording.</p></div><button id="started-close" class="text-action">Done</button></div>
     <ol class="setup-checklist">
      <li><span id="check-microphone">Microphone · Checking…</span><button id="started-mic">Allow microphone</button></li>
      <li><span id="check-permissions">Accessibility &amp; Input Monitoring · Checking…</span><button id="started-permissions">Open permission settings</button></li>
      <li><span id="check-shortcut">Shortcut connection · Checking…</span><span id="started-hook-help" class="subtle">After granting access, quit and reopen HandsFree if the shortcut stays disconnected.</span></li>
      <li><span id="check-model">English model · Checking…</span><button id="started-model">Download (~148 MB)</button></li>
     </ol>
      <p class="subtle">When ready, open Practice to test your microphone and shortcut. The model works offline after download.</p>
    </section>
    <section id="practice" class="card practice" aria-labelledby="practice-title" hidden>
      <h2 id="practice-title" class="sr-only">Try your voice</h2>
      <p id="shortcut-tutorial"><span id="practice-gesture">Press</span> <kbd id="practice-shortcut">…</kbd><span id="practice-instruction"> to start / finish.</span></p><p id="shortcut-evidence" class="subtle" role="status">Shortcut not tested yet.</p>
      <div class="practice-meter"><label for="input-level">Microphone</label><meter id="input-level" class="sr-only" min="0" max="1" value="0" aria-describedby="input-level-help"></meter><div id="practice-waveform" class="input-waveform" aria-hidden="true">${Array.from({length:9},()=>'<span></span>').join('')}</div><span id="practice-timer" aria-label="Recording time">— / —</span><span id="input-level-help" class="sr-only">Start a private test to check input. No audio file is saved.</span></div>
    <label for="practice-text" class="sr-only">Practice dictation</label>
    <textarea id="practice-text" rows="4" autocomplete="off" spellcheck="false" aria-describedby="practice-privacy" placeholder="Speak freely. This space is just for you."></textarea>
     <div class="practice-bottom"><div class="practice-actions"><button id="practice-start" class="primary" disabled>${icon('mic')}<span>Start test</span></button><button id="practice-finish" class="primary" disabled hidden>${icon('check')}<span>Finish</span></button><button id="practice-cancel" class="icon-action" aria-label="Cancel practice" title="Cancel practice" disabled hidden>${icon('close')}</button><button id="practice-clear" class="icon-action" aria-label="Clear practice" title="Clear practice">${icon('clear')}</button></div></div>
     <p id="practice-privacy" class="sr-only">No clipboard or usage counted. Clears when you leave.</p>
    <div class="practice-status-slot"><p id="practice-message" role="status" aria-label="Practice status" aria-live="polite"></p><button id="practice-recovery" class="text-action" hidden>View problem</button></div>
   </section>
    <p id="practice-platform-help" class="subtle" hidden>Private practice is available on macOS. Use Overview for your configured dictation shortcut.</p>
 </section>
 <section id="settings" hidden aria-labelledby="settings-title">
     <div class="settings-intro page-heading"><h1 id="settings-title">Settings</h1><p>Make HandsFree work for you.</p><button id="settings-started" class="text-action" hidden>Setup guide</button></div>
    <section id="workflow" class="card" aria-labelledby="workflow-title" hidden><h2 id="workflow-title">General</h2>
     <div class="setting-row"><div><h3>Keyboard shortcuts</h3><p id="workflow-pause-state">Checking…</p><p>Pause shortcuts without interrupting a recording. Private tests stay available.</p></div><button id="workflow-pause" class="icon-action" aria-label="Pause shortcuts" title="Pause shortcuts" disabled>${icon('pause')}</button></div>
    <div class="setting-row"><div><h3>Launch at login</h3><p id="login-state" role="status">Checking…</p><button id="login-settings" class="text-action" hidden>Open Login Items</button><button id="login-cancel" class="text-action" hidden>Cancel pending registration</button></div><label class="switch"><input id="launch-at-login" type="checkbox" role="switch" aria-label="Launch at login" aria-describedby="login-state" disabled><span aria-hidden="true"></span></label></div>
    <div class="setting-row"><div><h3><label for="excluded-app-choice">Excluded apps</label></h3><p>Prevent external dictation starts in these apps. Existing recordings are unaffected.</p></div></div>
    <div class="workflow-app-controls"><select id="excluded-app-choice" aria-label="Running app to exclude" disabled><option value="">Choose a running app</option></select><button id="excluded-app-add" class="icon-action" aria-label="Add excluded app" title="Add excluded app" disabled>${icon('plus')}</button><button id="excluded-app-refresh" class="icon-action" aria-label="Refresh running apps" title="Refresh running apps" disabled>${icon('update')}</button></div>
    <ul id="excluded-apps" aria-label="Excluded apps"></ul><p id="workflow-error" class="feedback" role="status" hidden></p>
   </section>
   <section class="card preferences" aria-labelledby="preferences-title"><h2 id="preferences-title">Dictation</h2>
     <div class="setting-row"><div><h3><label for="recording-limit">Recording limit</label></h3><p>Maximum length of each recording.</p></div><select id="recording-limit" title="Applies to the next recording"><option value="120">2 minutes</option><option value="180">3 minutes</option><option value="240">4 minutes</option><option value="300">5 minutes</option></select></div>
    <div id="microphone-choice-row" class="setting-row" hidden><div><h3><label for="microphone-choice">Microphone</label></h3><p id="microphone-choice-help">Applies to the next recording. Unavailable selections never fall back silently.</p></div><div class="microphone-controls"><select id="microphone-choice" aria-describedby="microphone-choice-help" disabled><option value="">System default</option></select><button id="microphone-refresh" class="icon-action" aria-label="Refresh microphones" title="Refresh microphones" disabled>${icon('update')}</button></div></div>
    <div class="setting-row"><div><h3><label for="recording-mode">Recording mode</label></h3><p id="recording-mode-help" hidden>Hold the shortcut; release to finish. Other keys or focus changes cancel.</p></div><select id="recording-mode" aria-describedby="recording-mode-help"><option value="toggle">Toggle</option><option value="push_to_talk">Push to talk</option></select></div>
    <div id="compatibility-row" class="setting-row" hidden><div><h3>Compatibility paste</h3><p id="compatibility-help">For apps that hide their text field. Pastes once into the same active app/window; the exact field cannot be verified.</p></div><label class="switch"><input id="compatibility-paste" type="checkbox" role="switch" aria-label="Compatibility paste" aria-describedby="compatibility-help"><span aria-hidden="true"></span></label></div>
     <div class="setting-row shortcut-row"><div><h3>Shortcut</h3></div><div class="shortcut-value"><button id="change-shortcut" aria-label="Record shortcut" title="Record shortcut" aria-pressed="false" aria-describedby="shortcut-feedback"><span id="saved-shortcut">…</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/></svg></button><button id="stop-shortcut" hidden>Cancel</button><button id="shortcut-fn" class="text-action" hidden>Use default</button></div><p id="shortcut-feedback" role="status" hidden></p></div>
   </section>
   <section class="card preferences" aria-labelledby="experience-title"><h2 id="experience-title">Appearance &amp; sound</h2>
     <div class="setting-row"><div><h3><label for="appearance-choice">Appearance</label></h3><p>Light, dark, or follow your system.</p></div><select id="appearance-choice" disabled><option value="light">Light</option><option value="dark">Dark</option><option value="system" selected>System</option></select></div>
     <div class="setting-row listening-row"><div><h3>Completion sound</h3></div><select id="sound-style" aria-label="Sound"><option value="clean">Clean</option><option value="warm">Warm</option></select><span id="sound-state" class="state">Off</span><label class="switch"><input id="sounds" type="checkbox" role="switch" aria-label="Completion sound"><span aria-hidden="true"></span></label></div>
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
     <section class="local-data" aria-labelledby="data-title"><div class="setting-row"><div><h2 id="data-title">Usage totals</h2><p id="privacy-detail" class="subtle">Private tests are never counted.</p></div><button id="reset" class="icon-action danger" aria-label="Reset usage totals" title="Reset usage totals" aria-haspopup="dialog">${icon('clear')}</button></div></section>
 </section>
  <div class="general-status-slot"><p id="message" class="status-detail" role="status" aria-label="Dictation status" aria-live="polite" hidden></p><button id="message-recovery" class="text-action" hidden>View problem</button></div>
 <p id="feedback" class="feedback" role="status" hidden></p><p id="storage-error" class="feedback" role="status" hidden></p>
  </main>
   <footer><span class="footer-privacy">${icon('shield')}On-device · English</span><div class="footer-meta"><span class="footer-brand"><span class="sr-only">HandsFree</span><span id="app-version">0.1.1</span><span class="beta-badge">BETA</span></span><button id="updates-open" class="text-action" aria-describedby="updates-feedback" hidden>${icon('update')}<span class="update-summary"><strong id="updates-indicator-label">Updates</strong><span id="updates-indicator-detail">Not checked</span></span><span id="updates-announcement" class="sr-only" role="status" aria-live="polite"></span></button></div><p id="updates-feedback" role="status" aria-live="polite" hidden></p></footer>
</div>
 <dialog id="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">Reset usage totals?</h2><p>Totals will return to zero. Your preferences and language model won’t change.</p><div class="dialog-actions"><button id="keep-stats" autofocus>Keep totals</button><button id="confirm-reset" class="danger">Reset totals</button></div></dialog>
 <dialog id="health-dialog" aria-labelledby="health-title" aria-describedby="health-summary">
  <div class="health-heading"><h2 id="health-title" tabindex="-1" autofocus>Product status</h2><div class="health-tools"><button id="health-refresh" class="icon-action" aria-label="Refresh status" title="Refresh status">${icon('update')}</button><button id="health-close" class="icon-action" aria-label="Close product status" title="Close product status">${icon('close')}</button></div></div><p id="health-summary" role="status" aria-live="polite">Connecting to HandsFree…</p>
  <ul class="health-checks" aria-label="Dictation requirements">
   <li><div><strong>Microphone access</strong><span id="health-mic-state">Checking…</span></div><button id="health-mic" hidden>Allow microphone</button></li>
   <li id="health-permissions-row"><div><strong>Shortcuts &amp; paste access</strong><span id="health-permissions-state">Checking…</span></div><button id="health-permissions" hidden>Open macOS permissions</button></li>
   <li><div><strong>Shortcut connection</strong><span id="health-hook-state">Checking…</span></div></li>
   <li><div><strong>English model</strong><span id="health-model-state">Checking…</span></div><button id="health-model" hidden>Download model</button></li>
   <li id="health-input" hidden><div><strong><label for="health-microphone">Microphone</label></strong><span id="health-input-help" class="sr-only">Applies to the next recording. An unavailable saved device never switches silently.</span></div><div class="health-input-controls"><select id="health-microphone" aria-describedby="health-input-help" disabled></select><button id="health-microphone-refresh" class="icon-action" aria-label="Refresh microphones" title="Refresh microphones" disabled>${icon('update')}</button></div></li>
  </ul>
  <p id="health-error" class="feedback" role="status" hidden></p><p class="sr-only">These checks don’t record audio. Permission checks are not proof that microphone capture works.</p>
  <div class="dialog-actions"><button id="health-practice" class="primary" hidden>${icon('mic')}<span>Private test</span></button></div>
 </dialog>`;
const el = (id: string) => document.getElementById(id)!;
const button = (id: string) => el(id) as HTMLButtonElement;
// Setup is a Settings destination, never extra content above the private editor.
el('settings').insertBefore(el('get-started'), el('workflow'));
// Avoid presenting native actions as ready before the first backend response.
for (const id of ['started-mic', 'started-permissions', 'started-model', 'change-shortcut', 'mic', 'permissions', 'download', 'reset', 'sounds', 'sound-style', 'sound-volume', 'recording-limit', 'recording-mode']) {
  (el(id) as HTMLInputElement | HTMLButtonElement).disabled = true;
}
type AudioStatus = Status & { audio_ready?: boolean };
let current: AudioStatus | undefined;
let connectionError = '';
const displayShortcut = (status: Status) => status.platform === 'windows' ? shortcutLabel(status.shortcut, 'windows') : status.shortcut_label;
let refreshTask: Promise<void> | undefined;
let soundsPending = false;
let stylePending = false;
let volumePending = false;
let limitPending = false;
let modePending = false;
let microphonePending = false;
let microphonesLoading = false;
let microphonesLoaded = false;
let microphoneDevices: {uid: string; name: string}[] = [];
let defaultMicrophone: string | null = null;
let microphoneOptions = '';
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
let guidePermissionRequests = 0;
let gettingStartedInitialized = false;
let focusIntent = 0;
document.addEventListener('pointerdown', () => ++focusIntent, true);
document.addEventListener('keydown', () => ++focusIntent, true);
document.addEventListener('focusin', e => { if (e.target !== document.body) ++focusIntent; }, true);
// A disabled/replaced initiating control may leave focus on body. Restore only
// for this action, in this view, with no intervening focus or user intent.
async function workflowFocus(source: HTMLElement, effect: () => Promise<void>, target: () => HTMLElement | undefined) {
  const owned = document.activeElement === source && !el('settings').hidden;
  const intent = focusIntent;
  await effect();
  if (!owned || intent !== focusIntent || el('settings').hidden || !document.hasFocus()) return;
  if (document.activeElement !== source && document.activeElement !== document.body) return;
  const next = target();
  if (next && next.getClientRects().length && !next.matches(':disabled')) next.focus({preventScroll:true});
}
function statusText(id: string, text: string) {
  const node = el(id);
  if (node.textContent !== text) node.textContent = text;
  if (text) node.tabIndex = 0; else node.removeAttribute('tabindex');
}
type Page = 'overview' | 'practice-page' | 'settings';
function focusHeading(tab: Page) {
  const heading = el(`${tab}-title`); heading.tabIndex = -1; heading.focus({preventScroll:true});
}
function navigate(tab: Page) {
  ++focusIntent;
  updates.cancelPreparation();
  if (tab !== 'practice-page') clearPractice();
  if (capturing && tab !== 'settings') void stopCapture();
  for (const name of ['overview', 'practice-page', 'settings']) {
    el(name).hidden = name !== tab;
    el(`nav-${name}`).classList.toggle('active', name === tab);
    if (name === tab) el(`nav-${name}`).setAttribute('aria-current', 'page');
    else el(`nav-${name}`).removeAttribute('aria-current');
  }
  document.querySelector('main')!.scrollTop = 0;
  window.scrollTo(0, 0);
  renderPractice();
  if (tab === 'settings' && current?.platform === 'macos') { void workflow.refresh(); void workflow.runningApps(); void refreshMicrophones(); }
}
function feedback(message: string) {
  el('feedback').hidden = !message; statusText('feedback', message);
  el('health-error').hidden = !message; el('health-error').textContent = message;
  el('feedback').setAttribute('aria-label','Action feedback');
  button('message-recovery').hidden = !message && current?.phase !== 'error' && current?.phase !== 'not_pasted';
}
async function action(command: string, args?: Record<string, unknown>): Promise<boolean> {
  try { await invoke(command, args); feedback(''); await refresh(); return true; }
  catch (e) { feedback(String(e)); return false; }
}
el('nav-overview').onclick = () => navigate('overview');
el('nav-practice-page').onclick = () => navigate('practice-page');
el('overview-practice').onclick = () => { navigate('practice-page'); focusHeading('practice-page'); };
el('nav-settings').onclick = () => navigate('settings');
const healthDialog = el('health-dialog') as HTMLDialogElement;
function renderHealth() {
  const s = current;
  const mac = s?.platform === 'macos';
  statusText('health-summary', !s ? connectionError ? 'Couldn’t connect to HandsFree. Refresh status to try again.' : 'Connecting to HandsFree…'
    : s.phase === 'error' || s.phase === 'not_pasted' ? el('message').textContent || 'The last dictation failed. Review the checks below, then try a private test.'
    : s.phase === 'recording' ? s.audio_ready === false ? 'Preparing the microphone and audio cues…' : 'Dictation is listening. Close this panel to continue.'
    : s.phase === 'processing' ? 'Finishing the current dictation. Wait before testing again.'
    : s.phase === 'downloading' ? `Downloading the English model… ${Math.round(s.progress)}%.`
    : readiness(s) ? 'Permissions, shortcut and model are ready. Use a private test to check actual capture.' : readinessDetail(s));
  el('health-mic-state').textContent = !s ? 'Unknown' : s.microphone ? 'Allowed' : 'Access needed';
  el('health-permissions-row').hidden = !mac;
  el('health-permissions-state').textContent = !s ? 'Unknown' : s.accessibility && s.input_monitoring ? 'Allowed' : [!s.accessibility && 'Accessibility needed', !s.input_monitoring && 'Input Monitoring needed'].filter(Boolean).join(' · ');
  el('health-hook-state').textContent = !s ? 'Unknown' : s.hotkey ? 'Connected' : mac ? 'Disconnected. Quit and reopen HandsFree after granting access.' : 'Unavailable. Choose another shortcut in Settings.';
  el('health-model-state').textContent = !s ? 'Unknown' : s.model_ready ? 'Ready offline' : s.phase === 'downloading' ? `Downloading… ${Math.round(s.progress)}%` : 'Download needed · ~148 MB';
  button('health-mic').hidden = !s || s.microphone;
  button('health-mic').disabled = !s || installingUpdate() || !phasePolicy(s.phase).editConfiguration;
  button('health-permissions').hidden = !mac || Boolean(s?.accessibility && s.input_monitoring);
  button('health-permissions').disabled = button('health-mic').disabled;
  button('health-model').hidden = !s || s.model_ready;
  button('health-model').disabled = !s || installingUpdate() || button('download').disabled;
  button('health-practice').hidden = !mac;
  button('health-practice').disabled = !s || !readiness(s) || !phasePolicy(s.phase).previewSound || installingUpdate();
  el('health-input').hidden = !mac;
}
button('product-status').onclick = () => {
  closeBrandMenu(); renderHealth(); healthDialog.showModal(); renderPractice();
  void refresh(); void refreshMicrophones();
};
button('health-close').onclick = () => healthDialog.close();
healthDialog.addEventListener('close', () => {
  renderPractice();
  if (document.activeElement === document.body || healthDialog.contains(document.activeElement)) button('product-status').focus({preventScroll:true});
});
button('health-refresh').onclick = async () => {
  button('health-refresh').disabled = true;
  await refresh(); renderHealth(); button('health-refresh').disabled = false;
};
button('health-mic').onclick = () => { if (!button('health-mic').disabled) void action('request_microphone'); };
button('health-permissions').onclick = () => { if (!button('health-permissions').disabled && current?.platform === 'macos') void action('request_permissions'); };
button('health-model').onclick = () => { if (!button('health-model').disabled) button('download').click(); };
button('health-practice').onclick = () => {
  if (button('health-practice').disabled) return;
  healthDialog.close(); navigate('practice-page'); focusHeading('practice-page');
};
const brand = document.querySelector('.brand') as HTMLButtonElement;
function closeBrandMenu(restore = false) {
  el('brand-menu').hidden = true; brand.setAttribute('aria-expanded','false');
  if (restore) brand.focus();
  renderPractice();
}
function openBrandMenu() {
  void workflow.refresh();
  el('brand-menu').hidden = false; brand.setAttribute('aria-expanded','true'); renderPractice();
  menuItems()[0]?.focus();
}
const menuItems = () => Array.from(el('brand-menu').querySelectorAll<HTMLButtonElement>('button:not([hidden]):not(:disabled)')).filter(item => item.getClientRects().length);
brand.addEventListener('click', e => { e.preventDefault(); if(el('brand-menu').hidden) openBrandMenu(); else closeBrandMenu(); });
brand.onkeydown = e => { if(e.key==='ArrowDown'){e.preventDefault();openBrandMenu();button('brand-overview').focus();} };
el('brand-menu').onkeydown = e => {
  if(e.key==='Escape'){e.preventDefault();closeBrandMenu(true);return;}
  if(e.key==='Tab') {
    // Menu items are a composite, not a separate tab sequence. Continue from
    // the trigger to the outside control (or back from it for Shift+Tab).
    closeBrandMenu(true); return;
  }
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
    e.preventDefault(); const items=menuItems();
    const index=items.indexOf(document.activeElement as HTMLButtonElement);
    items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
  }
};
el('brand-menu').addEventListener('focusout', e => {
  if (!(e.relatedTarget instanceof Node) || (!el('brand-menu').contains(e.relatedTarget) && e.relatedTarget !== brand)) closeBrandMenu();
});
brand.addEventListener('focusout', e => { if (!(e.relatedTarget instanceof Node) || !el('brand-menu').contains(e.relatedTarget)) closeBrandMenu(); });
document.addEventListener('pointerdown', e => { if(!brand.contains(e.target as Node)&&!el('brand-menu').contains(e.target as Node)) closeBrandMenu(); });
el('brand-overview').onclick=()=>{closeBrandMenu();navigate('overview');focusHeading('overview');};
el('brand-settings').onclick=()=>{closeBrandMenu();navigate('settings');focusHeading('settings');};
function openGettingStarted() {
  if (current?.platform !== 'macos') return;
  closeBrandMenu(); navigate('settings'); el('get-started').hidden = false; renderGettingStarted();
  el('get-started-title').focus(); el('get-started').scrollIntoView({block:'nearest'});
}
el('brand-started').onclick = openGettingStarted;
el('settings-started').onclick = openGettingStarted;
el('started-close').onclick = () => { el('get-started').hidden = true; focusHeading('settings'); };
el('started-mic').onclick = () => { if (!button('mic').disabled) { guidePermissionRequests |= 1; button('mic').click(); } };
el('started-permissions').onclick = () => { if (!button('permissions').disabled) { guidePermissionRequests |= 2; button('permissions').click(); } };
el('started-model').onclick = () => button('download').click();
function renderGettingStarted() {
  const checks = setupChecklist(current);
  const labels = {microphone:'Microphone', permissions:'Accessibility & Input Monitoring', shortcut:'Shortcut connection', model:'English model'};
  for (const key of Object.keys(checks) as (keyof typeof checks)[]) el(`check-${key}`).textContent = `${labels[key]} · ${checks[key] ? 'Ready' : current?.platform === 'macos' ? 'Needs attention' : 'Checking…'}`;
  button('started-mic').disabled = !current || current.platform !== 'macos' || button('mic').disabled;
  button('started-permissions').disabled = !current || current.platform !== 'macos' || button('permissions').disabled;
  button('started-model').disabled = !current || current.platform !== 'macos' || button('download').disabled;
  el('started-model').textContent = current?.phase === 'downloading' ? `Downloading… ${Math.round(current.progress)}%` : checks.model ? 'Ready offline' : 'Download (~148 MB)';
  el('started-hook-help').hidden = checks.shortcut;
}
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
const practiceVisible = () => windowActive && !el('practice-page').hidden && !document.hidden && document.hasFocus() && !document.querySelector('dialog[open]') && el('brand-menu').hidden;
let practiceContext = 0;
let shortcutReceived = false;
let tutorialConfiguration = '';
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
  statusText('practice-message', view.message);
  renderPractice();
}, practiceVisible);
const practiceInputs = new PracticeInputs(practice, practiceVisible);
function clearPractice() { shortcutReceived = false; practiceInputs.reset(); void practice.clear(); }
function renderPractice() {
  statusText('practice-message', practice.view.message || 'No clipboard or usage counted. Clears when you leave.');
  if (!practice.view.message) el('practice-message').removeAttribute('tabindex');
  const focusedAction = document.activeElement;
  if (focusedAction instanceof HTMLButtonElement && focusedAction.closest('.practice-actions')) {
    // Retire a contextual control without browser focus/scroll recovery.
    const phase = practice.view.phase;
    if ((['practice-start','practice-clear'].includes(focusedAction.id) && ['starting','recording','processing','cancelling'].includes(phase)) || (focusedAction.id === 'practice-finish' && phase !== 'recording') || (focusedAction.id === 'practice-cancel' && !['starting','recording','processing'].includes(phase))) practiceField.focus({preventScroll:true});
  }
  el('practice').hidden = current?.platform !== 'macos';
  el('practice-platform-help').hidden = current?.platform !== 'windows';
  const tutorial = current ? shortcutTutorial(displayShortcut(current), current.recording_mode) : 'Waiting for your configured shortcut…';
  el('practice-gesture').textContent = current?.recording_mode === 'push_to_talk' ? 'Hold' : 'Press';
  el('practice-shortcut').textContent = current ? displayShortcut(current) : '…';
  el('practice-instruction').textContent = current?.recording_mode === 'push_to_talk' ? '; release to finish.' : ' to start / finish.';
  el('shortcut-tutorial').title = tutorial;
  el('shortcut-tutorial').setAttribute('aria-label', tutorial);
  el('shortcut-evidence').textContent = shortcutReceived ? 'Shortcut received.' : 'Shortcut not tested yet.';
  el('shortcut-evidence').title = shortcutReceived ? 'Confirms the key event, not microphone or transcription success.' : 'Start test checks the microphone, not the shortcut.';
  el('shortcut-evidence').setAttribute('aria-label', `${el('shortcut-evidence').textContent} ${el('shortcut-evidence').title}`);
  const level = practiceVisible() ? practice.view.inputLevel : null;
  const waveform = el('practice-waveform');
  waveform.dataset.active = String(level !== null);
  const weights = [0.25, 0.5, 0.8, 0.6, 1, 0.7, 0.9, 0.5, 0.3];
  for (const [index, bar] of Array.from(waveform.children).entries()) {
    (bar as HTMLElement).style.height = `${3 + 23 * (level ?? 0) * weights[index]}px`;
  }
  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`;
  el('practice-timer').textContent = practiceVisible() && practice.view.elapsedSeconds !== null && practice.view.limitSeconds !== null ? `${clock(practice.view.elapsedSeconds)} / ${clock(practice.view.limitSeconds)}` : '— / —';
  (el('input-level') as HTMLMeterElement).value = level ?? 0;
  el('input-level').setAttribute('aria-valuetext', level === null ? 'No current input reading' : `${Math.round(level * 100)} percent input level`);
  el('input-level-help').textContent = level !== null ? 'Live input level, not a speech or transcription score.' : practice.view.phase === 'recording' ? 'Waiting for an input reading…' : 'Start a private test to check input. No audio file is saved.';
  const active = ['starting', 'recording', 'processing'].includes(practice.view.phase);
  button('practice-start').disabled = !current || !readiness(current) || !canEditShortcut() || capturing || captureStopping || shortcutPending || modePending || downloadPending || !practiceVisible() || !['idle', 'error','complete','empty'].includes(practice.view.phase);
  button('practice-start').hidden = active || practice.view.phase==='cancelling';
  button('practice-start').querySelector('span')!.textContent = ['complete','empty'].includes(practice.view.phase) ? 'Record again' : 'Start test';
  button('practice-finish').disabled = practice.view.phase !== 'recording';
  button('practice-finish').hidden = practice.view.phase !== 'recording';
  button('practice-cancel').disabled = !active;
  button('practice-cancel').hidden = !active;
  button('practice-clear').hidden = active || practice.view.phase==='cancelling';
  if (practice.view.phase !== 'error' && document.activeElement === el('practice-recovery')) practiceField.focus({preventScroll:true});
  button('practice-recovery').hidden = practice.view.phase !== 'error';
  renderGettingStarted();
  syncPracticeContext();
  renderUpdates();
}
practiceField.oninput = () => practice.edit(practiceField.value);
el('practice-start').onclick = () => { if (!button('practice-start').disabled) void practiceInputs.start(); };
el('practice-finish').onclick = () => void practice.finish();
el('practice-cancel').onclick = clearPractice;
el('practice-clear').onclick = clearPractice;
el('practice-recovery').onclick = () => button('product-status').click();
el('message-recovery').onclick = () => button('product-status').click();
window.addEventListener('blur', () => { windowActive=false; syncPracticeContext(); clearPractice(); });
window.addEventListener('pagehide', () => { windowActive=false; syncPracticeContext(); clearPractice(); });
window.addEventListener('focus', () => { windowActive=true; renderPractice(); void refreshMicrophones(); });
// WebKit does not always dispatch pagehide when a native window is hidden.
void listen('practice-cleared', () => { practiceContext=0; clearPractice(); }).catch(() => { /* Browser-only preview has no native events. */ });
void listen<PracticeInput>('practice-input', ({payload}) => {
  if(payload.context!==practiceContext || !practiceVisible() || capturing || captureStopping || installingUpdate()) return;
  if ((payload.action === 'toggle' || payload.action === 'press') && Number.isSafeInteger(payload.receipt) && payload.receipt > 0) { shortcutReceived = true; renderPractice(); }
  void practiceInputs.receive(payload);
}).catch(()=>{});
void listen<string>('dashboard-navigate', ({payload}) => {
  closeBrandMenu();
   if(payload==='updates') { if (current?.platform === 'macos') void updates.check(); }
   else if(payload==='get-started') openGettingStarted();
    else { navigate(payload==='settings'?'settings':payload==='practice'?'practice-page':'overview'); if(payload==='practice') practiceField.focus(); }
}).catch(()=>{});
const canInstallUpdate = () => current?.platform === 'macos'
  && phasePolicy(current.phase).installUpdate
  && practice.view.phase === 'idle' && !capturing && !captureStopping && !shortcutPending && !downloadPending && !modePending;
const updates = new Updates(invoke, () => { renderUpdates(); renderPractice(); renderShortcut(); renderWorkflow(); }, canInstallUpdate);
const workflowAllowed = () => current?.platform === 'macos' && !installingUpdate();
const workflow = new Workflow(invoke, renderWorkflow, workflowAllowed);
let workflowAppKey = '';
function renderWorkflow() {
  const status = workflow.status, allowed = workflowAllowed();
  el('workflow').hidden = current?.platform !== 'macos';
  el('brand-pause').hidden = current?.platform !== 'macos';
  for(const id of ['workflow-pause','brand-pause']) {
    button(id).disabled = !allowed || !status || workflow.pending.pause;
    const label = status?.paused ? 'Resume shortcuts' : 'Pause shortcuts';
    if (id === 'brand-pause') button(id).textContent = label;
    else {
      button(id).setAttribute('aria-label', label); button(id).title = label;
      if (button(id).dataset.paused !== String(Boolean(status?.paused))) {
        button(id).dataset.paused = String(Boolean(status?.paused)); button(id).innerHTML = icon(status?.paused ? 'play' : 'pause');
      }
    }
  }
  el('workflow-pause-state').textContent = status ? status.paused ? 'Paused until resumed or app restarts' : 'Shortcuts active' : 'Checking…';
  const login = el('launch-at-login') as HTMLInputElement;
  login.checked = status?.login.status === 'enabled';
  login.disabled = !allowed || !status || workflow.pending.login || status.login.status === 'approval_required';
  const labels = {enabled:'Enabled in macOS', approval_required:'Approval required in macOS Login Items', not_registered:'Not registered', not_found:'Login item not found', unknown:'macOS status unknown'};
  el('login-state').textContent = status ? `${labels[status.login.status]}${status.login.error ? ` · ${status.login.error}` : ''}` : 'Checking…';
  el('login-settings').hidden = status?.login.status !== 'approval_required';
  button('login-settings').disabled = !allowed || workflow.pending.settings || workflow.pending.login;
  el('login-cancel').hidden = status?.login.status !== 'approval_required';
  button('login-cancel').disabled = !allowed || workflow.pending.login;
  const choice = el('excluded-app-choice') as HTMLSelectElement;
  const key = JSON.stringify([workflow.apps,status?.excluded_bundle_ids]);
  if(key !== workflowAppKey) {
    workflowAppKey = key; const selected = choice.value;
    choice.replaceChildren(new Option('Choose a running app',''));
    for(const app of workflow.apps) if(!status?.excluded_bundle_ids.includes(app.bundle_id)) choice.add(new Option(`${app.name} · ${app.bundle_id}`,app.bundle_id));
    choice.value = Array.from(choice.options).some(option=>option.value===selected) ? selected : '';
    const existing = new Map(Array.from(el('excluded-apps').children, item => [(item as HTMLElement).dataset.bundleId!, item]));
    for(const id of status?.excluded_bundle_ids ?? []) {
      const item = existing.get(id) ?? document.createElement('li'); existing.delete(id);
      (item as HTMLElement).dataset.bundleId = id;
      const name = item.querySelector('span') ?? document.createElement('span'), remove = item.querySelector('button') ?? document.createElement('button');
      const app = workflow.apps.find(app=>app.bundle_id===id);
      name.textContent = app ? `${app.name} · ${id}` : id;
      if (!remove.firstElementChild) remove.innerHTML = icon('clear');
      remove.className = 'icon-action'; remove.setAttribute('aria-label',`Remove ${id}`); remove.title = app ? `Remove ${app.name}` : `Remove ${id}`;
      remove.onclick = () => {
        const index = Array.from(el('excluded-apps').children).indexOf(item);
        void workflowFocus(remove, () => workflow.exclusions(workflow.status!.excluded_bundle_ids.filter(saved=>saved!==id)), () => {
          const remaining = Array.from(el('excluded-apps').querySelectorAll('button'));
          return item.isConnected ? remove : remaining[index] ?? remaining[index-1] ?? choice;
        });
      };
      if (!name.parentNode) item.append(name,remove);
      if (!item.parentNode) el('excluded-apps').append(item);
    }
    for (const item of existing.values()) item.remove();
  }
  choice.disabled = !allowed || !status || workflow.pending.exclusions || workflow.pending.apps;
  button('excluded-app-add').disabled = choice.disabled || !choice.value;
  button('excluded-app-refresh').disabled = !allowed || workflow.pending.apps || workflow.pending.exclusions;
  for(const remove of Array.from(el('excluded-apps').querySelectorAll('button'))) remove.disabled = !allowed || workflow.pending.exclusions;
  el('workflow-error').textContent = workflow.error; el('workflow-error').hidden = !workflow.error;
}
el('excluded-app-choice').onchange = renderWorkflow;
el('excluded-app-refresh').onclick = () => { void workflow.runningApps(); };
el('excluded-app-add').onclick = () => { const id = (el('excluded-app-choice') as HTMLSelectElement).value; if(id && workflow.status && workflow.apps.some(app=>app.bundle_id===id)) void workflow.exclusions([...new Set([...workflow.status.excluded_bundle_ids,id])]); };
const loginFocusTarget = () => button('login-settings').hidden ? el('launch-at-login') : el('login-settings');
el('launch-at-login').onchange = () => { void workflowFocus(el('launch-at-login'), () => workflow.login((el('launch-at-login') as HTMLInputElement).checked), loginFocusTarget); };
el('login-settings').onclick = () => { void workflowFocus(el('login-settings'), () => workflow.openLoginSettings(), loginFocusTarget); };
el('login-cancel').onclick = () => { void workflowFocus(el('login-cancel'), () => workflow.login(false), () => button('login-cancel').hidden ? loginFocusTarget() : el('login-cancel')); };
el('workflow-pause').onclick = () => { if(workflow.status) void workflow.pause(!workflow.status.paused); };
el('brand-pause').onclick = () => { closeBrandMenu(true); if(workflow.status) void workflow.pause(!workflow.status.paused); };
function renderUpdates() {
  const view = updates.view;
  const indicator = updateIndicator(view);
  for (const [id, text] of [['updates-indicator-label', indicator.label], ['updates-indicator-detail', indicator.detail], ['updates-announcement', `${indicator.label}. ${indicator.detail}`]]) {
    if (el(id).textContent !== text) el(id).textContent = text;
  }
  button('updates-open').dataset.attention = indicator.attention;
  const canDownload = canInstallUpdate();
  const instruction = view.phase === 'available' ? canDownload ? 'Click to download, verify, install and reopen HandsFree. Models, settings and usage totals are kept.' : 'Finish dictation, clear the private test and stop shortcut recording before updating.' : 'Click to check for updates';
  button('updates-open').title = `${indicator.label}. ${indicator.detail}. ${instruction}`;
  button('updates-open').setAttribute('aria-label', button('updates-open').title);
  button('updates-open').disabled = current?.platform !== 'macos' || updateBusy(view) || (view.phase === 'available' && !canDownload);
  button('updates-open').dataset.phase = view.phase;
  button('updates-open').setAttribute('aria-busy', String(updateBusy(view)));
  button('brand-updates').textContent = view.phase === 'available' ? `${indicator.label} ${indicator.detail}` : 'Check for updates';
  button('brand-updates').disabled = button('updates-open').disabled;
  button('brand-updates').title = button('updates-open').title;
  statusText('updates-feedback', view.phase === 'error' ? view.message : '');
  el('updates-feedback').hidden = view.phase !== 'error' || !view.message;
}
el('updates-open').onkeydown = event => {
  if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
};
el('updates-open').onclick = async () => {
  if (current?.platform !== 'macos' || button('updates-open').disabled) return;
  const ownedFocus = document.activeElement === el('updates-open');
  const intent = focusIntent;
  const version = updates.view.phase === 'available' ? updates.view.available_version : undefined;
  if (version) await updates.download(version);
  else await updates.check();
  renderUpdates();
  if (ownedFocus && intent === focusIntent && document.hasFocus() && !button('updates-open').disabled
    && (document.activeElement === document.body || document.activeElement === el('updates-open'))) button('updates-open').focus({preventScroll:true});
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
const microphoneChoice = el('microphone-choice') as HTMLSelectElement;
const appearanceChoice = el('appearance-choice') as HTMLSelectElement;
const appearance = new AppearancePreference(invoke, () => {
  document.documentElement.dataset.appearance = appearance.value;
  appearanceChoice.value = appearance.selection;
  appearanceChoice.disabled = appearance.pending || !current || current.platform !== 'macos' || installingUpdate();
});
appearanceChoice.onchange = async () => {
  if (appearanceChoice.disabled) return;
  await appearance.change(appearanceValue(appearanceChoice.value));
  feedback(appearance.error);
};
function renderMicrophones() {
  el('microphone-choice-row').hidden = current?.platform !== 'macos';
  if (!microphonePending) {
    const selected = current?.microphone_uid ?? '';
    const defaultName = microphoneDevices.find(d=>d.uid===defaultMicrophone)?.name;
    const signature = JSON.stringify([selected, defaultMicrophone, microphoneDevices]);
    if (signature !== microphoneOptions) {
    const options = [new Option(defaultName ? `System default · ${defaultName}` : 'System default', ''), ...microphoneDevices.map(d=>new Option(d.name,d.uid))];
    if (selected && !microphoneDevices.some(d=>d.uid===selected)) options.push(new Option('Saved microphone · Unavailable', selected));
    microphoneChoice.replaceChildren(...options);
    microphoneOptions = signature;
    }
    microphoneChoice.value = selected;
  }
  microphoneChoice.disabled = microphonePending || microphonesLoading || !canEditShortcut() || capturing || captureStopping || current?.platform !== 'macos';
  button('microphone-refresh').disabled = microphonesLoading || microphonePending || current?.platform !== 'macos';
  const healthChoice = el('health-microphone') as HTMLSelectElement;
  if (healthChoice.innerHTML !== microphoneChoice.innerHTML) healthChoice.replaceChildren(...Array.from(microphoneChoice.options, option => option.cloneNode(true)));
  healthChoice.value = microphoneChoice.value;
  microphoneChoice.title = microphoneChoice.selectedOptions[0]?.textContent ?? 'Microphone';
  healthChoice.title = healthChoice.selectedOptions[0]?.textContent ?? 'Microphone';
  healthChoice.disabled = microphoneChoice.disabled;
  button('health-microphone-refresh').disabled = button('microphone-refresh').disabled;
}
async function refreshMicrophones() {
  if (microphonesLoading || current?.platform !== 'macos') return;
  microphonesLoading = true; renderMicrophones();
  try {
    const result = await invoke<{devices:{uid:string;name:string}[];default_uid:string|null}>('list_microphones');
    microphoneDevices = result.devices; defaultMicrophone = result.default_uid;
  } catch (error) { feedback(String(error)); }
  finally { microphonesLoading = false; renderMicrophones(); }
}
button('microphone-refresh').onclick = () => void refreshMicrophones();
button('health-microphone-refresh').onclick = () => void refreshMicrophones();
el('health-microphone').onchange = () => {
  const select = el('health-microphone') as HTMLSelectElement;
  if (select.disabled || microphoneChoice.disabled) return;
  microphoneChoice.value = select.value;
  microphoneChoice.dispatchEvent(new Event('change'));
};
microphoneChoice.onchange = async () => {
  if (microphonePending || microphoneChoice.disabled) return;
  const uid = microphoneChoice.value || null;
  microphonePending = true; renderMicrophones();
  await action('set_microphone', {uid});
  microphonePending = false; renderMicrophones();
};
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
  const appearanceRevision = appearance.revision;
  try {
      current = await invoke<Status>('status');
      if (connectionError) {
        // Retire only our connection failure, not a newer independent action error.
        if (el('feedback').textContent === connectionError) feedback('');
        connectionError = '';
      }
      appearance.observe(current.appearance, appearanceRevision);
      renderMicrophones();
      if (current.platform === 'macos' && !microphonesLoaded) { microphonesLoaded = true; void refreshMicrophones(); }
      const configuration = JSON.stringify([current.shortcut, current.recording_mode]);
      if (configuration !== tutorialConfiguration) { tutorialConfiguration = configuration; shortcutReceived = false; }
      el('brand-started').hidden = current.platform !== 'macos';
      el('settings-started').hidden = current.platform !== 'macos';
      if (current.platform === 'macos' && !gettingStartedInitialized) {
        gettingStartedInitialized = true;
        el('get-started').hidden = readiness(current);
      }
      if (current.platform !== 'macos') el('get-started').hidden = true;
     const windows = current.platform === 'windows';
      el('updates-open').hidden = current.platform !== 'macos';
      el('brand-updates').hidden = current.platform !== 'macos';
      renderWorkflow(); void workflow.refresh();
     if (current.platform === 'macos') { void updates.refresh(); void updates.progress(); }
     button('setup').disabled = false;
    button('reset').disabled = false;
    if (!soundsPending) sounds.disabled = false;
    if (!volumePending) volume.disabled = false;
    if (!limitPending) { recordingLimit.disabled = false; recordingLimit.value = String(current.recording_limit ?? 120); }
    const requests = (current as Status & { permission_requests?: number }).permission_requests ?? 0;
    if (requests !== seenPermissionRequests) {
      const added = requests & ~seenPermissionRequests;
      const fromGuide = added !== 0 && (added & ~guidePermissionRequests) === 0 && !el('get-started').hidden && !el('settings').hidden;
      guidePermissionRequests &= ~requests;
      seenPermissionRequests = requests;
      if (!fromGuide && !healthDialog.open) navigate('settings');
    }
    const audioStarting = current.platform === 'macos' && current.phase === 'recording' && current.audio_ready === false;
    el('phase').textContent = audioStarting ? 'Starting…' : current.phase === 'idle' && !readiness(current) ? 'Setup needed' : phaseLabel(current.phase);
    // Keep diagnostics outside the compact header; never render dictation payloads.
    const idleHint = `Select a text field and press ${current.shortcut_label}.`;
    const message = current.message.startsWith('Copied.') ? 'Text copied. Switch to your app and paste when you’re ready.' : current.message.startsWith('Paste shortcut sent') ? 'Paste sent to your app. Check the original field.' : current.message;
    statusText('message', audioStarting ? 'Preparing microphone and audio cues…' : current.phase === 'idle' && current.message === idleHint ? '' : message);
    el('message').title = current.message;
    el('message').hidden = !el('message').textContent;
    button('message-recovery').hidden = current.phase !== 'error' && current.phase !== 'not_pasted' && el('feedback').hidden;
    el('dot').className = current.phase;
    button('mic').disabled = current.microphone;
     el('mic').textContent = windows ? 'Open settings' : current.microphone ? 'Allowed' : 'Allow';
     el('mic-state').textContent = windows ? 'Connect a microphone and enable microphone access.' : 'Allow access to record your voice.';
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
     document.querySelector<HTMLElement>('.setup-card')!.hidden = ready;
    el('setup-state').textContent = ready ? 'Ready' : 'Needs attention';
    el('setup-missing').hidden = ready;
    document.querySelector<HTMLElement>('.readiness')!.hidden = ready;
    el('ready-title').textContent = ready ? 'Ready' : 'Finish setting up';
    el('ready-detail').textContent = readinessDetail(current);
    el('setup').textContent = 'Open settings';
    el('storage-error').hidden = !current.persistence_error;
     el('storage-error').textContent = current.persistence_error;
     renderHealth();
     renderUpdates();
  } catch (e) { current = undefined; clearPractice(); renderPractice(); renderWorkflow(); el('phase').textContent = 'Disconnected'; el('dot').className = 'error'; connectionError = `Couldn’t connect to HandsFree: ${String(e)}`; renderHealth(); renderMicrophones(); feedback(connectionError); }
}
void refresh();
void getVersion().then(version => { el('app-version').textContent = version; }).catch(() => { /* Packaged version fallback for browser previews. */ });
setInterval(() => { if (!document.hidden) void refresh(); }, 800);
// Only sample the existing, owned private recording; never start capture on a timer.
setInterval(() => { if (practiceVisible() && practice.view.phase === 'recording') void practice.poll(); }, 120);
document.addEventListener('visibilitychange', () => { if (document.hidden) { syncPracticeContext(); clearPractice(); if (capturing) void stopCapture(); } else void refresh(); });
