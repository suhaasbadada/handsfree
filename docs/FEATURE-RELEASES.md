# Four lean feature releases

Authorized scope: four sequential releases, one per group. No new AI features,
transcript history, snippets, extra statistics, per-app profiles or theme settings.
Existing recording modes, duration limits and sound controls are retained/refined,
not counted as new implementations.

| Release | Scope | State |
| --- | --- | --- |
| 1 — Get started (beta 11) | Inline setup checklist; explicit permission/model actions; private input meter; configured shortcut tutorial | Verified complete publication/parity gates; exact-source CI, local/draft/public audits, activation CI, Pages, tap CI and live byte readback passed; hardware/OTA acceptance remains separate |
| 2 — Recording controls (beta 12) | Saved microphone UID/System default; session timer; retain/refine mode, duration and sound controls; stable practice layout and focus transfer | COMPLETE: publication/parity verified, including activation CI, Pages, tap CI and live feed/page bytes; hardware/OTA acceptance separate |
| 3 — Fit your workflow (beta 13) | Launch at login; app exclusions; temporary pause; menu-bar quick controls | COMPLETE: publication/parity verified; source/public audit, repaired activation CI, Pages, tap CI and live site/feed byte readback passed; hardware/ServiceManagement/AppKit ordering/OTA acceptance unverified |
| 4 — Clear and accessible (beta 14) | Keyboard/VoiceOver; system appearance/reduced motion; status and actionable recovery; latest-offer updater bugfix | Unpublished candidate preparation; final validation, exact-source CI, signing and local/draft/public audits pending; no installed OTA/VoiceOver/hardware/login-OS acceptance claimed |

## Group 1 verified completion evidence

