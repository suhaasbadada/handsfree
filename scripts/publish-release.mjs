// Canonical publication entry point. Direct gh/admin publication bypasses this
// repository policy and is unsupported; this is not a GitHub permission boundary.
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { main as audit, tag } from './check-release.mjs';
import { verifyHardwareEvidence } from './check-release-smoke.mjs';

const repo = 'suhaasbadada/handsfree';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export function validateSourceCI(runs, commit) {
  if (!Array.isArray(runs) || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Exact-source CI evidence missing');
  const matching = runs.filter(item => item.head_sha === commit && item.path === '.github/workflows/ci.yml')
    .sort((a, b) => b.id - a.id);
  const latest = matching[0];
  if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success' || !Number.isSafeInteger(latest.id) || !latest.html_url?.startsWith(`https://github.com/${repo}/actions/runs/`)) {
    throw new Error('Latest exact-source Checks workflow must be completed/successful before publication');
  }
  return latest;
}
export async function main(args = process.argv.slice(2)) {
  if (args.length < 1 || args.length > 2 || !['--check', '--publish'].includes(args[0]) || args[1]?.startsWith('-')) {
    throw new Error('Usage: node scripts/publish-release.mjs --check | --publish [candidate-directory] (publication requires owner authorization)');
  }
  const directory = resolve(args[1] ?? resolve(root, 'release'));
  // Always the full draft/bytes/signatures/hardware audit, never local-only.
  await audit([directory]);
  const receipt = verifyHardwareEvidence(directory);
  const commit = run('git', ['rev-parse', 'HEAD']);
  if (commit !== receipt.before.sourceCommit || run('git', ['status', '--short', '--untracked-files=normal'])) throw new Error('Source changed before publication');
  const runs = JSON.parse(run('gh', ['api', `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${commit}&per_page=100`]));
  const ci = validateSourceCI(runs.workflow_runs, commit);
  console.log(`Publication gates passed: source ${commit}; Checks run ${ci.id} ${ci.html_url}; fresh exact-candidate hardware receipt.`);
  if (args[0] === '--publish') {
    // No command/env skip override. Invocation itself must be separately approved.
    verifyHardwareEvidence(directory);
    run('gh', ['release', 'edit', tag, '--repo', repo, '--draft=false']);
    console.log(`Published ${tag}; anonymous-public artifact audit, installation, dictation and OTA remain separate gates.`);
  } else console.log('CHECK ONLY: nothing published.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Publication blocked: ${error.message}`); process.exitCode = 1; });
}
