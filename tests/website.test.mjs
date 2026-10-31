import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('site/index.html', root), 'utf8');
const css = readFileSync(new URL('site/styles.css', root), 'utf8');
const workflow = readFileSync(new URL('.github/workflows/pages.yml', root), 'utf8');

test('open-source section uses an accessible GitHub icon without decorative arrows', () => {
  const section = html.match(/<section class="open-note[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.match(section, /class="github-link"[^>]*href="https:\/\/github.com\/suhaasbadada\/handsfree"[^>]*aria-label="View HandsFree on GitHub"/);
  assert.match(section, /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(section, /↗|open-mark|Meet the project|Explore source/i);
});

test('hero and README lead with the same grounded thought-first positioning', () => {
  const readme = readFileSync(new URL('README.md', root), 'utf8');
  const headline = html.match(/<h1 id="hero-title">([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '');
  assert.equal(headline, 'Don’t lose your train of thought.');
  assert.ok(readme.includes(`**${headline}**`));
  const support = 'Say it while it’s clear. HandsFree turns your thoughts into text, without making typing the bottleneck.';
  assert.ok(html.includes(support));
  assert.ok(readme.includes(support));
  assert.match(css, /\.hero h1 em\{font-style:normal\}/);
});

test('use cases are concise, semantic, and honest about coding-tool support', () => {
  const section = html.match(/<section[^>]*id="usecases"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.match(section, /aria-labelledby="usecases-title"/);
  assert.match(section, /<h2 id="usecases-title">Talk through the work\.<\/h2>/);
  assert.match(section, /<ul class="usecase-list" role="list">/);
  assert.equal([...section.matchAll(/<li\b/g)].length, 4);
  assert.equal([...section.matchAll(/<svg class="usecase-icon"[^>]*aria-hidden="true"[^>]*focusable="false"/g)].length, 4);
  assert.match(section, /<li class="usecase-featured">/);
  assert.match(section, /<blockquote>/);
  assert.doesNotMatch(section, /usecase-number/);
  for (const title of ['Think out loud with your coding assistant.', 'Messages &amp; email', 'Notes &amp; ideas', 'First drafts']) {
    assert.ok(section.includes(`<h3>${title}</h3>`));
  }
  const readme = readFileSync(new URL('README.md', root), 'utf8');
  const cases = readme.match(/## Use cases\n([\s\S]*?)\n## Platforms/)?.[1];
  assert.ok(cases);
  assert.equal([...cases.matchAll(/^- /gm)].length, 4);
  for (const copy of [section, cases]) {
    assert.match(copy, /Claude Code or Codex/);
    assert.match(copy, /No special integration/);
    assert.match(copy, /depends on the focused field/);
    assert.match(copy, /clipboard/);
    assert.match(copy, /HandsFree doesn’t run commands/);
    assert.doesNotMatch(copy, /official|plugin|seamless integration|guaranteed/i);
    assert.ok(copy.replace(/<[^>]+>/g, ' ').split(/\s+/).length < 180, 'Keep use cases scannable');
  }
});

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

test('hero demonstrates dictation honestly with an accessible static fallback', () => {
  assert.match(html, /<script type="module" src="\.\/demo.js"><\/script>/);
  assert.match(html, /Illustrative demo — no microphone access/);
  assert.match(html, /<label[^>]+for="demo-text">Text<\/label>/);
  assert.match(html, /<textarea id="demo-text" readonly[^>]*>Let’s move our meeting to tomorrow morning\.<\/textarea>/);
  assert.match(html, /<button id="demo-play"[^>]* hidden>Play demo/);
  assert.match(html, /id="demo-status"[^>]*role="status"[^>]*aria-atomic="true"/);
  assert.doesNotMatch(html + css, /voice-garden|wave-seed|garden-label|\borbit\b|infinite/);
  const js = readFileSync(new URL('site/demo.js', root), 'utf8');
  assert.doesNotMatch(js, /getUserMedia|SpeechRecognition|AudioContext|fetch\(/);
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
