/** HEX-7 fixed-step loop: fps cap, backlog clamp, single RAF, pause when hidden. */
export function createLoop({ fps = 30, update, render, onError, maxCatchup = 3 } = {}) {
  let step = 1 / Math.min(30, Math.max(1, fps));
  let targetFps = Math.min(30, Math.max(1, fps));
  let acc = 0, last = 0, running = false, raf = 0, pausedByHide = false;
  let frames = 0, fpsAccum = 0, shownFps = 0;

  function cancelRaf() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.25) dt = step; // giant gap after background — drop backlog
    acc += dt;
    fpsAccum += dt; frames++;
    if (fpsAccum >= 0.5) {
      shownFps = frames / fpsAccum;
      frames = 0; fpsAccum = 0;
    }
    try {
      let n = 0;
      while (acc >= step && n < maxCatchup) {
        update && update(step);
        acc -= step;
        n++;
      }
      if (acc > step * maxCatchup) acc = 0; // discard leftover after catch-up cap
      render && render(Math.min(1, acc / step), shownFps);
    } catch (e) {
      running = false;
      cancelRaf();
      onError && onError(e);
    }
  }

  function onVis() {
    if (document.hidden) {
      if (running) { pausedByHide = true; running = false; cancelRaf(); last = 0; acc = 0; }
    } else if (pausedByHide) {
      pausedByHide = false;
      start();
    }
  }
  const doc = typeof document !== 'undefined' ? document : null;
  if (doc) doc.addEventListener('visibilitychange', onVis);

  function start() {
    cancelRaf(); // prevent duplicate RAF chains on restart
    running = true;
    pausedByHide = false;
    last = 0; acc = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    pausedByHide = false;
    cancelRaf();
    last = 0; acc = 0;
  }

  function setFps(fpsIn) {
    targetFps = Math.min(30, Math.max(1, fpsIn | 0 || 30));
    step = 1 / targetFps;
  }

  return {
    start, stop, setFps,
    get running() { return running; },
    get fps() { return targetFps; },
    get shownFps() { return shownFps; },
    get step() { return step; },
    dispose() { stop(); if (doc) doc.removeEventListener('visibilitychange', onVis); }
  };
}
