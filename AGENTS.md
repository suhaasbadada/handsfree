# HandsFree workflow

- For lifecycle, phase, pending-flag or concurrency changes, start at `docs/STATE-MACHINES.md` and `docs/state-machines.json`. Preserve owner/FIFO/epoch/generation boundaries, update the relevant contract tests, and distinguish UI eligibility from native authorization. Inventory anchors are navigation, not proof of runtime correctness.

- After each completed, validated update, commit and push the changes to GitHub unless the user explicitly asks otherwise. Report the commit and any failed checks or push blockers.
- Do not leave installed app updates uncommitted and unpublished without telling the user.
- Keep signing private keys, certificates, credentials, downloaded speech models, recordings, local settings/statistics, and build artifacts out of Git.
- Use `npm run build:local` for local app updates to preserve the existing signing identity and macOS permissions. Never replace that identity automatically.
