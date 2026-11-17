import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// These JSON documents are intentional GitHub API payloads, not source-code
// proxies. The owner-approved PR/CI policy is the independent specification.
test('main protection payload requires PRs and current GitHub Actions checks without a second account',()=>{
  const p=JSON.parse(readFileSync(new URL('../.github/main-protection.json',import.meta.url),'utf8'));
  assert.equal(p.enforce_admins,true);
  assert.equal(p.required_status_checks.strict,true);
  assert.deepEqual(p.required_status_checks.checks,[{context:'mac',app_id:15368}]);
  assert.equal(p.required_pull_request_reviews.required_approving_review_count,0);
  assert.equal(p.required_pull_request_reviews.dismiss_stale_reviews,true);
  assert.equal(p.required_linear_history,true);
  assert.equal(p.required_conversation_resolution,true);
  assert.equal(p.allow_force_pushes,false);
  assert.equal(p.allow_deletions,false);
});
test('repository settings allow only owner-controlled squash merges and merged remote-branch cleanup',()=>{
  const p=JSON.parse(readFileSync(new URL('../.github/repository-settings.json',import.meta.url),'utf8'));
  assert.equal(p.allow_squash_merge,true);
  assert.equal(p.allow_merge_commit,false);
  assert.equal(p.allow_rebase_merge,false);
  assert.equal(p.allow_auto_merge,false);
  assert.equal(p.delete_branch_on_merge,true);
});
