import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('paused Windows candidate workflow is manual-only, x64, read-only and never publishes', () => {
  const workflow = read('.github/workflows/windows.yml');
  const triggers = workflow.split(/^on:\s*$/m)[1]?.split(/^permissions:/m)[0];
  assert.ok(triggers, 'Workflow has an explicit trigger block');
  assert.deepEqual(triggers.split('\n').map(line => line.replace(/#.*/, '').trim()).filter(Boolean), ['workflow_dispatch:']);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|pull_request_target|schedule|workflow_call|workflow_run):/m);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runs-on: windows-2022/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /stable-x86_64-pc-windows-msvc/);
  for (const check of ['npm ci', 'npm test', 'npm run build', './scripts/windows-package.ps1']) assert.ok(workflow.includes(check));
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /path: release\/windows-x64\/\s+# [^\n]+\n\s+include-hidden-files: true/);
  assert.doesNotMatch(workflow, /secrets\.|contents: write|gh release|tauri-action|build:local/);
  assert.match(workflow, /Verify actual CPU transcription without microphone access/);
  assert.match(workflow, /Get-FileHash \$model -Algorithm SHA256/);
  assert.match(workflow, /real_model_pipeline_smoke -- --ignored --nocapture/);
  assert.ok(workflow.indexOf('real_model_pipeline_smoke') < workflow.indexOf('actions/upload-artifact@v7'));
  const mac = read('.github/workflows/ci.yml');
  assert.match(mac, /push:/);
  assert.match(mac, /pull_request:/);
  assert.match(mac, /runs-on: macos-/);
});

test('Windows packaging prepares notices before native compilation and inspects the NSIS payload', () => {
  const script = read('scripts/windows-package.ps1');
  const env = read('scripts/windows-env.ps1');
  assert.ok(script.indexOf("'scripts/release-notices.py'") < script.indexOf("@('test'"));
  for (const command of ['fmt', 'test', 'clippy', 'fetch']) assert.ok(script.includes(`@('${command}'`));
  assert.match(script, /'--locked'/);
  assert.match(script, /'--all-targets', '--', '-D', 'warnings'/);
  assert.match(script, /'--config', 'src-tauri\/tauri.windows.conf.json', '--bundles', 'nsis'/);
  assert.match(script, /Invoke-Checked 7z @\('t'/);
  for (const file of ['THIRD_PARTY_SOURCES.tar.gz', 'inventory.json', 'COPYRIGHT-library.html', 'PROVENANCE.txt']) assert.ok(script.includes(file));
  assert.match(script, /'scripts\/windows-artifact-checksums.py', \$output/);
  for (const file of ['SHA256SUMS', 'BUILD-SHA256SUMS']) assert.ok(read('scripts/windows-artifact-checksums.py').includes(file));
  assert.match(script, /Candidate output exists/);
  assert.match(script, /'scripts\/windows-source-state.py', 'snapshot'/);
  assert.match(script, /'scripts\/windows-source-state.py', 'restore'/);
  assert.ok(script.indexOf("'snapshot'") < script.indexOf("@('fmt'"));
  assert.ok(script.indexOf("'restore'") > script.indexOf("@('run', 'tauri', 'build'"));
  assert.match(script, /if \(\$dirty -or \$commit -ne \$sourceCommit\)/);
  assert.match(script, /Build normalization: \$normalization/);
  assert.match(script, /Source Cargo.toml SHA256 \(original bytes, restored\)/);
  assert.match(env, /x86_64-pc-windows-msvc/);
  for (const flag of ['NATIVE', 'AVX', 'AVX2', 'AVX512', 'FMA', 'F16C']) assert.ok(env.includes(`'${flag}'`));
  assert.match(env, /SetEnvironmentVariable\("GGML_\$flag", 'OFF', 'Process'\)/);
  assert.doesNotMatch(script, /Start-Process|build:local|gh release|signtool/i);
  assert.deepEqual(script.match(/Remove-Item[^\r\n]+/g), ['Remove-Item -LiteralPath $extraction -Recurse -Force -ErrorAction Stop }']);
  assert.match(script, /Join-Path \$tempRoot \("handsfree-nsis-audit-" \+ \[Guid\]::NewGuid\(\)/);
  assert.match(script, /finally \{[\s\S]*Remove-Item -LiteralPath \$extraction/);
  assert.match(script, /Cannot clean owned NSIS extraction directory \$extraction/);
  assert.match(script, /Invoke-Checked 7z @\('x', \$installers\[0\].FullName, "-o\$extraction", '-y'\)/);
  assert.match(script, /if \(\$payloadApps.Count -ne 1\)/);
  assert.match(script, /'scripts\/windows-pe-imports.py', \$payloadApps\[0\].FullName/);
  assert.match(script, /Copy-Item "\$notices\/\*" \$output -Recurse -Force/);
});

test('Windows resources and per-user installer do not alter the Mac bundle', () => {
  const config = JSON.parse(read('src-tauri/tauri.windows.conf.json'));
  const base = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.deepEqual(config.bundle.targets, ['nsis']);
  assert.deepEqual(config.bundle.icon, ['icons/icon.ico']);
  assert.deepEqual(config.bundle.resources, { 'target/windows-notices/': 'licenses/' });
  assert.equal(config.bundle.licenseFile, '../LICENSE');
  assert.equal(config.bundle.windows.nsis.installMode, 'currentUser');
  assert.equal(config.bundle.windows.webviewInstallMode.type, 'downloadBootstrapper');
  assert.equal(config.app.macOSPrivateApi, false);
  assert.equal(base.app.macOSPrivateApi, true);
  assert.deepEqual(base.bundle.targets, ['app', 'dmg']);
  assert.equal(base.bundle.macOS.signingIdentity, '-');
});

test('notice generation retains Mac default and explicitly inventories Windows dependencies', () => {
  const script = read('scripts/release-notices.py');
  assert.match(script, /default="aarch64-apple-darwin"/);
  assert.match(script, /"--filter-platform", args.target/);
  assert.match(script, /x86_64-pc-windows-msvc/);
  assert.match(script, /hashlib.sha256\(crate.read_bytes\(\)\).hexdigest\(\) != checksum/);
  assert.match(script, /Experimental Windows beta; unsigned/);
  assert.match(script, /encoding="utf-8"/);
  assert.match(script, /NOTICES \/ "windows-supplements"/);
  for (const [file, hash] of Object.entries({
    'webview2-rs-LICENSE': '0dcf41516e608bbcb6cdc5229feb7b86fe4a643b85e7df251133c93408fdac73',
    'dasp_sample-LICENSE-MIT': 'b1d6df41ed3aa96806e74c729444d7c121d90e6660a6aed01d298e03fde475a0',
  })) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../scripts/windows-licenses/${file}`, import.meta.url))).digest('hex'), hash);
  }
});
