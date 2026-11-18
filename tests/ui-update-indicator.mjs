import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installPracticeFixture } from './ui-practice-events.mjs';

// Mock IPC only: never contacts the real feed, installs or relaunches the app.
export async function checkUpdateIndicator({send,evaluate,until,port}) {
  const fixture = await evaluate(`Boolean(window.listeners)`)
    ? undefined : await installPracticeFixture({send,evaluate});
  try {
  const screenshot = async name => {
    if (!process.env.UI_SCREENSHOTS) return;
    mkdirSync(process.env.UI_SCREENSHOTS,{recursive:true});
    const image = await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(join(process.env.UI_SCREENSHOTS,`inline-update-${name}.png`),Buffer.from(image.data,'base64'));
  };
  await send('Page.navigate',{url:`http://127.0.0.1:${port}`});
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride',{width:980,height:820,deviceScaleFactor:1,mobile:false});
  await until(`window.fixture && document.getElementById('updates-open') && !document.getElementById('updates-open').hidden`);
  await evaluate(`window.visibleUpdateState={installed_version:'0.1.1-beta.20',phase:'idle',notes:'',downloaded_bytes:0,message:'Choose Check for updates.'};window.nextUpdateVersion='0.1.1-beta.21';const inlineInvoke=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(command,args)=>{if(['update_status','check_for_updates','install_update'].includes(command)){window.calls.push({command,args});if(command==='check_for_updates'){if(window.waitUpdateCheck)await window.waitUpdateCheck;window.visibleUpdateState={...window.visibleUpdateState,phase:'available',available_version:window.nextUpdateVersion,notes:'<img src=x onerror="window.updateInjected=true">',message:'Update available.'};}if(command==='install_update'){if(window.waitInstall)await window.waitInstall;window.visibleUpdateState={...window.visibleUpdateState,phase:'error',available_version:undefined,message:'Signature verification failed. Check again.'};}return structuredClone(window.visibleUpdateState);}return inlineInvoke(command,args);};`);
  await until(`document.getElementById('updates-indicator-detail').textContent==='Not checked'`);
  const footerLayout = () => evaluate(`(() => {
    const footer = document.querySelector('footer').getBoundingClientRect();
    const main = document.querySelector('main').getBoundingClientRect();
    return [footer.top, footer.height, main.height];
  })()`);
  assert.equal(await evaluate(`window.calls.some(c=>c.command==='check_for_updates'||c.command==='install_update')`),false,'Idle observations never contact the feed or install');
  await evaluate(`document.getElementById('nav-settings').click()`);
  assert.equal(await evaluate(`document.querySelector('.setup-card').hidden`),true,'Ready setup is not repeated as an empty Settings section');
  await evaluate(`document.querySelector('main').scrollTop=document.querySelector('main').scrollHeight`);
  await screenshot('settings-ready');
  await evaluate(`document.querySelector('main').scrollTop=0`);
  await evaluate(`window.fixture.model_ready=false`);
  await until(`!document.querySelector('.setup-card').hidden`);
  await evaluate(`window.fixture.model_ready=true`);
  await until(`document.querySelector('.setup-card').hidden`);
  const idleLayout = await footerLayout();
  await evaluate(`window.waitUpdateCheck=new Promise(resolve=>window.finishUpdateCheck=resolve);document.getElementById('updates-open').focus();document.getElementById('updates-open').click();document.getElementById('updates-open').click()`);
  await until(`document.getElementById('updates-open').dataset.phase==='checking'`);
  assert.equal(await evaluate(`document.getElementById('updates-open').disabled && document.getElementById('updates-open').getAttribute('aria-busy')==='true' && document.querySelector('#updates-open > svg').dataset.glyph==='spinner' && getComputedStyle(document.querySelector('#updates-open > svg')).animationName==='update-spin' && !document.querySelector('dialog[open]')`),true,'Checking animates the accessible busy spinner inline, without opening a modal');
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='check_for_updates').length`),1,'Repeated check clicks are suppressed');
  await evaluate(`window.finishUpdateCheck();window.waitUpdateCheck=undefined`);
  await until(`document.getElementById('updates-indicator-label').textContent==='Download & update' && !document.getElementById('updates-open').disabled`);
  assert.equal(await evaluate(`document.activeElement.id`),'updates-open','Keyboard focus stays on the inline action after the check, without a modal');
  assert.equal(await evaluate(`document.getElementById('updates-indicator-detail').textContent`),'0.1.1-beta.21','The action exposes its exact version');
  assert.deepEqual(await footerLayout(), idleLayout, 'An update offer does not lift the footer or resize the main pane');
  assert.match(await evaluate(`document.getElementById('updates-open').getAttribute('aria-label')`), /install and reopen HandsFree/);
  assert.equal(await evaluate(`(()=>{const b=document.getElementById('updates-open'),a=b.getBoundingClientRect();return ['updates-indicator-label','updates-indicator-detail'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>1 && r.height>1 && r.left>=a.left && r.right<=a.right && r.bottom<=a.bottom;});})()`),true,'The exact offer and action are visible before consent');
  assert.equal(await evaluate(`document.getElementById('updates-open').getAttribute('aria-busy')==='false' && document.querySelector('#updates-open > svg').dataset.glyph==='download' && getComputedStyle(document.querySelector('#updates-open > svg')).animationName==='none'`),true,'Available offer has a static download icon, never an idle loader');
  await screenshot('available');
  assert.equal(await evaluate(`!window.updateInjected && !document.querySelector('#updates-dialog,#update-confirm-dialog') && !window.calls.some(c=>c.command==='install_update')`),true,'The check result is not consent and cannot inject notes or open update modals');
  // A changed feed must not silently turn a click for beta21 into beta22 consent.
  await evaluate(`window.nextUpdateVersion='0.1.1-beta.22';document.getElementById('updates-open').click()`);
  await until(`document.getElementById('updates-indicator-detail').textContent==='0.1.1-beta.22' && !document.getElementById('updates-open').disabled`);
  assert.equal(await evaluate(`window.calls.some(c=>c.command==='install_update')`),false,'A changed offer needs a new click for that version');
  await evaluate(`window.fixture.phase='recording'`);
  await until(`document.getElementById('updates-open').disabled`);
  await evaluate(`window.fixture.phase='idle'`);
  await until(`!document.getElementById('updates-open').disabled`);
  // Navigation revokes a pending download intent before archive bytes.
  await evaluate(`window.waitUpdateCheck=new Promise(resolve=>window.finishUpdateCheck=resolve);document.getElementById('updates-open').click();document.getElementById('home-back').click();window.finishUpdateCheck();window.waitUpdateCheck=undefined`);
  await until(`!document.getElementById('updates-open').disabled`);
  assert.equal(await evaluate(`window.calls.some(c=>c.command==='install_update')`),false,'Navigating during preparation revokes the click, not the fresh offer');
  await evaluate(`document.getElementById('practice-text').value='Private draft before update';document.getElementById('practice-text').dispatchEvent(new Event('input'));window.waitInstall=new Promise(resolve=>window.finishInstall=resolve);document.getElementById('updates-open').click();document.getElementById('updates-open').click()`);
  await until(`window.calls.filter(c=>c.command==='install_update').length===1`);
  assert.equal(await evaluate(`window.context===0 && document.getElementById('practice-text').value==='' && document.getElementById('input-level').value===0`),true,'Installation revokes Home eligibility and clears private draft and meter');
  assert.deepEqual(await evaluate(`window.calls.filter(c=>c.command==='install_update').map(c=>c.args)`),[{version:'0.1.1-beta.22'}],'One explicit click dispatches only the freshly revalidated displayed version');
  await evaluate(`window.visibleUpdateState={...window.visibleUpdateState,phase:'downloading',downloaded_bytes:50,total_bytes:100}`);
  await until(`document.getElementById('updates-indicator-detail').textContent.includes('50%')`);
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('updates-open')).opacity`),'1','Busy progress stays readable rather than fading with disabled controls');
  await screenshot('downloading');
  assert.equal(await evaluate(`document.getElementById('updates-open').disabled && !document.querySelector('dialog[open]')`),true,'Byte progress stays inline and cannot start a duplicate install');
  await evaluate(`window.visibleUpdateState={...window.visibleUpdateState,phase:'installing'}`);
  await until(`document.getElementById('updates-open').dataset.phase==='installing'`);
  await evaluate(`window.visibleUpdateState={...window.visibleUpdateState,phase:'downloading',downloaded_bytes:75}`);
  assert.equal(await evaluate(`document.getElementById('updates-open').disabled`),true,'Delayed progress never re-enables installation');
  await evaluate(`window.finishInstall();window.waitInstall=undefined`);
  await until(`document.getElementById('updates-feedback').textContent.includes('Signature verification failed') && !document.getElementById('updates-open').disabled`);
  await screenshot('error');
  await evaluate(`document.getElementById('updates-open').click()`);
  await until(`document.getElementById('updates-open').dataset.attention==='available'`);
  assert.equal(await evaluate(`document.getElementById('updates-feedback').hidden`),true,'An explicit retry retires the previous error without another modal');
  const checks=await evaluate(`window.calls.filter(c=>c.command==='check_for_updates').length`);
  for (const [width,height] of [[980,820],[560,650],[320,650]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate(`window.visibleUpdateState={...window.visibleUpdateState,phase:'idle',available_version:undefined}`);
    await until(`document.getElementById('updates-open').dataset.phase==='idle'`);
    const baseline = await footerLayout();
    for (const phase of ['checking','available','downloading','installing','error','up_to_date','idle']) {
      await evaluate(`window.visibleUpdateState={...window.visibleUpdateState,phase:'${phase}',available_version:'0.1.1-beta.123456789012345678901234567890',message:'${phase==='error'?'Network unavailable. '.repeat(20):phase}',downloaded_bytes:50,total_bytes:100}`);
      await until(`document.getElementById('updates-open').dataset.phase==='${phase}'`);
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth && document.getElementById('updates-open').scrollWidth<=document.getElementById('updates-open').clientWidth`),true,`${width}px ${phase}: update action and errors fit inline`);
      if (phase !== 'error') assert.deepEqual(await footerLayout(), baseline, `${width}px ${phase}: footer stays at its idle position`);
      assert.equal(await evaluate(`!document.querySelector('dialog[open]')`),true,'No update phase opens a modal');
    }
  }
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='check_for_updates').length`),checks,'Progress/status reads never issue unsolicited feed checks');
  await send('Emulation.setDeviceMetricsOverride',{width:980,height:820,deviceScaleFactor:1,mobile:false});
  } finally {
    if (fixture) await send('Page.removeScriptToEvaluateOnNewDocument', {identifier:fixture.identifier});
  }
}
