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
  const pending = deferred(); h.responses.set('install_update', pending.promise);
  const installing = u.install('0.1.1-beta.8'); await u.install('0.1.1-beta.8');
  assert.equal(u.view.phase, 'downloading');
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
  responses.set('install_update', new Error('Permission denied')); await u.install('0.1.1-beta.8');
  assert.equal(u.view.phase, 'error'); assert.match(u.view.message, /Permission denied/);
  responses.set('check_for_updates', view('up_to_date')); await u.check(); assert.equal(u.view.phase, 'up_to_date');
  assert.equal(calls.filter(c => c.command === 'check_for_updates').length, 3);
});
