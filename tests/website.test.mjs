import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('site/index.html', root), 'utf8');
const css = readFileSync(new URL('site/styles.css', root), 'utf8');
const workflow = readFileSync(new URL('.github/workflows/pages.yml', root), 'utf8');

test('website local links and assets resolve within the Pages artifact', () => {
  const site = new URL('site/', root).pathname;
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
  for (const [, attribute, url] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if (url.startsWith('https://')) continue;
    if (url.startsWith('#')) {
      assert.ok(ids.includes(url.slice(1)), `Missing anchor: ${url}`);
      continue;
    }
    assert.ok(url.startsWith('./'), `${attribute} must be project-relative: ${url}`);
    const target = resolve(site, url);
    assert.ok(!relative(site, target).startsWith('..'), `Outside site: ${url}`);
    assert.ok(existsSync(target), `Missing asset: ${url}`);
  }
  assert.deepEqual(readFileSync(new URL('site/assets/handsfree.png', root)),
    readFileSync(new URL('src-tauri/icons/icon.png', root)));
});

test('website is dependency-free with accessible, honest platform copy', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /href="#main">Skip to content/);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.match(html, /rel="canonical" href="https:\/\/suhaasbadada.github.io\/handsfree\/"/);
  assert.doesNotMatch(html, /<iframe\b|https?:\/\/[^"\s]+\.(?:js|css)(?:["?])/i);
  assert.match(html, /<script type="module" src="\.\/download.js"><\/script>/);
  assert.doesNotMatch(css, /@import|url\s*\(/i);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /color-scheme:light;/);
  assert.doesNotMatch(css, /prefers-color-scheme/);
  assert.match(css, /focus-visible/);
  assert.match(html, /No public Mac download yet/);
  assert.equal([...html.matchAll(/Not implemented or available to download/g)].length, 2);
  assert.match(html, /href="https:\/\/github.com\/suhaasbadada\/handsfree\/releases">Release notes &amp; status/);
  assert.match(html, /<noscript>/);
  assert.equal([...html.matchAll(/class="button primary"/g)].length, 1, 'One primary action, not competing downloads');
  assert.doesNotMatch(html, /releases\/download\//);
  assert.match(html, /MIT license does not relicense dependencies or clear the publication gate/);
});

test('Pages deployment uses the static artifact, official actions and scoped permissions', () => {
  for (const action of ['checkout@v7', 'configure-pages@v6', 'upload-pages-artifact@v5', 'deploy-pages@v5']) {
    assert.ok(workflow.includes(`uses: actions/${action}`), action);
  }
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /'site\/\*\*'/);
  assert.match(workflow, /'\.github\/workflows\/pages.yml'/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /permissions:\n      pages: write\n      id-token: write/);
  assert.match(workflow, /group: github-pages\n  cancel-in-progress: false/);
  assert.match(workflow, /path: site/);
  assert.match(workflow, /name: github-pages/);
  assert.doesNotMatch(workflow, /secrets\.|CNAME|npm |cargo /);
});

test('project license metadata and grant agree without relicensing dependencies', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root)));
  const lock = JSON.parse(readFileSync(new URL('package-lock.json', root)));
  assert.equal(pkg.license, 'MIT');
  assert.equal(lock.packages[''].license, 'MIT');
  assert.match(readFileSync(new URL('src-tauri/Cargo.toml', root), 'utf8'), /license = "MIT"/);
  const license = readFileSync(new URL('LICENSE', root), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Suhaas Badada/);
  assert.match(license, /THE SOFTWARE IS PROVIDED "AS IS"/);
});
