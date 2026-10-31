# HandsFree website

Canonical URL: **https://suhaasbadada.github.io/handsfree/**

The landing page lives in `site/`. It is plain HTML and CSS with no build step, JavaScript, tracking, external fonts, CDN assets, or paid services. The icon in `site/assets/handsfree.png` is a copy of the existing app icon (`src-tauri/icons/icon.png`); update both if the brand changes. The waveform is an illustration, not a product screenshot. Colors follow the system light/dark preference; motion respects reduced-motion settings.

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
- The Mac beta is **prepared, not public**. Keep the CTA as **View beta status**, pointing to the releases index, until a verified public release exists. Do not link to an unpublished asset.
- Windows and Linux are planned, not implemented or downloadable. Do not imply present cross-platform support or invent dates, metrics, testimonials, or performance guarantees.
- The project's MIT grant covers its own code, not dependency/model licenses. The upstream objc2 publication caveat remains unresolved; the website must not suggest that changing the project license clears it.
- When a public Mac beta is approved, update the README, page, and release notes together with the actual release details and limitations. Review third-party and privacy disclosures when changing feature copy.
