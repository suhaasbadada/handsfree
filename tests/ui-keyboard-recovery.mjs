import assert from 'node:assert/strict';

// Real key dispatch and Chromium's production-document AX tree; not a claim of
// macOS VoiceOver / WKWebView or ServiceManagement acceptance.
export async function checkKeyboardRecovery({send,evaluate,until,port}) {
  await send('Page.navigate', {url:`http://127.0.0.1:${port}`});
  await until(`window.context>0 && !document.getElementById('practice-start').disabled`);
  const key = async (key, modifiers=0) => {
    const codes = {Enter:13,' ':32,ArrowDown:40,ArrowUp:38,Home:36,End:35,Escape:27,Tab:9,PageDown:34};
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key===' '?'Space':key,windowsVirtualKeyCode:codes[key],modifiers,...(key==='Enter'?{text:'\r'}:key===' '?{text:' '}: {})});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key===' '?'Space':key,windowsVirtualKeyCode:codes[key],modifiers});
  };
  const focused = () => evaluate(`document.activeElement.id || document.activeElement.className`);
  const ax = await send('Accessibility.getFullAXTree');
  assert.ok(ax.nodes.some(n=>n.role?.value==='button' && n.name?.value==='HandsFree menu'));
  for (const opener of ['Enter',' ','ArrowDown']) {
    await evaluate(`window.keyTrace=[];if(!window.traceInstalled){window.traceInstalled=true;for(const type of ['focusin','focusout','click','keydown','keyup'])document.addEventListener(type,e=>window.keyTrace.push([e.type,e.target.id||e.target.className,e.key,e.relatedTarget?.id]),true);}`);
    await evaluate(`document.querySelector('.brand').focus()`); await key(opener);
    assert.equal(await focused(),'brand-overview',`${opener} opens at first item: ${JSON.stringify(await evaluate(`window.keyTrace`))}`);
    await evaluate(`document.getElementById('brand-started').disabled=true`);
    await key('ArrowDown'); assert.equal(await focused(),'brand-settings','Disabled item skipped');
    await key('End'); assert.equal(await focused(),'brand-updates');
    await key('Home'); assert.equal(await focused(),'brand-overview');
    await key('ArrowUp'); assert.equal(await focused(),'brand-updates');
    await key('Escape'); assert.equal(await focused(),'brand');
  }
  await key('Enter'); await key('Tab');
  assert.equal(await focused(),'nav-overview');
  assert.equal(await evaluate(`document.getElementById('brand-menu').hidden && window.context>0`),true,'Tab closes and restores eligible practice context');
  await evaluate(`document.querySelector('.brand').focus()`); await key('Enter'); await key('Tab',8);
  assert.equal(await evaluate(`document.getElementById('brand-menu').hidden && !document.activeElement.closest('#brand-menu')`),true,'Shift Tab exits composite');
  await evaluate(`document.querySelector('.brand').focus()`); await key('Enter');
  await evaluate(`document.getElementById('nav-settings').focus()`);
  assert.equal(await focused(),'nav-settings');
  assert.equal(await evaluate(`document.getElementById('brand-menu').hidden`),true,'Focusout does not steal focus');
  await evaluate(`document.querySelector('.brand').focus()`); await key('Enter'); await key('ArrowDown'); await key('Enter');
  assert.equal(await focused(),'settings-title');
  await evaluate(`document.querySelector('.brand').focus()`); await key('Enter'); await key('Enter');
  assert.equal(await focused(),'overview-title');

  await evaluate(`window.rejectStart='Selected microphone unavailable. Reconnect it or choose another microphone. '.repeat(80);document.getElementById('practice-start').click()`);
  await until(`!document.getElementById('practice-recovery').hidden`);
  await evaluate(`window.fixture.phase='error';window.fixture.message='Delivery failed. Check the original field; do not paste again blindly. '.repeat(80)`);
  await until(`!document.getElementById('message-recovery').hidden`);
  const errorAX = await send('Accessibility.getFullAXTree');
  for (const name of ['Practice status','Dictation status']) assert.ok(errorAX.nodes.some(n=>n.name?.value===name && !n.ignored),name);
  for (const id of ['practice-message','message']) {
    await evaluate(`document.getElementById('${id}').focus();window.statusMutations=0;window.statusObserver=new MutationObserver(()=>window.statusMutations++);window.statusObserver.observe(document.getElementById('${id}'),{childList:true,characterData:true,subtree:true});window.errorPositions=['practice','.activity','footer'].map(s=>{const r=document.querySelector(s==='practice'?'#practice':s).getBoundingClientRect();return [r.y+scrollY,r.height]})`);
    await key('ArrowDown'); await key('PageDown');
    await until(`document.getElementById('${id}').scrollTop>0`);
    await evaluate(`window.savedScroll=document.getElementById('${id}').scrollTop;window.pollCount=window.calls.filter(c=>c.command==='status').length`);
    await until(`window.calls.filter(c=>c.command==='status').length>window.pollCount+1`);
    assert.equal(await evaluate(`window.statusMutations===0 && document.getElementById('${id}').scrollTop>=window.savedScroll`),true,'Polling preserves text nodes and scroll');
    assert.deepEqual(await evaluate(`['#practice','.activity','footer'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.y+scrollY,r.height]})`),await evaluate(`window.errorPositions`),'Keyboard scrolling does not reflow reserved slots');
    await evaluate(`window.statusObserver.disconnect()`);
  }
  await evaluate(`document.getElementById('practice-recovery').click()`);
  assert.equal(await focused(),'microphone-choice','Explicit recovery uses existing picker');
  await evaluate(`window.fixture.phase='idle';window.fixture.message='';window.rejectStart='';document.getElementById('nav-overview').click()`);
  await until(`!document.getElementById('practice-message').textContent && document.getElementById('message').hidden`);
  assert.equal(await evaluate(`['practice-message','message'].every(id=>!document.getElementById(id).hasAttribute('tabindex'))`),true,'Empty reserved status is not a tab stop');

  await evaluate(`document.getElementById('nav-settings').click()`);
  await until(`!document.getElementById('launch-at-login').disabled`);
  await evaluate(`window.delayLogin=true;document.getElementById('launch-at-login').focus();document.getElementById('launch-at-login').click()`);
  await until(`typeof window.loginAck==='function'`);
  await evaluate(`window.loginAck()`);
  await until(`document.activeElement.id==='login-settings'`);
  await evaluate(`window.loginAck=null;document.getElementById('login-cancel').focus();document.getElementById('login-cancel').click()`);
  await until(`typeof window.loginAck==='function'`);
  await evaluate(`window.rejectLogin=true;window.loginAck()`);
  await until(`document.activeElement.id==='login-cancel' && !document.getElementById('login-cancel').disabled`);
  await evaluate(`window.rejectLogin=false;window.loginAck=null;document.getElementById('login-cancel').click()`);
  await until(`typeof window.loginAck==='function'`); await evaluate(`window.loginAck()`);
  await until(`document.activeElement.id==='launch-at-login' && !document.getElementById('launch-at-login').disabled`);
  await evaluate(`window.loginResult='enabled';window.loginAck=null;document.getElementById('launch-at-login').click()`);
  await until(`typeof window.loginAck==='function'`); await evaluate(`window.loginAck()`);
  await until(`document.getElementById('launch-at-login').checked && !document.getElementById('launch-at-login').disabled`);
  assert.equal(await focused(),'launch-at-login');
  await evaluate(`window.loginAck=null;document.getElementById('launch-at-login').click()`);
  await until(`typeof window.loginAck==='function'`);
  await evaluate(`document.getElementById('nav-overview').focus();document.getElementById('nav-overview').click();document.getElementById('nav-settings').click();window.loginAck()`);
  await until(`!document.getElementById('launch-at-login').disabled`);
  assert.equal(await focused(),'nav-overview','Navigating away and back revokes delayed focus ownership');

  await evaluate(`window.workflow.excluded_bundle_ids=['com.first','com.middle','com.last']`);
  await until(`document.querySelector('[aria-label="Remove com.middle"]')`);
  await evaluate(`window.delayExclusions=true;window.rejectExclusions=true;document.querySelector('[aria-label="Remove com.middle"]').focus();document.activeElement.click()`);
  await until(`typeof window.exclusionsAck==='function'`); await evaluate(`window.exclusionsAck()`);
  await until(`!document.querySelector('[aria-label="Remove com.middle"]').disabled`);
  assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'Remove com.middle','Failure restores initiating Remove');
  for (const [remove,next] of [['com.middle','Remove com.last'],['com.last','Remove com.first'],['com.first',null]]) {
    await evaluate(`window.rejectExclusions=false;window.exclusionsAck=null;document.querySelector('[aria-label="Remove ${remove}"]').focus();document.activeElement.click()`);
    await until(`typeof window.exclusionsAck==='function'`); await evaluate(`window.exclusionsAck()`);
    await until(`!document.querySelector('[aria-label="Remove ${remove}"]')`);
    assert.equal(await evaluate(next ? `document.activeElement.getAttribute('aria-label')` : `document.activeElement.id`),next ?? 'excluded-app-choice','Deletion focuses next, previous or picker');
  }
  await evaluate(`window.workflow.excluded_bundle_ids=['com.delayed']`);
  await until(`document.querySelector('[aria-label="Remove com.delayed"]')`);
  await evaluate(`window.exclusionsAck=null;document.querySelector('[aria-label="Remove com.delayed"]').focus();document.activeElement.click()`);
  await until(`typeof window.exclusionsAck==='function'`);
  await evaluate(`document.getElementById('recording-mode').focus();window.exclusionsAck()`);
  await until(`!document.querySelector('[aria-label="Remove com.delayed"]')`);
  assert.equal(await focused(),'recording-mode','Other interactions revoke removal focus ownership');
}
