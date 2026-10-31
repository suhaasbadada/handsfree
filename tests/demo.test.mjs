import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, sampleText } from '../site/demo.js';

function fixture(reducedMotion = () => false) {
  const jobs = new Map();
  const history = [];
  let id = 0;
  const demo = createDemo({
    render: value => history.push(value), reducedMotion,
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
  return { demo, jobs, history, advance };
}

test('demo is static until played, then listens, processes, and shows one complete transcript', () => {
  const { demo, jobs, history, advance } = fixture();
  assert.deepEqual(history, [{ state: 'done', text: sampleText, active: false }]);
  assert.equal(jobs.size, 0);
  demo.play();
  assert.deepEqual(history.at(-1), { state: 'listening', text: '', active: true });
  assert.equal(advance(), 1600);
  assert.deepEqual(history.at(-1), { state: 'processing', text: '', active: true });
  assert.equal(advance(), 700);
  assert.deepEqual(history.at(-1), { state: 'done', text: sampleText, active: false });
  assert.equal(jobs.size, 0, 'No looping or autoplay');
  demo.play();
  assert.equal(history.at(-1).state, 'listening', 'Replay works');
  demo.dispose();
});

for (const stage of ['listening', 'processing']) {
  test(`reset during ${stage} cancels timers and ignores stale callbacks`, () => {
    const { demo, jobs, history, advance } = fixture();
    demo.play();
    if (stage === 'processing') advance();
    const stale = [...jobs.values()][0].fn;
    demo.play();
    assert.equal(history.at(-1).state, 'done');
    assert.equal(jobs.size, 0);
    demo.play();
    stale();
    assert.equal(history.at(-1).state, 'listening');
    assert.equal(jobs.size, 1);
    demo.dispose();
    const count = history.length;
    stale();
    demo.play();
    assert.equal(history.length, count);
    assert.equal(jobs.size, 0);
  });
}

test('reduced motion immediately shows final text with no timers', () => {
  const { demo, jobs, history } = fixture(() => true);
  demo.play();
  assert.deepEqual(history.at(-1), { state: 'done', text: sampleText, active: false });
  assert.equal(jobs.size, 0);
});
