import assert from 'node:assert/strict';

export async function checkCompactControls({send,evaluate,until,port}) {
  await send('Page.navigate',{url:`http://127.0.0.1:${port}`});
  await send('Page.bringToFront');
  await until(`document.getElementById('phase')?.textContent==='Ready'`);
  await evaluate(`window.fixture.shortcut_label='Fn';window.fixture.shortcut={code:'Fn',modifiers:0}`);
  await until(`document.getElementById('overview-shortcut').textContent==='Fn'`);
  await until(`document.getElementById('microphone-choice').options.length>=3`);
  await evaluate(`window.compactRealOptions=document.getElementById('microphone-choice').innerHTML`);
  for (const theme of ['light','dark']) {
    await evaluate(`window.fixture.appearance='${theme}'`);
    await until(`document.documentElement.dataset.appearance==='${theme}'`);
    assert.equal(await evaluate(`(()=>{const p=document.createElement('span');p.style.color='var(--accent)';document.body.append(p);const c=getComputedStyle(p).color;p.remove();return getComputedStyle(document.getElementById('overview-shortcut')).color===c && getComputedStyle(document.getElementById('saved-shortcut')).color===c;})()`),true,'Configured shortcut is red without replacing its key box');
    for (const [width,height] of [[980,820],[980,600],[560,650],[320,650]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await evaluate(`document.getElementById('nav-settings').click()`);
      await until(`!document.getElementById('microphone-choice').disabled`);
      await evaluate(`for(const id of ['microphone-choice','excluded-app-choice']){const s=document.getElementById(id);s.replaceChildren(new Option('System default · MacBook Air Microphone with an extremely long device label '.repeat(5),''));}`);
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth && document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth`),true,`${width}/${theme}: actual inner Settings scroller has no horizontal overflow`);
      assert.equal(await evaluate(`['microphone-refresh','excluded-app-refresh','excluded-app-add','reset','workflow-pause'].every(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return e.querySelector('svg') && e.getAttribute('aria-label') && !e.textContent.trim() && r.height===32 && r.width===32;})`),true,'Utility actions are compact accessible icons, not fat labeled pills');
      await evaluate(`document.getElementById('product-status').click()`);
      await until(`document.getElementById('health-dialog').open`);
      assert.equal(await evaluate(`(()=>{const row=document.getElementById('health-input'),s=document.getElementById('health-microphone').getBoundingClientRect(),b=document.getElementById('health-microphone-refresh').getBoundingClientRect();return row.parentElement.classList.contains('health-checks') && Math.abs(s.top-b.top)<1 && s.height===32 && b.width===32 && document.getElementById('health-microphone-refresh').querySelector('svg') && !document.getElementById('health-microphone-refresh').textContent.trim();})()`),true,'Microphone selection and refresh fit one normal status checklist row');
      assert.equal(await evaluate(`document.getElementById('health-dialog').scrollWidth<=document.getElementById('health-dialog').clientWidth`),true,'Status controls fit without horizontal scrolling');
      await evaluate(`document.getElementById('health-close').click()`);
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:980,height:820,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.getElementById('nav-practice-page').click()`);
  await until(`window.context>0`);
  assert.equal(await evaluate(`!document.getElementById('practice-setup') && document.getElementById('nav-settings').getClientRects().length>0`),true,'Practice has no redundant Settings button');
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('practice-shortcut')).color===getComputedStyle(document.getElementById('overview-shortcut')).color`),true,'Practice uses the same red configured shortcut key');
  await evaluate(`window.fixture.shortcut_label='Control + Shift + J'`);
  await until(`document.getElementById('practice-shortcut').textContent==='Control + Shift + J'`);
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('practice-shortcut')).color===getComputedStyle(document.getElementById('overview-shortcut')).color`),true,'Red shortcut styling follows custom combinations, not hardcoded Fn');
  await evaluate(`window.fixture.microphone_uid=null;document.getElementById('microphone-choice').innerHTML=window.compactRealOptions;document.getElementById('nav-settings').click();document.getElementById('microphone-refresh').click()`);
  await until(`document.getElementById('microphone-choice').options.length>=3 && !document.getElementById('microphone-choice').disabled`);
  await evaluate(`window.compactKeys=[];window.compactKeyWrites=window.calls.filter(c=>c.command==='set_microphone').length;document.getElementById('microphone-choice').value='';document.getElementById('microphone-choice').focus();document.getElementById('microphone-choice').addEventListener('keydown',e=>window.compactKeys.push([e.key,e.isTrusted,e.defaultPrevented,document.hasFocus()]));`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:49,text:' '});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:49});
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40,nativeVirtualKeyCode:125});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40,nativeVirtualKeyCode:125});
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:36,text:'\r'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:36});
  assert.equal(await evaluate(`window.compactKeys.length===3 && window.compactKeys.every(k=>k[1]&&!k[2]&&k[3])`),true,'Focused select receives trusted keyboard input without app interception');
  // Headless macOS Chromium does not drive the system popup's option selection.
  // Exercise the production change handler separately; do not claim native-popup
  // selection acceptance from a DOM event.
  await evaluate(`document.getElementById('microphone-choice').value='built-in';document.getElementById('microphone-choice').dispatchEvent(new Event('change',{bubbles:true}))`);
  await until(`window.calls.filter(c=>c.command==='set_microphone').length>window.compactKeyWrites`);
  await until(`!document.getElementById('microphone-choice').disabled`);
  assert.equal(await evaluate(`document.getElementById('microphone-choice').value===document.getElementById('health-microphone').value && window.fixture.microphone_uid===window.calls.filter(c=>c.command==='set_microphone').at(-1).args.uid`),true,'Compact selects retain the shared guarded preference transaction');
}
