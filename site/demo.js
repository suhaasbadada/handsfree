export const sampleText = 'Let’s move our meeting to tomorrow morning.';

// Inject the clock so cancellation and the entire sequence can be tested without waits.
export function createDemo({ render, schedule = setTimeout, cancel = clearTimeout, reducedMotion = () => false }) {
  let timer;
  let generation = 0;
  let state = 'done';
  let disposed = false;
  function clear() {
    generation++;
    cancel(timer);
    timer = undefined;
  }
  function show(next) {
    state = next;
    render({ state, text: state === 'done' ? sampleText : '', active: state !== 'done' });
  }
  function later(next, delay, complete) {
    const current = generation;
    timer = schedule(() => {
      if (disposed || current !== generation) return;
      timer = undefined;
      show(next);
      complete?.();
    }, delay);
  }
  show('done');
  return {
    play() {
      if (disposed) return;
      clear();
      // A second click is a reset, not another overlapping playback.
      if (state !== 'done' || reducedMotion()) return show('done');
      show('listening');
      later('processing', 1600, () => later('done', 700));
    },
    dispose() { clear(); disposed = true; },
  };
}

if (typeof document !== 'undefined') {
  const button = document.getElementById('demo-play');
  const figure = document.querySelector('.dictation-demo');
  if (button && figure) {
    const text = document.getElementById('demo-text');
    const phase = document.getElementById('demo-phase');
    const status = document.getElementById('demo-status');
    let started = false;
    const demo = createDemo({
      reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      render({ state, text: value, active }) {
        figure.dataset.state = state;
        text.value = value;
        phase.textContent = { listening: 'Listening', processing: 'Processing', done: 'Done' }[state];
        button.firstChild.textContent = active ? 'Reset demo ' : 'Play demo ';
        status.textContent = !started ? '' : state === 'done' ? `Done. ${value}` : `${phase.textContent}. Illustrative demo.`;
      },
    });
    button.hidden = false;
    button.addEventListener('click', () => { started = true; demo.play(); });
    // Also covers bfcache navigation: leave a static, replayable result behind.
    window.addEventListener('pagehide', () => { if (figure.dataset.state !== 'done') demo.play(); });
  }
}
