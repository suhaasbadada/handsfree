import assert from 'node:assert/strict';

// Native bridge must exist BEFORE the production module registers listeners.
export async function checkPracticeEvents({send,evaluate,until,port}) {
  await send('Page.enable');
  const fixture = await evaluate(`({...window.fixture,platform:'macos',phase:'idle',message:'',model_ready:true,microphone:true,accessibility:true,input_monitoring:true,hotkey:true})`);
  await send('Page.addScriptToEvaluateOnNewDocument', {source:`
    window.fixture=${JSON.stringify(fixture)};
    window.calls=[];window.callbacks=new Map();window.listeners=new Map();window.callbackId=0;
    window.practiceGeneration=0;window.practiceResult={phase:'recording',text:''};
    window.workflow={paused:false,excluded_bundle_ids:['com.absent.app'],login:{status:'not_registered',error:null}};
    window.emitNative=(event,payload)=>{for(const listener of window.listeners.get(event)||[])window.callbacks.get(listener.handler)?.({event,id:listener.id,payload});};
    window.__TAURI_INTERNALS__={
      transformCallback(callback){const id=++window.callbackId;window.callbacks.set(id,callback);return id;},
      async invoke(command,args){
        window.calls.push({command,args});
        if(command==='plugin:event|listen'){const id=++window.callbackId;const list=window.listeners.get(args.event)||[];list.push({...args,id});window.listeners.set(args.event,list);return id;}
         if(command==='status')return structuredClone(window.fixture);
         if(command==='workflow_status')return structuredClone(window.workflow);
         if(command==='set_paused'){if(window.delayPause)await new Promise(r=>window.pauseAck=r);window.workflow.paused=args.paused;return structuredClone(window.workflow);}
         if(command==='set_launch_at_login'){if(window.delayLogin)await new Promise(r=>window.loginAck=r);if(window.rejectLogin)throw 'Login registration failed';window.workflow.login={status:args.enabled?(window.loginResult||'approval_required'):'not_registered',error:null};return structuredClone(window.workflow.login);}
         if(command==='running_apps')return [{bundle_id:'com.running.app',name:'<b>Running app</b>'}];
         if(command==='set_excluded_apps'){if(window.delayExclusions)await new Promise(r=>window.exclusionsAck=r);if(window.rejectExclusions)throw 'Exclusion save failed';window.workflow.excluded_bundle_ids=args.bundleIds;return structuredClone(window.workflow);}
        if(command==='list_microphones')return {devices:[{uid:'built-in',name:'Built-in microphone'},{uid:'usb-input',name:'USB input'}],default_uid:'built-in'};
        if(command==='set_microphone'){if(window.rejectMicrophone)throw 'Could not save microphone';window.fixture.microphone_uid=args.uid;return;}
        if(command==='request_microphone')window.fixture.permission_requests=(window.fixture.permission_requests||0)|1;
        if(command==='request_permissions')window.fixture.permission_requests=(window.fixture.permission_requests||0)|2;
        if(command==='practice_context'){window.context=args.active?args.revision:0;return;}
        if(command==='practice_start'){if(window.delayStart)await new Promise(r=>window.startAck=r);if(window.rejectStart)throw window.rejectStart;if(window.layoutLiveStatus){window.fixture.phase='recording';window.fixture.message='Press Fn to finish, Escape to cancel. Maximum 2 minutes.';}return ++window.practiceGeneration;}
        if(command==='practice_status'){if(window.layoutLiveStatus && ['complete','empty','error'].includes(window.practiceResult.phase)){window.fixture.phase='idle';window.fixture.message='Practice finished. No text was pasted or saved.';}return {...window.practiceResult,generation:window.practiceGeneration};}
        if(command==='practice_finish'){window.practiceResult.phase='processing';if(window.layoutLiveStatus){window.fixture.phase='processing';window.fixture.message='Transcribing locally…';}return;}
        if(command==='practice_cancel'){if(window.delayCancel)await new Promise(r=>window.cancelAck=r);if(window.layoutLiveStatus){window.fixture.phase='idle';window.fixture.message='Cancelled.';}return;}
         if(command==='update_status')return {installed_version:'0.1.1-beta.9',phase:'idle',notes:'',downloaded_bytes:0,message:'Choose Check for updates.'};
         if(command==='check_for_updates')return {installed_version:'0.1.1-beta.9',phase:'up_to_date',notes:'',downloaded_bytes:0,message:'Up to date.'};
      }
    };
  `});
  await send('Page.navigate', {url:`http://127.0.0.1:${port}`});
  await until(`window.listeners.has('practice-input') && document.getElementById('phase').textContent==='Ready'`);
  assert.equal(await evaluate(`!document.getElementById('home').hidden && !document.querySelector('aside,nav,#brand-menu,#get-started')`),true,'Home replaces sidebar, tabs and setup guide');
  await until(`window.context>0 && window.listeners.has('practice-input') && !document.getElementById('practice-start').disabled`);
  assert.equal(await evaluate(`['words','saved','count','practice-text'].every(id=>document.getElementById(id).getClientRects().length) && window.context>0`),true,'Visible focused Home combines totals and private editor and grants context');
  const baseline = await evaluate(`JSON.stringify(window.fixture.stats)`);
  assert.equal(await evaluate(`!document.getElementById('get-started')`),true,'No setup guide DOM');
  await evaluate(`document.getElementById('nav-settings').click()`);
  assert.equal(await evaluate(`!document.getElementById('settings').hidden && document.getElementById('home').hidden && window.context===0`),true,'Settings replaces Home and revokes Practice context');
  await evaluate(`document.getElementById('product-status').click()`);
  assert.equal(await evaluate(`document.getElementById('health-dialog').open && document.getElementById('health-model-state').textContent==='Installed · English'`),true,'Product status uses native proofs');
  assert.equal(await evaluate(`window.calls.some(c=>['request_microphone','request_permissions','download_model','practice_start'].includes(c.command))`),false,'Opening guidance never prompts, downloads or records');
  await evaluate(`Object.assign(window.fixture,{microphone:false,input_monitoring:false,model_ready:false,hotkey:false})`);
  await until(`!document.getElementById('health-model').disabled && !document.getElementById('health-model').hidden`);
  assert.equal(await evaluate(`document.getElementById('practice-start').disabled`),true,'Partial native setup cannot authorize practice');
  await evaluate(`document.getElementById('health-mic').click();document.getElementById('health-permissions').click();document.getElementById('health-model').click()`);
  await until(`['request_microphone','request_permissions','download_model'].every(command=>window.calls.filter(c=>c.command===command).length===1)`);
  await evaluate(`Object.assign(window.fixture,{microphone:true,input_monitoring:true,model_ready:true,hotkey:true})`);
  await until(`document.getElementById('health-model-state').textContent==='Installed · English'`);
   assert.equal(await evaluate(`window.fixture.permission_requests===3 && document.getElementById('health-dialog').open && window.context===0`),true,'Explicit recovery preserves modal revocation');
   await evaluate(`document.getElementById('health-close').click()`);
   await until(`document.activeElement.id==='product-status'`);
   assert.equal(await evaluate(`document.activeElement.id==='product-status' && document.activeElement.getClientRects().length>0`),true,'Status close restores visible recovery trigger');
    await evaluate(`document.getElementById('home-back').click()`);
    await until(`window.context>0 && !document.getElementById('practice-start').disabled`);
    await evaluate(`document.getElementById('practice-start').click()`);
   await until(`!document.getElementById('practice-finish').hidden`);
   assert.equal(await evaluate(`'shortcutReceipt' in window.calls.filter(c=>c.command==='practice_start').at(-1).args`),false,'Button start omits receipt in actual IPC');
  assert.equal(await evaluate(`document.getElementById('shortcut-evidence').textContent.startsWith('Shortcut not tested')`),true,'Button start is not shortcut evidence');
  await evaluate(`window.practiceResult={phase:'recording',text:'',input_level:0.65}`);
  await until(`document.getElementById('input-level').value===0.65`);
  await evaluate(`document.getElementById('practice-clear').click()`);
  await until(`!document.getElementById('practice-start').disabled && document.getElementById('input-level').value===0`);
  await evaluate(`window.fixture.recording_mode='push_to_talk';window.fixture.shortcut_label='Option + Space'`);
  await until(`document.getElementById('shortcut-tutorial').textContent.startsWith('Hold Option + Space')`);
  await evaluate(`window.fixture.recording_mode='toggle';window.fixture.shortcut_label='Fn'`);
  await until(`document.getElementById('shortcut-tutorial').textContent.startsWith('Press Fn')`);
   const beforeInvalidReceipt = await evaluate(`window.calls.filter(c=>c.command==='practice_start').length`);
   await evaluate(`window.emitNative('practice-input',{action:'toggle',token:1,source:1,context:window.context})`);
   assert.equal(await evaluate(`window.calls.filter(c=>c.command==='practice_start').length`),beforeInvalidReceipt,'Missing shortcut receipt cannot become explicit practice');
   await evaluate(`window.sendPractice=(action,token=1,context=window.context)=>window.emitNative('practice-input',{action,token,source:1,context,receipt:123});window.sendPractice('toggle')`);
   await until(`!document.getElementById('practice-finish').hidden`);
   assert.equal(await evaluate(`window.calls.filter(c=>c.command==='practice_start').at(-1).args.shortcutReceipt`),123,'Native receipt reaches actual IPC');
  assert.equal(await evaluate(`document.getElementById('shortcut-evidence').textContent.startsWith('Shortcut received')`),true,'Actual native listener reports key receipt separately from capture');
  await evaluate(`window.sendPractice('toggle');window.practiceResult={phase:'complete',text:'A little more thinking.'}`);
  await until(`document.getElementById('practice-text').value==='A little more thinking.'`);
  assert.equal(await evaluate(`JSON.stringify(window.fixture.stats)`),baseline,'Native practice leaves totals unchanged');
  assert.equal(await evaluate(`window.calls.every(c=>!['toggle','copy_transcript','reset_stats'].includes(c.command))`),true,'Practice uses no normal dictation, clipboard or stats reset IPC');
   await evaluate(`window.oldContext=window.context;document.getElementById('nav-settings').click()`);
   await until(`window.context===0 && document.getElementById('practice-text').value===''`);
   assert.equal(await evaluate(`!document.getElementById('settings').hidden && document.getElementById('home').hidden`),true,'Settings navigation revokes and clears Practice');
   const overviewStarts = await evaluate(`window.calls.filter(c=>c.command==='practice_start').length`);
   await evaluate(`window.sendPractice('toggle',1,window.oldContext)`);
   assert.equal(await evaluate(`window.context===0 && document.getElementById('practice-text').value==='' && window.calls.filter(c=>c.command==='practice_start').length===${overviewStarts}`),true,'Stale native input cannot revive Practice in Settings');
   await evaluate(`window.emitNative('dashboard-navigate','settings')`);
   await until(`!document.getElementById('settings').hidden && window.context===0`);
  assert.equal(await evaluate(`document.getElementById('input-level').value===0 && document.getElementById('shortcut-evidence').textContent.startsWith('Shortcut not tested')`),true,'Navigation retires meter and evidence');
  await evaluate(`window.emitNative('dashboard-navigate','practice')`);
   await until(`window.context>window.oldContext && document.activeElement.id==='practice-text' && !document.getElementById('practice-start').disabled`);
   assert.equal(await evaluate(`!document.getElementById('home').hidden`),true,'Legacy tray Practice navigation selects Home');
  const starts = await evaluate(`window.calls.filter(c=>c.command==='practice_start').length`);
  await evaluate(`window.sendPractice('toggle',1,window.oldContext)`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='practice_start').length`),starts,'Old context is rejected');
  assert.equal(await evaluate(`document.getElementById('shortcut-evidence').textContent.startsWith('Shortcut not tested')`),true,'Stale native events are not shortcut evidence');
  await evaluate(`window.delayStart=true;window.sendPractice('press',2);window.sendPractice('release',2)`);
  await until(`typeof window.startAck==='function'`);
  await evaluate(`window.startAck();window.delayStart=false`);
  await until(`window.calls.filter(c=>c.command==='practice_finish').length===2`);
  await evaluate(`document.getElementById('practice-cancel').click()`);
  await until(`!document.getElementById('practice-start').disabled`);
  await evaluate(`document.getElementById('nav-settings').click()`);
  await until(`window.context===0 && !document.getElementById('settings').hidden`);
   await evaluate(`window.emitNative('dashboard-navigate','overview')`);
  await until(`window.context>0`);
  await evaluate(`window.oldContext=window.context;window.dispatchEvent(new Event('blur'))`);
  await until(`window.context===0`);
  await evaluate(`window.dispatchEvent(new Event('focus'))`);
  await until(`window.context>window.oldContext`);
  await evaluate(`window.oldContext=window.context;window.emitNative('practice-cleared')`);
  await until(`window.context>window.oldContext && !document.getElementById('practice-start').disabled`);
  for (const opener of [`document.getElementById('nav-settings').click()`,`document.getElementById('product-status').click()`]) {
    const pendingStarts = await evaluate(`window.calls.filter(c=>c.command==='practice_start').length`);
    await evaluate(`window.delayStart=true;window.startAck=undefined;window.sendPractice('press',3)`);
    await until(`typeof window.startAck==='function'`);
    await evaluate(opener);
    await until(`window.context===0`);
    await evaluate(`window.startAck();window.delayStart=false`);
    await until(`document.getElementById('practice-cancel').hidden`);
     await evaluate(`document.getElementById('health-dialog').close();document.getElementById('home-back').click()`);
     await until(`window.context>0 && !document.getElementById('practice-start').disabled`);
     assert.equal(await evaluate(`window.calls.filter(c=>c.command==='practice_start').length`),pendingStarts+1,'Returning Home does not revive the revoked pending start');
     assert.equal(await evaluate(`document.getElementById('practice-text').value==='' && document.getElementById('input-level').value===0`),true,'Pending teardown leaves no private text or meter');
  }
  await evaluate(`window.updateChecks=window.calls.filter(c=>c.command==='check_for_updates').length;window.emitNative('dashboard-navigate','updates')`);
  await until(`window.calls.filter(c=>c.command==='check_for_updates').length>window.updateChecks`);
  assert.equal(await evaluate(`window.context>0 && !document.querySelector('dialog[open]') && !window.calls.some(c=>c.command==='install_update')`),true,'Tray Updates checks inline without a modal, capture teardown or implicit install');
  await evaluate(`window.trayUpdatesInvoke=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(command,args)=>{const result=await window.trayUpdatesInvoke(command,args);return ['update_status','check_for_updates'].includes(command)?{...result,phase:'available',available_version:'0.1.1-beta.24',message:'Update available'}:result;};document.getElementById('updates-open').click()`);
  await until(`document.getElementById('updates-open').dataset.phase==='available'`);
  await evaluate(`window.availableTrayChecks=window.calls.filter(c=>c.command==='check_for_updates').length;window.emitNative('dashboard-navigate','updates')`);
  await until(`window.calls.filter(c=>c.command==='check_for_updates').length>window.availableTrayChecks && document.getElementById('updates-open').dataset.phase==='available'`);
  assert.equal(await evaluate(`!window.calls.some(c=>c.command==='install_update') && window.context>0`),true,'Generic tray App updates remains check-only even with an available offer; only the exact-version Download & update action may install');
  await evaluate(`window.__TAURI_INTERNALS__.invoke=window.trayUpdatesInvoke`);

  // Fresh production documents at each width: no direct controller calls or
  // screenshots masquerading as layout evidence. Compare document positions AND
  // scroll offsets so scroll anchoring cannot hide reflow.
  for (const width of [320,400,740,980]) {
    await send('Emulation.setDeviceMetricsOverride', {width,height:820,deviceScaleFactor:1,mobile:false});
     await send('Page.navigate', {url:`http://127.0.0.1:${port}`});
     await until(`Boolean(document.getElementById('home'))`);
    await until(`window.context>0 && !document.getElementById('practice-start').disabled`);
    await evaluate(`window.layoutLiveStatus=true;document.getElementById('practice-start').focus({preventScroll:true});window.scrollTo(0,Math.max(0,document.getElementById('practice').getBoundingClientRect().top+scrollY-80));window.layoutSnapshot=()=>({scroll:scrollY,rects:['practice','practice-text','practice-message'].map(id=>document.getElementById(id)).concat([document.querySelector('.practice-actions'),document.querySelector('.activity'),document.querySelector('footer')]).map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})});`);
    const pristine = await evaluate(`window.layoutSnapshot()`);
    const stable = async state => {
      const actual = await evaluate(`window.layoutSnapshot()`);
      assert.deepEqual(actual,pristine,`${width}px ${state}: practice, textarea, actions, activity, footer and scroll must stay pristine`);
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('#practice button,#practice textarea,#practice meter')].filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})`),true,`${width}px ${state}: contained controls`);
    };
    await evaluate(`window.delayStart=true;document.getElementById('practice-start').click()`);
    await until(`typeof window.startAck==='function'`);
    await stable('pending start');
    assert.equal(await evaluate(`document.activeElement.id`),'practice-text','Retiring Start keeps focus without scrolling');
    await evaluate(`window.startAck();window.delayStart=false`);
    await until(`!document.getElementById('practice-finish').hidden`);
    await until(`document.getElementById('phase').textContent==='Listening'`);
    await stable('recording before samples');
    await evaluate(`window.practiceResult={phase:'recording',text:'',input_level:0.81,elapsed_seconds:61.9,limit_seconds:120};window.emitNative('practice-input',{action:'press',token:99,source:1,context:window.context})`);
    await until(`document.getElementById('input-level').value===0.81 && document.getElementById('practice-timer').textContent==='1:01 / 2:00'`);
    await stable('meter, timer and shortcut receipt');
    await evaluate(`window.fixture.recording_limit=300`);
    await until(`document.getElementById('recording-limit').value==='300'`);
    assert.equal(await evaluate(`document.getElementById('practice-timer').textContent`),'1:01 / 2:00','Current timer keeps frozen native limit');
    await evaluate(`document.getElementById('practice-finish').focus({preventScroll:true});document.getElementById('practice-finish').click()`);
    await until(`document.getElementById('practice-message').textContent.includes('Transcribing')`);
    await until(`document.getElementById('phase').textContent==='Processing'`);
    await stable('processing');
    await evaluate(`window.practiceResult={phase:'complete',text:'Completed privately.'}`);
    await until(`document.getElementById('practice-text').value==='Completed privately.'`);
    await until(`document.getElementById('phase').textContent==='Ready'`);
    await stable('complete / record again');
    await evaluate(`window.rejectStart='Selected microphone unavailable. '.repeat(40);document.getElementById('practice-start').click()`);
    await until(`document.getElementById('practice-message').textContent.startsWith('Selected microphone unavailable')`);
    await stable('long start error with bounded overflow');
    assert.equal(await evaluate(`document.getElementById('practice-message').scrollHeight>document.getElementById('practice-message').clientHeight`),true,'Genuine long errors remain accessible by bounded scrolling');
    await evaluate(`window.rejectStart='';window.practiceResult={phase:'recording',text:''};document.getElementById('practice-start').click()`);
    await until(`!document.getElementById('practice-finish').hidden`);
    await stable('retry');
    await evaluate(`window.delayCancel=true;document.getElementById('practice-cancel').click()`);
    await until(`typeof window.cancelAck==='function'`);
    await stable('pending cancellation');
    await evaluate(`window.cancelAck();window.delayCancel=false`);
    await until(`!document.getElementById('practice-start').disabled`);
    await stable('cancelled');
    await evaluate(`document.getElementById('practice-clear').focus({preventScroll:true});window.emitNative('practice-input',{action:'toggle',token:0,source:0,context:window.context,receipt:123})`);
    await until(`!document.getElementById('practice-finish').hidden`);
    assert.equal(await evaluate(`document.activeElement.id`),'practice-text','Shortcut start retires focused Clear without losing keyboard focus');
    await stable('shortcut start while Clear focused');
    await evaluate(`document.getElementById('practice-cancel').click()`);
    await until(`!document.getElementById('practice-start').disabled`);
  }

  await evaluate(`document.getElementById('nav-settings').click();window.fixture.microphone_uid='disconnected-uid'`);
  await until(`document.getElementById('microphone-choice').value==='disconnected-uid'`);
  assert.equal(await evaluate(`document.getElementById('dot').className==='error' && document.getElementById('phase').textContent==='Needs attention' && document.getElementById('practice-start').disabled`),true,'Unavailable saved microphone is broken, not green Ready');
  assert.equal(await evaluate(`document.getElementById('microphone-choice').selectedOptions[0].textContent`),'Saved microphone · Unavailable','Disconnected saved UID remains visible, never replaced by default');
  await evaluate(`{window.rejectMicrophone=true;const s=document.getElementById('microphone-choice');s.value='usb-input';s.dispatchEvent(new Event('change'));}`);
  await until(`!document.getElementById('microphone-choice').disabled && document.getElementById('feedback').textContent.includes('Could not save microphone')`);
  assert.equal(await evaluate(`document.getElementById('microphone-choice').value`),'disconnected-uid','Failed save rolls selection back');
  await evaluate(`{window.rejectMicrophone=false;const s=document.getElementById('microphone-choice');s.value='';s.dispatchEvent(new Event('change'));}`);
  await until(`window.fixture.microphone_uid===null && !document.getElementById('microphone-choice').disabled`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='set_microphone').at(-1).args.uid`),null,'System default is persisted as null, never a device ID/name');
  await until(`!document.getElementById('workflow-pause').disabled`);
  assert.equal(await evaluate(`document.getElementById('excluded-apps').textContent.includes('com.absent.app')`),true,'Saved absent app remains visible');
  const appReads = await evaluate(`window.calls.filter(c=>c.command==='running_apps').length`);
  const statusReads = await evaluate(`window.calls.filter(c=>c.command==='workflow_status').length`);
  await until(`window.calls.filter(c=>c.command==='workflow_status').length>${statusReads}`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='running_apps').length`),appReads,'Status polling does not enumerate apps');
  await evaluate(`window.delayPause=true;document.getElementById('workflow-pause').click();document.getElementById('workflow-pause').click()`);
  await until(`typeof window.pauseAck==='function'`);
  assert.equal(await evaluate(`document.getElementById('workflow-pause').disabled`),true,'Pause control preserves pending owner');
  await evaluate(`window.pauseAck();window.delayPause=false`);
  await until(`document.getElementById('workflow-pause').getAttribute('aria-label')==='Resume shortcuts'`);
  await evaluate(`document.getElementById('workflow-pause').click()`);
  await until(`document.getElementById('workflow-pause').getAttribute('aria-label')==='Pause shortcuts'`);
  await evaluate(`window.workflow.paused=true`);
  await until(`document.getElementById('workflow-pause').getAttribute('aria-label')==='Resume shortcuts'`);
  await evaluate(`document.getElementById('launch-at-login').click()`);
  await until(`!document.getElementById('login-settings').hidden`);
  assert.equal(await evaluate(`document.getElementById('launch-at-login').checked`),false,'Approval is not enabled');
  await evaluate(`document.getElementById('login-cancel').click()`);
  await until(`document.getElementById('login-cancel').hidden && !document.getElementById('launch-at-login').disabled`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='set_launch_at_login').at(-1).args.enabled`),false,'Pending registration can be explicitly withdrawn without claiming it was enabled');
  await evaluate(`window.loginResult='enabled';document.getElementById('launch-at-login').click()`);
  await until(`document.getElementById('launch-at-login').checked && !document.getElementById('launch-at-login').disabled`);
  await evaluate(`window.rejectLogin=true;document.getElementById('launch-at-login').click()`);
  await until(`document.getElementById('workflow-error').textContent.includes('Login registration failed')`);
  assert.equal(await evaluate(`document.getElementById('launch-at-login').checked`),true,'Failed login request restores observed state');
  await evaluate(`{const s=document.getElementById('excluded-app-choice');s.value='com.running.app';s.dispatchEvent(new Event('change'));window.rejectExclusions=true;document.getElementById('excluded-app-add').click();}`);
  await until(`document.getElementById('workflow-error').textContent.includes('Exclusion save failed')`);
  assert.equal(await evaluate(`window.workflow.excluded_bundle_ids.join(',')`),'com.absent.app','Failed save preserves exclusions');
  assert.equal(await evaluate(`document.getElementById('excluded-app-choice').value`),'com.running.app','Failed save preserves picker selection for retry');
  await evaluate(`window.rejectExclusions=false;document.getElementById('excluded-app-add').click()`);
  await until(`document.getElementById('excluded-apps').children.length===2`);
  assert.equal(await evaluate(`!document.getElementById('excluded-apps').querySelector('b') && document.getElementById('excluded-apps').textContent.includes('<b>Running app</b>')`),true,'Names rendered as text only');
  await evaluate(`document.querySelector('[aria-label="Remove com.absent.app"]').click()`);
  await until(`!window.workflow.excluded_bundle_ids.includes('com.absent.app')`);
   await evaluate(`document.getElementById('home-back').click();document.getElementById('practice-start').click()`);
  await until(`!document.getElementById('practice-finish').hidden`);
  assert.equal(await evaluate(`'shortcutReceipt' in window.calls.filter(c=>c.command==='practice_start').at(-1).args`),false,'Explicit Start test works while paused and omits receipt');
  await evaluate(`document.getElementById('practice-cancel').click()`);
}
