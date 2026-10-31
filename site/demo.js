export const sampleText = 'Let’s move our meeting to tomorrow morning.';

// One clock, including the result hold. Changes invalidate already queued callbacks.
export function createDemo({ render, schedule = setTimeout, cancel = clearTimeout,
  reducedMotion = () => false, visible = () => true }) {
  let timer;
  let generation = 0;
  let paused = false;
  let disposed = false;
  function clear() {
    generation++;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }
  function show(state) {
    render({ state, text: state === 'done' ? sampleText : '', paused });
  }
  function running() { return !disposed && !paused && visible() && !reducedMotion(); }
  function step(state) {
    show(state);
    const current = generation;
    const next = { listening: 'processing', processing: 'done', done: 'listening' }[state];
    timer = schedule(() => {
      if (current !== generation || !running()) return;
      timer = undefined;
      step(next);
    }, { listening: 1600, processing: 700, done: 2600 }[state]);
  }
  function sync() {
    if (disposed) return;
    clear();
    if (running()) step('listening');
    else show('done');
  }
  sync();
  return {
    sync,
    togglePause() { if (!disposed) { paused = !paused; sync(); } },
    dispose() { clear(); disposed = true; },
  };
}

if (typeof document !== 'undefined') {
  const button = document.getElementById('demo-pause');
  const figure = document.querySelector('.dictation-demo');
  if (button && figure) {
    const text = document.getElementById('demo-text');
    const phase = document.getElementById('demo-phase');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let pageActive = true;
    const demo = createDemo({
      reducedMotion: () => motion.matches,
      visible: () => pageActive && !document.hidden,
      render({ state, text: value, paused }) {
        figure.dataset.state = state;
        text.value = value;
        phase.textContent = { listening: 'Listening', processing: 'Processing', done: 'Done' }[state];
        button.hidden = motion.matches;
        button.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation');
        button.title = paused ? 'Resume animation' : 'Pause animation';
        button.textContent = paused ? '▶' : 'Ⅱ';
      },
    });
    button.addEventListener('click', () => demo.togglePause());
    document.addEventListener('visibilitychange', demo.sync);
    motion.addEventListener('change', demo.sync);
    window.addEventListener('pagehide', () => { pageActive = false; demo.sync(); });
    window.addEventListener('pageshow', () => { pageActive = true; demo.sync(); });
  }
}
