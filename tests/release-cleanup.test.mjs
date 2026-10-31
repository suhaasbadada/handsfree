import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const moduleUrl = new URL('../scripts/check-release.mjs', import.meta.url).href;
const baseline = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
const { createAuditScope } = await import(moduleUrl);
test('import installs no signal handlers or exit behavior', () => {
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), baseline);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'handsfree-release-cleanup-test-'));
  const temporary = join(root, 'own-audit'), mount = join(temporary, 'mounted');
  const unrelated = join(root, 'unrelated-mounted-image');
  mkdirSync(mount, { recursive: true });
  writeFileSync(join(mount, 'mount-marker'), 'mounted');
  writeFileSync(unrelated, 'do not touch');
  const log = join(root, 'detach.log'), executable = join(root, 'fake-detach.mjs');
  writeFileSync(executable, `import {appendFileSync,unlinkSync} from 'node:fs';
const [mount,log,fail]=process.argv.slice(2);
appendFileSync(log,JSON.stringify(process.argv.slice(2))+'\\n');
if(fail==='true')process.exit(9);
unlinkSync(mount+'/mount-marker');\n`);
  return { root, temporary, mount, unrelated, log, executable };
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  for (const fail of [false, true]) {
    test(`${signal}: ${fail ? 'failed detach preserves and diagnoses exact scope' : 'detaches and cleans only its own scope'}; exits ${code}`, { timeout: 10000 }, async () => {
      const f = fixture();
      let child;
      try {
        const source = `
import {execFileSync} from 'node:child_process';
import {createAuditScope} from ${JSON.stringify(moduleUrl)};
const scope=createAuditScope(${JSON.stringify(f.temporary)}, {
  detach: mount=>execFileSync(process.execPath,[${JSON.stringify(f.executable)},mount,${JSON.stringify(f.log)},${JSON.stringify(String(fail))}]),
  onInterrupt: code=>process.exit(code),
});
scope.markAttached();
setInterval(()=>{},1000);
process.send('ready');`;
        child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        let stderr = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => { stderr += chunk; });
        const exited = once(child, 'exit', { signal: AbortSignal.timeout(7000) });
        const [ready] = await once(child, 'message', { signal: AbortSignal.timeout(5000) });
        assert.equal(ready, 'ready');
        assert.equal(child.kill(signal), true);
        assert.deepEqual(await exited, [code, null]);
        assert.deepEqual(readFileSync(f.log, 'utf8').trim().split('\n').map(JSON.parse), [[f.mount, f.log, String(fail)]], 'exact mount passed once; no force/global arguments');
        assert.equal(readFileSync(f.unrelated, 'utf8'), 'do not touch');
        assert.equal(existsSync(f.temporary), fail);
        assert.equal(existsSync(join(f.mount, 'mount-marker')), fail);
        if (fail) {
          assert.ok(stderr.includes(`Detach failed for ${f.mount}`));
          assert.ok(stderr.includes(`preserved audit directory: ${f.temporary}`));
        } else assert.equal(stderr, '');
      } finally {
        if (child && child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
          await once(child, 'exit');
        }
        rmSync(f.root, { recursive: true, force: true });
      }
    });
  }
}

test('normal cleanup is idempotent and removes handlers, including after detach failure', t => {
  const diagnostic = t.mock.method(console, 'error', () => {});
  for (const fail of [false, true]) {
    const f = fixture();
    const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
    let attempts = 0;
    const scope = createAuditScope(f.temporary, { detach: mount => {
      attempts++;
      assert.equal(mount, f.mount);
      if (fail) throw new Error('fake detach failure');
    } });
    try {
      scope.markAttached();
      for (let i = 0; i < 2; i++) {
        if (fail) assert.throws(() => scope.cleanup(), /preserved audit directory/);
        else scope.cleanup();
      }
      assert.equal(attempts, 1);
      assert.equal(existsSync(f.temporary), fail);
      if (fail) assert.ok(diagnostic.mock.calls.some(call => call.arguments[0].includes(`preserved audit directory: ${f.temporary}`)));
      assert.equal(readFileSync(f.unrelated, 'utf8'), 'do not touch');
      assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), before);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});
