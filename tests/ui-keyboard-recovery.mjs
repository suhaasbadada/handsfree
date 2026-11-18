import assert from 'node:assert/strict';

// Real key dispatch and Chromium's production-document AX tree; not a claim of
// macOS VoiceOver / WKWebView or ServiceManagement acceptance.
export async function checkKeyboardRecovery({send,evaluate,until,port}) {
  await send('Page.navigate', {url:`http://127.0.0.1:${port}`});
  await until(`Boolean(document.getElementById('home'))`);
  await until(`window.context>0 && !document.getElementById('practice-start').disabled`);
  const key = async (key, modifiers=0) => {
    const codes = {Enter:13,' ':32,ArrowDown:40,ArrowUp:38,Home:36,End:35,Escape:27,Tab:9,PageDown:34};
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key===' '?'Space':key,windowsVirtualKeyCode:codes[key],modifiers,...(key==='Enter'?{text:'\r'}:key===' '?{text:' '}: {})});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key===' '?'Space':key,windowsVirtualKeyCode:codes[key],modifiers});
  };
  const focused = () => evaluate(`document.activeElement.id || document.activeElement.className`);
  const ax = await send('Accessibility.getFullAXTree');
  assert.ok(ax.nodes.some(n=>n.role?.value==='button' && n.name?.value==='Settings'));
  assert.ok(!ax.nodes.some(n=>n.name?.value==='HandsFree menu'));
  for (const opener of ['Enter',' ']) {
    await evaluate(`document.getElementById('nav-settings').focus()`); await key(opener);
    assert.equal(await focused(),'settings-title');
    assert.equal(await evaluate(`window.context===0 && document.getElementById('home').hidden`),true,'Keyboard Settings revokes private context');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('#recording-mode input')].map(r=>r.value)`), ['toggle','push_to_talk']);
    for (const id of ['sound-style']) {
      await evaluate(`document.getElementById('${id}').focus()`);
      assert.equal(await focused(),id,'Native select is keyboard focusable');
      assert.equal(await evaluate(`(()=>{const e=document.getElementById('${id}'),s=getComputedStyle(e.parentElement.querySelector('svg'));return e.tagName==='SELECT' && s.display!=='none' && parseFloat(s.width)>=12 && s.pointerEvents==='none' && s.color===getComputedStyle(document.body).color;})()`),true,'Theme-safe visible chevron does not intercept native control');
    }
    await evaluate(`document.getElementById('product-status').click()`);
    await until(`document.getElementById('health-dialog').open`);
    await key('Escape');
    await until(`!document.getElementById('health-dialog').open && document.activeElement.id==='product-status'`);
    assert.equal(await evaluate(`document.getElementById('home').hidden`), true, 'Closing Product status must not leave Settings');
    await evaluate(`document.getElementById('change-shortcut').click()`);
    await until(`document.getElementById('change-shortcut').getAttribute('aria-pressed')==='true'`);
    await key('Escape');
    await until(`document.getElementById('change-shortcut').getAttribute('aria-pressed')==='false' && !document.getElementById('change-shortcut').disabled`);
    assert.equal(await evaluate(`document.getElementById('home').hidden`), true, 'Escape cancels recording a shortcut before navigating');
    await evaluate(`document.getElementById('home-back').focus()`); await key(opener === 'Enter' ? 'Escape' : opener);
    assert.equal(await focused(),'home-title','Back announces Home without unsolicited editor focus');
    assert.equal(await evaluate(`document.getElementById('practice-text').tabIndex`),0,'Home return must not remove the editor from sequential keyboard navigation');
    await until(`window.context>0`);
    assert.equal(await evaluate(`!window.calls.some(c=>c.command==='practice_start')`),true,'Home return only restores eligibility, never capture');
  }

  await evaluate(`window.rejectStart='Selected microphone unavailable. Reconnect it or choose another microphone. '.repeat(80);document.getElementById('practice-start').click()`);
  await until(`!document.getElementById('practice-recovery').hidden`);
  await evaluate(`window.fixture.phase='error';window.fixture.message='Delivery failed. Check the original field; do not paste again blindly. '.repeat(80)`);
  await until(`document.getElementById('dot').className==='error'`);
  const errorAX = await send('Accessibility.getFullAXTree');
  for (const name of ['Practice status','Dictation status']) assert.ok(errorAX.nodes.some(n=>n.name?.value===name && !n.ignored),name);
  for (const id of ['practice-message','message']) {
    assert.equal(await evaluate(`document.getElementById('${id}').classList.contains('sr-only') && !document.getElementById('${id}').hasAttribute('tabindex')`),true,'Announcements do not create invisible keyboard stops');
    await evaluate(`window.statusMutations=0;window.statusObserver=new MutationObserver(()=>window.statusMutations++);window.statusObserver.observe(document.getElementById('${id}'),{childList:true,characterData:true,subtree:true});window.pollCount=window.calls.filter(c=>c.command==='status').length`);
    await until(`window.calls.filter(c=>c.command==='status').length>window.pollCount+1`);
    assert.equal(await evaluate(`window.statusMutations===0`),true,'Polling does not repeat announcements');
    await evaluate(`window.statusObserver.disconnect()`);
  }
  await evaluate(`document.getElementById('practice-recovery').click()`);
  assert.equal(await focused(),'health-title','Explicit recovery opens the direct product-status panel, not another Settings button');
  assert.equal(await evaluate(`document.getElementById('health-practice-error').textContent.startsWith('Selected microphone unavailable') && document.getElementById('health-summary').textContent.startsWith('Delivery failed')`),true,'Product status preserves both actionable diagnostics');
  await evaluate(`document.getElementById('health-close').click()`);
  await evaluate(`window.fixture.phase='idle';window.fixture.message='';window.rejectStart='';document.getElementById('home-back').click()`);
  await until(`document.getElementById('practice-message').textContent==='' && document.getElementById('message').textContent===''`);
  assert.equal(await evaluate(`document.querySelector('.practice-badge').textContent==='Private' && document.getElementById('practice-text').getAttribute('aria-describedby')==='practice-privacy' && getComputedStyle(document.getElementById('practice-privacy')).position==='absolute'`),true,'Idle Home keeps a compact privacy label and accessible description, not another explanatory paragraph');
  assert.equal(await evaluate(`['practice-message','message'].every(id=>!document.getElementById(id).hasAttribute('tabindex'))`),true,'Empty announcements are not tab stops');

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
  await evaluate(`document.getElementById('home-back').click();document.getElementById('nav-settings').click();window.loginAck()`);
  await until(`!document.getElementById('launch-at-login').disabled`);
  assert.equal(await focused(),'settings-title','Navigating away and back revokes delayed focus ownership');

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
  await evaluate(`document.querySelector('#recording-mode input:checked').focus();window.exclusionsAck()`);
  await until(`!document.querySelector('[aria-label="Remove com.delayed"]')`);
  assert.equal(await evaluate(`document.activeElement.matches('#recording-mode input:checked')`),true,'Other interactions revoke removal focus ownership');
}
