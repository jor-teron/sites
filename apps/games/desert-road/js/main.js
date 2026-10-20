/* Desert Road — boot: resize handling and the frame-capped rAF loop. */
(() => {
  const DR = window.DR, CFG = DR.CFG, state = DR.state, view = DR.view, canvas = DR.canvas, ctx = DR.ctx;

  function resize() {
    const oldRoad = view.road, oldH = view.H;
    view.DPR = Math.min(window.devicePixelRatio || 1, 2);
    view.W = canvas.clientWidth;
    view.H = canvas.clientHeight;
    const { W, H } = view;
    canvas.width  = Math.floor(W * view.DPR);
    canvas.height = Math.floor(H * view.DPR);
    ctx.setTransform(canvas.width / (W || 1), 0, 0, canvas.height / (H || 1), 0, 0);
    view.road = DR.roadGeom(W);
    const road = view.road;
    view.sandGrad = ctx.createLinearGradient(0, 0, 0, H);
    view.sandGrad.addColorStop(0, CFG.colors.sandTop);
    view.sandGrad.addColorStop(1, CFG.colors.sandBottom);

    // Keep the car and obstacles at the same spot on the road and the same relative height.
    const c = state.car;
    if (oldRoad.w > 0 && oldH > 0) {
      const mapX = (x) => road.x + (x - oldRoad.x) * road.w / oldRoad.w;
      c.x = mapX(c.x);
      c.targetX = mapX(c.targetX);
      const m = CFG.obstacles.spawnMargin;
      for (const o of state.obstacles) {
        o.x = DR.clamp(mapX(o.x + o.w / 2) - o.w / 2, road.x + m, road.x + road.w - m - o.w);
        o.y = o.y * H / oldH;
      }
    } else {
      c.x = c.targetX = W / 2;
    }
    c.x = DR.clamp(c.x, DR.carMinX(), DR.carMaxX());
    c.targetX = DR.clamp(c.targetX, DR.carMinX(), DR.carMaxX());
    c.y = DR.carY();
    state.needsDraw = true;
    if (W > 0 && H > 0) {
      DR.render.draw();               // a resize clears the canvas: repaint now
      if (state.paused) DR.render.drawPaused();
    }
  }

  // ----- Loop (one rAF loop, capped at CFG.maxFps) -----
  const FRAME_MS = 1000 / CFG.maxFps;
  const FRAME_SLACK_MS = 1.5;   // early-fire tolerance so 60 Hz lands on every 2nd vsync
  let lastTick = performance.now();
  let lastStep = lastTick;
  let frameAcc = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    frameAcc += now - lastTick;
    lastTick = now;
    if (frameAcc < FRAME_MS - FRAME_SLACK_MS) return;
    frameAcc -= FRAME_MS;
    if (frameAcc > FRAME_MS || frameAcc < -FRAME_MS) frameAcc = 0; // after a stall: no catch-up

    let dt = (now - lastStep) / 1000;
    lastStep = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;

    if (state.running && !state.paused) {
      DR.game.update(dt);
      DR.render.draw();
    } else if (!state.played) {
      state.roadOffset = (state.roadOffset + CFG.road.idleScroll * dt * 60) % CFG.road.stripePeriod;
      DR.render.draw();
    } else if (state.needsDraw) {
      state.needsDraw = false;
      DR.render.draw();
      if (state.paused) DR.render.drawPaused();
    }
  }

  if (DR.el.best) DR.el.best.innerHTML = DR.storage.bestHtml(DR.storage.loadBest());
  DR.game.renderColors(DR.el.colors);
  window.addEventListener('resize', resize);
  resize();
  DR.el.startBtn.addEventListener('click', DR.game.onStartClick);
  requestAnimationFrame(loop);

  // expose for Controller integration (DesertDrive kept as an alias)
  window.DesertRoad = window.DesertDrive = { start: DR.game.startGame, setInput: window.setDriveInput };
})();
