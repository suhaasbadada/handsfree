// Optional visual smoke check; does not launch the app, install packages or use the mic.
// Serve site/ on port 8765, then set BROWSER_BINARY to a Chromium-compatible browser.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const binary = process.env.BROWSER_BINARY;
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
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`)) break;
    await delay(50);
  }
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
    animation: getComputedStyle(document.querySelector('.wave-seed')).animationName,
    scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth
  })`);
  assert.ok(dark.dark);
  assert.equal(dark.animation, 'none');
  assert.equal(dark.scroll, dark.width);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate('document.activeElement.textContent'), 'Skip to content');
  await screenshot('mobile-dark');
  assert.deepEqual(errors, []);
  console.log('Dark mobile, reduced motion, keyboard skip link, and JavaScript errors: passed');
} finally {
  socket?.close();
  browser.kill();
  if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
  rmSync(profile, { recursive: true, force: true });
}
