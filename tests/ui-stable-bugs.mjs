import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Issues #1/#2: rendered content geometry and trusted pointer/keyboard input.
// This fixture uses production UI code; it never opens a microphone.
export async function checkStableBugs({send,evaluate,until,port}) {
  await send('Page.navigate',{url:`http://127.0.0.1:${port}`});
  await send('Page.bringToFront');
  await until(`window.context>0 && !document.getElementById('practice-start').disabled`);
  const failures=[];
  const check=(ok,label)=>{if(!ok)failures.push(label);};
  const click=async id=>{
    const point=await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  for(const [width,height] of [[980,820],[560,650],[320,650]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for(const theme of ['light','dark']) {
      await evaluate(`window.fixture.appearance=${JSON.stringify(theme)}`);
      await until(`document.documentElement.dataset.appearance===${JSON.stringify(theme)}`);
      for(const phase of ['complete','empty']) {
        await evaluate(`window.practiceResult={phase:${JSON.stringify(phase)},text:${JSON.stringify(phase==='complete'?'Known layout fixture.':'')}};document.getElementById('practice-start').click()`);
        await until(`!document.getElementById('practice-start').hidden && document.getElementById('practice-start').querySelector('span').textContent==='Record again'`);
        for(const size of [14,28]) {
          const fit=await evaluate(`(()=>{const b=document.getElementById('practice-start'),t=b.querySelector('span');t.style.fontSize='${size}px';const r=b.getBoundingClientRect(),s=getComputedStyle(b),range=document.createRange();range.selectNodeContents(t);const p={l:parseFloat(s.paddingLeft)+parseFloat(s.borderLeftWidth),r:parseFloat(s.paddingRight)+parseFloat(s.borderRightWidth),t:parseFloat(s.paddingTop)+parseFloat(s.borderTopWidth),b:parseFloat(s.paddingBottom)+parseFloat(s.borderBottomWidth)};return [...range.getClientRects(),b.querySelector('svg').getBoundingClientRect()].every(c=>c.left>=r.left+p.l-1 && c.right<=r.right-p.r+1 && c.top>=r.top+p.t-1 && c.bottom<=r.bottom-p.b+1) && r.left>=0 && r.right<=innerWidth && b.scrollWidth<=b.clientWidth && document.documentElement.scrollWidth<=innerWidth;})()`);
          check(fit,`#1 ${width}/${theme}/${phase}/${size}px: full label/icon must fit button padding and viewport`);
          if(process.env.UI_SCREENSHOTS) {
            await evaluate(`document.getElementById('practice-start').scrollIntoView({block:'center'})`);
            mkdirSync(process.env.UI_SCREENSHOTS,{recursive:true});
            const image=await send('Page.captureScreenshot',{format:'png'});
            writeFileSync(join(process.env.UI_SCREENSHOTS,`bug1-${width}-${theme}-${phase}-${size}px.png`),Buffer.from(image.data,'base64'));
          }
        }
        await evaluate(`document.getElementById('practice-start').querySelector('span').style.fontSize='';document.getElementById('practice-clear').click()`);
        await until(`document.getElementById('practice-text').value==='' && !document.getElementById('practice-start').disabled`);
      }
      const starts=await evaluate(`window.calls.filter(c=>c.command==='practice_start').length`);
      await click('nav-settings');
      await until(`!document.getElementById('settings').hidden && window.context===0`);
      await click('home-back');
      await until(`!document.getElementById('home').hidden && window.context>0`);
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:70});
      check(await evaluate(`document.activeElement!==document.getElementById('practice-text')`),`#2 ${width}/${theme}: pointer Back must not focus the editor`);
      check(await evaluate(`getComputedStyle(document.getElementById('nav-settings')).backgroundColor==='rgba(0, 0, 0, 0)' && !document.getElementById('nav-settings').matches(':hover')`),`#2 ${width}/${theme}: gear must not retain a selected fill after pointer leaves`);
      check(await evaluate(`window.calls.filter(c=>c.command==='practice_start').length===${starts}`),`#2 ${width}/${theme}: navigation must not start recording`);
      if(process.env.UI_SCREENSHOTS) {
        const image=await send('Page.captureScreenshot',{format:'png'});
        writeFileSync(join(process.env.UI_SCREENSHOTS,`bug2-home-return-${width}-${theme}.png`),Buffer.from(image.data,'base64'));
      }
      // A keyboard user can still reach the editor and see its focus indicator.
      await evaluate(`document.getElementById('practice-text').focus()`);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      check(await evaluate(`document.activeElement===document.getElementById('practice-text') && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>0`),`#2 ${width}/${theme}: keyboard editor focus must stay visible`);
    }
  }
  assert.deepEqual(failures,[],'Stable UI regressions must pass for rendered text, navigation and accessible focus');
  await send('Emulation.setDeviceMetricsOverride',{width:980,height:820,deviceScaleFactor:1,mobile:false});
}
