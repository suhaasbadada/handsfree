import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('macOS WebKit contains native select text without hiding main overflow', {skip:process.platform!=='darwin',timeout:70000}, () => {
  // Isolated nonpersistent WKWebView, no window, app JS, backend or microphone.
  const result=spawnSync('/usr/bin/osascript',['-l','JavaScript',fileURLToPath(new URL('./ui-webkit-layout.jxa',import.meta.url))],{
    cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024,
    stdio:['ignore','pipe','pipe'],
  });
  assert.ifError(result.error);
  assert.equal(result.status,0,result.stderr);
  const output=`${result.stdout}\n${result.stderr}`;
  const rows=output.split('\n').filter(line=>line.startsWith('{"size":')).map(JSON.parse);
  assert.equal(rows.length,48,output);
  assert.ok(rows.every(row=>row.ok && row.chevrons && row.refreshFits && row.mainOverflow!=='hidden'),output);
  assert.ok(rows.filter(row=>row.mode==='forced-css-scrollbars').every(row=>row.main.gutter===16&&row.dialog.gutter===16),output);
  assert.ok(output.includes('NEGATIVE_CONTROL='),output);
  const home=output.split('\n').filter(line=>line.startsWith('HOME=')).map(line=>JSON.parse(line.slice(5)));
  assert.equal(home.length,24,output);
  assert.ok(home.every(row=>row.ok&&row.fits&&row.contained),output);
});
