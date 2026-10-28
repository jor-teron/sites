/* Road Safety RS1 — Safe Crossing mini-game: a top-down road with LEFT-hand traffic (near lane comes from the right,
   far lane from the left) and a zebra crossing. Look right, left, right again, then Cross. Reaching the far footpath
   scores 1; walking in front of a car makes it stop with a gentle "Oops" and costs a life (3 lives). Real time, capped at 30 fps.
   RS.makeCross({ onEnd(score), onInfo(text) }) -> { el, start(), stop(), look(dir), cross() }. */
window.RS = window.RS || {};
(() => {
  const W = 400, H = 300, LANE = [110, 190], KERB = [70, 230], ZX = 200, COLS = ['#e5484d', '#3d7bdc', '#ffb347', '#7ccf95', '#b197fc', '#f2f2f2'];
  window.RS.makeCross = o => {
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    cv.className = 'rs-cv'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Road with a zebra crossing and cars');
    let cars, kid, looks, score, lives, spawn, raf = 0, last = 0, msg = '', msgT = 0, scale = 1, running = false, t = 0;
    const reset = () => { cars = []; kid = { y: 258, st: 'wait', face: 0, faceT: 0, oopsT: 0 }; looks = []; score = 0; lives = 3; spawn = [0.5, 1.5]; t = 0; };
    const say = (s, d) => { msg = s; msgT = d || 2.2; o.onInfo && o.onInfo(s); };
    const fit = () => {
      const p = cv.parentNode; if (!p) return; if (!p._ro) { p._ro = 1; ro.observe(p); } const w = Math.min(p.clientWidth, (p.clientHeight || 1e9) * W / H, 760), dpr = window.devicePixelRatio || 1;
      scale = w / W; cv.style.width = w + 'px'; cv.style.height = w * H / W + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(w * H / W * dpr); draw();
    };
    const look = d => { if (!running || kid.st !== 'wait') return; kid.face = d; kid.faceT = 1.2; looks.push([d, t]); if (looks.length > 3) looks.shift(); say(d > 0 ? 'Looking RIGHT \u2192' : '\u2190 Looking LEFT', 1.2); };
    const cross = () => {
      if (!running || kid.st !== 'wait') return;
      const ok = looks.length === 3 && looks[0][0] > 0 && looks[1][0] < 0 && looks[2][0] > 0 && t - looks[0][1] < 8;
      if (!ok) { say('First look RIGHT, then LEFT, then RIGHT again!', 2.5); looks = []; return; }
      kid.st = 'walk'; looks = []; say('Walk straight across \u2013 keep watching!', 1.5);
    };
    function step(dt) {
      t += dt;
      for (let l = 0; l < 2; l++) {                                  // lane 0: far lane, cars go left -> right; lane 1: near lane, right -> left
        spawn[l] -= dt;
        const lastCar = cars.filter(c => c.l === l).sort((a, b) => l ? b.x - a.x : a.x - b.x)[0];
        const room = !lastCar || (l ? W + 40 - lastCar.x : lastCar.x + 40) > 110;
        if (spawn[l] <= 0 && room) { const v = 42 + Math.random() * 28 + Math.min(score, 10) * 3;   // slow enough that a car you cannot see yet cannot reach you
          cars.push({ l, x: l ? W + 40 : -40, v, c: COLS[Math.floor(Math.random() * COLS.length)], stop: 0 }); spawn[l] = 0.9 + Math.random() * 2.6 - Math.min(score, 10) * 0.05; }
      }
      cars.forEach(c => { if (c.stop > 0) c.stop -= dt; else c.x += (c.l ? -c.v : c.v) * dt; });
      cars = cars.filter(c => c.x > -80 && c.x < W + 80);
      if (kid.faceT > 0 && (kid.faceT -= dt) <= 0) kid.face = 0;
      if (kid.st === 'walk') {
        kid.y -= 60 * dt;
        for (const c of cars) if (Math.abs(kid.y - LANE[c.l]) < 24 && c.stop <= 0) {
          const front = c.l ? c.x - 30 : c.x + 30, gap = c.l ? front - (ZX + 9) : (ZX - 9) - front;
          if (gap < 4 && gap > -64) { c.stop = 1.6; kid.st = 'oops'; kid.oopsT = 1.6; lives--; say('Oops! The car had to stop suddenly. Wait for a big gap.', 2.5); break; }
        }
        if (kid.st === 'walk' && kid.y <= 42) { score++; say('Safe crossing! +1', 1.5); kid.st = 'done'; kid.oopsT = 0.8; }
      } else if (kid.st === 'oops' || kid.st === 'done') {
        if ((kid.oopsT -= dt) <= 0) { if (lives <= 0) return end(); kid.y = 258; kid.st = 'wait'; }
      }
      if (msgT > 0) msgT -= dt;
    }
    function end() { running = false; cancelAnimationFrame(raf); draw(); o.onEnd && o.onEnd(score); }
    function loop(now) {
      if (!running) return; raf = requestAnimationFrame(loop);
      if (now - last < 32) return;                                   // 30 fps cap
      const dt = Math.min(0.05, (now - last) / 1000 || 0.033); last = now; step(dt); if (running) draw();
    }
    const rr = (x, y, w, h, r, f) => { ctx.fillStyle = f; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill(); };
    function draw() {
      const dpr = cv.width / W; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#8fbf6a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#c9c3b5'; ctx.fillRect(0, 40, W, 30); ctx.fillRect(0, KERB[1], W, 30);       // footpaths
      ctx.fillStyle = '#555c66'; ctx.fillRect(0, KERB[0], W, KERB[1] - KERB[0]);
      ctx.fillStyle = '#f2f2f2'; for (let x = 0; x < W; x += 40) if (Math.abs(x + 12 - ZX) > 40) ctx.fillRect(x, 148, 24, 4);   // centre line
      for (let y = KERB[0] + 6; y < KERB[1] - 6; y += 18) ctx.fillRect(ZX - 26, y, 52, 10);               // zebra stripes
      ctx.fillStyle = '#d9a441'; [30, 110, 290, 370].forEach(x => { ctx.beginPath(); ctx.arc(x, 18, 14, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x, 282, 12, 0, 7); ctx.fill(); });
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('\u2192 traffic', 8, 100); ctx.textAlign = 'right'; ctx.fillText('traffic \u2190', W - 8, 214);
      cars.forEach(c => { const x = c.x - 30, y = LANE[c.l] - 15; rr(x, y, 60, 30, 7, c.c); rr(c.l ? x + 8 : x + 34, y + 4, 18, 22, 4, 'rgba(20,30,45,0.75)');
        ctx.fillStyle = '#ffe9a0'; const hx = c.l ? x - 1 : x + 58; ctx.fillRect(hx, y + 3, 3, 6); ctx.fillRect(hx, y + 21, 3, 6);
        if (c.stop > 0) { ctx.fillStyle = '#ff6b6b'; const bx = c.l ? x + 58 : x - 1; ctx.fillRect(bx, y + 3, 3, 6); ctx.fillRect(bx, y + 21, 3, 6); } });
      // the kid seen from above: cone shows where they look
      const kx = ZX, ky = kid.y;
      if (kid.face) { ctx.fillStyle = 'rgba(255,240,120,0.25)'; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + kid.face * 240, ky - 120); ctx.lineTo(kx + kid.face * 240, ky + 10); ctx.fill(); }
      ctx.fillStyle = '#ff8c42'; ctx.beginPath(); ctx.ellipse(kx, ky + 3, 12, 8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#8d5524'; ctx.beginPath(); ctx.arc(kx + kid.face * 3, ky - 2, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#2b1a10'; ctx.beginPath(); ctx.arc(kx - kid.face * 2, ky - 3, 6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, 22); ctx.fillStyle = '#fff'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('Safe crossings: ' + score, 8, 16); ctx.textAlign = 'right'; ctx.fillText('\u2764'.repeat(Math.max(0, lives)) + '\u2661'.repeat(3 - Math.max(0, lives)), W - 8, 16);
      if (msgT > 0 && msg) { ctx.font = '700 14px system-ui, sans-serif'; const w = ctx.measureText(msg).width + 20; rr(ZX - w / 2, 126, w, 28, 8, 'rgba(0,0,0,0.7)'); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(msg, ZX, 145); }
      if (!running) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 22, W, H - 22); }
    }
    const ro = new ResizeObserver(() => fit()); reset();
    return {
      el: cv, fit, look, cross,
      start() { reset(); running = true; last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); say('Stand at the kerb. Look right, left, right!', 2.5); },
      stop() { running = false; cancelAnimationFrame(raf); },
      get state() { return { score, lives, kid: kid.st, y: kid.y, cars: cars.map(c => ({ l: c.l, x: Math.round(c.x) })), running }; }
    };
  };
})();
