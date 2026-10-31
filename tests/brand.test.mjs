import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
// Decode the noninterlaced RGBA PNGs without adding a runtime/test dependency.
function pixels(path) {
  const png = readFileSync(path);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(png[24], 8);
  assert.equal(png[25], 6);
  assert.equal(png[28], 0);
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const a = x >= 4 ? data[at - 4] : 0;
      const b = y ? data[at - stride] : 0;
      const c = y && x >= 4 ? data[at - stride - 4] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      data[at] = raw[y * (stride + 1) + 1 + x] + [0, a, b, Math.floor((a + b) / 2), paeth][filter];
    }
  }
  return { width, height, data };
}

function assertRedLogo(path, size) {
  const { width, height, data } = pixels(path);
  assert.equal(width, size);
  assert.equal(height, size);
  let red = 0, green = 0, neutral = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = data.subarray(i, i + 4);
    if (a === 0) continue;
    // Include faint rounded-edge/shadow pixels, not just the opaque tile.
    // Red antialiasing is allowed; every other visible pixel must be neutral.
    assert.ok(g <= Math.max(r, b) + 1, `Green tint in logo shell: ${path} at pixel ${i / 4}`);
    const redEdge = r > g + 1 && r > b + 1;
    if (!redEdge) {
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 1, `Non-neutral logo shell: ${path} at pixel ${i / 4}`);
      if (a === 255 && r >= 20 && r <= 45) neutral++;
    }
    if (a < 128) continue;
    if (r > g + 30 && r > b + 30) red++;
    if (g > r + 20 && g > b + 20) green++;
  }
  assert.ok(red > size * size * 0.05, `Missing warm red waveform: ${path}`);
  assert.equal(green, 0, `Stale green waveform: ${path}`);
  assert.ok(neutral > size * size * 0.4, `Missing neutral charcoal tile: ${path}`);
}

test('frontend and website share the canonical red waveform', () => {
  assertRedLogo(new URL('src-tauri/icons/icon.png', root), 512);
  assert.deepEqual(readFileSync(new URL('site/assets/handsfree.png', root)), readFileSync(new URL('src-tauri/icons/icon.png', root)));
  assert.match(readFileSync(new URL('src/main.ts', root), 'utf8'), /new URL\('\.\.\/src-tauri\/icons\/icon.png'/);
  assert.match(readFileSync(new URL('site/index.html', root), 'utf8'), /name="theme-color" content="#f7f6f3"/);
  assert.match(readFileSync(new URL('site/index.html', root), 'utf8'), /rel="icon" type="image\/png" href="\.\/assets\/handsfree\.png"/);
});

test('every native ICNS representation contains the red logo at its proper resolution', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'handsfree-icons-'));
  try {
    const iconset = join(directory, 'icon.iconset');
    execFileSync('iconutil', ['-c', 'iconset', new URL('src-tauri/icons/icon.icns', root).pathname, '-o', iconset]);
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) assertRedLogo(join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`), size * scale);
    }
    const bridge = readFileSync(new URL('src-tauri/native/Bridge.swift', root), 'utf8');
    assert.match(bridge, /CFBundleIconFile/);
    assert.match(bridge, /app\.applicationIconImage = icon/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