- App artifact source: `994bcb82b2cb92a08badbd4754695378f89afa88`;
  [source CI 42761543948](https://github.com/suhaasbadada/handsfree/actions/runs/42761543948) passed.
- Activation: `8ca7ea9bab03e240fddbf1e9017169e5c70c8bff`;
  [activation CI 42762733421](https://github.com/suhaasbadada/handsfree/actions/runs/42762733421)
  and [Pages 42762733468](https://github.com/suhaasbadada/handsfree/actions/runs/42762733468) passed.
- Homebrew tap: `3b29243b6b776f2c88493ec50652a123ebce251c`;
  [tap CI 42762691517](https://github.com/suhaasbadada/homebrew-handsfree/actions/runs/42762691517) passed.
- Live website/feed byte readback and remote cask coordinates were verified.
  These publication/parity checks are not microphone hardware or OTA acceptance.

## Group 2 publication evidence — COMPLETE

- [Published beta 12](https://github.com/suhaasbadada/handsfree/releases/tag/v0.1.1-beta.12),
  artifact source `40e56571584dd6f17df020571f523a6e45b110b1`;
  [source CI 42765942619](https://github.com/suhaasbadada/handsfree/actions/runs/42765942619) passed.
- Local/draft/anonymous-public seven-asset audits passed. Repository website,
  README/install links and the exact generated signed feed now select beta 12;
  the candidate export remains disabled.
- Activation `fff4b4204aa8d144111cf5d9b491b6fc1728d6d0`,
  [activation CI 42767293534](https://github.com/suhaasbadada/handsfree/actions/runs/42767293534)
  and [Pages 42767293520](https://github.com/suhaasbadada/handsfree/actions/runs/42767293520) passed.
- Tap `a933768c5c0586093b9becb9f1d4cbdfc125d968`,
  [tap CI 42767247856](https://github.com/suhaasbadada/homebrew-handsfree/actions/runs/42767247856)
  passed. Live website/feed byte readback and matching remote cask coordinates
  were verified (primary's verified handoff).
  Hardware/OTA acceptance remains separate and unverified.
- [Beta 12 notes](releases/v0.1.1-beta.12.md) record hashes and preservation boundaries.

## Group 3 publication evidence — COMPLETE

- [Published beta 13](https://github.com/suhaasbadada/handsfree/releases/tag/v0.1.1-beta.13),
  artifact source `aed1c5c213639958b3b418e54c2330b9ebc80e76`;
  [source CI 42775050746](https://github.com/suhaasbadada/handsfree/actions/runs/42775050746) passed.
- Exact-source anonymous-public seven-asset audit passed. Repository active
  release/site/README/install links and the exact signed feed select beta 13;
  disabled candidate coordinates now prepare beta 14 without changing active beta 13.
- DMG SHA-256: `48eee3b3684875b11c586ea4af9fec22fdefe150485db1f53f21e4e6f85a184e`.
  Updater archive SHA-256: `17308d0483e7d9820d9d585b4038c128ccc9637ecd70707c02dcba457de02271`.
  Exact feed SHA-256: `055169ccc4670c7f8b5c19f018920e9bae4cbc365e0472a0b47d3a14ccb0e675`.
  Prior outputs: `release/history/beta12-before-beta13-dsrbi6sn/`.
- Activation `e6c13c991884fc5b3e9da75b85256845fee181b4`:
  [Pages 42776429338](https://github.com/suhaasbadada/handsfree/actions/runs/42776429338) passed.
  Initial [activation CI 42776429267](https://github.com/suhaasbadada/handsfree/actions/runs/42776429267)
  **FAILED**, because a test read an ignored local release file. Repair
  `99fd55f03f905b079915aededd7a7c3870b85d81` pins the audited feed hash in the
  tracked source oracle instead of reading ignored local artifacts;
  [repair CI 42778706884](https://github.com/suhaasbadada/handsfree/actions/runs/42778706884)
  **PASSED**, including all 14 beta tests in that clean fixture.
- Homebrew tap `777c6b32cafa18444a1c437b3960a8685c721861`:
  [tap CI 42776388356](https://github.com/suhaasbadada/homebrew-handsfree/actions/runs/42776388356) passed.
  Live beta 13 website/feed byte readback and matching remote cask coordinates
  were verified (primary's verified handoff), independently of CI/Pages.
  The stale updater expiry repair
  is separate group 4 / beta 14 source work, not a changed beta 13 artifact.
- [Published notes](releases/v0.1.1-beta.13.md) distinguish synthetic coverage
  from actual OS login, AppKit/window ordering, hardware and OTA acceptance,
  all still unverified. No VoiceOver acceptance is claimed.

## Group 4 implementation evidence — candidate preparation, unpublished

Production-DOM CDP coverage exercises real key dispatch and browser AX names for
the brand menu and status regions, bounded error scrolling/stable positions,
explicit existing recovery destinations, login pending/cancel/failure focus,
exclusion next/previous/picker focus and delayed-completion no-steal guards.
These checks preserve the beta 12 practice layout/privacy contract, existing
receipt/toggle/hold/clipboard/statistics coverage and explicit updater consent.
Source also follows system appearance without a forced native Light theme or
background, adds reduced-motion/runtime-contrast coverage, and refreshes the
latest updater offer on explicit Download intent before exact-version/revision
confirmation. Expired/changed offers require review; Check again needs no restart.
Command-line AppKit tests exercise NSButton target/actions, not AXPress or
VoiceOver acceptance. Final validation, exact-source CI, signing and
local/draft/anonymous-public audits remain pending for group 4 / beta 14.
No checks establish real macOS VoiceOver, hardware dictation, ServiceManagement
or installed OTA replacement/restart acceptance. No custom preferences, AI
feature or extra stored user data is added. See [candidate notes](releases/v0.1.1-beta.14.md).

## Mandatory parity gate for every release

The app repository and `suhaasbadada/homebrew-handsfree` are separate repositories,
not mirrors. Keep their **distribution coordinates** aligned:

1. Build once from reviewed clean source with existing signing identities.
2. Pass exact-source CI and local/draft/anonymous-public artifact audits.
3. Activate the exact audited signed feed and website DMG coordinates.
4. Publish the cask with that version, canonical DMG URL and audited SHA-256.
5. Verify live website/feed bytes, remote cask contents and tap CI independently.
6. Record release URL, source SHA, run IDs, activation SHA and tap SHA together.

Never overwrite historical artifacts, change signing identities or reset totals.
Do not replace the installed app manually: the user upgrades through the app.
Microphone hardware, OTA replacement/restart and separate-Mac acceptance are
separate gates; report them as unverified until actually exercised.
