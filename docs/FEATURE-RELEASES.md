# Four lean feature releases

Authorized scope: four sequential releases, one per group. No new AI features,
transcript history, snippets, extra statistics, per-app profiles or theme settings.
Existing recording modes, duration limits and sound controls are retained/refined,
not counted as new implementations.

| Release | Scope | State |
| --- | --- | --- |
| 1 — Get started (beta 11) | Inline setup checklist; explicit permission/model actions; private input meter; configured shortcut tutorial | Verified complete publication/parity gates; exact-source CI, local/draft/public audits, activation CI, Pages, tap CI and live byte readback passed; hardware/OTA acceptance remains separate |
| 2 — Recording controls (beta 12 candidate) | Saved microphone UID/System default; session timer; retain/refine mode, duration and sound controls; stable practice layout and focus transfer | Locally validated in task worktree except latest small Clear focus regression rerun pending; candidate metadata only, not committed, signed, published or hardware/OTA-accepted |
| 3 — Fit your workflow | Launch at login; app exclusions; temporary pause; menu-bar quick controls | Pending |
| 4 — Clear and accessible | Keyboard/VoiceOver; system appearance/reduced motion; status and actionable recovery | Pending |

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

Group 2 [candidate notes](releases/v0.1.1-beta.12.md) do not activate downloads;
public website, signed feed, README and installer links remain beta 11 until the
beta 12 anonymous-public audit and subsequent activation gates pass.

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
