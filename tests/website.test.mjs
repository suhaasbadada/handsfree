import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homebrewCommand } from '../site/install.js';
import { release, windowsRelease } from '../site/release.js';

// Static defaults and JavaScript must select the same verified public release.
const publishedMacUrl = 'https://github.com/suhaasbadada/handsfree/releases/download/v0.1.1-beta.14/HandsFree-0.1.1-beta.14-macos-arm64.dmg';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('site/index.html', root), 'utf8');
const css = readFileSync(new URL('site/styles.css', root), 'utf8');
const workflow = readFileSync(new URL('.github/workflows/pages.yml', root), 'utf8');

test('Homebrew is recommended and visible in the hero, with safe setup across docs', () => {
  const readme = readFileSync(new URL('README.md', root), 'utf8');
  const install = readFileSync(new URL('docs/INSTALL.md', root), 'utf8');
  const command = homebrewCommand;
  const download = readme.match(/## Download & install\n([\s\S]*?)\n## Features/)?.[1];
  assert.ok(download.indexOf(command) < download.indexOf('Download for Mac (.dmg)'));
  assert.match(download, /Homebrew recommended/);
  const section = html.match(/<section class="getting-started[\s\S]*?<\/section>/)?.[0];
  assert.ok(section.includes(command));
  assert.match(section, /Homebrew recommended/);
  const hero = html.match(/<section class="hero[\s\S]*?<\/section>/)[0];
  assert.ok(hero.indexOf(command) < hero.indexOf('id="primary-download"'));
  assert.match(hero, /Recommended on Mac · Homebrew/);
  assert.match(hero, /Homebrew simplifies installation; macOS security prompts may still appear\./);
  assert.match(hero, /href="https:\/\/brew.sh\/"/);
  for (const copy of [download, section, install]) {
    assert.ok(copy.includes(command));
    assert.match(copy, /https:\/\/github.com\/suhaasbadada\/homebrew-handsfree#readme/);
    assert.match(copy, /trust/i);
    assert.match(copy, /Apple (?:identity|approval)/);
    assert.match(copy, /notarization|not notarized/);
    // Permit the explicit data-safety prohibition, never a destructive command.
    assert.doesNotMatch(copy.replace('Do not use `--zap`', ''), /--no-quarantine|--force|--zap|sudo|xattr|spctl|rm -|\bbrew trust (?!\x2d\x2dcask suhaasbadada\/handsfree\/handsfree)/);
    const tokens = [...copy.matchAll(/brew (?:install|upgrade|trust) --cask ([^\s<`]+)/g)].map(match => match[1]);
    assert.ok(tokens.every(token => token === 'suhaasbadada/handsfree/handsfree'));
  }
  assert.match(install, /Only if prompted/);
  assert.match(install, /brew trust --cask suhaasbadada\/handsfree\/handsfree/);
  assert.match(install, /brew update\nbrew upgrade --cask suhaasbadada\/handsfree\/handsfree/);
  assert.match(install, /keep using your current manual installation/);
  assert.match(install, /quit HandsFree and move the existing app copy to a safe backup/);
  assert.match(install, /do not delete your models, settings, statistics, or other user data/);
  assert.match(install, /Gatekeeper, quarantine/);
  assert.match(install, /Do not use `--zap`, delete HandsFree's data folders, or reset totals to update/);
  assert.match(css, /\.homebrew-option>code\{[^}]*white-space:normal;overflow-wrap:anywhere/);
});

test('hero has a direct, accessible Mac download with a real decorative Apple SVG', () => {
  const hero = html.match(/<section class="hero[\s\S]*?<\/section>/)[0];
  const cta = hero.match(/<a id="primary-download"[\s\S]*?<\/a>/)[0];
  assert.match(cta, /href="https:\/\/github.com\/suhaasbadada\/handsfree\/releases\/download\/[^\"]+\.dmg"/);
  assert.match(cta, /aria-label="Download for Mac \(Apple Silicon\)"/);
  assert.match(cta, /<svg class="apple-logo"[^>]*fill="currentColor"[^>]*aria-hidden="true"[^>]*focusable="false"><path d="[^"]+"\/><\/svg><span id="download-label">Download for Mac<\/span>/);
  assert.doesNotMatch(cta, /aria-disabled|tabindex/);
  assert.doesNotMatch(hero, /Explore (the )?source/);
  assert.equal([...html.matchAll(/class="apple-logo"/g)].length, 2, 'Both Mac controls retain the monochrome Apple symbol');
  assert.match(html, /class="card-top"><span class="platform-symbol" aria-hidden="true">⌘<\/span>/);
  const readme = readFileSync(new URL('README.md', root), 'utf8');
  assert.ok(readme.indexOf('## Download') < readme.indexOf('## Features'));
  assert.ok(readme.indexOf('### Mac — Homebrew recommended') < 1100, 'Recommended Mac installation leads the README');
  assert.ok(readme.indexOf('### [Download for Mac (.dmg)]') < readme.indexOf('## Features'), 'Direct DMG alternative remains in the download section');
  for (const link of ['CONTRIBUTING.md', 'SECURITY.md', 'LICENSE']) assert.ok(readme.includes(`](${link})`));
});

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
  const site = fileURLToPath(new URL('site/', root));
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
  assert.match(html, /Experimental Mac beta available/);
  assert.match(html, /Windows development is paused/);
  assert.match(html, /Windows and Linux are not supported/);
  assert.equal(windowsRelease.publicAvailable, false);
  assert.doesNotMatch(html, /href="[^"]*\.exe|windows-card-download|Download for Windows|Linux planned|coming soon|Still ahead|More desktops, in time|Cross-platform is the direction/i);
  assert.match(html, /about 148 MB/);
  assert.match(html, /<noscript>/);
  const nojs = html.match(/<noscript>([\s\S]*?)<\/noscript>/)[1];
  assert.match(nojs, /Windows, Linux, Intel Macs and mobile devices are not supported/);
  assert.match(nojs, /download only to transfer to a compatible Mac/);
  assert.equal([...html.matchAll(/class="button primary"/g)].length, 2, 'Hero and platform card offer the same Mac download');
  assert.equal(release.publicAvailable, true, 'Activated manifest selects the verified public Mac beta');
  assert.equal(release.dmgUrl, publishedMacUrl);
  assert.ok(html.includes(`href="${publishedMacUrl}"`), 'Static defaults retain the verified published Mac beta');
  assert.match(html, /MIT license does not relicense dependencies/);
});

test('Mac platform card has a primary Apple download, with technical details disclosed below', () => {
  const card = html.match(/<article class="platform-card available">[\s\S]*?<\/article>/)?.[0];
  assert.ok(card);
  const cta = card.match(/<a class="button primary"[\s\S]*?<\/a>/)?.[0];
  assert.ok(cta);
  assert.ok(cta.includes(`href="${publishedMacUrl}"`), 'Static card retains the verified published Mac beta');
  assert.match(cta, /aria-label="Download for Mac \(Apple Silicon\)"/);
  assert.match(cta, /<svg class="apple-logo"[^>]*aria-hidden="true"[^>]*focusable="false"><path d="[^"]+"\/><\/svg><span>Download for Mac<\/span>/);
  assert.match(card, /Apple Silicon · macOS 14\+ · English/);
  assert.match(card, /Speak naturally\. Get text where you work\./);
  assert.doesNotMatch(card, /card-footnote|text-link|notarized|self-signed|Intel|Open Anyway|drag HandsFree/i);
  assert.match(css, /\.platform-card\.available \.button\{margin-top:auto;max-width:none;gap:10px\}/);
  const details = html.match(/<details class="release-note">[\s\S]*?<\/details>/)?.[0];
  assert.match(details, /Intel Macs and mobile devices are not supported/);
  assert.match(details, /locally self-signed, not notarized/);
  assert.match(details, /Open Anyway/);
  assert.match(details, /Managed Macs may not allow this override/);
  assert.match(details, /MIT license does not relicense dependencies/);
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
  assert.match(html, /<label class="visually-hidden" for="demo-text">Text<\/label>/);
  assert.match(html, /<textarea id="demo-text" readonly[^>]*>Let’s move our meeting to tomorrow morning\.<\/textarea>/);
  assert.match(html, /<button id="demo-pause"[^>]*aria-label="Pause animation"[^>]* hidden>/);
  assert.doesNotMatch(html, /Play demo|Reset demo|demo-play|demo-status/);
  const demo = html.match(/<figure class="dictation-demo"[\s\S]*?<\/figure>/)[0];
  assert.doesNotMatch(demo + css, /demo-card|demo-label/);
  assert.match(css, /#demo-text\{[^}]*border:0;[^}]*background:transparent;[^}]*padding:0;/);
  assert.doesNotMatch(demo, /aria-live|role="status"/);
  assert.doesNotMatch(html + css, /voice-garden|wave-seed|garden-label|\borbit\b|infinite/);
  const js = readFileSync(new URL('site/demo.js', root), 'utf8');
  assert.doesNotMatch(js, /getUserMedia|SpeechRecognition|AudioContext|fetch\(/);
});

test('hero is concise; architecture guidance and publication details are disclosed below', () => {
  const hero = html.match(/<section class="hero[\s\S]*?<\/section>/)[0];
  assert.match(hero, /id="download-requirements"[^>]*>For Apple Silicon Mac · macOS 14\+ · English<\/p>/);
  assert.doesNotMatch(hero, /About This Mac|licensing review|No public Mac download|id="release-status"/);
  assert.match(html, /<details class="release-note">[\s\S]*About This Mac[\s\S]*id="release-status"/);
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
