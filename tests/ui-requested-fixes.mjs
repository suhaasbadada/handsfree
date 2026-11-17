import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function checkRequestedFixes({send,evaluate,until,port}) {
  await send('Page.navigate',{url:`http://127.0.0.1:${port}`});
  await send('Page.bringToFront');
  await until(`window.fixture && document.getElementById('phase')?.textContent==='Ready'`);
  await send('Emulation.setDeviceMetricsOverride',{width:980,height:820,deviceScaleFactor:1,mobile:false});
  const shot = async name => {
    if (!process.env.UI_SCREENSHOTS) return;
    await evaluate(`Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished))`);
    mkdirSync(process.env.UI_SCREENSHOTS,{recursive:true});
    const image = await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(join(process.env.UI_SCREENSHOTS,`requested-${name}.png`),Buffer.from(image.data,'base64'));
  };
  for (const theme of ['light','dark']) {
    await evaluate(`window.fixture.appearance='${theme}';document.getElementById('nav-settings').click()`);
    await until(`document.documentElement.dataset.appearance==='${theme}'`);
    assert.equal(await evaluate(`!document.querySelector('#settings-started,#get-started')`),true,'Setup guide is removed, not another expandable recovery surface');
    assert.equal(await evaluate(`(()=>{const ids=['change-shortcut','recording-limit','sound-style','sound-volume','microphone-choice','recording-mode','appearance-choice','workflow-pause'];const rows=ids.map(id=>document.getElementById(id).getBoundingClientRect());return rows.every((r,i)=>!i||r.top>rows[i-1].top);})()`),true,'Settings priority is shortcut, time, sounds/volume, microphone, mode, appearance, general');
    assert.equal(await evaluate(`(()=>{const c=document.querySelector('.workflow-app-controls'),r=c.previousElementSibling;return c.querySelector('select').getBoundingClientRect().top-r.getBoundingClientRect().bottom>=12;})()`),true,'App picker does not sit on the row divider');
    for (const phase of ['error','not_pasted','setup_required']) {
      await evaluate(`window.fixture.phase='${phase}';window.fixture.message='Microphone capture failed. Please check your input device.'`);
      await until(`!document.getElementById('preview-sound').disabled`);
      const before = await evaluate(`window.calls.filter(c=>c.command==='preview_sound').length`);
      await evaluate(`document.getElementById('preview-sound').click()`);
      await until(`window.calls.filter(c=>c.command==='preview_sound').length===${before+1}`);
      await until(`!document.getElementById('preview-sound').disabled`);
      assert.equal(await evaluate(`window.fixture.phase`),phase,'Preview does not clear the existing failure/result state');
    }
    await shot(`${theme}-settings`);
    await evaluate(`window.fixture.phase='idle';window.fixture.message=''`);
    await until(`document.getElementById('phase').textContent==='Ready'`);
    await evaluate(`document.getElementById('home-back').focus();document.getElementById('home-back').click()`);
    await until(`window.context>0 && !document.getElementById('practice-start').disabled`);
    const bounds = await evaluate(`(()=>{const r=document.getElementById('practice-text').getBoundingClientRect();return [r.x,r.y,r.width,r.height];})()`);
    const bars = () => evaluate(`Array.from(document.querySelectorAll('#practice-waveform span'),e=>parseFloat(e.style.height))`);
    assert.deepEqual(await bars(),Array(9).fill(3),'Idle waveform is quiet, not fake speech');
    await shot(`${theme}-practice-idle`);
    await evaluate(`window.practiceResult={phase:'recording',text:'',audio_ready:true,input_level:0.75,elapsed_seconds:2,limit_seconds:120};document.getElementById('practice-start').click()`);
    await until(`document.getElementById('input-level').value===0.75`);
    assert.ok(Math.max(...await bars())>19,'Waveform uses the native input-level observation');
    await shot(`${theme}-practice-recording`);
    assert.deepEqual(await evaluate(`(()=>{const r=document.getElementById('practice-text').getBoundingClientRect();return [r.x,r.y,r.width,r.height];})()`),bounds,'Live waveform does not move the editor');
    await evaluate(`window.practiceResult={phase:'recording',text:'',audio_ready:false,input_level:0.9}`);
    await until(`document.getElementById('practice-waveform').dataset.active==='false'`);
    assert.deepEqual(await bars(),Array(9).fill(3),'Unready or stale input cannot animate the waveform');
    await evaluate(`document.getElementById('practice-cancel').click()`);
    await until(`!document.getElementById('practice-start').disabled`);
    assert.deepEqual(await bars(),Array(9).fill(3),'Cancelled input leaves a quiet waveform');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#practice-waveform span')).transitionDuration`),'0s','Reduced motion disables waveform transitions');
    await send('Emulation.setEmulatedMedia',{features:[]});
    await evaluate(`window.fixture.phase='error';window.fixture.message='Microphone capture failed. Please check your input device.'`);
    await until(`!document.getElementById('message-recovery').hidden`);
    assert.equal(await evaluate(`(()=>{const c=document.getElementById('practice'),r=document.getElementById('message-recovery'),m=document.getElementById('message');return r.getBoundingClientRect().top>c.getBoundingClientRect().bottom && m.getBoundingClientRect().right<r.getBoundingClientRect().left;})()`),true,'Home editor and recovery remain separate and aligned');
    await shot(`${theme}-overview-error`);
    await evaluate(`window.fixture.phase='idle';window.fixture.message=''`);
    await until(`document.getElementById('phase').textContent==='Ready'`);
  }
  await evaluate(`delete window.fixture.appearance`);
}
