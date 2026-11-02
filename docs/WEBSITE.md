# HandsFree website

Canonical URL: **https://suhaasbadada.github.io/handsfree/**

The landing page lives in `site/`. It is plain HTML/CSS plus small local JavaScript modules, with no build step, dependencies, tracking, external fonts, CDN assets, or paid services. `release.js` is the versioned release manifest; `download.js` detects OS and renders the single above-fold primary CTA. There are no release API calls or automatic downloads. The published Apple Silicon DMG is a direct link for every visitor, including without JavaScript. Its decorative inline Apple SVG is preserved when JavaScript updates the label. The icon in `site/assets/handsfree.png` is a copy of the existing app icon (`src-tauri/icons/icon.png`); update both if the brand changes. The original logo and warm light/red design remain. The waveform is an illustration, not a product screenshot. Motion respects reduced-motion settings.

## Preview and validate

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory site
# Open http://localhost:8765/
npm test
# Optional, with a local Chromium-compatible browser (server running on 8765):
# BROWSER_BINARY='/path/to/browser' node tests/website-smoke.mjs
```

The website tests check local links/assets, fragment targets, canonical URL, platform disclosures, and the Pages workflow's expected deployment configuration. Run `node tests/download-website-smoke.mjs` for self-contained headless OS, viewport, clipboard, no-JS and reduced-motion coverage (no preview server needed). Check keyboard navigation in a browser before publishing substantial visual changes. No app build or signing is needed to update the website.

## Enable free GitHub Pages (maintainer action)

1. In the public `suhaasbadada/handsfree` repository, open **Settings → Pages → Build and deployment** and choose **GitHub Actions** as the source. Leave **Custom domain** empty; no domain purchase or DNS setup is needed. Leave HTTPS enabled.
2. Merge the website and `.github/workflows/pages.yml` into `main`. The workflow runs on changes to `site/**` or itself. Alternatively run **Actions → Deploy website to GitHub Pages → Run workflow** on `main` after enabling Pages.
3. If the `github-pages` environment requires approval, approve that deployment. Check both workflow jobs and open the canonical URL above. Verify the icon/styles load under `/handsfree/`, and test the release and source links.

API equivalent for step 1 (with an appropriately authorized GitHub CLI): check `gh api repos/suhaasbadada/handsfree/pages`; if Pages does not exist, create it with `gh api --method POST repos/suhaasbadada/handsfree/pages -f build_type=workflow`. For an existing Pages site, use `--method PUT` with the same `build_type` instead. No API calls are needed by the workflow to create a site: configuration is a one-time maintainer action.

The workflow uses official version-pinned Pages actions, uploads **only `site/`**, and grants write permissions only to its deployment job. It uses the standard Pages deployment token, not a personal access token or repository secret. It does not publish an app release. There is no `CNAME` file or custom domain configuration.

## Editing guidelines

- Keep all local asset/navigation URLs project-relative (`./assets/…`, `./styles.css`, `./`, or `#section`) so GitHub Pages' `/handsfree/` subpath works.
- The Mac beta **v0.1.1-beta.4 is published** and `release.js` has `publicAvailable: true`. Its exact canonical versioned DMG URL is validated; invalid or unavailable manifests fail closed. Keep the README, static/no-JS CTA, metadata, and manifest consistent when changing availability. Never replace the immutable published artifact during website-only updates. Release auditing verifies the artifact's original source commit/tree, not later website commits: use the exact packaging-source checkout for `npm run release:check -- --public` rather than changing provenance to match a new HEAD.
- OS detection uses Client Hints with UA/platform fallback. Supported/unknown-architecture Mac visitors see a **Recommended on Mac · Homebrew** command strip above the hero’s direct Apple-logo DMG download. `install.js` reveals copy buttons only with JavaScript; copying requires an explicit click and announces success only after the clipboard write resolves. Denial leaves selectable command text and an accessible error. No command is executed. The hero recommendation is hidden for other OSes, explicit Intel Macs, or unavailable Mac releases; the Mac platform card and visible setup steps still explain Homebrew for intentional Mac installs. Without JavaScript the clearly Mac-labeled hero command and direct DMG remain available. The security caveat is always beside the hero command. Keep setup and trust instructions visible, not behind disclosure widgets.
- Windows x64/unknown-architecture visitors see a direct **Download for Windows** EXE with a Windows logo and secondary Apple-logo Mac link. ARM/32-bit Windows is not automatically offered x64. Linux, mobile, unknown, and unsupported Windows visitors retain a clearly scoped Mac download with appropriate notes. Reliable explicit Intel hints show an unsupported warning but retain the Mac link for intentionally downloading for another device. Safari generally supplies no architecture hint: **MacIntel is not proof of Intel hardware**. No OS guess is persisted or sent anywhere. Both platform cards retain direct downloads; no action requires a manual-install detour.
- The illustrative demo automatically loops through Listening, Processing, complete text, and a short result hold. Its small pause/resume icon is keyboard accessible; there is no play/reset CTA or microphone access. Hidden pages cancel all transitions, returning to one loop when visible; reduced motion and no JavaScript show the complete static example. Loop updates do not move focus, scroll the page, or announce repeatedly to screen readers.
- The experimental Windows x64 EXE is published (unsigned, not yet hardware-tested); Linux remains planned with no download. Do not invent dates, metrics, testimonials, or performance guarantees. Homebrew does not notarize the Mac beta or remove macOS security prompts.
- The project's MIT grant covers its own code, not dependency/model licenses. Preserve upstream evidence and the historical objc2 SDK caveat without inventing a specific prohibition or legal certification; see the recorded experimental distribution decision in `RELEASING.md`.
- When a public Mac beta is approved, update the README, page, and release notes together with the actual release details and limitations. Review third-party and privacy disclosures when changing feature copy.
