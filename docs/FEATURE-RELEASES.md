# Four lean feature releases

Authorized scope: four sequential releases, one per group. No new AI features,
transcript history, snippets, extra statistics, per-app profiles or theme settings.
Existing recording modes, duration limits and sound controls are retained/refined,
not counted as new implementations.

| Release | Scope | State |
| --- | --- | --- |
| 1 — Get started (beta 11) | Inline setup checklist; explicit permission/model actions; private input meter; configured shortcut tutorial | Local tests/build/Rust checks/browser integration passed; publication pending |
| 2 — Recording controls | Microphone selection; recording timer; retain/refine mode, duration and sound controls | Pending |
| 3 — Fit your workflow | Launch at login; app exclusions; temporary pause; menu-bar quick controls | Pending |
| 4 — Clear and accessible | Keyboard/VoiceOver; system appearance/reduced motion; status and actionable recovery | Pending |

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
