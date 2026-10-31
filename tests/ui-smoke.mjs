// Optional local browser smoke check. Does not launch HandsFree or use the mic.
// BROWSER_BINARY='/path/to/Chromium' node tests/ui-smoke.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const binary = process.env.BROWSER_BINARY;
const port = process.env.UI_PORT ?? '5187';
if (!binary) throw new Error('Set BROWSER_BINARY to a Chromium-compatible browser. Start npm run dev -- --port 5187 first.');
const profile = mkdtempSync(join(tmpdir(), 'handsfree-ui-'));
const browser = spawn(binary, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9237', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let socket;
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const request = ++id;
    pending.set(request, { resolve, reject });
    socket.send(JSON.stringify({ id: request, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); }
  throw new Error(`Timed out: ${expression}\n${JSON.stringify(await evaluate(`({focus:document.activeElement?.id,feedback:document.getElementById('feedback')?.textContent,calls:window.calls?.slice(-12)})`))}`);
}
try {
  let page;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { page = await (await fetch(`http://127.0.0.1:9237/json/new?http://127.0.0.1:${port}`, { method: 'PUT' })).json(); break; }
    catch { await delay(50); }
  }
  assert.ok(page?.webSocketDebuggerUrl, 'Headless browser started');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      const request = pending.get(message.id); pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
    }
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 980, height: 820, deviceScaleFactor: 1, mobile: false });
  await until(`Boolean(document.getElementById('nav-settings'))`);
  assert.equal(await evaluate(`document.querySelector('footer .beta-badge').textContent==='BETA' && document.querySelector('footer .beta-badge').getBoundingClientRect().width>0 && !document.querySelector('.brand .beta-badge') && !document.querySelector('main footer') && document.getElementById('app-version').textContent==='0.1.1'`), true, 'Version, beta and language metadata live in the actual footer');
  assert.equal(await evaluate(`['change-shortcut','mic','permissions','download','reset','sounds','sound-volume'].every(id=>document.getElementById(id).disabled)`), true, 'Native controls are unavailable before the backend connects');
  await evaluate(`window.calls = []; window.fixture = {phase:'idle',message:'Select a text field and press Fn.', progress:0,model_ready:true,microphone:true,accessibility:true,input_monitoring:true,hotkey:true,transcript:'',sounds:true,sound_volume:50,sound_style:'tap',shortcut:{code:'Fn',modifiers:0},shortcut_label:'Fn',stats:{words:0,transcriptions:0,speech_seconds:0,saved_seconds:0},persistence_error:''}; window.__TAURI_INTERNALS__ = { invoke: async (command,args) => { window.calls.push({command,args}); if(command==='status') return structuredClone(window.fixture); if(command==='set_sounds') window.fixture.sounds=args.enabled; if(command==='set_sound_style') window.fixture.sound_style=args.style; if(command==='set_shortcut'){if(window.rejectShortcut) throw 'Could not save shortcut'; window.fixture.shortcut=args.shortcut;window.fixture.shortcut_label=args.shortcut.code==='Fn'?'Fn':args.shortcut.code==='Space'?'Option + Space':'Control + Shift + J';} if(command==='reset_stats') window.fixture.stats={words:0,transcriptions:0,speech_seconds:0,saved_seconds:0}; } }; document.getElementById('feedback').hidden=true;`);
  await until(`document.getElementById('ready-title').textContent==='Ready'`);
  assert.deepEqual(await evaluate(`['words','saved','count'].map(id=>document.getElementById(id).textContent)`), ['0','0 sec','0'], 'First-launch totals are real zeros');
  assert.equal(await evaluate(`document.querySelectorAll('details').length`), 0, 'No disclosure maze in the app or its dialogs');
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('nav button'),b=>({name:b.getAttribute('aria-label'),title:b.title,text:b.textContent.trim(),icon:!!b.querySelector('svg')}))`), [{name:'Overview',title:'Overview',text:'',icon:true},{name:'Settings',title:'Settings',text:'',icon:true}], 'Icon navigation retains accessible button names and tooltips');
  const accessibility = await send('Accessibility.getFullAXTree');
  for (const name of ['Overview','Settings']) assert.ok(accessibility.nodes.some(node=>node.role?.value==='button' && node.name?.value===name), `${name} is an accessible button`);
  assert.equal(await evaluate(`document.getElementById('overview-model').hidden`), true, 'Existing users do not see another download CTA');
  // Clean first launch: download remains discoverable for every permissions /
  // hook combination, without a poll initiating any network operation.
  for (let mask = 0; mask < 16; mask++) {
    await evaluate(`Object.assign(window.fixture,{model_ready:false,microphone:${!!(mask & 1)},accessibility:${!!(mask & 2)},input_monitoring:${!!(mask & 4)},hotkey:${!!(mask & 8)}})`);
    await until(`!document.getElementById('overview-model').hidden && !document.getElementById('overview-download').disabled`);
    await until(`document.getElementById('mic-row').hidden===${!!(mask&1)} && document.getElementById('permissions-row').hidden===${!!((mask&2)&&(mask&4))} && document.getElementById('hotkey-row').hidden===${!!(mask&8)}`);
    assert.equal(await evaluate(`document.getElementById('overview-download').getBoundingClientRect().width>0 && document.getElementById('overview-download').textContent.includes('Download English model')`), true);
    await evaluate(`document.getElementById('nav-settings').click()`);
    assert.equal(await evaluate(`['mic','permissions','download'].every(id=>{const b=document.getElementById(id);return !b.getClientRects().length || b.getBoundingClientRect().height===36})`), true, `Uniform setup action heights in readiness combination ${mask}`);
    await evaluate(`document.getElementById('nav-overview').click()`);
  }
  assert.equal(await evaluate(`window.calls.some(c=>c.command==='download_model')`), false, 'Never downloads automatically');
  await evaluate(`document.getElementById('setup').click()`);
  assert.equal(await evaluate(`!document.getElementById('settings').hidden && document.activeElement.id==='model-row'`), true, 'Setup points directly to missing model');
  await evaluate(`window.downloadAttempts=0;const downloadInvoke=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(command,args)=>{if(command==='download_model'){window.downloadAttempts++;if(window.failDownload)throw 'Download failed. You can retry.';window.fixture.phase='downloading';window.fixture.progress=42;await new Promise(resolve=>window.finishDownload=resolve);window.fixture.model_ready=true;window.fixture.phase='idle';}return downloadInvoke(command,args);};window.failDownload=true;document.getElementById('download').click()`);
  await until(`document.getElementById('feedback').textContent.includes('Download failed') && !document.getElementById('download').disabled`);
  await evaluate(`window.failDownload=false;document.getElementById('nav-overview').click();document.getElementById('overview-download').click();document.getElementById('overview-download').click()`);
  await until(`document.getElementById('overview-download').textContent.includes('42%') && document.getElementById('overview-download').disabled`);
  assert.equal(await evaluate(`window.downloadAttempts`), 2, 'Failed request plus one retry; duplicate click does not dispatch twice');
  await evaluate(`window.finishDownload()`);
  await until(`document.getElementById('overview-model').hidden && document.getElementById('model-ready').textContent.includes('Ready')`);
  await evaluate(`Object.assign(window.fixture,{microphone:true,accessibility:true,input_monitoring:true,hotkey:true});document.getElementById('feedback').hidden=true`);
  await until(`document.getElementById('setup-state').textContent==='Ready'`);
  // Duration saves independently of sound/shortcut, rolls back failed writes,
  // and reflects refreshed persisted values without starting capture.
  await evaluate(`window.fixture.recording_limit=120; const limitInvoke=window.__TAURI_INTERNALS__.invoke; window.__TAURI_INTERNALS__.invoke=async(command,args)=>{ if(command==='set_recording_limit'){if(window.rejectLimit)throw 'Could not save recording limit';window.fixture.recording_limit=args.seconds;} return limitInvoke(command,args); };`);
  assert.equal(await evaluate(`!document.getElementById('copy') && !document.getElementById('transcript') && !document.querySelector('.transcript-section')`), true, 'No transcript or manual copy surface');
  await evaluate(`document.getElementById('nav-settings').click()`);
  assert.equal(await evaluate(`document.getElementById('overview').hidden && !document.getElementById('settings').hidden`), true);
  assert.equal(await evaluate(`document.querySelector('.readiness').hidden`), true, 'No readiness card when ready');
  await until(`!document.getElementById('recording-limit').disabled`);
  assert.deepEqual(await evaluate(`Array.from(document.getElementById('recording-limit').options,o=>o.value)`), ['120','180','240','300']);
  await evaluate(`document.getElementById('recording-limit').value='300'; document.getElementById('recording-limit').dispatchEvent(new Event('change'))`);
  await until(`window.fixture.recording_limit===300 && !document.getElementById('recording-limit').disabled`);
  await evaluate(`window.rejectLimit=true; document.getElementById('recording-limit').value='180'; document.getElementById('recording-limit').dispatchEvent(new Event('change'))`);
  await until(`document.getElementById('feedback').textContent.includes('Could not save recording limit') && !document.getElementById('recording-limit').disabled`);
  assert.equal(await evaluate(`document.getElementById('recording-limit').value`), '300', 'Failed duration write rolls back');
  await evaluate(`window.rejectLimit=false;window.fixture.recording_limit=240`);
  await until(`document.getElementById('recording-limit').value==='240'`);
  assert.equal(await evaluate(`document.getElementById('setup-state').textContent==='Ready' && document.getElementById('setup-missing').hidden`), true, 'Ready setup is a single row, details optional');
  assert.equal(await evaluate(`document.getElementById('shortcut-dialog')`), null);
  assert.equal(await evaluate(`['change-shortcut','recording-limit','sounds','sound-volume','preview-sound','reset'].every(id=>document.getElementById(id).getBoundingClientRect().height>0)`), true, 'Every essential preference is visible without expansion');
  assert.deepEqual(await evaluate(`['change-shortcut','recording-limit','preview-sound','reset'].map(id=>document.getElementById(id).getBoundingClientRect().height)`), [36,36,36,36], 'Settings actions and select share one control height');
  const recording = `document.getElementById('change-shortcut').getAttribute('aria-pressed')==='true'`;
  const stopped = `document.getElementById('change-shortcut').getAttribute('aria-pressed')==='false' && !document.getElementById('change-shortcut').disabled`;
  const key = (code, mods = '') => evaluate(`document.getElementById('change-shortcut').dispatchEvent(new KeyboardEvent('keydown',{code:'${code}',${mods}bubbles:true,cancelable:true}))`);
  await evaluate(`document.getElementById('change-shortcut').click()`);
  await until(recording);
  assert.equal(await evaluate(`document.activeElement.id==='change-shortcut' && document.getElementById('saved-shortcut').textContent==='Press shortcut…' && !document.querySelector('dialog[open]')`), true, 'Single inline recorder, no modal or presets');
  const initialSaves = await evaluate(`window.calls.filter(c=>c.command==='set_shortcut').length`);
  for (const [code, mods] of [['Space',''],['KeyQ','metaKey:true,'],['KeyJ','ctrlKey:true,repeat:true,'],['KeyJ','ctrlKey:true,isComposing:true,']]) await key(code, mods);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='set_shortcut').length`), initialSaves, 'Activation Space, reserved keys, repeats and composition never save');
  await key('KeyJ', 'ctrlKey:true,shiftKey:true,');
  await until(`${stopped} && document.getElementById('saved-shortcut').textContent==='Control + Shift + J'`);
  assert.deepEqual(await evaluate(`window.calls.filter(c=>c.command==='set_shortcut').at(-1).args.shortcut`), {code:'KeyJ',modifiers:5});
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='set_shortcut').length`), initialSaves+1, 'Valid combo automatically persists exactly once');
  await evaluate(`window.rejectShortcut=true;document.getElementById('change-shortcut').click()`);
  await key('Space', 'altKey:true,');
  await until(`${stopped} && document.getElementById('shortcut-feedback').textContent.includes('Could not save')`);
  assert.equal(await evaluate(`document.getElementById('saved-shortcut').textContent`), 'Control + Shift + J', 'Failed save restores active binding with concise inline error');
  for (const cancel of ['escape','blur','tab','navigation','cancel']) {
    await evaluate(`document.getElementById('change-shortcut').click()`);
    await until(recording);
    if (cancel==='escape') await key('Escape');
    if (cancel==='tab') await key('Tab');
    if (cancel==='blur') await evaluate(`window.dispatchEvent(new Event('blur'))`);
    if (cancel==='navigation') await evaluate(`document.getElementById('nav-overview').click()`);
    if (cancel==='cancel') await evaluate(`document.getElementById('stop-shortcut').click()`);
    await until(stopped);
    assert.equal(await evaluate(`window.calls.filter(c=>c.command==='capture_shortcut').at(-1).args.active`), false, `${cancel} releases native capture`);
    await evaluate(`document.getElementById('nav-settings').click()`);
  }
  await evaluate(`window.realTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>window.realTimeout(fn,ms===15000?30:ms,...args);document.getElementById('change-shortcut').click()`);
  await until(`${stopped} && document.getElementById('shortcut-feedback').textContent.includes('timed out')`);
  await evaluate(`window.setTimeout=window.realTimeout;window.rejectShortcut=false;document.getElementById('shortcut-fn').click()`);
  await until(`${stopped} && document.getElementById('saved-shortcut').textContent==='Fn'`);
  assert.equal(await evaluate(`document.getElementById('shortcut-fn').hidden`), true, 'Fn reset remains a small contextual action');
  // Hold persistence across polling: never replace the recorder with stale status.
  await evaluate(`const shortcutInvoke=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(command,args)=>{if(command==='set_shortcut')await new Promise(resolve=>window.releaseShortcut=resolve);return shortcutInvoke(command,args);};document.getElementById('change-shortcut').click()`);
  await key('Space','altKey:true,');
  await until(`document.getElementById('change-shortcut').disabled`);
  await delay(1000);
  assert.equal(await evaluate(`document.getElementById('saved-shortcut').textContent`), 'Press shortcut…', 'Pending capture survives a status poll');
  await evaluate(`window.releaseShortcut()`);
  await until(`${stopped} && document.getElementById('saved-shortcut').textContent==='Option + Space'`);
  await evaluate(`window.__TAURI_INTERNALS__.invoke=shortcutInvoke`);
  // A blur while the native start IPC is pending must still release capture
  // after that start completes, never leaving the global hook suspended.
  await evaluate(`const captureInvoke=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(command,args)=>{if(command==='capture_shortcut'&&args.active)await new Promise(resolve=>window.releaseCapture=resolve);return captureInvoke(command,args);};document.getElementById('change-shortcut').click();window.dispatchEvent(new Event('blur'))`);
  await until(`document.getElementById('change-shortcut').disabled`);
  await evaluate(`window.releaseCapture()`);
  await until(stopped);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='capture_shortcut').at(-1).args.active`), false, 'Delayed native start cannot outlive cancellation');
  await evaluate(`window.__TAURI_INTERNALS__.invoke=captureInvoke`);
  await evaluate(`window.rejectShortcut=false;window.fixture.sound_style='bell'`);
  assert.equal(await evaluate(`document.getElementById('sound-style')===null`), true, 'One cue, no style selector even with a legacy preference');
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='preview_sound').length`), 0, 'Visible sound controls never autoplay');
  await evaluate(`document.getElementById('sounds').click()`);
  await until(`window.fixture.sounds===false && !document.getElementById('sounds').disabled`);
  await until(`document.getElementById('sound-state').textContent==='Off'`);
  // Keep IPC unresolved across a real status poll: the pending user choice
  // must neither be overwritten nor re-enabled by the backend's old value.
  await evaluate(`const pendingInvoke=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(command,args)=>{if(['set_sounds','set_sound_volume','set_recording_limit'].includes(command))await new Promise(resolve=>window.releasePreference=resolve);return pendingInvoke(command,args);}`);
  for (const [control, command, value] of [['sounds','set_sounds',true],['sound-volume','set_sound_volume','62'],['recording-limit','set_recording_limit','180']]) {
    await evaluate(`{window.preferencePolls=window.calls.filter(c=>c.command==='status').length;const control=document.getElementById('${control}');${control==='sounds' ? 'control.click()' : `control.value='${value}';control.dispatchEvent(new Event('change'))`}}`);
    await until(`window.calls.filter(c=>c.command==='status').length>window.preferencePolls`);
    assert.equal(await evaluate(`document.getElementById('${control}').disabled`), true, `${command} stays disabled during a poll`);
    assert.equal(await evaluate(`document.getElementById('${control}').${control==='sounds'?'checked':'value'}`), value, `${command} retains the user's pending choice`);
    await evaluate(`window.releasePreference()`);
    await until(`!document.getElementById('${control}').disabled`);
  }
  await evaluate(`window.__TAURI_INTERNALS__.invoke=pendingInvoke;window.fixture.sounds=false`);
  await evaluate(`window.fixture.sound_volume=50; const oldInvoke=window.__TAURI_INTERNALS__.invoke; window.__TAURI_INTERNALS__.invoke=async(command,args)=>{ if(command==='set_sound_volume') window.fixture.sound_volume=args.volume; return oldInvoke(command,args); };`);
  await until(`document.getElementById('volume-percent').textContent==='50%'`);
  const volumeCommits = await evaluate(`window.calls.filter(c=>c.command==='set_sound_volume').length`);
  await evaluate(`const slider=document.getElementById('sound-volume'); for(let n=51;n<=70;n++){slider.value=String(n); slider.dispatchEvent(new Event('input'));}`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='set_sound_volume').length`), volumeCommits, 'Dragging never sends IPC');
  assert.equal(await evaluate(`document.getElementById('volume-percent').textContent`), '70%');
  await evaluate(`document.getElementById('sound-volume').dispatchEvent(new Event('change'))`);
  await until(`window.fixture.sound_volume===70 && !document.getElementById('sound-volume').disabled`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='set_sound_volume').length`), volumeCommits + 1, 'One commit on release');
  await until(`!document.getElementById('preview-sound').disabled`);
  await evaluate(`document.getElementById('preview-sound').click(); document.getElementById('preview-sound').click();`);
  await until(`window.calls.some(c=>c.command==='preview_sound')`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='preview_sound').length`), 1, 'Explicit preview works while sounds muted, without repeat');
  for (const phase of ['recording', 'processing', 'downloading']) {
    await evaluate(`window.fixture.phase=${JSON.stringify(phase)}`);
    await until(`document.getElementById('dot').className===${JSON.stringify(phase)}`);
    assert.equal(await evaluate(`document.getElementById('preview-sound').disabled`), true);
    await evaluate(`document.getElementById('preview-sound').click()`);
  }
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='preview_sound').length`), 1, 'No preview while busy');
  await evaluate(`window.fixture.phase='idle'`);
  for (const message of ['No speech detected. Try again.', 'Cancelled.']) {
    await evaluate(`window.fixture.message=${JSON.stringify(message)}`);
    await until(`document.getElementById('message').textContent===${JSON.stringify(message)}`);
  }
  await until(`!document.getElementById('preview-sound').disabled`);
  for (const field of ['microphone','accessibility','input_monitoring','hotkey','model_ready']) {
    await evaluate(`window.fixture[${JSON.stringify(field)}]=false`);
    await until(`document.getElementById('setup-state').textContent==='Needs attention'`);
    const row = {microphone:'mic-row',accessibility:'permissions-row',input_monitoring:'permissions-row',hotkey:'hotkey-row',model_ready:'model-row'}[field];
    assert.equal(await evaluate(`!document.getElementById('setup-missing').hidden && !document.getElementById('${row}').hidden && !document.querySelector('.readiness').hidden`), true, `Missing ${field} is actionable, never concealed by Ready`);
    await evaluate(`window.fixture[${JSON.stringify(field)}]=true`);
    await until(`document.getElementById('setup-state').textContent==='Ready'`);
  }
  await evaluate(`window.fixture.model_ready=false;window.fixture.phase='downloading';window.fixture.progress=42`);
  await until(`document.getElementById('download').textContent==='42%'`);
  assert.equal(await evaluate(`!document.getElementById('progress').hidden && document.getElementById('progress').value===42 && !document.getElementById('setup-missing').hidden`), true, 'Model download progress remains visible');
  await evaluate(`window.fixture.model_ready=true;window.fixture.phase='idle'`);
  await until(`document.getElementById('setup-state').textContent==='Ready'`);
  await evaluate(`window.fixture.phase='processing';window.fixture.message='Loading local model… Escape cancels.'`);
  await until(`!document.getElementById('cancel').hidden && document.getElementById('message').textContent.includes('Loading local model')`);
  await evaluate(`document.getElementById('cancel').click()`);
  assert.equal(await evaluate(`window.calls.some(c=>c.command==='cancel')`), true, 'Model loading remains cancellable');
  await evaluate(`window.fixture.phase='error';window.fixture.message='Microphone capture failed. Please check your input device.'`);
  await until(`document.getElementById('phase').textContent==='Needs attention'`);
  assert.equal(await evaluate(`document.getElementById('message').textContent`), 'Microphone capture failed. Please check your input device.', 'Capture failure retains actionable backend detail');
  await evaluate(`window.fixture.phase='idle'`);
  await evaluate(`document.getElementById('reset').click()`);
  assert.equal(await evaluate(`document.getElementById('reset-dialog').open`), true);
  assert.equal(await evaluate(`window.calls.some(c=>c.command==='reset_stats')`), false);
  await evaluate(`document.getElementById('keep-stats').click()`);
  assert.equal(await evaluate(`window.calls.some(c=>c.command==='reset_stats')`), false);
  await evaluate(`document.getElementById('reset').click(); document.getElementById('confirm-reset').click()`);
  await until(`!document.getElementById('reset-dialog').open`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='reset_stats' && c.args.confirmed).length`), 1);
  await evaluate(`document.getElementById('nav-overview').click(); window.fixture.transcript='<script>unsafe</script> & a thought'; window.fixture.stats={words:100,transcriptions:4,speech_seconds:45,saved_seconds:105};`);
  await until(`document.getElementById('words').textContent==='100'`);
  assert.equal(await evaluate(`document.body.textContent.includes(window.fixture.transcript)`), false, 'Confidential payload is never rendered, even as escaped text');
  assert.ok(!(await send('Accessibility.getFullAXTree')).nodes.some(node=>node.name?.value?.includes('<script>unsafe</script>')), 'Payload absent from accessibility tree');
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='copy_transcript').length`), 0);
  await evaluate(`window.fixture.phase='copied'; window.fixture.message='Copied. Automatic paste skipped: Not pasted [start:no-original-focus].';`);
  await until(`document.getElementById('phase').textContent==='Copied' && document.getElementById('dot').className==='copied'`);
  assert.equal(await evaluate(`document.getElementById('cancel').hidden && !document.getElementById('preview-sound').disabled && !document.getElementById('change-shortcut').disabled && !document.body.textContent.includes(window.fixture.transcript)`), true, 'Copied fallback is ready without exposing payload');
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('dot')).backgroundColor`), 'rgb(112, 107, 104)', 'Normal fallback is graphite; muted red is reserved for recording/active controls');
  assert.match(await evaluate(`document.getElementById('message').textContent`), /start:no-original-focus/);
  await evaluate(`document.getElementById('nav-settings').click();document.getElementById('feedback').hidden=true;window.fixture.message='Select a text field and press Fn.'`);
  await until(`document.getElementById('message').textContent==='Select a text field and press Fn.'`);
  assert.equal(await evaluate(`document.querySelector('footer').getBoundingClientRect().bottom<=innerHeight`), true, `Ready settings fit the normal window: ${JSON.stringify(await evaluate(`Array.from(document.querySelectorAll('aside,header,.settings-intro,#settings .card,.local-data,.status,footer')).map(e=>({name:e.className||e.tagName,height:e.getBoundingClientRect().height,bottom:e.getBoundingClientRect().bottom}))`))}`);
  await evaluate(`window.fixture.phase='idle'`);
  await evaluate(`window.fixture.transcript='A little less typing. A little more room to think.'; document.getElementById('feedback').hidden=true;`);
  await delay(900);
  assert.equal(await evaluate(`document.body.textContent.includes(window.fixture.transcript)`), false);
  for (const theme of ['light','dark']) {
    await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-color-scheme',value:theme}]});
    assert.deepEqual(await evaluate(`({scheme:getComputedStyle(document.documentElement).colorScheme,bg:getComputedStyle(document.documentElement).backgroundColor,text:getComputedStyle(document.documentElement).color})`), {scheme:'light',bg:'rgb(247, 246, 243)',text:'rgb(48, 46, 45)'}, 'The app stays intentionally light even on a dark system');
    await evaluate(`document.getElementById('feedback').hidden=false;document.getElementById('feedback').textContent='Could not save. Try again.'`);
    assert.deepEqual(await evaluate(`({bg:getComputedStyle(document.getElementById('feedback')).backgroundColor,text:getComputedStyle(document.getElementById('feedback')).color})`), {bg:'rgb(250, 240, 223)',text:'rgb(48, 46, 45)'}, 'Warning feedback has dark readable text in either system mode');
    await evaluate(`document.getElementById('feedback').hidden=true`);
    for (const width of [320, 390, 400, 560, 740, 980, 1280]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 820, deviceScaleFactor: 1, mobile: false });
      for (const tab of ['overview','settings']) {
        await evaluate(`document.getElementById('nav-${tab}').click()`);
        const nav = await evaluate(`(() => { const a=document.getElementById('nav-overview').getBoundingClientRect(), b=document.getElementById('nav-settings').getBoundingClientRect(),brand=document.querySelector('.brand').getBoundingClientRect();return {same:a.y===b.y&&a.width===b.width&&a.height===b.height,width:a.width,height:a.height,centered:Math.abs((brand.y+brand.height/2)-(a.y+a.height/2))<1,active:document.querySelector('nav [aria-current="page"]').id};})()`);
        assert.deepEqual(nav, {same:true,width:40,height:40,centered:true,active:`nav-${tab}`}, `Header aligned at ${width}px`);
        assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`), true, `No horizontal overflow at ${width}px, ${theme}, ${tab}`);
        assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('button, select, input')).filter(e=>e.getClientRects().length && (e.getBoundingClientRect().right>innerWidth || e.getBoundingClientRect().left<0)).map(e=>e.id)`), [], 'All controls fit');
        if (tab==='settings') assert.equal(await evaluate(`(() => {const label=document.querySelector('.shortcut-row h3').getBoundingClientRect(),value=document.querySelector('.shortcut-value').getBoundingClientRect();return value.top>=label.bottom || value.left>=label.right;})()`), true, 'Shortcut value never overlaps its label');
        assert.equal(await evaluate(`['words','saved','count'].every(id=>{const s=getComputedStyle(document.getElementById(id));return s.color==='rgb(166, 74, 69)' && s.opacity==='1'})`), true, 'Readable muted brand red numbers, not faded opacity');
        assert.equal(await evaluate(`(() => {const status=document.querySelector('.status').getBoundingClientRect(),nav=document.querySelector('nav').getBoundingClientRect();return status.top>=nav.bottom && Math.abs(status.right-nav.right)<1 && !document.querySelector('main .status');})()`), true, 'Compact status aligns to navigation upper right');
      }
      await evaluate(`document.getElementById('change-shortcut').click()`);
      await until(recording);
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true, `Inline recording fits ${width}px, ${theme}`);
      await key('Escape'); await until(stopped);
      await evaluate(`Object.assign(window.fixture,{microphone:false,accessibility:false,input_monitoring:false,hotkey:false,model_ready:false})`);
      await until(`document.getElementById('setup-state').textContent==='Needs attention'`);
      for (const tab of ['settings','overview']) {
        await evaluate(`document.getElementById('nav-${tab}').click()`);
        assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true, `First-run ${tab} fits ${width}px`);
        assert.equal(await evaluate(`['mic','permissions','download','overview-download'].every(id=>{const b=document.getElementById(id),r=b.getBoundingClientRect();return !r.width || (r.left>=0&&r.right<=innerWidth&&r.height>=36)})`), true, 'First-run actions fit without clipping');
      }
      await evaluate(`Object.assign(window.fixture,{microphone:true,accessibility:true,input_monitoring:true,hotkey:true,model_ready:true})`);
      await until(`document.getElementById('setup-state').textContent==='Ready'`);
    }
  }
  // Status text shares space with a dot and (while busy) Cancel. Exercise real
  // wrapping and geometry, not just the document width, including unbroken errors.
  for (const phase of ['idle','recording','processing','downloading','error']) {
    await evaluate(`window.fixture.phase=${JSON.stringify(phase)};window.fixture.message=${JSON.stringify('Long local status: ' + 'diagnostic-path/'.repeat(30))}`);
    await until(`document.getElementById('dot').className===${JSON.stringify(phase)}`);
    for (const width of [320,390,400,560,740,980,1280]) {
      await send('Emulation.setDeviceMetricsOverride', {width,height:820,deviceScaleFactor:1,mobile:false});
      const geometry = await evaluate(`(() => {
        const dot=document.getElementById('dot').getBoundingClientRect();
        const title=document.getElementById('phase').getBoundingClientRect();
        const text=document.getElementById('phase').getBoundingClientRect();
        const cancel=document.getElementById('cancel').getBoundingClientRect();
        return {fits:document.documentElement.scrollWidth<=innerWidth,
          aligned:dot.top>=title.top && dot.bottom<=title.bottom,
          wraps:document.getElementById('message').scrollWidth<=document.querySelector('main').clientWidth+1,
          separated:!cancel.width || cancel.top>=text.bottom || cancel.left>=text.right,
          label:document.getElementById('phase').textContent};
      })()`);
      assert.ok(geometry.fits && geometry.aligned && geometry.wraps && geometry.separated, `${phase} status fits and aligns at ${width}px: ${JSON.stringify(geometry)}`);
      if (phase==='idle') assert.equal(geometry.label,'Ready');
    }
  }
   if (process.env.UI_SCREENSHOT_DIR) {
     await send('Emulation.setDeviceMetricsOverride', {width:740,height:820,deviceScaleFactor:1,mobile:false});
     await evaluate(`window.fixture.phase='idle';window.fixture.message='';document.getElementById('feedback').hidden=true`);
     await until(`document.getElementById('phase').textContent==='Ready'`);
     for (const width of [740,400,320]) {
       await send('Emulation.setDeviceMetricsOverride', {width,height:820,deviceScaleFactor:1,mobile:false});
       for (const tab of ['overview','settings']) {
         await evaluate(`document.getElementById('nav-${tab}').click()`);
         const shot = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:true});
         writeFileSync(join(process.env.UI_SCREENSHOT_DIR, `${tab}-${width}.png`), Buffer.from(shot.data,'base64'));
       }
     }
     await evaluate(`Object.assign(window.fixture,{model_ready:false,microphone:false,accessibility:false,input_monitoring:false,hotkey:false})`);
     await until(`document.getElementById('setup-state').textContent==='Needs attention'`);
     for (const tab of ['overview','settings']) {
       await evaluate(`document.getElementById('nav-${tab}').click()`);
       const shot = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:true});
       writeFileSync(join(process.env.UI_SCREENSHOT_DIR, `${tab}-first-run-320.png`), Buffer.from(shot.data,'base64'));
     }
   }
   console.log('UI smoke passed: private payload never rendered, activity metrics, upper-right status, accessible navigation, uniform controls, preferences, 16 first-run combinations, download retry/progress, shortcuts, reset, light/dark responsive layout. No microphone capture.');
} finally {
  socket?.close();
  browser.kill('SIGTERM');
  await new Promise(resolve => browser.once('exit', resolve));
  rmSync(profile, { recursive: true, force: true });
}
