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
  assert.deepEqual(await evaluate(`({disabled:document.getElementById('primary-download').getAttribute('aria-disabled'), href:document.getElementById('primary-download').getAttribute('href')})`), {disabled:'true',href:null}, 'Draft manifest cannot produce a dead download');
  await evaluate(`(async () => { window.downloadModule=await import('./download.js'); window.releaseModule=await import('./release.js'); })()`);
  for (const os of ['mac','windows','linux','mobile','unknown']) {
    await evaluate(`window.downloadModule.renderDownload(document,{os:${JSON.stringify(os)},arch:'unknown'},{...window.releaseModule.release,publicAvailable:true})`);
    const href = await evaluate(`document.getElementById('primary-download').getAttribute('href')`);
    assert.equal(href, os === 'mac' ? 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.0-beta.1/HandsFree-0.1.0-beta.1-macos-arm64.dmg' : null, `${os}: only Mac gets a direct DMG`);
  }
  await evaluate(`window.downloadModule.renderDownload(document,{os:'mac',arch:'intel'},{...window.releaseModule.release,publicAvailable:true})`);
  assert.equal(await evaluate(`document.getElementById('primary-download').hasAttribute('href')`), false, 'Known Intel never gets ARM build');
  await evaluate(`window.downloadModule.renderDownload(document,{os:'mac',arch:'unknown'},window.releaseModule.release)`);
  for (const width of [320, 390, 768, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const metrics = await evaluate(`new Promise(resolve => requestAnimationFrame(() => resolve({
      width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
      images: [...document.images].every(i => i.complete && i.naturalWidth > 0),
      styles: getComputedStyle(document.querySelector('.hero')).display
    })))`);
    assert.equal(metrics.scroll, metrics.width, `No horizontal overflow at ${width}px`);
    assert.ok(metrics.images, 'Icons loaded');
    assert.equal(metrics.styles, 'grid', 'Stylesheet loaded');
    assert.equal(await evaluate(`document.querySelector('.site-header .beta-badge').textContent==='Beta' && document.querySelector('.site-header .beta-badge').getBoundingClientRect().width>0`), true, 'Visible beta identity at every width');
    assert.equal(await evaluate(`document.getElementById('primary-download').getBoundingClientRect().bottom < innerHeight`), true, `Primary action above fold at ${width}px`);
    console.log(`Light ${width}px: layout and assets passed`);
    if (width === 1280) await screenshot('desktop');
  }
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
  assert.deepEqual(await evaluate(`({value:document.getElementById('demo-text').value,readonly:document.getElementById('demo-text').readOnly,label:document.getElementById('demo-text').labels[0].textContent,hidden:document.getElementById('demo-play').hidden})`),
    { value: sample, readonly: true, label: 'Text', hidden: false }, 'Semantic, labelled text field and working demo button');
  const { nodes } = await send('Accessibility.getFullAXTree');
  assert.ok(nodes.some(node => node.role?.value === 'textbox' && node.name?.value === 'Text' && node.value?.value === sample), 'Transcript is a named textbox in the accessibility tree');
  async function activate(key = 'Enter') {
    await evaluate(`document.getElementById('demo-play').focus()`);
    const code = key === ' ' ? 'Space' : 'Enter';
    const keyCode = key === ' ' ? 32 : 13;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text: key === ' ' ? ' ' : '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  }
  await activate();
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'done', 'Reduced motion finishes immediately');
  assert.equal(await evaluate(`document.getElementById('demo-status').textContent`), `Done. ${sample}`, 'One complete transcript announcement');
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('demo-play')).outlineStyle`), 'solid', 'Visible keyboard focus');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await activate(' ');
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'listening', 'Space plays demo');
  assert.equal(await evaluate(`document.getElementById('demo-text').value`), '');
  await activate();
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'done', 'Enter resets active demo');
  await delay(2400);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'done', 'Reset has no stale transitions');
  await activate();
  await delay(1700);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'processing');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.demo-dots')).display`), 'flex', 'Three processing dots shown');
  await delay(800);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'done');
  assert.equal(await evaluate(`document.getElementById('demo-text').value`), sample, 'Complete transcript appears');
  await activate();
  await evaluate(`window.dispatchEvent(new PageTransitionEvent('pagehide'))`);
  assert.equal(await evaluate(`document.querySelector('.dictation-demo').dataset.state`), 'done', 'Leaving page cancels playback');
  assert.deepEqual(errors, []);
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.reload');
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(`document.readyState === 'complete'`)) break;
    await delay(50);
  }
  assert.equal(await evaluate(`document.getElementById('primary-download').hasAttribute('href')`), false, 'No-JS CTA cannot point at a draft');
  assert.equal(await evaluate(`document.querySelector('noscript').getClientRects().length>0 && document.getElementById('release-status').textContent.includes('No public Mac download')`), true, 'No-JS availability fallback is visible');
  assert.equal(await evaluate(`document.getElementById('demo-play').hidden && document.getElementById('demo-text').value === ${JSON.stringify(sample)}`), true, 'No-JS demo shows meaningful text and no inert play button');
  console.log('Dark mobile, demo playback/reset, reduced motion, keyboard, no-JS fallback, and JavaScript errors: passed');
} finally {
  socket?.close();
  browser.kill();
  if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
  rmSync(profile, { recursive: true, force: true });
}
