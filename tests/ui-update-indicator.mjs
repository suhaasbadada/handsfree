import assert from 'node:assert/strict';

export async function checkUpdateIndicator({send,evaluate,until,port}) {
  await send('Page.navigate',{url:`http://127.0.0.1:${port}`});
  await until(`!!document.getElementById('updates-open') && !document.getElementById('updates-open').hidden`);
  await evaluate(`window.visibleUpdateState={installed_version:'0.1.1-beta.14',phase:'idle',notes:'',downloaded_bytes:0,message:'Choose Check for updates.'};const originalIndicatorInvoke=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(command,args)=>{if(command==='update_status'){window.calls.push({command,args});return structuredClone(window.visibleUpdateState);}return originalIndicatorInvoke(command,args);};`);
  await until(`document.getElementById('updates-indicator-detail').textContent==='Not checked'`);
  const checks = await evaluate(`window.calls.filter(c=>c.command==='check_for_updates').length`);
  const rects = () => evaluate(`['updates-open'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height]})`);
  const originalRects = await rects();
  await evaluate(`Object.assign(window.visibleUpdateState,{phase:'available',available_version:'0.1.1-beta.15',message:'Update available.'})`);
  await until(`document.getElementById('updates-indicator-label').textContent==='Update available' && document.getElementById('updates-indicator-detail').textContent==='0.1.1-beta.15'`);
  assert.equal(await evaluate(`!document.getElementById('updates-dialog').open && document.getElementById('updates-open').dataset.attention==='available'`),true,'Verified update stays visible outside the dialog');
  assert.deepEqual(await rects(),originalRects,'An available update changes emphasis, not footer geometry');
  assert.ok((await send('Accessibility.getFullAXTree')).nodes.some(n=>n.role?.value==='button' && n.name?.value==='Update available. 0.1.1-beta.15. Open app updates'),'Prominent update action has a complete accessible name');
  await evaluate(`document.getElementById('updates-open').click()`);
  await until(`document.getElementById('updates-dialog').open && document.getElementById('updates-version').textContent.includes('0.1.1-beta.15')`);
  await evaluate(`document.getElementById('updates-close').click();window.visibleUpdateState={...window.visibleUpdateState,phase:'error',message:'Feed unavailable.'}`);
  await until(`document.getElementById('updates-indicator-label').textContent==='Update failed'`);
  assert.equal(await evaluate(`document.getElementById('updates-open').dataset.attention`),'error','Error never advertises a stale offer as available or up to date');
  await evaluate(`window.visibleUpdateState={...window.visibleUpdateState,phase:'up_to_date',available_version:undefined,message:'Up to date.'}`);
  await until(`document.getElementById('updates-indicator-label').textContent==='Up to date'`);
  await evaluate(`window.visibleUpdateState={...window.visibleUpdateState,phase:'idle',message:'Offer expired. Check again.'}`);
  await until(`document.getElementById('updates-indicator-detail').textContent==='Not checked'`);
  assert.deepEqual(await rects(),originalRects,'Expired and failed checks keep the same status slot');
  assert.equal(await evaluate(`window.calls.filter(c=>c.command==='check_for_updates').length`),checks,'Persistent status observes local IPC only, never unsolicited feed requests');
}
