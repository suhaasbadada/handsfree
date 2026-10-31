// Optional visual smoke check; does not launch the app, install packages or use the mic.
// Serve site/ on port 8765, then set BROWSER_BINARY to a Chromium-compatible browser.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const binary = process.env.BROWSER_BINARY;
const port = process.env.SITE_PORT ?? '8765';
const sitePath = process.env.SITE_PATH ?? '/';
if (!binary) throw new Error('Set BROWSER_BINARY and serve site/ on http://127.0.0.1:8765 first.');
const profile = mkdtempSync(join(tmpdir(), 'handsfree-website-'));
const browser = spawn(binary, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9248', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let socket;
let id = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const request = ++id;
    pending.set(request, { resolve, reject });
    socket.send(JSON.stringify({ id: request, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const path = join(tmpdir(), `handsfree-website-${name}.png`);
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log(`Screenshot: ${path}`);
}
try {
  let page;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      page = await (await fetch('http://127.0.0.1:9248/json/new?about:blank', { method: 'PUT' })).json();
      break;
    } catch { await delay(50); }
  }
  assert.ok(page?.webSocketDebuggerUrl, 'Headless browser started');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'prefers-color-scheme', value: 'light' },
  ] });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}${sitePath}` });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`)) break;
    await delay(50);
  }
  const dmgUrl = 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.2/HandsFree-0.1.1-beta.2-macos-arm64.dmg';
  assert.deepEqual(await evaluate(`({disabled:document.getElementById('primary-download').getAttribute('aria-disabled'), href:document.getElementById('primary-download').getAttribute('href')})`), {disabled:null,href:dmgUrl}, 'Published manifest offers a working direct download');
  await evaluate(`(async () => { window.downloadModule=await import('./download.js'); window.releaseModule=await import('./release.js'); })()`);
  for (const os of ['mac','windows','linux','mobile','unknown']) {
    await evaluate(`window.downloadModule.renderDownload(document,{os:${JSON.stringify(os)},arch:'unknown'},{...window.releaseModule.release,publicAvailable:true})`);
    const href = await evaluate(`document.getElementById('primary-download').getAttribute('href')`);
    assert.equal(href, dmgUrl, `${os}: Mac DMG remains available to every visitor`);
    assert.deepEqual(await evaluate(`({label:document.getElementById('download-label').textContent, name:document.getElementById('primary-download').getAttribute('aria-label'),icons:document.querySelectorAll('#primary-download svg.apple-logo[aria-hidden="true"] path').length})`),
      {label:os === 'mac' ? 'Download for Mac' : 'Get Mac beta', name:'Download for Mac (Apple Silicon)',icons:1});
    for (const manifest of ['{...window.releaseModule.release,publicAvailable:false}', '{...window.releaseModule.release,dmgUrl:"https://evil.invalid/bad.dmg"}']) {
      await evaluate(`window.downloadModule.renderDownload(document,{os:${JSON.stringify(os)},arch:'unknown'},${manifest})`);
      assert.equal(await evaluate(`document.getElementById('primary-download').hasAttribute('href')`), false, `${os}: unavailable/corrupt manifests fail closed`);
    }
  }
  await evaluate(`window.downloadModule.renderDownload(document,{os:'mac',arch:'intel'},{...window.releaseModule.release,publicAvailable:true})`);
  assert.equal(await evaluate(`document.getElementById('primary-download').getAttribute('href')`), dmgUrl, 'Intel visitor may intentionally download for another Mac');
  assert.match(await evaluate(`document.getElementById('download-platform-note').textContent`), /Intel Macs are not supported/);
  await evaluate(`window.downloadModule.renderDownload(document,{os:'mac',arch:'unknown'},window.releaseModule.release)`);
  for (const width of [320, 390, 400, 560, 740, 768, 980, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const metrics = await evaluate(`new Promise(resolve => requestAnimationFrame(() => resolve({
      width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
      images: [...document.images].every(i => i.complete && i.naturalWidth > 0),
      styles: getComputedStyle(document.querySelector('.hero')).display
    })))`);
    assert.equal(metrics.scroll, metrics.width, `No horizontal overflow at ${width}px`);
    assert.ok(metrics.images, 'Icons loaded');
    assert.equal(metrics.styles, 'grid', 'Stylesheet loaded');
    const brew = await evaluate(`(() => {
      const option = document.querySelector('.homebrew-option');
      const code = option.querySelector('code');
      const details = option.querySelector('details');
      const closed = !details.open;
      details.open = true;
      const fits = document.documentElement.scrollWidth === document.documentElement.clientWidth;
      details.open = false;
      return { command: code.textContent, closed, fits, wraps: getComputedStyle(code).overflowWrap === 'anywhere', contained: code.getBoundingClientRect().right <= innerWidth };
    })()`);
    assert.deepEqual(brew, { command: 'brew install --cask suhaasbadada/handsfree/handsfree', closed: true, fits: true, wraps: true, contained: true }, `Homebrew command and expanded trust note fit at ${width}px`);
    const demo = await evaluate(`(() => {
      const figure = document.querySelector('.dictation-demo');
      const text = document.getElementById('demo-text');
      const capsule = document.querySelector('.demo-capsule').getBoundingClientRect();
      const style = getComputedStyle(text);
      const bounds = text.getBoundingClientRect();
      const before = figure.getBoundingClientRect().height;
      const sample = text.value;
      text.value = '';
      const stable = figure.getBoundingClientRect().height === before;
      text.value = sample;
      return {
        direct: text.parentElement === figure && !figure.querySelector('.demo-card'),
        border: style.borderTopWidth, background: style.backgroundColor,
        labelHidden: getComputedStyle(text.labels[0]).clipPath === 'inset(50%)',
        fits: text.scrollHeight <= text.clientHeight && text.scrollWidth <= text.clientWidth,
        separated: bounds.top - capsule.bottom >= 24,
        stable
      };
    })()`);
    assert.deepEqual(demo, { direct: true, border: '0px', background: 'rgba(0, 0, 0, 0)', labelHidden: true, fits: true, separated: true, stable: true }, `Borderless, readable, stable demo at ${width}px`);
    const platforms = await evaluate(`(() => {
      const cards = [...document.querySelectorAll('.platform-card')];
      const card = cards[0];
      const cta = card.querySelector('a.button.primary');
      const box = cta.getBoundingClientRect();
      const style = getComputedStyle(card);
      const innerWidth = card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return {
        href: cta.getAttribute('href'), label: cta.textContent.trim(),
        icons: cta.querySelectorAll('svg.apple-logo[aria-hidden="true"] path').length,
        fullWidth: Math.abs(box.width - innerWidth) < 1,
        bottomAnchored: Math.abs(card.getBoundingClientRect().bottom - box.bottom - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth)) < 1,
        heights: cards.map(c => c.getBoundingClientRect().height),
        footnote: !!card.querySelector('.card-footnote'),
        detailsClosed: !document.querySelector('details.release-note').open
      };
    })()`);
    assert.equal(platforms.href, dmgUrl);
    assert.equal(platforms.label, 'Download for Mac');
    assert.equal(platforms.icons, 1);
    assert.ok(platforms.fullWidth, `Full-width Mac button at ${width}px`);
    assert.ok(platforms.bottomAnchored, `Bottom-anchored Mac button at ${width}px`);
    assert.equal(platforms.footnote, false);
    assert.ok(platforms.detailsClosed, 'Technical release details remain expandable');
    if (width > 760) assert.ok(platforms.heights.every(height => Math.abs(height - platforms.heights[0]) < 1), 'Desktop platform cards have equal heights');
    const headline = await evaluate(`(() => {
      const title = document.getElementById('hero-title');
      return { text: title.textContent, lines: title.offsetHeight / parseFloat(getComputedStyle(title).lineHeight) };
    })()`);
    assert.equal(headline.text, 'Don’t lose your train of thought.');
    assert.ok(Math.abs(headline.lines - 2) < 0.1, `Intentional two-line headline at ${width}px`);
    const usecases = await evaluate(`({
      count: document.querySelectorAll('#usecases li').length,
      columns: getComputedStyle(document.querySelector('.usecase-list')).gridTemplateColumns.split(' ').length,
      contained: [...document.querySelectorAll('#usecases li')].every(item => {
        const box = item.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.height > 0;
      })
    })`);
    assert.equal(usecases.count, 4, 'Four readable use cases');
    assert.equal(usecases.columns, width <= 760 ? 1 : 2, `Responsive use cases at ${width}px`);
    assert.ok(usecases.contained, 'Use-case rows stay within the viewport');
    assert.equal(await evaluate(`document.querySelector('.site-header .beta-badge').textContent==='BETA' && document.querySelector('.site-header .beta-badge').getBoundingClientRect().width>0`), true, 'Visible uppercase beta identity at every width');
    assert.equal(await evaluate(`document.getElementById('primary-download').getBoundingClientRect().bottom < innerHeight`), true, `Primary action above fold at ${width}px`);
    console.log(`Light ${width}px: layout and assets passed`);
    if (width === 1280) await screenshot('desktop');
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  assert.equal(await evaluate(`document.getElementById('demo-pause').hidden && !document.getElementById('demo-play')`), true, 'Reduced motion has no animation or play control');
  assert.equal(await evaluate(`document.documentElement.scrollWidth === innerWidth`), true, 'No overflow on a 320px touch viewport');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await evaluate(`window.scrollTo(0,0); document.body.tabIndex=-1; document.body.focus(); document.body.removeAttribute('tabindex')`);
  await send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'prefers-color-scheme', value: 'dark' },
  ] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const dark = await evaluate(`({
    dark: matchMedia('(prefers-color-scheme:dark)').matches,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
    animation: getComputedStyle(document.querySelector('.demo-wave i')).animationName,
    scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth
  })`);
  assert.ok(dark.dark);
  assert.equal(dark.scheme, 'light');
  assert.equal(dark.background, 'rgb(247, 246, 243)');
  assert.equal(dark.animation, 'none');
  assert.equal(dark.scroll, dark.width);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate('document.activeElement.textContent'), 'Skip to content');
  await screenshot('mobile-dark');
  const sample = 'Let’s move our meeting to tomorrow morning.';
  assert.deepEqual(await evaluate(`({value:document.getElementById('demo-text').value,readonly:document.getElementById('demo-text').readOnly,label:document.getElementById('demo-text').labels[0].textContent})`),
    { value: sample, readonly: true, label: 'Text' }, 'Semantic, labelled static reduced-motion text field');
  const { nodes } = await send('Accessibility.getFullAXTree');
  assert.equal(nodes.filter(node => node.role?.value === 'link' && node.name?.value === 'Download for Mac (Apple Silicon)').length, 2, 'Hero and platform card provide named, accessible Mac downloads');
  assert.ok(nodes.some(node => node.role?.value === 'region' && node.name?.value === 'Talk through the work.'), 'Use cases form a named accessible section');
  for (const title of ['Think out loud with your coding assistant.', 'Messages & email', 'Notes & ideas', 'First drafts']) {
    assert.ok(nodes.some(node => node.role?.value === 'heading' && node.name?.value === title), `Accessible use-case heading: ${title}`);
  }
  assert.ok(nodes.some(node => node.role?.value === 'textbox' && node.name?.value === 'Text' && node.value?.value === sample), 'Transcript is a named textbox in the accessibility tree');
  async function activate(key = 'Enter') {
    await evaluate(`document.getElementById('demo-pause').focus()`);
    const code = key === ' ' ? 'Space' : 'Enter';
    const keyCode = key === ' ' ? 32 : 13;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text: key === ' ' ? ' ' : '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  for (const width of [320, 390, 768, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate(`new Promise(resolve => requestAnimationFrame(() => resolve(document.documentElement.scrollWidth === innerWidth && document.getElementById('primary-download').getBoundingClientRect().bottom < innerHeight)))`), true, `Normal motion: visible download and no overflow at ${width}px`);
  }
  await delay(100);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'listening', 'Motion change starts automatic loop without a play action');
  await activate(' ');
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'done', 'Space pauses animation on a meaningful static result');
  assert.equal(await evaluate(`document.getElementById('demo-pause').getAttribute('aria-label')`), 'Resume animation');
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('demo-pause')).outlineStyle`), 'solid', 'Visible keyboard focus');
  await delay(2500);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'done', 'Paused animation has no stale transitions');
  await activate();
  await delay(1700);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'processing');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.demo-dots')).display`), 'flex', 'Three processing dots shown');
  await delay(800);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'done');
  assert.equal(await evaluate(`document.getElementById('demo-text').value`), sample, 'Complete transcript appears');
  await delay(2500);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'listening', 'Result hold resets into the next automatic loop');
  assert.equal(await evaluate(`document.activeElement.id==='demo-pause' && !document.querySelector('.dictation-demo [aria-live],.dictation-demo [role="status"]')`), true, 'Loops preserve focus without live announcement spam');
  await evaluate(`window.dispatchEvent(new PageTransitionEvent('pagehide'))`);
  await delay(1800);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'done', 'Leaving page cancels all playback timers');
  await evaluate(`window.dispatchEvent(new PageTransitionEvent('pageshow'))`);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'listening', 'Returning resumes automatically');
  // Simulate the browser visibility signal without depending on headless focus policy.
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))`);
  await delay(1800);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'done', 'Hidden page has no advancing loop');
  await evaluate(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))`);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'listening');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await delay(100);
  assert.equal(await evaluate(`document.getElementById('demo-text').value`), sample, 'Changing to reduced motion cancels the loop');
  assert.deepEqual(errors, []);
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.reload');
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(`document.readyState === 'complete'`)) break;
    await delay(50);
  }
  assert.equal(await evaluate(`document.getElementById('primary-download').getAttribute('href')`), dmgUrl, 'No-JS CTA directly downloads the published Mac beta');
  assert.equal(await evaluate(`document.querySelector('noscript').getClientRects().length>0 && document.querySelectorAll('#primary-download svg.apple-logo[aria-hidden="true"] path').length===1`), true, 'No-JS requirements and Apple logo are visible');
  assert.equal(await evaluate(`!document.getElementById('demo-play') && document.getElementById('demo-pause').hidden && document.getElementById('demo-text').value === ${JSON.stringify(sample)}`), true, 'No-JS demo shows meaningful text and no inert control');
  for (const width of [320, 390, 768, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate(`document.documentElement.scrollWidth === innerWidth && document.getElementById('primary-download').getBoundingClientRect().bottom < innerHeight`), true, `No JavaScript: visible download and no overflow at ${width}px`);
  }
  console.log('Dark mobile, automatic demo loop/pause, visibility cancellation, reduced motion, keyboard, no-JS fallback, and JavaScript errors: passed');
} finally {
  socket?.close();
  browser.kill();
  if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
  rmSync(profile, { recursive: true, force: true });
}
