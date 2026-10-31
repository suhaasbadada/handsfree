import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeInstall, homebrewCommand } from '../site/install.js';
import { renderDownload } from '../site/download.js';
import { release } from '../site/release.js';

test('copy requires a click and reports actual clipboard success or failure', async () => {
  for (const fails of [false, true]) {
    let click;
    const writes = [];
    const status = { textContent: '' };
    const button = { hidden: true, dataset: { copyBrew: 'command' },
      addEventListener(event, handler) { assert.equal(event, 'click'); click = handler; },
      closest() { return { querySelector() { return status; } }; } };
    initializeInstall({ querySelectorAll() { return [button]; }, getElementById() { return { textContent: homebrewCommand }; } },
      { clipboard: { async writeText(value) { if (fails) throw Error('Denied'); writes.push(value); } } });
    assert.equal(button.hidden, false);
    assert.deepEqual(writes, []);
    assert.equal(status.textContent, '');
    await click();
    assert.deepEqual(writes, fails ? [] : [homebrewCommand]);
    assert.match(status.textContent, fails ? /Copy unavailable.*Select and copy/ : /^Copied\. Paste in Terminal/);
    assert.doesNotMatch(status.textContent, /Installed/);
  }
});

test('hero Homebrew recommendation is scoped to supported Mac visitors and availability', () => {
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { setAttribute() {}, removeAttribute() {} });
    return elements.get(id);
  } };
  for (const os of ['mac', 'windows', 'linux', 'mobile', 'unknown']) for (const arch of ['arm64', 'unknown', 'intel']) {
    renderDownload(document, { os, arch }, { ...release, publicAvailable: true });
    assert.equal(document.getElementById('hero-homebrew').hidden, os !== 'mac' || arch === 'intel');
  }
  renderDownload(document, { os: 'mac', arch: 'arm64' }, { ...release, publicAvailable: false });
  assert.equal(document.getElementById('hero-homebrew').hidden, true);
});
