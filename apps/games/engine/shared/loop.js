/** Fixed-step loop, fps capped (default 30). */
export function createLoop({ fps = 30, update, render, onError } = {}) {
  const step = 1 / fps;
  let acc = 0, last = 0, running = false, raf = 0;
  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts; acc += dt;
    try {
      let n = 0;
      while (acc >= step && n++ < 5) { update && update(step); acc -= step; }
      render && render(acc / step);
    } catch (e) { running = false; onError && onError(e); }
  }
  return {
    start() { if (!running) { running = true; last = 0; acc = 0; raf = requestAnimationFrame(frame); } },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    get running() { return running; }, step
  };
}
