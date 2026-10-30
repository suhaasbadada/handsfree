import { invoke } from '@tauri-apps/api/core';
import './style.css';
import { phaseLabel, canCancel } from './presentation';

type Status = { phase: string; message: string; progress: number; model_ready: boolean; microphone: boolean; accessibility: boolean; input_monitoring: boolean; hotkey: boolean; transcript: string };
document.querySelector('#app')!.innerHTML = `
<main><header><span class="mark">〰</span><span>handsfree <small>LOCAL DICTATION</small></span></header>
<h1>Less typing.<br><span>More you.</span></h1><p class="intro">Tap <kbd>fn</kbd>, speak naturally, tap again.<br>Your words appear right where you left off.</p>
<section class="status"><span id="dot"></span><div><strong id="phase">Connecting…</strong><p id="message" aria-live="polite"></p></div><button id="cancel" hidden>Cancel</button></section>
<section><h2>Make yourself at home</h2>
<div class="step"><b>01</b><div><h3>Allow microphone access</h3><p>Audio stays on this Mac and is deleted after transcription.</p></div><button id="mic">Allow</button></div>
<div class="step"><b>02</b><div><h3>Enable Accessibility & Input Monitoring</h3><p>Used only for the Fn shortcut and pasting. Enable Handsfree in both panes; restart the app after changing permissions.</p></div><button id="permissions">Open</button></div>
<div class="step"><b>03</b><div><h3>Download the English model <span id="model-state"></span></h3><p>Whisper base.en · 148 MB · one-time download from Hugging Face. Transcription never uses the network.</p><progress id="progress" max="100" value="0" hidden></progress></div><button id="download">Download</button></div>
<div class="step"><b>04</b><div><h3>Let Fn be yours</h3><p>In Keyboard settings, set “Press 🌐 key to” to <strong>Do Nothing</strong>. Turn off macOS Dictation’s Fn shortcut if enabled. Only a short, unmodified Fn tap triggers Handsfree.</p></div><button id="keyboard">Open</button></div>
</section><section class="note"><strong>Stay in your flow.</strong> Choose a text field in another app, then use Fn. Handsfree never activates the pill or switches apps. If focus changes, the result is kept here instead of being pasted.</section>
<section id="result" hidden><h2>Last transcript</h2><p id="transcript"></p><button id="copy">Copy text</button></section>
<footer><span>PRIVATE BY DEFAULT</span><span>English · on-device · Apple Silicon</span></footer></main>`;
const el = (id: string) => document.getElementById(id)!;
let current: Status | undefined;
let refreshing = false;
async function action(command: string) {
  try { await invoke(command); await refresh(); }
  catch (e) { el('message').textContent = String(e); }
}
el('mic').onclick = () => void action('request_microphone');
el('permissions').onclick = () => void action('request_permissions');
el('keyboard').onclick = () => void action('open_keyboard');
el('download').onclick = () => void action('download_model');
el('cancel').onclick = () => void action('cancel');
el('copy').onclick = () => void action('copy_transcript');
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    current = await invoke<Status>('status');
    el('phase').textContent = phaseLabel(current.phase);
    el('message').textContent = current.message;
    el('dot').className = current.phase;
    (el('mic') as HTMLButtonElement).disabled = current.microphone;
    el('mic').textContent = current.microphone ? 'Allowed' : 'Allow';
    el('permissions').textContent = current.accessibility && current.input_monitoring ? (current.hotkey ? 'Allowed' : 'Restart app') : 'Open';
    el('model-state').textContent = current.model_ready ? '✓' : '';
    (el('download') as HTMLButtonElement).disabled = current.model_ready || current.phase === 'downloading';
    el('download').textContent = current.model_ready ? 'Ready' : 'Download';
    el('progress').hidden = current.phase !== 'downloading';
    (el('progress') as HTMLProgressElement).value = current.progress;
    el('cancel').hidden = !canCancel(current.phase);
    el('result').hidden = !current.transcript;
    el('transcript').textContent = current.transcript;
  } catch (e) { el('message').textContent = String(e); }
  finally { refreshing = false; }
}
void refresh();
setInterval(() => void refresh(), 650);
