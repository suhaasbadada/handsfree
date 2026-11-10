import test from 'node:test';
import assert from 'node:assert/strict';
import { Updates } from '../src/updates.ts';

const view = (phase = 'idle', extra = {}) => ({ installed_version: '0.1.1-beta.7', phase, notes: '', downloaded_bytes: 0, message: '', ...extra });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture() {
  const calls = [], responses = new Map(); let allowed = true;
  const updates = new Updates(async (command, args) => {
    calls.push({ command, args });
    const response = responses.get(command);
    if (response instanceof Error) throw response;
    return response === undefined ? view() : await response;
  }, () => {}, () => allowed);
  return { updates, calls, responses, busy: () => { allowed = false; } };
}
const available = () => view('available', { available_version: '0.1.1-beta.8', notes: '<script>not executable</script>' });
test('opening reads installed distribution locally; only explicit checking contacts the feed', async () => {
  const { updates: u, calls, responses } = fixture();
  assert.deepEqual(calls, []);
  await u.refresh();
  assert.equal(u.view.installed_version, '0.1.1-beta.7');
  assert.deepEqual(calls.map(c => c.command), ['update_status']);
  responses.set('check_for_updates', available());
  await u.check();
  assert.equal(u.view.available_version, '0.1.1-beta.8');
  assert.equal(u.view.notes, '<script>not executable</script>', 'Presentation must use a text node, not HTML');
  assert.equal(calls.some(c => c.command === 'install_update'), false);
});
test('duplicate checks are suppressed and stale local snapshots cannot erase new release information', async () => {
  const { updates: u, calls, responses } = fixture();
  const old = deferred(), check = deferred();
  responses.set('update_status', old.promise); const poll = u.refresh();
  responses.set('check_for_updates', check.promise); const checking = u.check(); await u.check();
  assert.equal(u.view.phase, 'checking');
  check.resolve(available()); await checking;
  old.resolve(view('up_to_date')); await poll;
  assert.equal(u.view.phase, 'available');
  assert.equal(calls.filter(c => c.command === 'check_for_updates').length, 1);
});
test('installation requires the explicitly confirmed version and idle work, and dispatches only once', async () => {
  const h = fixture(), u = h.updates;
  h.responses.set('check_for_updates', available()); await u.check();
  await u.install('0.1.1-beta.9'); assert.equal(h.calls.some(c => c.command === 'install_update'), false);
  await u.install('0.1.1-beta.8'); assert.equal(h.calls.some(c => c.command === 'install_update'), false, 'A cached offer has not been freshly prepared for confirmation');
  assert.equal(await u.prepareConfirmation(), '0.1.1-beta.8');
  const pending = deferred(); h.responses.set('install_update', pending.promise);
  const installing = u.install('0.1.1-beta.8'); await u.install('0.1.1-beta.8');
  assert.equal(u.view.phase, 'checking', 'Native metadata validation is not archive downloading');
  assert.deepEqual(h.calls.filter(c => c.command === 'install_update'), [{ command: 'install_update', args: { version: '0.1.1-beta.8' } }]);
  h.responses.set('update_status', view('downloading', { downloaded_bytes: 25, total_bytes: 100 })); await u.progress();
  assert.equal(u.view.downloaded_bytes, 25);
  h.responses.set('update_status', available()); await u.progress();
  assert.equal(u.view.phase, 'downloading', 'A pre-install snapshot must not re-enable normal controls');
  pending.resolve(view('error', { message: 'Signature rejected' })); await installing;
  assert.equal(u.view.phase, 'error');
  const other = fixture(); other.responses.set('check_for_updates', available()); await other.updates.check(); other.busy();
  await other.updates.install('0.1.1-beta.8'); assert.equal(other.calls.some(c => c.command === 'install_update'), false);
});
test('offline checks and installation failures stay visible and permit an explicit retry', async () => {
  const { updates: u, responses, calls } = fixture();
  responses.set('check_for_updates', new Error('Feed unavailable (HTTP 404)')); await u.check();
  assert.equal(u.view.phase, 'error'); assert.match(u.view.message, /404/);
  responses.set('check_for_updates', available()); await u.check();
  await u.prepareConfirmation();
  responses.set('install_update', new Error('Permission denied')); await u.install('0.1.1-beta.8');
  assert.equal(u.view.phase, 'error'); assert.match(u.view.message, /Permission denied/);
  assert.equal(u.view.available_version, undefined); assert.equal(u.view.notes, '');
  responses.set('check_for_updates', view('up_to_date')); await u.check(); assert.equal(u.view.phase, 'up_to_date');
  assert.equal(calls.filter(c => c.command === 'check_for_updates').length, 4);
});

test('delayed download progress never moves an installing UI backwards', async () => {
  const {updates:u,responses} = fixture();
  responses.set('check_for_updates', available()); await u.check();
  await u.prepareConfirmation();
  const pending = deferred(); responses.set('install_update', pending.promise);
  const installing = u.install('0.1.1-beta.8');
  responses.set('update_status', view('installing', {message:'Installing the verified update.'})); await u.progress();
  assert.equal(u.view.phase, 'installing');
  responses.set('update_status', view('downloading', {downloaded_bytes:50,total_bytes:100})); await u.progress();
  assert.equal(u.view.phase, 'installing');
  pending.resolve(view('error', {message:'Install failed; check again.'})); await installing;
  assert.equal(u.view.phase, 'error', 'The owning command still reports a terminal failure');
});

