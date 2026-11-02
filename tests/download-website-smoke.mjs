// Self-contained headless Brave smoke: no app, microphone, installer download or package install.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { release, windowsRelease } from '../site/release.js';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const binary = process.env.BROWSER_BINARY || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const profile = await mkdtemp(join(tmpdir(), 'handsfree-download-smoke-'));
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const disabled = url.pathname.startsWith('/disabled/');
    const relative = url.pathname.replace(/^\/(?:disabled\/)?/, '') || 'index.html';
    const path = resolve(root, relative);
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    let body = await readFile(path);
    if (disabled && relative === 'release.js') {
      // Fixture revokes the real public manifest, exercising removal of static/stale EXE links.
      const source = body.toString();
      const revoked = source.replace(/(export const windowsRelease[\s\S]*?publicAvailable:) true/, '$1 false');
      assert.notEqual(revoked, source, 'Disabled fixture must revoke the actual Windows manifest');
      body = Buffer.from(revoked);
    }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(path)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(binary, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
let sequence = 0;
const pending = new Map();
const errors = [];
const requests = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(Error('Browser startup timeout')), 15000);
    browser.on('error', error => { clearTimeout(timeout); reject(error); });
    browser.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  const debugOrigin = endpoint.replace(/^ws:/, 'http:').split('/devtools/')[0];
  const page = await (await fetch(`${debugOrigin}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      if (message.error) request.reject(Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params);
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.setDownloadBehavior', { behavior: 'deny' });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  async function navigate(path, os = 'Windows', architecture = 'x86', bitness = '64') {
    const userAgent = os === 'Windows' ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36'
      : os === 'macOS' ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0.0.0 Safari/537.36'
        : 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0 Safari/537.36';
    await send('Emulation.setUserAgentOverride', { userAgent, platform: os === 'Windows' ? 'Win32' : os === 'macOS' ? 'MacIntel' : 'Linux x86_64',
      userAgentMetadata: { brands: [], fullVersionList: [], platform: os, platformVersion: '10.0', architecture, bitness, model: '', mobile: false } });
    await send('Page.navigate', { url: `${origin}${path}?case=${++sequence}` });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      ready = await evaluate(`document.readyState === 'complete' && !!document.getElementById('primary-download') && document.getElementById('release-status').textContent.startsWith('Mac beta v')`);
      if (ready) break;
      await delay(30);
    }
    assert.ok(ready, 'Page initialized');
  }
  const visible = id => `getComputedStyle(document.getElementById(${JSON.stringify(id)})).display !== 'none'`;
  assert.equal(windowsRelease.publicAvailable, true);
  await navigate('/disabled/');
  assert.equal(await evaluate(`document.getElementById('primary-download').getAttribute('href')`), release.dmgUrl);
  assert.equal(await evaluate(`document.getElementById('windows-card-download').hasAttribute('href')`), false);
  assert.match(await evaluate(`document.getElementById('windows-card-download').textContent`), /Build verification pending/);
  assert.equal(await evaluate(visible('primary-windows-icon')), false);
  for (const motion of ['reduce', 'no-preference']) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }] });
  for (const [os, arch, winPrimary, bitness] of [['Windows', 'x86', true, '64'], ['Windows', '', true, '64'], ['Windows', 'arm', false, '64'], ['Windows', 'x86', false, '32'], ['macOS', 'arm', false, '64'], ['Linux', 'x86', false, '64']]) {
    await navigate('/', os, arch, bitness);
    assert.equal(await evaluate(visible('hero-homebrew')), os === 'macOS');
    assert.equal(await evaluate(`document.getElementById('primary-download').getAttribute('href')`), winPrimary ? windowsRelease.installerUrl : release.dmgUrl);
    assert.equal(await evaluate(visible('primary-windows-icon')), winPrimary);
    assert.equal(await evaluate(visible('primary-apple-icon')), !winPrimary);
    assert.equal(await evaluate(visible('secondary-mac-download')), winPrimary);
    assert.equal(await evaluate(`document.getElementById('secondary-mac-download').getAttribute('href')`), release.dmgUrl);
    assert.equal(await evaluate(`document.getElementById('mac-card-download').getAttribute('href')`), release.dmgUrl);
    assert.equal(await evaluate(`document.getElementById('windows-card-download').getAttribute('href')`), windowsRelease.installerUrl);
    assert.match(await evaluate(`document.getElementById('windows-release-status').textContent`), /Not yet hardware-tested/);
    if (os === 'Windows' && arch === 'arm') assert.match(await evaluate(`document.getElementById('download-platform-note').textContent`), /Windows ARM is unsupported/);
    if (bitness === '32') assert.match(await evaluate(`document.getElementById('download-platform-note').textContent`), /32-bit Windows is unsupported/);
    const { nodes } = await send('Accessibility.getFullAXTree');
    assert.ok(nodes.some(node => node.role?.value === 'link' && node.name?.value === 'Download for Mac (Apple Silicon)'));
    assert.ok(nodes.some(node => node.role?.value === 'link' && node.name?.value === 'Download for Windows (x64 EXE)'));
    for (const width of [320, 390, 768, 1280]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: width <= 390 ? 844 : 800, deviceScaleFactor: 1, mobile: false });
      assert.equal(await evaluate(`document.documentElement.scrollWidth === document.documentElement.clientWidth`), true, `No overflow at ${width}px`);
      assert.equal(await evaluate(`document.getElementById('primary-download').getBoundingClientRect().bottom < innerHeight`), true, `Primary above fold at ${width}px (${motion})`);
      if (os === 'macOS') assert.equal(await evaluate(`document.getElementById('hero-brew-command').getBoundingClientRect().bottom < innerHeight`), true, `Homebrew above fold at ${width}px`);
    }
  }
  await navigate('/', 'macOS', 'arm');
  await send('Page.bringToFront');
  const command = 'brew install --cask suhaasbadada/handsfree/handsfree';
  assert.equal(await evaluate(`document.getElementById('hero-brew-command').textContent`), command);
  // Deterministic clipboard fixtures exercise success and browser-policy rejection without touching the user's clipboard.
  await evaluate(`window.clipboardWrites=[]; Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.clipboardWrites.push(text)}}}); document.querySelector('[data-copy-brew]').focus()`);
  assert.equal(await evaluate(`document.activeElement === document.querySelector('[data-copy-brew]')`), true, 'Copy button accepts keyboard focus');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  assert.deepEqual(await evaluate('window.clipboardWrites'), [command]);
  assert.match(await evaluate(`document.querySelector('#hero-homebrew .copy-status').textContent`), /^Copied/);
  await evaluate(`navigator.clipboard.writeText=async()=>{throw Error('denied')}; document.querySelector('[data-copy-brew]').click()`);
  assert.match(await evaluate(`document.querySelector('#hero-homebrew .copy-status').textContent`), /Copy unavailable.*Select and copy/);
  assert.equal(await evaluate(`document.getElementById('hero-brew-command').textContent`), command);
  }
  await navigate('/');
  await evaluate(`(async () => { const {renderDownload} = await import('./download.js'); const {release,windowsRelease} = await import('./release.js'); renderDownload(document,{os:'windows',arch:'unknown'},{...release,publicAvailable:false},{...windowsRelease,publicAvailable:false}); })()`);
  assert.equal(await evaluate(`['primary-download','secondary-mac-download','mac-card-download','windows-card-download'].every(id => { const a=document.getElementById(id); return !a.hasAttribute('href') && a.getAttribute('aria-disabled') === 'true'; })`), true);
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.navigate', { url: `${origin}/` });
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`document.readyState === 'complete' && !!document.getElementById('windows-card-download')`)) break;
    await delay(30);
  }
  assert.equal(await evaluate(`document.getElementById('primary-download').getAttribute('href')`), release.dmgUrl, 'Static Mac download works without JS');
  assert.equal(await evaluate(visible('hero-homebrew')), true, 'No-JS recommendation stays available and explicitly Mac-labeled');
  assert.equal(await evaluate(`document.querySelector('[data-copy-brew]').hidden`), true, 'No-JS never shows a nonfunctional copy button');
  assert.equal(await evaluate(`document.getElementById('windows-card-download').getAttribute('href')`), windowsRelease.installerUrl, 'Static Windows x64 card offers the public EXE without JS');
  for (const motion of ['reduce', 'no-preference']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }] });
    for (const width of [320, 390, 768, 1280]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      assert.equal(await evaluate(`document.documentElement.scrollWidth === document.documentElement.clientWidth`), true, `No-JS fits at ${width}px (${motion})`);
    }
  }
  assert.deepEqual(errors, []);
  assert.equal(requests.some(url => /github\.com|\.(?:exe|dmg)(?:[?#]|$)/.test(url)), false, 'No automatic installer requests or GitHub API dependency');
  console.log('Download website smoke passed: real public page, disabled fixture, Windows x64/unknown/ARM/32-bit, Mac, Linux, icons, AX names, four viewport widths, normal/reduced motion, stale href revocation, no-JS and no auto-download.');
} finally {
  socket?.close();
  browser.kill();
  if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
