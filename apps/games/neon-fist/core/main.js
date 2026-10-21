// Boot: responsive HiDPI canvas, frame loop (30/60 FPS), URL options for testing.
(function () {
  const C = NF.config, cv = document.getElementById('game'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, last = 0, fpsIdx = 0, acc = 0;
  function resize() {
    dpr = Math.min(C.maxDPR, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  function frame(ts) {
    const dt = Math.min(0.1, (ts - (last || ts)) / 1000); last = ts; acc += dt;
    const step = 1 / C.fpsOptions[fpsIdx];
    if (acc >= step - 0.002) {
      const d = Math.min(0.1, acc); acc = 0;
      if (NF.roster && NF.roster.open) { requestAnimationFrame(frame); return; }   // roster covers the stage
      NF.viewer.update(d);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      NF.viewer.render(ctx, W, H);
    }
    requestAnimationFrame(frame);
  }
  NF.main = {
    toggleFps() { fpsIdx = 1 - fpsIdx; const b = document.getElementById('fpsBtn'); if (b) b.textContent = 'FPS: ' + C.fpsOptions[fpsIdx]; },
    measure() { return NF.viewer.measure(W, H); }
  };
  addEventListener('resize', resize); resize();
  NF.viewer.init();
  document.getElementById('fpsBtn').addEventListener('click', () => NF.main.toggleFps());
  // ?char=nova&pose=kick&hold=1&vs=1&flip=1&ui=0   ·   generated: ?f=42  ·  ?f=42&vs=07 (versus fighter 07)  ·  ?f=42&vs=kai
  const q = new URLSearchParams(location.search), num = v => /^\d{1,2}$/.test(v || '') ? +v : null;
  if (q.get('char')) NF.viewer.select(Math.max(0, NF.characters.list.findIndex(c => c.id === q.get('char'))));
  const vsQ = q.get('vs'), vsNum = num(vsQ), vsHand = NF.characters[vsQ];
  if (num(q.get('f')) !== null) NF.viewer.showGen(num(q.get('f')), vsHand && vsHand.id ? vsHand : vsNum !== null && vsQ !== '1' ? vsNum : undefined);
  if (vsQ && vsQ !== '0') NF.viewer.toggleVersus();
  NF.roster.init();
  if (!location.search || q.get('roster') === '1') NF.roster.show();   // roster is the landing screen; old URLs open the viewer
  if (q.get('flip') === '1') NF.viewer.flip();
  if (q.get('hold') === '1') NF.viewer.toggleHold();
  if (q.get('pose')) NF.viewer.pose(q.get('pose'));
  if (q.get('ui') === '0') document.body.classList.add('noui');
  requestAnimationFrame(frame);
})();