test('open app cached beta11 refreshes feed and confirms/installs only beta12', async () => {
  const {updates:u,responses,calls} = fixture();
  responses.set('check_for_updates', view('available', {available_version:'0.1.1-beta.11'})); await u.check();
  const fresh = deferred(); responses.set('check_for_updates', fresh.promise);
  const preparing = u.prepareConfirmation();
  assert.equal(u.view.phase, 'checking');
  assert.equal(await u.prepareConfirmation(), undefined, 'Duplicate Download must not issue another check');
  fresh.resolve(view('available', {available_version:'0.1.1-beta.12'}));
  assert.equal(await preparing, '0.1.1-beta.12');
  await u.install('0.1.1-beta.11');
  responses.set('install_update', view('error', {message:'test ended before bytes'}));
  await u.install('0.1.1-beta.12');
  assert.deepEqual(calls.filter(c=>c.command==='install_update').map(c=>c.args), [{version:'0.1.1-beta.12'}]);
  assert.equal(calls.filter(c=>c.command==='check_for_updates').length, 2);
});

test('close/navigation during delayed preparation revokes confirmation without losing the fresh offer', async () => {
  const {updates:u,responses,calls} = fixture();
  responses.set('check_for_updates', available()); await u.check();
  const fresh = deferred(); responses.set('check_for_updates', fresh.promise);
  const preparing = u.prepareConfirmation(); u.cancelPreparation();
  fresh.resolve(available()); assert.equal(await preparing, undefined);
  assert.equal(u.view.phase, 'available');
  await u.install('0.1.1-beta.8');
  assert.equal(calls.some(c=>c.command==='install_update'), false);
  responses.set('check_for_updates', available()); assert.equal(await u.prepareConfirmation(), '0.1.1-beta.8');
});

test('prepare up-to-date/offline/busy and changed snapshots cannot authorize installation', async () => {
  for (const result of [view('up_to_date'), new Error('Offline')]) {
    const {updates:u,responses,calls} = fixture();
    responses.set('check_for_updates', available()); await u.check();
    responses.set('check_for_updates', result); assert.equal(await u.prepareConfirmation(), undefined);
    assert.equal(u.view.available_version, undefined);
    await u.install('0.1.1-beta.8'); assert.equal(calls.some(c=>c.command==='install_update'), false);
    responses.set('check_for_updates', available()); await u.check(); assert.equal(u.view.phase, 'available');
  }
  const h = fixture(); h.responses.set('check_for_updates', available()); await h.updates.check();
  const fresh = deferred(); h.responses.set('check_for_updates', fresh.promise);
  const preparing = h.updates.prepareConfirmation(); h.busy(); fresh.resolve(available());
  assert.equal(await preparing, undefined, 'Idle eligibility must be rechecked after network IO');
  const k = fixture(); k.responses.set('check_for_updates', available()); await k.updates.check(); await k.updates.prepareConfirmation();
  k.responses.set('update_status', view('available', {available_version:'0.1.1-beta.9'})); await k.updates.refresh();
  await k.updates.install('0.1.1-beta.9'); assert.equal(k.calls.some(c=>c.command==='install_update'), false, 'A new local snapshot is not consent');
});

test('expired confirmation returning a newer native offer requires another refresh and confirmation', async () => {
  const {updates:u,responses,calls} = fixture();
  responses.set('check_for_updates', available()); await u.check(); await u.prepareConfirmation();
  responses.set('install_update', view('available', {available_version:'0.1.1-beta.9',message:'Review the fresh offer'}));
  await u.install('0.1.1-beta.8'); await u.install('0.1.1-beta.9');
  assert.equal(u.view.available_version, '0.1.1-beta.9');
  assert.equal(calls.filter(c=>c.command==='install_update').length, 1);
  responses.set('check_for_updates', u.view); assert.equal(await u.prepareConfirmation(), '0.1.1-beta.9');
});

test('a late pre-preparation local refresh cannot override the new confirmation identity', async () => {
  const {updates:u,responses,calls} = fixture();
  responses.set('check_for_updates', available()); await u.check();
  const stale = deferred(); responses.set('update_status', stale.promise); const polling = u.refresh();
  responses.set('check_for_updates', view('available', {available_version:'0.1.1-beta.12'}));
  assert.equal(await u.prepareConfirmation(), '0.1.1-beta.12');
  stale.resolve(available()); await polling;
  assert.equal(u.view.available_version, '0.1.1-beta.12');
  responses.set('install_update', view('error')); await u.install('0.1.1-beta.12');
  assert.deepEqual(calls.filter(c=>c.command==='install_update').map(c=>c.args), [{version:'0.1.1-beta.12'}]);
});

test('unknown or incomplete native update snapshots fail closed', async () => {
  for (const invalid of [view('unrecognized'), view('available'), view('available', {available_version: 1})]) {
    const {updates:u,responses,calls} = fixture();
    responses.set('update_status', invalid); await u.refresh();
    assert.equal(u.view.phase, 'error');
    assert.match(u.view.message, /unavailable/);
    await u.install('0.1.1-beta.8');
    assert.equal(calls.some(c => c.command === 'install_update'), false);
  }
});
