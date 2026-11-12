import assert from 'node:assert/strict';

// Actual production DOM + IPC, in a fresh document. No localStorage or app launch.
export async function checkAppearance({send,evaluate,until,port}) {
  await send('Page.enable');
  const fixture = await evaluate(`({...window.fixture,platform:'macos',phase:'idle',message:'',model_ready:true,microphone:true,accessibility:true,input_monitoring:true,hotkey:true,appearance:'system'})`);
  const source = saved => `
    window.fixture=${JSON.stringify({...fixture,appearance:saved})};window.calls=[];
    window.__TAURI_INTERNALS__={transformCallback(){return 1;},async invoke(command,args){
      window.calls.push({command,args});
      if(command==='status')return structuredClone(window.fixture);
      if(command==='set_appearance'){
        if(window.delayAppearance)await new Promise(r=>window.appearanceAck=r);
        if(window.rejectAppearance)throw 'Appearance save failed';
        window.fixture.appearance=args.appearance;return {appearance:window.fixture.appearance};
      }
      if(command==='workflow_status')return {paused:false,excluded_bundle_ids:[],login:{status:'not_registered',error:null}};
      if(command==='running_apps')return [];
      if(command==='list_microphones')return {devices:[],default_uid:null};
      if(command==='update_status')return {installed_version:'0.1.1',phase:'idle',notes:'',downloaded_bytes:0,message:''};
    }};`;
  let script = await send('Page.addScriptToEvaluateOnNewDocument',{source:source('system')});
  try {
    await send('Page.navigate',{url:`http://127.0.0.1:${port}`});
    await until(`document.documentElement.dataset.appearance==='system' && !document.getElementById('appearance-choice').disabled`);
    await evaluate(`document.getElementById('nav-practice-page').click()`);
    const before = await evaluate(`JSON.stringify(window.fixture)`);
    const bounds = await evaluate(`(()=>{const r=document.getElementById('practice-title').closest('section').getBoundingClientRect();return [r.x,r.y,r.width,r.height];})()`);
    const choose = async mode => {
      await evaluate(`(()=>{const s=document.getElementById('appearance-choice');s.value=${JSON.stringify(mode)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await until(`document.documentElement.dataset.appearance===${JSON.stringify(mode)} && !document.getElementById('appearance-choice').disabled`);
    };
    for (const mode of ['system','light','dark']) {
      await choose(mode);
      for (const os of ['light','dark','light']) {
        await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:os}]});
        const dark = mode==='dark' || (mode==='system' && os==='dark');
        assert.deepEqual(await evaluate(`(()=>{const s=getComputedStyle(document.documentElement);return [s.backgroundColor,s.color];})()`),dark?['rgb(32, 31, 30)','rgb(243, 239, 234)']:['rgb(247, 246, 243)','rgb(48, 46, 45)'],`${mode}/${os}: explicit override or future system change`);
        assert.deepEqual(await evaluate(`(()=>{const r=document.getElementById('practice-title').closest('section').getBoundingClientRect();return [r.x,r.y,r.width,r.height];})()`),bounds,'Appearance does not alter practice geometry');
        const ratio = await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.primary'));const l=c=>c.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const a=l(s.color),b=l(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);})()`);
        assert.ok(ratio>=4.5,`${mode}/${os} primary text contrast ${ratio}`);
      }
    }
    await choose('light');
    // Consume the actual landing stylesheet in a separate same-origin document.
    const landing = await evaluate(`new Promise(resolve=>{const f=document.createElement('iframe');f.hidden=true;f.onload=()=>{const d=f.contentDocument;const root=getComputedStyle(d.documentElement);const colors={};for(const [app,site] of Object.entries({bg:'paper',surface:'card',text:'ink',muted:'muted',line:'line',accent:'green',active:'tint','primary-bg':'green','primary-fg':'on-green'})){const p=d.createElement('span');p.style.color='var(--'+site+')';d.body.append(p);colors[app]=getComputedStyle(p).color;}f.remove();resolve(colors);};f.srcdoc='<link rel="stylesheet" href="/site/styles.css"><body></body>';document.body.append(f);})`);
    const app = await evaluate(`(()=>{const colors={};for(const name of ${JSON.stringify(Object.keys(landing))}){const p=document.createElement('span');p.style.color='var(--'+name+')';document.body.append(p);colors[name]=getComputedStyle(p).color;p.remove();}return colors;})()`);
    assert.deepEqual(app,landing,'Light app palette is the actual landing CSS palette, including primary');
    const unchanged = await evaluate(`(()=>{const f={...window.fixture};f.appearance='system';return JSON.stringify(f);})()`);
    assert.equal(unchanged,before,'No capture, timer, shortcut or usage state changes');
    assert.equal(await evaluate(`window.calls.some(c=>['practice_start','practice_cancel','practice_clear','reset_stats','toggle'].includes(c.command))`),false);
    await evaluate(`(()=>{document.getElementById('nav-settings').click();window.delayAppearance=true;const s=document.getElementById('appearance-choice');s.value='dark';s.dispatchEvent(new Event('change'));})()`);
    await until(`typeof window.appearanceAck==='function'`);
    const writes = await evaluate(`window.calls.filter(c=>c.command==='set_appearance').length`);
    await evaluate(`document.getElementById('appearance-choice').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate(`window.calls.filter(c=>c.command==='set_appearance').length`),writes,'Pending duplicate ignored');
    await until(`document.getElementById('appearance-choice').disabled && document.getElementById('appearance-choice').value==='dark' && document.documentElement.dataset.appearance==='light'`);
    await evaluate(`window.appearanceAck();window.delayAppearance=false`);
    await until(`!document.getElementById('appearance-choice').disabled && document.documentElement.dataset.appearance==='dark'`);
    await evaluate(`(()=>{window.rejectAppearance=true;const s=document.getElementById('appearance-choice');s.value='system';s.dispatchEvent(new Event('change'));})()`);
    await until(`!document.getElementById('appearance-choice').disabled && document.getElementById('feedback').textContent.includes('Appearance save failed')`);
    assert.equal(await evaluate(`document.getElementById('appearance-choice').value`),'dark','Failure restores saved native choice');
    for (const saved of ['dark','system']) {
      // The mock backend survives reload, just as persisted native Store does.
      await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier});
      script=await send('Page.addScriptToEvaluateOnNewDocument',{source:source(saved)});
      await send('Page.reload');
      await until(`document.documentElement.dataset.appearance===${JSON.stringify(saved)} && document.getElementById('appearance-choice').value===${JSON.stringify(saved)} && !document.getElementById('appearance-choice').disabled`);
    }
  } finally { await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier}); }
  console.log('Appearance DOM: six mode/OS combinations, live changes, landing CSS, geometry, pending/failure and saved reload passed');
}
