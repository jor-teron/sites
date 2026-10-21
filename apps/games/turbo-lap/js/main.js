/* Turbo Lap — boot: canvas sizing (responsive, DPR-aware) and the frame-capped loop. */
window.TL = window.TL || {};
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const view = TL.view = { W: 0, H: 0, DPR: 1, fps: TL.storage.fps(), shownFps: 0 };

  function resize() {
    view.DPR = Math.min(window.devicePixelRatio || 1, 2);
    view.W = Math.max(1, canvas.clientWidth);
    view.H = Math.max(1, canvas.clientHeight);
    canvas.width = Math.floor(view.W * view.DPR);
    canvas.height = Math.floor(view.H * view.DPR);
    ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  TL.setFps = f => { view.fps = f; TL.storage.setFps(f); };

  let last = 0, frames = 0, fpsT = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (!last) { last = t; fpsT = t; return; }
    const elapsed = t - last;
    if (elapsed < 1000 / view.fps - 2) return;            // cap: skip this vsync
    last = t;
    const dt = Math.min(elapsed / 1000, TL.CFG.maxDt);
    frames++;
    if (t - fpsT >= 500) { view.shownFps = Math.round(frames * 1000 / (t - fpsT)); frames = 0; fpsT = t; }
    TL.input.pollGamepad();
    TL.game.update(dt);
    if (canvas.width !== Math.floor(canvas.clientWidth * view.DPR)) resize();
    TL.game.draw(ctx, view.W, view.H);
  }
  TL.game.init();
  requestAnimationFrame(loop);
})();
