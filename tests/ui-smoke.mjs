// Optional local browser smoke check. Does not launch HandsFree or use the mic.
// BROWSER_BINARY='/path/to/Chromium' node tests/ui-smoke.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
  assert.equal(await evaluate(`document.querySelector('.brand .beta-badge').textContent==='BETA' && document.querySelector('.brand .beta-badge').getBoundingClientRect().width>0`), true, 'App brand visibly identifies uppercase beta status');
  assert.equal(await evaluate(`['change-shortcut','mic','permissions','download','reset','sounds','sound-volume'].every(id=>document.getElementById(id).disabled)`), true, 'Native controls are unavailable before the backend connects');
  await evaluate(`window.calls = []; window.fixture = {phase:'idle',message:'Select a text field and press Fn.', progress:0,model_ready:true,microphone:true,accessibility:true,input_monitoring:true,hotkey:true,transcript:'',sounds:true,sound_volume:50,sound_style:'tap',shortcut:{code:'Fn',modifiers:0},shortcut_label:'Fn',stats:{words:0,transcriptions:0,speech_seconds:0,saved_seconds:0},persistence_error:''}; window.__TAURI_INTERNALS__ = { invoke: async (command,args) => { window.calls.push({command,args}); if(command==='status') return structuredClone(window.fixture); if(command==='set_sounds') window.fixture.sounds=args.enabled; if(command==='set_sound_style') window.fixture.sound_style=args.style; if(command==='set_shortcut'){if(window.rejectShortcut) throw 'Could not save shortcut'; window.fixture.shortcut=args.shortcut;window.fixture.shortcut_label=args.shortcut.code==='Fn'?'Fn':args.shortcut.code==='Space'?'Option + Space':'Control + Shift + J';} if(command==='reset_stats') window.fixture.stats={words:0,transcriptions:0,speech_seconds:0,saved_seconds:0}; } }; document.getElementById('feedback').hidden=true;`);
  await until(`document.getElementById('ready-title').textContent.includes('You’re ready')`);
  // Duration saves independently of sound/shortcut, rolls back failed writes,
  // and reflects refreshed persisted values without starting capture.
  await evaluate(`window.fixture.recording_limit=120; const limitInvoke=window.__TAURI_INTERNALS__.invoke; window.__TAURI_INTERNALS__.invoke=async(command,args)=>{ if(command==='set_recording_limit'){if(window.rejectLimit)throw 'Could not save recording limit';window.fixture.recording_limit=args.seconds;} return limitInvoke(command,args); };`);
  assert.equal(await evaluate(`document.getElementById('copy').disabled`), true);
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
  assert.equal(await evaluate(`document.getElementById('shortcut-dialog').open || document.querySelector('.sound-options').open`), false, 'Advanced controls are out of the way');
  await evaluate(`document.getElementById('change-shortcut').click()`);
  assert.equal(await evaluate(`document.getElementById('shortcut-dialog').open && document.activeElement.id==='shortcut-fn'`), true, 'Shortcut dialog focuses its first choice');
  for (let tab = 0; tab < 12; tab++) {
    await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    // Native dialog focus wraps through the document body between its ends;
    // no underlying setting may receive focus while it is modal.
    assert.equal(await evaluate(`document.activeElement===document.body || document.getElementById('shortcut-dialog').contains(document.activeElement)`), true, 'Tab stays in the modal');
  }
  await evaluate(`document.getElementById('shortcut-option').click()`);
  await until(`document.getElementById('saved-shortcut').textContent==='Option + Space' && !document.getElementById('record-shortcut').disabled`);
  assert.equal(await evaluate(`!document.getElementById('shortcut-dialog').open && document.activeElement.id==='change-shortcut'`), true, 'Saving returns focus to Change');
  await evaluate(`document.getElementById('change-shortcut').click(); document.getElementById('record-shortcut').click()`);
  await until(`!document.getElementById('shortcut-recorder').hidden`);
  await evaluate(`document.getElementById('shortcut-recorder').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ',metaKey:true,bubbles:true,cancelable:true}))`);
  assert.equal(await evaluate(`document.getElementById('shortcut-recorder').hidden`), false, 'Reserved combo stays unsaved');
  await evaluate(`document.getElementById('shortcut-recorder').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyJ',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))`);
  await until(`document.getElementById('shortcut-recorder').hidden && document.getElementById('saved-shortcut').textContent==='Control + Shift + J'`);
  assert.deepEqual(await evaluate(`window.calls.filter(c=>c.command==='set_shortcut').at(-1).args.shortcut`), {code:'KeyJ',modifiers:5});
  await until(`!document.getElementById('shortcut-fn').disabled`);
  await evaluate(`document.getElementById('change-shortcut').click(); window.rejectShortcut=true;document.getElementById('shortcut-fn').click()`);
  await until(`document.getElementById('feedback').textContent.includes('Could not save')`);
  assert.equal(await evaluate(`document.getElementById('saved-shortcut').textContent`), 'Control + Shift + J', 'Failed save preserves active shortcut');
  assert.equal(await evaluate(`document.getElementById('shortcut-dialog').open && document.getElementById('shortcut-feedback').textContent.includes('Could not save')`), true, 'Save errors remain visible inside the dialog');
  await evaluate(`document.getElementById('record-shortcut').click()`);
  await until(`!document.getElementById('shortcut-recorder').hidden`);
  await evaluate(`document.getElementById('shortcut-recorder').dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',bubbles:true,cancelable:true}))`);
  await until(`document.getElementById('shortcut-recorder').hidden`);
  assert.equal(await evaluate(`document.getElementById('shortcut-dialog').open && document.activeElement.id==='close-shortcut'`), true, 'Escape cancels recording without closing dialog');
  await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until(`!document.getElementById('shortcut-dialog').open`);
  assert.equal(await evaluate(`document.activeElement.id==='change-shortcut'`), true, 'Dialog Escape restores focus');
  await until(`!document.getElementById('record-shortcut').disabled`);
  await evaluate(`window.realTimeout=window.setTimeout; window.setTimeout=(fn,ms,...args)=>window.realTimeout(fn,ms===25000?30:ms,...args); document.getElementById('change-shortcut').click(); document.getElementById('record-shortcut').click()`);
  await until(`document.getElementById('shortcut-feedback').textContent.includes('timed out')`);
  assert.equal(await evaluate(`document.getElementById('shortcut-dialog').open && document.getElementById('shortcut-recorder').hidden && window.calls.filter(c=>c.command==='capture_shortcut').at(-1).args.active===false`), true, 'Recording timeout releases native capture and keeps dialog usable');
  await evaluate(`window.setTimeout=window.realTimeout;document.getElementById('close-shortcut').click()`);
  await evaluate(`document.querySelector('.sound-options').open=true`);
  await evaluate(`window.rejectShortcut=false;window.fixture.sound_style='bell'`);
  assert.equal(await evaluate(`document.getElementById('sound-style')===null`), true, 'One cue, no style selector even with a legacy preference');
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='preview_sound').length`), 0, 'Opening sound options never autoplays');
  await evaluate(`document.getElementById('sounds').click()`);
  await until(`window.fixture.sounds===false && !document.getElementById('sounds').disabled`);
  await until(`document.getElementById('sound-state').textContent==='Off'`);
  await evaluate(`window.fixture.sound_volume=50; const oldInvoke=window.__TAURI_INTERNALS__.invoke; window.__TAURI_INTERNALS__.invoke=async(command,args)=>{ if(command==='set_sound_volume') window.fixture.sound_volume=args.volume; return oldInvoke(command,args); };`);
  await until(`document.getElementById('volume-percent').textContent==='50%'`);
  await evaluate(`const slider=document.getElementById('sound-volume'); for(let n=51;n<=70;n++){slider.value=String(n); slider.dispatchEvent(new Event('input'));}`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='set_sound_volume').length`), 0, 'Dragging never sends IPC');
  assert.equal(await evaluate(`document.getElementById('volume-percent').textContent`), '70%');
  await evaluate(`document.getElementById('sound-volume').dispatchEvent(new Event('change'))`);
  await until(`window.fixture.sound_volume===70 && !document.getElementById('sound-volume').disabled`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='set_sound_volume').length`), 1, 'One commit on release');
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
  await evaluate(`document.querySelector('.setup-details').open=true`);
  assert.equal(await evaluate(`document.querySelectorAll('.setup-details ol li').length`), 4, 'First-dictation helper is a short ordered checklist');
  await evaluate(`document.querySelector('.setup-details').open=false;window.fixture.phase='processing';window.fixture.message='Loading local model… Escape cancels.'`);
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
  assert.equal(await evaluate(`document.getElementById('transcript').innerHTML`), '&lt;script&gt;unsafe&lt;/script&gt; &amp; a thought');
  await evaluate(`document.getElementById('copy').click()`);
  await until(`document.getElementById('feedback').textContent.startsWith('Copied.')`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='copy_transcript').length`), 1);
  await evaluate(`window.fixture.phase='copied'; window.fixture.message='Copied. Automatic paste skipped: Not pasted [start:no-original-focus].';`);
  await until(`document.getElementById('phase').textContent==='Copied' && document.getElementById('dot').className==='copied'`);
  assert.equal(await evaluate(`document.getElementById('cancel').hidden && !document.getElementById('copy').disabled && !document.getElementById('preview-sound').disabled && !document.getElementById('record-shortcut').disabled`), true, 'Copied fallback is ready, not an error or busy state');
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('dot')).backgroundColor`), 'rgb(112, 107, 104)', 'Normal fallback is graphite; muted red is reserved for recording/active controls');
  assert.match(await evaluate(`document.getElementById('message').textContent`), /start:no-original-focus/);
  await evaluate(`document.getElementById('nav-settings').click();document.querySelector('.sound-options').open=false;document.getElementById('feedback').hidden=true;window.fixture.message='Select a text field and press Fn.'`);
  await until(`document.getElementById('message').textContent==='Select a text field and press Fn.'`);
  assert.equal(await evaluate(`document.querySelector('footer').getBoundingClientRect().bottom<=innerHeight`), true, `Ready settings fit the normal window: ${JSON.stringify(await evaluate(`Array.from(document.querySelectorAll('aside,header,.settings-intro,#settings .card,.local-data,.status,footer')).map(e=>({name:e.className||e.tagName,height:e.getBoundingClientRect().height,bottom:e.getBoundingClientRect().bottom}))`))}`);
  await evaluate(`window.fixture.phase='idle'`);
  await evaluate(`window.fixture.transcript='A little less typing. A little more room to think.'; document.getElementById('feedback').hidden=true;`);
  await until(`document.getElementById('transcript').textContent.startsWith('A little less')`);
  for (const theme of ['light','dark']) {
    await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-color-scheme',value:theme}]});
    assert.deepEqual(await evaluate(`({scheme:getComputedStyle(document.documentElement).colorScheme,bg:getComputedStyle(document.documentElement).backgroundColor,text:getComputedStyle(document.documentElement).color})`), {scheme:'light',bg:'rgb(247, 246, 243)',text:'rgb(48, 46, 45)'}, 'The app stays intentionally light even on a dark system');
    await evaluate(`document.getElementById('feedback').hidden=false;document.getElementById('feedback').textContent='Could not save. Try again.'`);
    assert.deepEqual(await evaluate(`({bg:getComputedStyle(document.getElementById('feedback')).backgroundColor,text:getComputedStyle(document.getElementById('feedback')).color})`), {bg:'rgb(250, 240, 223)',text:'rgb(48, 46, 45)'}, 'Warning feedback has dark readable text in either system mode');
    await evaluate(`document.getElementById('feedback').hidden=true`);
    for (const width of [320, 390, 400, 560, 740, 980, 1280]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 820, deviceScaleFactor: 1, mobile: false });
      for (const tab of ['overview','settings']) {
        await evaluate(`document.getElementById('nav-${tab}').click();document.querySelector('.setup-details').open=${tab === 'settings'}`);
        assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`), true, `No horizontal overflow at ${width}px, ${theme}, ${tab}`);
        assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('button, select, input')).filter(e=>e.getClientRects().length && (e.getBoundingClientRect().right>innerWidth || e.getBoundingClientRect().left<0)).map(e=>e.id)`), [], 'All controls fit');
      }
      await evaluate(`document.getElementById('change-shortcut').click();document.querySelector('#shortcut-dialog details').open=true`);
      assert.equal(await evaluate(`document.getElementById('shortcut-dialog').scrollWidth<=document.getElementById('shortcut-dialog').clientWidth`), true, `Shortcut dialog fits ${width}px, ${theme}`);
      await evaluate(`document.getElementById('close-shortcut').click()`);
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
        const text=document.querySelector('.status>div').getBoundingClientRect();
        const cancel=document.getElementById('cancel').getBoundingClientRect();
        return {fits:document.documentElement.scrollWidth<=innerWidth,
          aligned:dot.top>=title.top && dot.bottom<=title.bottom,
          wraps:document.getElementById('message').scrollWidth<=text.width+1,
          separated:!cancel.width || cancel.top>=text.bottom || cancel.left>=text.right,
          label:document.getElementById('phase').textContent};
      })()`);
      assert.ok(geometry.fits && geometry.aligned && geometry.wraps && geometry.separated, `${phase} status fits and aligns at ${width}px: ${JSON.stringify(geometry)}`);
      if (phase==='idle') assert.equal(geometry.label,'Ready');
    }
  }
  console.log('UI smoke passed: recording limit save/rollback/refresh, compact ready settings, missing setup/download progress, shortcut dialog focus/Escape/timeout/presets/validation/save failure, single cue without selector/autoplay, toggle/volume/idle-only preview, reset, counts, safe transcript/copy, light/dark responsive layout. No microphone capture or screenshots.');
} finally {
  socket?.close();
  browser.kill('SIGTERM');
  await new Promise(resolve => browser.once('exit', resolve));
  rmSync(profile, { recursive: true, force: true });
}
