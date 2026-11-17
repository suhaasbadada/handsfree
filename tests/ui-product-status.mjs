import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function checkProductStatus({send,evaluate,until,port}) {
  await send('Page.navigate',{url:`http://127.0.0.1:${port}`});
  await send('Page.bringToFront');
  await until(`window.fixture && document.getElementById('phase')?.textContent==='Ready'`);
  for (const theme of ['light','dark','system']) {
    await evaluate(`window.fixture.appearance='${theme}'`);
    await until(`document.documentElement.dataset.appearance==='${theme}'`);
    assert.equal(await evaluate(`getComputedStyle(document.getElementById('dot')).backgroundColor`),'rgb(38, 133, 68)',`${theme}: true Ready is green`);
    await evaluate(`window.fixture.microphone=false`);
    await until(`document.getElementById('dot').className==='error'`);
    assert.equal(await evaluate(`(()=>{const p=document.createElement('span');p.style.color='var(--danger)';document.body.append(p);const red=getComputedStyle(p).color;p.remove();return getComputedStyle(document.getElementById('dot')).backgroundColor===red;})()`),true,`${theme}: missing native requirements are red`);
    await evaluate(`window.fixture.microphone=true;window.fixture.phase='error';window.fixture.message='Capture failed.'`);
    await until(`document.getElementById('phase').textContent==='Needs attention'`);
    assert.equal(await evaluate(`document.getElementById('dot').className==='error'`),true,'Permission-ready capture errors are not relabeled green');
    await evaluate(`window.fixture.phase='idle';window.fixture.message=''`);
    await until(`document.getElementById('phase').textContent==='Ready'`);
  }
  await evaluate(`window.fixture.persistence_error='Could not save local changes.'`);
  await until(`document.getElementById('phase').textContent==='Needs attention' && document.getElementById('dot').className==='error'`);
  await evaluate(`document.getElementById('product-status').click()`);
  assert.match(await evaluate(`document.getElementById('health-summary').textContent`),/Settings or usage couldn’t be saved/,'A storage failure is broken health even when capture prerequisites are ready');
  await evaluate(`document.getElementById('health-close').click();window.fixture.persistence_error=''`);
  await until(`document.getElementById('phase').textContent==='Ready'`);
  await evaluate(`window.healthInputInvoke=window.__TAURI_INTERNALS__.invoke;window.noDefaultInput=true;window.__TAURI_INTERNALS__.invoke=async(command,args)=>{const result=await window.healthInputInvoke(command,args);return command==='list_microphones' && window.noDefaultInput?{devices:[],default_uid:null}:result;};window.fixture.microphone_uid=null;document.getElementById('product-status').click()`);
  await until(`document.getElementById('phase').textContent==='Needs attention' && document.getElementById('health-practice').disabled`);
  assert.match(await evaluate(`document.getElementById('health-summary').textContent`),/Microphone unavailable/,'No actual system-default input is not green Ready or authorization to record');
  await evaluate(`window.noDefaultInput=false;document.getElementById('health-microphone-refresh').click()`);
  await until(`document.getElementById('phase').textContent==='Ready' && !document.getElementById('health-practice').disabled`);
  await evaluate(`document.getElementById('health-close').click();window.__TAURI_INTERNALS__.invoke=window.healthInputInvoke`);
  await evaluate(`window.fixture.phase='error';window.fixture.message='Microphone capture failed. Please check your input device.'`);
  await until(`document.getElementById('phase').textContent==='Needs attention'`);
  for (const [width,height] of [[980,820],[560,650],[320,650]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const geometry = await evaluate(`(()=>{const s=document.getElementById('product-status').getBoundingClientRect(),b=document.querySelector('.home-brand').getBoundingClientRect();return {top:s.top,right:s.right,left:s.left,brandRight:b.right};})()`);
    assert.ok(geometry.top<60 && geometry.right<=width && geometry.right>width/2 && geometry.left>geometry.brandRight,'Status is top-right, separate from branding');
    await evaluate(`document.getElementById('product-status').focus()`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await until(`document.getElementById('health-dialog').open`);
    assert.equal(await evaluate(`document.getElementById('health-summary').textContent`),'Microphone capture failed. Please check your input device.','Runtime failure is explained even with setup ready');
    assert.equal(await evaluate(`document.getElementById('health-mic-state').textContent`),'Allowed','Permission is not confused with actual capture');
    assert.equal(await evaluate(`document.getElementById('health-model-state').textContent`),'Ready offline');
    assert.equal(await evaluate(`document.getElementById('settings').hidden`),true,'Status explains the problem without navigating to Settings');
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('#health-dialog button,#health-dialog select')).filter(e=>e.getClientRects().length && (e.getBoundingClientRect().left<0 || e.getBoundingClientRect().right>innerWidth)).map(e=>e.id)`),[],'Direct recovery controls fit the window');
    if (process.env.UI_SCREENSHOTS) {
      mkdirSync(process.env.UI_SCREENSHOTS,{recursive:true});
      const image=await send('Page.captureScreenshot',{format:'png'});
      writeFileSync(join(process.env.UI_SCREENSHOTS,`product-status-${width}.png`),Buffer.from(image.data,'base64'));
    }
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until(`!document.getElementById('health-dialog').open && document.activeElement.id==='product-status'`);
  }
  assert.equal(await evaluate(`window.calls.some(c=>['practice_start','request_microphone','request_permissions','download_model','set_microphone'].includes(c.command))`),false,'Opening/closing status does not record, request access, download or change devices');
  await evaluate(`document.getElementById('product-status').click();Object.assign(window.fixture,{microphone:false,accessibility:false,model_ready:false,hotkey:false})`);
  await until(`!document.getElementById('health-mic').hidden && !document.getElementById('health-model').disabled`);
  await evaluate(`document.getElementById('health-mic').click()`);
  await until(`window.calls.some(c=>c.command==='request_microphone')`);
  await evaluate(`document.getElementById('health-permissions').click()`);
  await until(`window.calls.some(c=>c.command==='request_permissions')`);
  await until(`window.fixture.permission_requests===3`);
  assert.equal(await evaluate(`document.getElementById('settings').hidden && document.getElementById('health-dialog').open`),true,'Permission actions stay in the direct recovery panel');
  assert.match(await evaluate(`document.getElementById('health-hook-state').textContent`),/Disconnected.*Quit and reopen/,'Disconnected hooks get a concrete recovery instruction');
  await evaluate(`window.fixture.phase='recording';window.fixture.audio_ready=false`);
  await until(`document.getElementById('health-mic').disabled && document.getElementById('health-microphone').disabled`);
  assert.match(await evaluate(`document.getElementById('health-summary').textContent`),/Preparing/,'Starting is not listening');
  await evaluate(`Object.assign(window.fixture,{microphone:true,accessibility:true,model_ready:true,hotkey:true})`);
  await until(`document.getElementById('dot').className==='starting' && document.getElementById('phase').classList.contains('sr-only')`);
  assert.equal(await evaluate(`document.getElementById('phase').textContent==='Preparing microphone' && document.getElementById('message').textContent==='' && getComputedStyle(document.getElementById('dot')).backgroundColor==='rgba(0, 0, 0, 0)'`),true,'Pending capture is a quiet neutral indicator with an accessible description, not visible Starting copy or a false recording signal');
  await evaluate(`window.fixture.audio_ready=true`);
  await until(`document.getElementById('dot').className==='recording' && !document.getElementById('phase').classList.contains('sr-only')`);
  assert.equal(await evaluate(`document.getElementById('phase').textContent==='Listening'`),true,'Real audio readiness alone retires the startup indicator');
  await evaluate(`Object.assign(window.fixture,{phase:'idle',message:'',audio_ready:true,microphone:true,accessibility:true,model_ready:true,hotkey:true})`);
  await until(`!document.getElementById('health-practice').disabled`);
  await evaluate(`window.statusBeforeDevice=window.calls.filter(c=>c.command==='set_microphone').length;document.getElementById('health-microphone').value='';document.getElementById('health-microphone').dispatchEvent(new Event('change'))`);
  await until(`window.calls.filter(c=>c.command==='set_microphone').length===window.statusBeforeDevice+1 && !document.getElementById('health-microphone').disabled`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='set_microphone').at(-1).args.uid`),null,'Direct device picker shares the guarded native preference transaction');
  await evaluate(`window.healthInvoke=window.__TAURI_INTERNALS__.invoke;window.healthDisconnected=true;window.__TAURI_INTERNALS__.invoke=async(command,args)=>{if(command==='status'&&window.healthDisconnected)throw 'Backend unavailable';return window.healthInvoke(command,args)};document.getElementById('health-refresh').click()`);
  await until(`document.getElementById('phase').textContent==='Disconnected'`);
  assert.equal(await evaluate(`document.getElementById('health-mic-state').textContent==='Unknown' && document.getElementById('health-microphone').disabled`),true,'Disconnected status never retains a stale Ready proof or device authorization');
  await evaluate(`window.healthDisconnected=false;document.getElementById('health-refresh').click()`);
  await until(`document.getElementById('phase').textContent==='Ready' && !document.getElementById('health-practice').disabled`);
  assert.equal(await evaluate(`document.getElementById('health-error').hidden`),true,'Successful reconnect retires the obsolete connection failure');
  await evaluate(`document.getElementById('health-practice').click()`);
  await until(`!document.getElementById('home').hidden && window.context>0`);
  assert.equal(await evaluate(`window.calls.some(c=>c.command==='practice_start')`),false,'Opening the private test still requires explicit Start');
  await evaluate(`document.getElementById('product-status').click()`);
  await until(`window.context===0 && document.getElementById('practice-waveform').dataset.active==='false'`);
  await evaluate(`document.getElementById('health-close').click()`);
  await until(`window.context>0`);
  assert.equal(await evaluate(`window.calls.some(c=>c.command==='practice_start')`),false,'Status modal revokes Practice context and closing never restarts a recording');
}
