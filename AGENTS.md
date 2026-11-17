# HandsFree workflow

- Use local tests, review and GitHub's required PR checks directly. Do not run No Mistakes for this repository.

- For lifecycle, phase, pending-flag or concurrency changes, start at `docs/STATE-MACHINES.md` and `docs/state-machines.json`. Preserve owner/FIFO/epoch/generation boundaries, update the relevant contract tests, and distinguish UI eligibility from native authorization. Inventory anchors are navigation, not proof of runtime correctness.

- After each completed, validated update, commit and push only the task branch and open/update a pull request targeting `main`. Never push directly to `main`, force-push a protected branch, or bypass its PR/CI requirements. Report the PR, full head SHA and actual check states.
- Merge only after exact-head required checks, review findings and discussions are resolved, and the user has authorized merging for the task. Publication and stable-channel changes require explicit owner authorization; a green PR alone is not release approval.
- Use squash merges. Merged remote branches may be automatically deleted; preserve local/T3 worktrees and unmerged branches. Do not prune old worktrees or bulk-delete branches without an approved inventory.
- Do not leave installed app updates uncommitted and unpublished without telling the user.
- Keep signing private keys, certificates, credentials, downloaded speech models, recordings, local settings/statistics, and build artifacts out of Git.
- Use `npm run build:local` for local app updates to preserve the existing signing identity and macOS permissions. Never replace that identity automatically.

## Mandatory release acceptance

Follow [the release process](docs/RELEASE-PROCESS.md). Keep the application and Homebrew tap as separate repositories; no consolidation tooling is part of the release workflow.

- Publish only through `node scripts/publish-release.mjs --publish release`, after exact signed-candidate real-hardware capture/cancellation and private Practice acceptance. Green CI is not hardware evidence.
- Missing permission, failed/stale/mismatched evidence or failed acceptance blocks release; never bypass the gate, reset permissions or substitute another build's results.
- Completion requires the installed app's in-app OTA/restart, representative dictation and preservation checks for signing identity, models, settings, usage and clipboard. Publication or manual app replacement does not establish completion; report pending gates explicitly.
