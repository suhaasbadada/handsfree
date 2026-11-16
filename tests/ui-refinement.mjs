import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function checkRefinement({send,evaluate,until,port}) {
  await send('Page.navigate',{url:`http://127.0.0.1:${port}`});
  await until(`document.getElementById('phase')?.textContent==='Ready'`);
  const screenshot = async name => {
    if (!process.env.UI_SCREENSHOTS) return;
    await evaluate(`Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished))`);
    mkdirSync(process.env.UI_SCREENSHOTS,{recursive:true});
    const image = await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(join(process.env.UI_SCREENSHOTS,`${name}.png`),Buffer.from(image.data,'base64'));
  };
  for (const [width,height] of [[980,820],[560,650]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for (const theme of ['light','dark']) {
      await evaluate(`window.fixture.appearance='${theme}'`);
      await until(`document.documentElement.dataset.appearance==='${theme}'`);
      for (const tab of ['overview','practice-page','settings']) {
        await evaluate(`document.getElementById('nav-${tab}').click()`);
        if (tab==='practice-page') await until(`window.context>0 && !document.getElementById('practice-start').disabled`);
        await screenshot(`${width}-${theme}-${tab}`);
        const fit = await evaluate(`(()=>{const main=document.querySelector('main'),footer=document.querySelector('footer').getBoundingClientRect();return {body:document.documentElement.scrollHeight<=innerHeight+1,main:main.scrollHeight<=main.clientHeight+1,footer:footer.bottom<=innerHeight+1,horizontal:document.documentElement.scrollWidth<=innerWidth,heights:[main.scrollHeight,main.clientHeight]};})()`);
        assert.equal(fit.body && fit.footer && fit.horizontal,true,`${width} ${theme} ${tab}: viewport-bound shell`);
        if(tab!=='settings') assert.equal(fit.main,true,`${width} ${theme} ${tab}: ready content needs no scrolling ${fit.heights}`);
        else {
          assert.equal(fit.main,false,'Settings alone has normal content scrolling');
          await evaluate(`document.querySelector('main').scrollTop=document.querySelector('main').scrollHeight`);
          assert.equal(await evaluate(`document.querySelector('main').scrollTop>0`),true,'Settings content remains reachable');
          await evaluate(`document.querySelector('main').scrollTop=0`);
        }
        await screenshot(`${width}-${theme}-${tab}`);
      }
      await evaluate(`document.querySelector('main').scrollTop=document.querySelector('main').scrollHeight;document.getElementById('nav-practice-page').click()`);
      await until(`window.context>0 && !document.getElementById('practice-start').disabled`);
      assert.equal(await evaluate(`document.querySelector('main').scrollTop===0 && document.querySelector('main').scrollHeight<=document.querySelector('main').clientHeight+1`),true,'Switch from long Settings leaves Practice at its natural, unscrolled start');
      await evaluate(`window.savedContext=window.context;document.getElementById('practice-text').value='Private draft';document.getElementById('practice-text').dispatchEvent(new Event('input'));document.getElementById('practice-setup').click()`);
      await until(`window.context===0 && document.getElementById('practice-text').value===''`);
      assert.equal(await evaluate(`!document.getElementById('settings').hidden && document.activeElement.id==='preferences-title' && document.activeElement.getClientRects().length>0`),true,'Visible Settings action focuses Dictation, clearing the private draft and grant');
      await evaluate(`document.getElementById('nav-practice-page').click()`);
      await until(`window.context>window.savedContext && !document.getElementById('practice-start').disabled`);
      if (width===980) {
        for (const [name,phase] of [['recording','recording'],['processing','processing'],['complete','complete']]) {
          if(name==='recording') await evaluate(`window.practiceResult={phase:'recording',text:'',input_level:0.62,elapsed_seconds:8,limit_seconds:120};document.getElementById('practice-start').click()`);
          else await evaluate(`window.practiceResult={phase:'${phase}',text:'${phase==='complete'?'A little more room to think.':''}'};${phase==='processing'?"document.getElementById('practice-finish').click()":''}`);
          await until(name==='recording'?`document.getElementById('input-level').value===0.62`:name==='processing'?`document.getElementById('practice-message').textContent.includes('Transcribing')`:`document.getElementById('practice-text').value==='A little more room to think.'`);
          await screenshot(`${width}-${theme}-practice-${name}`);
        }
        await evaluate(`document.getElementById('practice-clear').click()`);
        await until(`!document.getElementById('practice-start').disabled`);
      }
    }
  }
  // Tiny/zoomed equivalent is intentionally document-scrollable, not clipped.
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:500,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.getElementById('nav-settings').click();document.querySelector('.local-data button').focus()`);
  assert.equal(await evaluate(`document.documentElement.scrollHeight>innerHeight && document.activeElement.id==='reset' && document.activeElement.getBoundingClientRect().bottom<=innerHeight && document.documentElement.scrollWidth<=innerWidth`),true,'Tiny viewport keyboard navigation reaches lower content through normal scrolling');
  await send('Emulation.setDeviceMetricsOverride',{width:980,height:820,deviceScaleFactor:1,mobile:false});
  await evaluate(`delete window.fixture.appearance;document.getElementById('nav-overview').click()`);
}
