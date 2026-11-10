import assert from 'node:assert/strict';

// Native bridge must exist BEFORE the production module registers listeners.
export async function checkPracticeEvents({send,evaluate,until,port}) {
  await send('Page.enable');
  const fixture = await evaluate(`({...window.fixture,platform:'macos',phase:'idle',message:'',model_ready:true,microphone:true,accessibility:true,input_monitoring:true,hotkey:true})`);
  await send('Page.addScriptToEvaluateOnNewDocument', {source:`
    window.fixture=${JSON.stringify(fixture)};
    window.calls=[];window.callbacks=new Map();window.listeners=new Map();window.callbackId=0;
    window.practiceGeneration=0;window.practiceResult={phase:'recording',text:''};
    window.emitNative=(event,payload)=>{for(const listener of window.listeners.get(event)||[])window.callbacks.get(listener.handler)?.({event,id:listener.id,payload});};
    window.__TAURI_INTERNALS__={
      transformCallback(callback){const id=++window.callbackId;window.callbacks.set(id,callback);return id;},
      async invoke(command,args){
        window.calls.push({command,args});
        if(command==='plugin:event|listen'){const id=++window.callbackId;const list=window.listeners.get(args.event)||[];list.push({...args,id});window.listeners.set(args.event,list);return id;}
        if(command==='status')return structuredClone(window.fixture);
        if(command==='practice_context'){window.context=args.active?args.revision:0;return;}
        if(command==='practice_start'){if(window.delayStart)await new Promise(r=>window.startAck=r);return ++window.practiceGeneration;}
        if(command==='practice_status')return {...window.practiceResult,generation:window.practiceGeneration};
        if(command==='practice_finish'){window.practiceResult.phase='processing';return;}
        if(command==='update_status')return {installed_version:'0.1.1-beta.9',phase:'idle',notes:'',downloaded_bytes:0,message:'Choose Check for updates.'};
      }
    };
  `});
  await send('Page.navigate', {url:`http://127.0.0.1:${port}`});
  await until(`window.context>0 && window.listeners.has('practice-input') && !document.getElementById('practice-start').disabled`);
  const baseline = await evaluate(`JSON.stringify(window.fixture.stats)`);
  await evaluate(`window.sendPractice=(action,token=1,context=window.context)=>window.emitNative('practice-input',{action,token,source:1,context});window.sendPractice('toggle')`);
  await until(`!document.getElementById('practice-finish').hidden`);
  await evaluate(`window.sendPractice('toggle');window.practiceResult={phase:'complete',text:'A little more thinking.'}`);
  await until(`document.getElementById('practice-text').value==='A little more thinking.'`);
  assert.equal(await evaluate(`JSON.stringify(window.fixture.stats)`),baseline,'Native practice leaves totals unchanged');
  assert.equal(await evaluate(`window.calls.every(c=>!['toggle','copy_transcript','reset_stats'].includes(c.command))`),true,'Practice uses no normal dictation, clipboard or stats reset IPC');
  await evaluate(`window.oldContext=window.context;window.emitNative('dashboard-navigate','settings')`);
  await until(`window.context===0 && document.getElementById('practice-text').value===''`);
  await evaluate(`window.emitNative('dashboard-navigate','practice')`);
  await until(`window.context>window.oldContext && document.activeElement.id==='practice-text' && !document.getElementById('practice-start').disabled`);
  const starts = await evaluate(`window.calls.filter(c=>c.command==='practice_start').length`);
  await evaluate(`window.sendPractice('toggle',1,window.oldContext)`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='practice_start').length`),starts,'Old context is rejected');
  await evaluate(`window.delayStart=true;window.sendPractice('press',2);window.sendPractice('release',2)`);
  await until(`typeof window.startAck==='function'`);
  await evaluate(`window.startAck();window.delayStart=false`);
  await until(`window.calls.filter(c=>c.command==='practice_finish').length===2`);
  await evaluate(`document.getElementById('practice-cancel').click()`);
  await until(`!document.getElementById('practice-start').disabled`);
  await evaluate(`document.querySelector('.brand').click()`);
  await until(`window.context===0 && !document.getElementById('brand-menu').hidden`);
  await evaluate(`document.getElementById('brand-overview').click()`);
  await until(`window.context>0`);
  await evaluate(`window.oldContext=window.context;window.dispatchEvent(new Event('blur'))`);
  await until(`window.context===0`);
  await evaluate(`window.dispatchEvent(new Event('focus'))`);
  await until(`window.context>window.oldContext`);
  await evaluate(`window.oldContext=window.context;window.emitNative('practice-cleared')`);
  await until(`window.context>window.oldContext && !document.getElementById('practice-start').disabled`);
  for (const opener of [`document.querySelector('.brand').click()`,`document.getElementById('updates-open').click()`]) {
    await evaluate(`window.delayStart=true;window.startAck=undefined;window.sendPractice('press',3)`);
    await until(`typeof window.startAck==='function'`);
    await evaluate(opener);
    await until(`window.context===0`);
    await evaluate(`window.startAck();window.delayStart=false`);
    await until(`document.getElementById('practice-cancel').hidden`);
    await evaluate(`document.getElementById('updates-dialog').close();document.getElementById('brand-overview').click()`);
    await until(`window.context>0 && !document.getElementById('practice-start').disabled`);
  }
  await evaluate(`window.emitNative('dashboard-navigate','updates')`);
  await until(`document.getElementById('updates-dialog').open && window.context===0`);
  await evaluate(`document.getElementById('updates-close').click()`);
  await until(`window.context>0`);
}
