# Public presentation audit — issue #8

Audited 2026-11-17 against stable v0.1.1 source and the completed rollout receipt.
This is a documentation/site change, not another app or release acceptance run.

## Before → after

| Surface / claim | Correction or retained evidence |
| --- | --- |
| README: 130 lines / 1,318 words, duplicated installation and update essays | 65 lines / 506 words; one install journey, short usage/features, linked detail. |
| Homebrew and installed OTA marked pending | Current README/site/install/update/security/readiness guidance now reflects completed stable rollout. Exact CI/merge and preservation evidence added to the stable release record. |
| Settings → Overview; old private-test page/buttons | First-launch model download is Settings → **Setup → English model → Download**, not Overview or General. Home has totals, Private Record/Finish and one gear. Product status has recovery actions. Historical practice instructions are explicitly archived below current guidance. |
| Listening sounds and absent Home explanation | Optional **completion sound**, 2–5 minute limit, current Home/private workflow. |
| Long update instructions repeated on landing page | Current footer **Updates → Download & update**, explicit-only requests, restart warning and linked legacy guidance. |
| Release details implied uncompleted distribution | Completed on the tested installed Mac; separate-Mac, physical Fn and universal Bluetooth remain unverified. |

## Entire active site inventory

- `index.html`: metadata, canonical URL, stable badge, requirements, both DMG CTAs,
  Homebrew/trust steps, features, use cases, privacy, setup, footer and demo caption
  reviewed. No future features, testimonials or performance promises added.
- `release.js`: active status corrected only; version, availability and asset URL
  unchanged. Disabled candidate and historical Windows objects remain unchanged.
- `download.js`, `install.js`, `demo.js`, `styles.css`, logo: reviewed, unchanged.
  Demo is a synthetic illustration, not a screenshot or microphone interaction;
  caption, keyboard pause, no-JS and reduced-motion fallbacks remain intact.
- `updates/macos-arm64.json`: unchanged; anonymously fetched live bytes equal the
  checked-in feed, SHA-256 `783a4c1ac21a69e5da782b06e59e29a3716d051bd92973182da434d30ca52fa7`.
- Stable preparation, beta release notes and Windows history retain their bytes.
  No app UI, native behavior, updater policy, assets or release channel changed.

## Links and verification

- Anonymous HTTP HEAD: **19 unique normalized URLs, all 200** (README/site and
  install/update guides, including DMG, release, source/docs, badges, brew.sh,
  tap, Pages and feed). Local Markdown targets exist; site tests check fragments.
- Anonymous GET: live tap cask is **0.1.1**, pinned DMG SHA-256
  `a84f328e880fa58c0055f605ae9bda19ebb6ad9f0a22d819804202684c0bab91`.
  No brew installation/upgrade command was executed.
- `npm test`: **457 passed / 1 skipped**; `npm run build`: passed.
- Both headless website smokes passed: full production JavaScript and no-JS,
  320–1280px layouts, OS/architecture variants, named controls/AX tree, keyboard,
  normal/reduced motion, clipboard fixtures, no automatic downloads and no JS errors.
  Public setup/privacy/status output is checked in the rendered DOM; changed
  journey text has measured contrast of at least 4.5:1. Site remains light under
  dark OS preference by design. Temporary browser profiles/server are cleaned up.
- Full-page screenshots: desktop, expanded release details and mobile with dark
  OS preference, using only the shipped synthetic sample. No app or microphone used.

These edits are not yet deployed. PR/exact-head CI, review and post-merge live
content/CTA verification remain the primary agent's gates. No new hardware,
separate-Mac, physical-key or VoiceOver acceptance is claimed.
