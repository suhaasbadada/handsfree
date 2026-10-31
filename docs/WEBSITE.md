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

The website tests check local links/assets, fragment targets, canonical URL, platform disclosures, and the Pages workflow's expected deployment configuration. Check desktop/mobile layouts, keyboard navigation, dark mode, and reduced motion in a browser before publishing substantial visual changes. No app build or signing is needed to update the website.

## Enable free GitHub Pages (maintainer action)

1. In the public `suhaasbadada/handsfree` repository, open **Settings → Pages → Build and deployment** and choose **GitHub Actions** as the source. Leave **Custom domain** empty; no domain purchase or DNS setup is needed. Leave HTTPS enabled.
2. Merge the website and `.github/workflows/pages.yml` into `main`. The workflow runs on changes to `site/**` or itself. Alternatively run **Actions → Deploy website to GitHub Pages → Run workflow** on `main` after enabling Pages.
3. If the `github-pages` environment requires approval, approve that deployment. Check both workflow jobs and open the canonical URL above. Verify the icon/styles load under `/handsfree/`, and test the release and source links.

API equivalent for step 1 (with an appropriately authorized GitHub CLI): check `gh api repos/suhaasbadada/handsfree/pages`; if Pages does not exist, create it with `gh api --method POST repos/suhaasbadada/handsfree/pages -f build_type=workflow`. For an existing Pages site, use `--method PUT` with the same `build_type` instead. No API calls are needed by the workflow to create a site: configuration is a one-time maintainer action.

The workflow uses official version-pinned Pages actions, uploads **only `site/`**, and grants write permissions only to its deployment job. It uses the standard Pages deployment token, not a personal access token or repository secret. It does not publish an app release. There is no `CNAME` file or custom domain configuration.

## Editing guidelines

- Keep all local asset/navigation URLs project-relative (`./assets/…`, `./styles.css`, `./`, or `#section`) so GitHub Pages' `/handsfree/` subpath works.
- The Mac beta **v0.1.1-beta.2 is being verified** and `release.js` has `publicAvailable: false`. Its exact canonical versioned DMG URL is validated; invalid or unavailable manifests fail closed. Keep the README, static/no-JS CTA, metadata, and manifest consistent when changing availability. Never replace the immutable published artifact during website-only updates. Release auditing verifies the artifact's original source commit/tree, not later website commits: use the exact packaging-source checkout for `npm run release:check -- --public` rather than changing provenance to match a new HEAD.
- OS detection uses Client Hints with UA/platform fallback. Mac visitors see **Download for Mac**; Windows, Linux, mobile, and unknown visitors see **Get Mac beta**, all linking directly to the same Apple Silicon asset. Requirements remain adjacent and the accessible name is **Download for Mac (Apple Silicon)**. Windows/Linux visitors get a small planned-platform note. Reliable explicit Intel hints show an unsupported warning but retain the clearly scoped link for intentionally downloading for another Mac. Safari generally supplies no architecture hint: **MacIntel is not proof of Intel hardware**. No architecture or OS guess is persisted or sent anywhere. The platform card also offers a direct DMG link; neither action requires scrolling through installation steps.
- The illustrative demo automatically loops through Listening, Processing, complete text, and a short result hold. Its small pause/resume icon is keyboard accessible; there is no play/reset CTA or microphone access. Hidden pages cancel all transitions, returning to one loop when visible; reduced motion and no JavaScript show the complete static example. Loop updates do not move focus, scroll the page, or announce repeatedly to screen readers.
- Windows and Linux are planned, not implemented or downloadable. Do not imply present cross-platform support or invent dates, metrics, testimonials, or performance guarantees.
- The project's MIT grant covers its own code, not dependency/model licenses. Preserve upstream evidence and the historical objc2 SDK caveat without inventing a specific prohibition or legal certification; see the recorded experimental distribution decision in `RELEASING.md`.
- When a public Mac beta is approved, update the README, page, and release notes together with the actual release details and limitations. Review third-party and privacy disclosures when changing feature copy.
