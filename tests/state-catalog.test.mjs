import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('docs/state-machines.json', root)));
test('state inventory has unique, source-linked owners and valid coordination edges', () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.ok(catalog.scope.includes('App-owned'));
  const ids = new Set(catalog.machines.map(m => m.id));
  assert.equal(ids.size, catalog.machines.length);
  for (const machine of catalog.machines) {
    assert.match(machine.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(['app','native','ui','paused-windows','website','release'].includes(machine.area));
    assert.ok(machine.encoding && machine.invariant && machine.states.length && machine.events.length, machine.id);
    assert.ok(!machine.owner.includes('..') && !machine.owner.startsWith('/'));
    const source = readFileSync(new URL(machine.owner, root), 'utf8');
    assert.ok(source.includes(machine.anchor), `${machine.id}: missing owner anchor ${machine.anchor}`);
    for (const dependency of machine.dependsOn) assert.ok(ids.has(dependency), `${machine.id}: unknown dependency ${dependency}`);
    assert.ok(machine.tests.length, `${machine.id}: missing verification entry point`);
    for (const path of machine.tests) assert.ok(existsSync(new URL(path, root)), `${machine.id}: missing test path ${path}`);
  }
});
