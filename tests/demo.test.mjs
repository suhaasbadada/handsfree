import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, sampleText } from '../site/demo.js';

function fixture({ reduced = false, visible = true } = {}) {
  const jobs = new Map();
  const history = [];
  let id = 0;
  const flags = { reduced, visible };
  const demo = createDemo({
    render: value => history.push(value), reducedMotion: () => flags.reduced, visible: () => flags.visible,
    schedule: (fn, delay) => { jobs.set(++id, { fn, delay }); return id; },
    cancel: key => jobs.delete(key),
  });
  const advance = () => {
    assert.equal(jobs.size, 1, 'Only one pending transition');
    const [key, job] = [...jobs][0];
    jobs.delete(key);
    job.fn();
    return job.delay;
  };
  return { demo, jobs, history, advance, flags };
}

test('autoplays listening → processing → complete text → hold → repeat with one timer', () => {
  const { demo, history, advance } = fixture();
  for (let loop = 0; loop < 4; loop++) {
    assert.deepEqual(history.at(-1), { state: 'listening', text: '', paused: false });
    assert.equal(advance(), 1600);
    assert.equal(history.at(-1).state, 'processing');
    assert.equal(advance(), 700);
    assert.deepEqual(history.at(-1), { state: 'done', text: sampleText, paused: false });
    assert.equal(advance(), 2600);
  }
  demo.dispose();
});

for (const stage of ['listening', 'processing', 'done']) {
  test(`hidden page cancels ${stage}, ignores queued callbacks and resumes one loop`, () => {
    const { demo, jobs, history, advance, flags } = fixture();
    if (stage !== 'listening') advance();
    if (stage === 'done') advance();
    const stale = [...jobs.values()][0].fn;
    flags.visible = false; demo.sync();
    assert.equal(jobs.size, 0);
    assert.equal(history.at(-1).text, sampleText);
    stale();
    assert.equal(jobs.size, 0);
    flags.visible = true;
    for (let i = 0; i < 5; i++) demo.sync();
    stale();
    assert.equal(jobs.size, 1);
    assert.equal(history.at(-1).state, 'listening');
    demo.dispose();
    const count = history.length;
    stale(); demo.sync(); demo.togglePause();
    assert.equal(history.length, count);
    assert.equal(jobs.size, 0);
  });
}

test('reduced motion and initially hidden pages are static with no timers', () => {
  for (const options of [{ reduced: true }, { visible: false }]) {
    const { demo, jobs, history } = fixture(options);
    assert.equal(history.at(-1).text, sampleText);
    assert.equal(jobs.size, 0);
    demo.dispose();
  }
});

test('motion changes cancel timers and pause survives visibility and motion toggles', () => {
  const { demo, jobs, history, flags } = fixture();
  const stale = [...jobs.values()][0].fn;
  flags.reduced = true; demo.sync(); stale();
  assert.equal(jobs.size, 0);
  assert.equal(history.at(-1).text, sampleText);
  flags.reduced = false; demo.sync();
  assert.equal(jobs.size, 1);
  demo.togglePause();
  for (const visible of [false, true, false, true]) { flags.visible = visible; demo.sync(); }
  for (const reduced of [true, false]) { flags.reduced = reduced; demo.sync(); }
  assert.equal(jobs.size, 0);
  assert.deepEqual(history.at(-1), { state: 'done', text: sampleText, paused: true });
  demo.togglePause();
  assert.equal(jobs.size, 1);
  demo.dispose();
});
