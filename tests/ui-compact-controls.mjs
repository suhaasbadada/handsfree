import assert from 'node:assert/strict';

export async function checkCompactControls({send,evaluate,until,port}) {
  await send('Page.navigate',{url:`http://127.0.0.1:${port}`});
  await send('Page.bringToFront');
  await until(`document.getElementById('phase')?.textContent==='Ready'`);
  await evaluate(`window.fixture.shortcut_label='Fn';window.fixture.shortcut={code:'Fn',modifiers:0}`);
  await until(`document.getElementById('practice-shortcut').textContent==='Fn'`);
  await until(`document.getElementById('microphone-choice').options.length>=3`);
  await evaluate(`window.compactRealOptions=document.getElementById('microphone-choice').innerHTML`);
  for (const theme of ['light','dark']) {
    await evaluate(`window.fixture.appearance='${theme}'`);
    await until(`document.documentElement.dataset.appearance==='${theme}'`);
    assert.equal(await evaluate(`(()=>{const p=document.createElement('span');p.style.color='var(--accent)';document.body.append(p);const c=getComputedStyle(p).color;p.remove();return getComputedStyle(document.getElementById('practice-shortcut')).color===c && getComputedStyle(document.getElementById('saved-shortcut')).color===c;})()`),true,'Configured shortcut is red without replacing its key box');
    for (const [width,height] of [[1200,820],[980,820],[980,600],[560,650],[320,650]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate(`(()=>{const header=document.querySelector('.product-header'),footer=document.querySelector('footer'),a=header.getBoundingClientRect(),b=footer.getBoundingClientRect();return getComputedStyle(header).borderBottomWidth==='1px' && getComputedStyle(footer).borderTopWidth==='1px' && Math.abs(a.left-b.left)<1 && Math.abs(a.right-b.right)<1;})()`),true,`${width}/${theme}: header and footer divider endpoints match`);
      await evaluate(`document.getElementById('nav-settings').click()`);
      await until(`!document.getElementById('microphone-choice').disabled`);
      assert.equal(await evaluate(`['recording-limit','sound-style','microphone-choice'].every(id=>{const s=document.getElementById(id),r=s.getBoundingClientRect(),a=s.parentElement.querySelector('svg').getBoundingClientRect(),c=document.createElement('canvas').getContext('2d');c.font=getComputedStyle(s).font;const text=c.measureText(s.selectedOptions[0].textContent).width;return Math.abs(a.top+a.height/2-r.top-r.height/2)<1 && r.width-text<=42 && r.width>=32;})`),true,`${width}/${theme}: chevrons stay centered without excessive reserved width`);
      assert.equal(await evaluate(`(()=>{const footer=document.querySelector('footer'), action=document.getElementById('updates-open'), bounds=action.getBoundingClientRect();return bounds.width>=30 && bounds.width<=40 && Math.abs(bounds.right-footer.getBoundingClientRect().right)<1 && document.getElementById('repository-link').href==='https://github.com/suhaasbadada/handsfree';})()`),true,`${width}/${theme}: compact updater at the trailing edge and correct repository destination`);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('main')).scrollbarWidth==='none' && getComputedStyle(document.querySelector('main')).overflowY===(innerWidth<480?'visible':'auto')`),true,'Remove the inset Settings scrollbar rail, not scrollability');
      await evaluate(`for(const id of ['microphone-choice','excluded-app-choice']){const s=document.getElementById(id);s.replaceChildren(new Option('System default · MacBook Air Microphone with an extremely long device label '.repeat(5),''));}`);
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth && document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth`),true,`${width}/${theme}: actual inner Settings scroller has no horizontal overflow`);
      assert.equal(await evaluate(`['microphone-refresh','excluded-app-refresh','workflow-pause'].every(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return e.querySelector('svg') && e.getAttribute('aria-label') && !e.textContent.trim() && r.height===32 && r.width===32;})`),true,'Utility actions remain compact accessible icons');
      assert.equal(await evaluate(`document.getElementById('excluded-app-add').textContent==='Add' && [...document.querySelectorAll('#recording-mode label')].every(label=>label.getBoundingClientRect().right<=innerWidth)`),true,'Named Add and recording mode choices fit');
      assert.equal(await evaluate(`!document.querySelector('#recording-mode svg') && [...document.querySelectorAll('#recording-mode label > span')].map(e=>e.textContent).join('|')==='Toggle|Push to Talk' && getComputedStyle(document.querySelector('#recording-mode input:checked + span')).borderColor!==getComputedStyle(document.querySelector('#recording-mode input:not(:checked) + span')).borderColor`),true,'Mode choices show only their labels with a highlighted selected radio');
      assert.equal(await evaluate(`document.getElementById('reset').textContent==='Delete data' && !document.getElementById('privacy-detail') && getComputedStyle(document.getElementById('data-title')).font===getComputedStyle(document.getElementById('appearance-title')).font`),true,'Usage totals matches nearby Settings labels and has a scoped text action');
      await evaluate(`document.getElementById('product-status').click()`);
      await until(`document.getElementById('health-dialog').open`);
      assert.equal(await evaluate(`(()=>{const row=document.getElementById('health-input'),s=document.getElementById('health-microphone').getBoundingClientRect(),b=document.getElementById('health-microphone-refresh').getBoundingClientRect();return row.parentElement.classList.contains('health-checks') && Math.abs(s.top-b.top)<1 && s.height===32 && b.width===32 && document.getElementById('health-microphone-refresh').querySelector('svg') && !document.getElementById('health-microphone-refresh').textContent.trim();})()`),true,'Microphone selection and refresh fit one normal status checklist row');
      assert.equal(await evaluate(`document.getElementById('health-dialog').scrollWidth<=document.getElementById('health-dialog').clientWidth`),true,'Status controls fit without horizontal scrolling');
      await evaluate(`document.getElementById('health-close').click()`);
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:980,height:820,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.getElementById('home-back').click()`);
  await until(`window.context>0`);
  assert.equal(await evaluate(`!document.getElementById('practice-setup') && document.getElementById('nav-settings').getClientRects().length>0`),true,'Practice has no redundant Settings button');
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('practice-shortcut')).color===getComputedStyle(document.getElementById('saved-shortcut')).color`),true,'Home and Settings share the red configured shortcut key');
  await evaluate(`window.fixture.shortcut_label='Control + Shift + J'`);
  await until(`document.getElementById('practice-shortcut').textContent==='Control + Shift + J'`);
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('practice-shortcut')).color===getComputedStyle(document.getElementById('saved-shortcut')).color`),true,'Red shortcut styling follows custom combinations, not hardcoded Fn');
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
