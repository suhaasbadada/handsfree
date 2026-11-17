# PR-first release process

## Source changes

1. Discuss larger work in an issue. Use the assigned task branch/T3 worktree;
   preserve unrelated work. Do not implement in the main checkout or push to main.
2. Add behavioral regressions, reproduce reported bugs where feasible, run the
   relevant checks and obtain independent review. Keep changes small and scoped.
3. Push the task branch and open a PR to `main`. Record the full head SHA, exact
   required check run, findings and manual tests. Never call skipped/unknown checks
   green or use another head's success.
4. Resolve findings/discussions and update the branch through the active harness's
   normal workflow. Required `mac` CI must pass on the exact current PR head and
   the branch must be up to date. Hosted checks do not use signing keys or prove
   real microphone capture, inference accuracy or an installed update.
5. Squash-merge only with explicit owner authority for the task. This repository
   does not require a second GitHub account's approval; that does not replace
   independent review or authorize an agent to merge on its own. Record the merge
   SHA and verify the corresponding post-merge checks.

## Enforcement

The owner-approved GitHub configuration is in
`.github/main-protection.json` and `.github/repository-settings.json`. It requires
PRs, current `mac` checks from GitHub Actions, an up-to-date base, resolved
conversations, linear history and squash merges, including for administrators.
Force-push and protected-branch deletion are disabled. Repository administrators
can change GitHub settings; this is governance, not an unbreakable security claim.
Do not disable protections or use administrator bypass to ship a failed change.

Authorized maintainers apply the reviewed API payloads with:

```sh
gh api --method PUT repos/suhaasbadada/handsfree/branches/main/protection --input .github/main-protection.json
gh api --method PATCH repos/suhaasbadada/handsfree --input .github/repository-settings.json
```

Read back the actual settings after applying; a JSON file alone does not enforce
anything. The required check name must continue to match the live workflow job.

## Candidate and publication

1. Obtain explicit owner agreement on version/channel, scope, signing policy and
   merge/publication authority. Stable is not synonymous with Apple notarization.
   Keep self-signed/not-notarized disclosures unless that policy is separately
   changed. Do not replace an existing identity or reset permissions.
2. Prepare candidate coordinates and release notes in a PR. Active public
   downloads and the signed feed remain on the previous release until the new
   public bytes are verified. Never rewrite historical release evidence.
3. From clean, reviewed, committed source, build/package using the existing
   identity and `npm run build:local` through the packaging scripts. Preserve
   previous artifacts and failed evidence; do not overwrite a published version.
   Record exact source tree, executable/bundle/archive/signature hashes and CI.
   If source changes, rebuild and repeat exact-candidate acceptance.
4. Run the signed candidate's real hardware capture/finish/cancellation gate and
   private Practice recognition/preservation acceptance. Retain actual failures,
   route coverage and limitations. Green hosted CI is not hardware evidence.
5. Create the versioned draft with exactly the audited assets and exact source
   target. Run local/full draft audits and the latest exact-source Checks gate.
6. Publish only through `node scripts/publish-release.mjs --publish release`, with
   owner authorization. No skip flags, permission resets or substituted receipts.
   Then run the anonymous-public byte/signature audit before activation.

## Distribution and installed acceptance

1. Open a separate metadata-activation PR for verified download links, release
   status and the exact signed feed. Review/check/merge it under the same policy.
   Verify Pages success and read back the actual live website/feed bytes.
2. Keep `suhaasbadada/homebrew-handsfree` separate. Open a cask version/checksum PR
   there using the verified public DMG; preserve signing/security notices and user
   data. Require its real cask CI and explicit merge authority. Verify the merged
   cask and actual version/hash; do not claim parity while the tap lags.
3. Perform the installed app's real in-app download/restart only with the user's
   consent for that task. If the user wants to click, wait for their action; do not
   replace the app manually or claim an automated click occurred.
4. Verify the actual installed path, new process, exact executable/bundle, signing
   requirement, permissions, model and settings/usage preservation. Do not mistake
   legitimate user changes for loss. Verify representative dictation and clipboard
   preservation where authorized; report untested facts honestly.
5. Record source CI, hardware/private acceptance, public audit, activation CI,
   Pages/feed, tap CI/parity and installed functional acceptance as separate gates.
   Only then report the authorized release complete. Owner-directed deferrals must
   remain explicit, not silently converted into passing acceptance.

## Branch hygiene

Merged remote PR branches can be deleted automatically. Keep local/T3 worktrees
intact. Before older-branch cleanup, inventory merge containment, unique commits,
open PRs and worktree ownership; obtain an explicit deletion list. A stale-looking
name or a prunable registration is not permission to discard data. Never bulk
prune worktrees, delete paused platform work or force-reset another task.

## Stable transition

The owner has authorized first stable `v0.1.1` after issues #1 and #2 are fixed and
verified. Keep the approved UI and English/Mac scope; enhancements and the broader
README/landing-page audit are separate work. Version/channel audit changes must
keep the same fail-closed signature, source, freshness and hardware requirements.
Future releases still require their own owner authority; this approval is not a
standing permission to publish arbitrary changes.
