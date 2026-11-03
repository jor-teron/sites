/*
 * Star Pinball — canvas renderer (PIN-1a; PIN-1b parts). Draws the whole table in code, no images:
 * a space backdrop (stars; planets at the sides when the screen is wide), the table body,
 * neon walls, slingshots, pop bumpers (flash when hit), rollover lanes (lit), the flippers,
 * the plunger spring and the ball (with a mark that turns with its spin).
 * PIN-1b: drop targets (up / down), the spinner flap, the hole (pulses when it will start a mission),
 * the raised ramp drawn over the table (the ball on it is drawn on top), the part the running mission
 * needs drawn brighter, and a SAVE light while ball save is on.
 * The table is portrait and scaled to fit the height; on a wide screen the canvas fills the width,
 * so you see more backdrop around the table. Low graphics: fewer stars and no glow.
 * Drawn only by the game loop (core/game.js), at the shared fpsLimit.
 */
const PBRender = (() => {
  const C = PB_CONFIG, T = PB_TABLE;
  let cv, cx, cw = 300, ch = 500, dpr = 1, k = 0.4, ox = 0, oy = 0, stars = [];

  const pal = () => PB_SETTINGS.isDark()
    ? { sky0: '#05060f', sky1: '#140b2e', body0: '#120a33', body1: '#1d1452', neon: '#38bdf8', sling: '#f472b6', bump: '#a78bfa', bumpHot: '#fde047', post: '#94a3b8', flip: '#f8fafc', lane: '#334155', laneLit: '#facc15', text: 'rgba(226,232,240,.22)', planet: '#7c3aed' }
    : { sky0: '#1e1b4b', sky1: '#3b2f7a', body0: '#241a63', body1: '#33298a', neon: '#67e8f9', sling: '#f9a8d4', bump: '#c4b5fd', bumpHot: '#fef08a', post: '#cbd5e1', flip: '#ffffff', lane: '#4c4f8a', laneLit: '#fde047', text: 'rgba(241,245,249,.25)', planet: '#8b5cf6' };

  function init(canvas) { cv = canvas; cx = cv.getContext('2d'); }
  function resize(wrap) {
    if (!cv) return;
    cw = Math.max(120, wrap.clientWidth); ch = Math.max(200, wrap.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, PB_SETTINGS.get('lowGraphics') ? 1 : 2);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    k = Math.min(cw / C.W, ch / C.H); ox = (cw - C.W * k) / 2; oy = (ch - C.H * k) / 2;
    let seed = 42; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const n = PB_SETTINGS.get('lowGraphics') ? 50 : 160;
    stars = Array.from({ length: n }, () => [rnd() * cw, rnd() * ch, rnd() * 1.4 + 0.3, rnd()]);
  }
  /** Table rectangle on screen (CSS px). */
  const tableRect = () => ({ x: ox, y: oy, w: C.W * k, h: C.H * k, k });

  function outline() {
    cx.beginPath();
    cx.moveTo(20, 1120); cx.lineTo(20, 290);
    cx.arc(302.5, 290, 282.5, Math.PI, 2 * Math.PI);
    cx.lineTo(585, 1140); cx.lineTo(20, 1140); cx.closePath();
  }
  function seg(a, b) { cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke(); }

  function draw(world, view) {
    if (!cx) return;
    const P = pal(), low = !!PB_SETTINGS.get('lowGraphics'), now = view.now || 0;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // backdrop
    const g = cx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, P.sky0); g.addColorStop(1, P.sky1);
    cx.fillStyle = g; cx.fillRect(0, 0, cw, ch);
    cx.fillStyle = '#ffffff';
    for (const s of stars) { cx.globalAlpha = 0.35 + 0.5 * s[3]; cx.fillRect(s[0], s[1], s[2], s[2]); }
    cx.globalAlpha = 1;
    if (ox > 80) {                                                      // wide screen: planets beside the table
      cx.fillStyle = P.planet; cx.globalAlpha = 0.5;
      cx.beginPath(); cx.arc(ox * 0.45, ch * 0.3, Math.min(ox * 0.3, 90), 0, Math.PI * 2); cx.fill();
      cx.fillStyle = '#0ea5e9'; cx.beginPath(); cx.arc(cw - ox * 0.5, ch * 0.72, Math.min(ox * 0.22, 60), 0, Math.PI * 2); cx.fill();
      cx.globalAlpha = 1;
    }
    // table space
    cx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    const bg = cx.createLinearGradient(0, 0, 0, C.H); bg.addColorStop(0, P.body1); bg.addColorStop(1, P.body0);
    outline(); cx.fillStyle = bg; cx.fill();
    // playfield art: a ringed planet, a comet trail and the title
    cx.save(); outline(); cx.clip();
    cx.globalAlpha = 0.35; cx.fillStyle = P.planet; cx.beginPath(); cx.arc(280, 700, 70, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = P.neon; cx.lineWidth = 4; cx.beginPath(); cx.ellipse(280, 700, 120, 26, -0.25, 0, Math.PI * 2); cx.stroke();
    cx.globalAlpha = 1; cx.fillStyle = P.text; cx.font = 'bold 34px sans-serif'; cx.textAlign = 'center';
    cx.fillText('STAR PINBALL', 280, 612);
    cx.restore();
    // rollover lanes
    for (const s of T.sensors) {
      const lit = view.lit && view.lit[s.id];
      cx.fillStyle = lit ? P.laneLit : P.lane; cx.globalAlpha = s.kind === 'top' ? 1 : 0.7;
      cx.beginPath();
      if (s.kind === 'top') { cx.moveTo(s.c[0], s.c[1] - 11); for (let i = 1; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 5 : 11; cx.lineTo(s.c[0] + rr * Math.cos(a), s.c[1] + rr * Math.sin(a)); } }
      else cx.arc(s.c[0], s.c[1], 6, 0, Math.PI * 2);
      cx.closePath(); cx.fill(); cx.globalAlpha = 1;
    }
    // hole (kick-out saucer)
    const H = T.hole.c;
    cx.fillStyle = '#05030f'; cx.beginPath(); cx.arc(H[0], H[1], 17, 0, Math.PI * 2); cx.fill();
    cx.lineWidth = 3; cx.strokeStyle = view.holeLit ? P.laneLit : P.lane;
    cx.globalAlpha = view.holeLit ? 0.55 + 0.45 * Math.sin(now / 180) : 1;
    cx.beginPath(); cx.arc(H[0], H[1], 21, 0, Math.PI * 2); cx.stroke(); cx.globalAlpha = 1;
    // slings (filled triangles, flash when kicked)
    for (const side of [0, 1]) {
      const v = side ? [[445, 800], [445, 900], [390, 930]] : [[115, 800], [115, 900], [170, 930]];
      const hot = view.flash && now - (view.flash['sling' + side] || -1e9) < 120;
      cx.fillStyle = hot ? P.bumpHot : P.sling; cx.globalAlpha = hot ? 0.9 : 0.35;
      cx.beginPath(); cx.moveTo(v[0][0], v[0][1]); cx.lineTo(v[1][0], v[1][1]); cx.lineTo(v[2][0], v[2][1]); cx.closePath(); cx.fill(); cx.globalAlpha = 1;
    }
    // walls
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    if (!low) { cx.shadowColor = P.neon; cx.shadowBlur = 10; }
    cx.strokeStyle = P.neon; cx.lineWidth = 6;
    cx.beginPath(); cx.moveTo(20, 1120); cx.lineTo(20, 290); cx.arc(302.5, 290, 282.5, Math.PI, 2 * Math.PI); cx.lineTo(585, 1140); cx.stroke();
    for (const s of T.walls) {
      if (s.kind === 'gate') { cx.save(); cx.lineWidth = 3; cx.setLineDash([6, 6]); seg(s.a, s.b); cx.restore(); continue; }
      if (s.a[0] === s.b[0] && (s.a[0] === 20 || s.a[0] === 585)) continue;   // outer walls: drawn with the outline above
      cx.strokeStyle = s.kind === 'sling' ? P.sling : P.neon; cx.lineWidth = s.kind === 'sling' ? 7 : 6; seg(s.a, s.b);
    }
    // drop targets
    const mDrops = view.mission === 'drops';
    for (const d of T.drops) {
      const up = world.drops[d.id];
      cx.strokeStyle = up ? (mDrops ? P.laneLit : P.sling) : P.lane; cx.lineWidth = up ? 7 : 3; cx.globalAlpha = up ? 1 : 0.6;
      cx.beginPath(); cx.moveTo(d.segs[0][0][0], d.segs[0][0][1]); for (const sg of d.segs) cx.lineTo(sg[1][0], sg[1][1]); cx.stroke();
      cx.globalAlpha = 1;
    }
    // spinner: a flap seen edge-on as it turns
    const SPn = T.spinner, sa = world.spinner.a, thick = 2 + 6 * Math.abs(Math.cos(sa));
    cx.shadowBlur = 0; cx.strokeStyle = view.mission === 'spin' ? P.laneLit : P.post; cx.lineWidth = thick;
    seg(SPn.a, SPn.b);
    cx.fillStyle = P.post; for (const p of [SPn.a, SPn.b]) { cx.beginPath(); cx.arc(p[0], p[1], 3, 0, Math.PI * 2); cx.fill(); }
    if (!low) { cx.shadowColor = P.neon; cx.shadowBlur = 10; }
    // bumpers + posts
    for (const c of T.circles) {
      const hot = view.flash && now - (view.flash[c.id] || -1e9) < 110;
      if (c.kind === 'bumper') {
        if (!low) { cx.shadowColor = hot ? P.bumpHot : P.bump; cx.shadowBlur = hot ? 26 : 14; }
        cx.fillStyle = hot ? P.bumpHot : P.bump; cx.beginPath(); cx.arc(c.c[0], c.c[1], c.R, 0, Math.PI * 2); cx.fill();
        cx.shadowBlur = 0; cx.fillStyle = P.body0; cx.beginPath(); cx.arc(c.c[0], c.c[1], c.R * 0.55, 0, Math.PI * 2); cx.fill();
        cx.fillStyle = hot ? '#fff' : P.bump; cx.beginPath(); cx.arc(c.c[0], c.c[1], c.R * 0.25, 0, Math.PI * 2); cx.fill();
      } else { cx.shadowBlur = 0; cx.fillStyle = P.post; cx.beginPath(); cx.arc(c.c[0], c.c[1], c.R, 0, Math.PI * 2); cx.fill(); }
    }
    cx.shadowBlur = 0;
    // plunger
    const pl = world.plunger, py = pl.y;
    cx.strokeStyle = P.post; cx.lineWidth = 2; cx.beginPath();
    for (let i = 0; i <= 8; i++) { const y = py + 6 + i * ((1135 - py - 6) / 8); cx.lineTo(i % 2 ? 556 : 574, y); } cx.stroke();
    cx.fillStyle = '#e2e8f0'; cx.fillRect(549, py, 32, 7);
    if (view.ready) {
      cx.fillStyle = P.laneLit; cx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 200);
      cx.beginPath(); cx.moveTo(565, 870); cx.lineTo(553, 892); cx.lineTo(577, 892); cx.closePath(); cx.fill(); cx.globalAlpha = 1;
    }
    // flippers
    for (const f of world.flippers) {
      const t = PBPhysics.tipOf(f), dx = t[0] - f.p[0], dy = t[1] - f.p[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
      cx.fillStyle = P.flip; if (!low) { cx.shadowColor = P.neon; cx.shadowBlur = 8; }
      cx.beginPath();
      cx.moveTo(f.p[0] + nx * f.rp, f.p[1] + ny * f.rp); cx.lineTo(t[0] + nx * f.rt, t[1] + ny * f.rt);
      cx.lineTo(t[0] - nx * f.rt, t[1] - ny * f.rt); cx.lineTo(f.p[0] - nx * f.rp, f.p[1] - ny * f.rp); cx.closePath(); cx.fill();
      cx.beginPath(); cx.arc(f.p[0], f.p[1], f.rp, 0, Math.PI * 2); cx.fill();
      cx.beginPath(); cx.arc(t[0], t[1], f.rt, 0, Math.PI * 2); cx.fill(); cx.shadowBlur = 0;
      cx.fillStyle = P.sling; cx.beginPath(); cx.arc(f.p[0], f.p[1], 4, 0, Math.PI * 2); cx.fill();
    }
    if (view.saveOn) {                                                     // ball save light
      cx.fillStyle = P.laneLit; cx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 150);
      cx.font = 'bold 18px sans-serif'; cx.textAlign = 'center'; cx.fillText('SAVE', 280, 1075); cx.globalAlpha = 1;
    }
    // ball: under the ramp on the table, over it while riding the ramp
    const b = world.ball;
    if (b && b.live && b.mode !== 'ramp') ball(b, b.mode === 'hole' ? 0.8 : 1);
    drawRamp(P, view, low);
    if (b && b.live && b.mode === 'ramp') ball(b, 1.12);
  }
  function ball(b, sc) {
    const r = C.ballR * sc, gg = cx.createRadialGradient(b.x - r * 0.4, b.y - r * 0.4, r * 0.15, b.x, b.y, r);
    gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.5, '#cbd5e1'); gg.addColorStop(1, '#475569');
    if (sc > 1) { cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.arc(b.x + 5, b.y + 7, r, 0, Math.PI * 2); cx.fill(); }
    cx.fillStyle = gg; cx.beginPath(); cx.arc(b.x, b.y, r, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = 'rgba(30,41,59,.55)'; cx.lineWidth = 2.5;                     // spin mark
    cx.beginPath(); cx.arc(b.x, b.y, r * 0.62, b.ang, b.ang + 1.3); cx.stroke();
  }
  /** The raised ramp: a see-through deck with two rails along the path. */
  function drawRamp(P, view, low) {
    const path = T.ramp.path, hot = view.mission === 'ramp';
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    cx.strokeStyle = 'rgba(103,232,249,.13)'; cx.lineWidth = 34;
    cx.beginPath(); cx.moveTo(path[0][0], path[0][1]); for (const p of path) cx.lineTo(p[0], p[1]); cx.stroke();
    const rail = (off) => {
      cx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const a = path[Math.max(0, i - 1)], c = path[Math.min(path.length - 1, i + 1)], dx = c[0] - a[0], dy = c[1] - a[1], L = Math.hypot(dx, dy);
        cx.lineTo(path[i][0] - dy / L * off, path[i][1] + dx / L * off);
      }
      cx.stroke();
    };
    if (!low) { cx.shadowColor = hot ? P.laneLit : P.neon; cx.shadowBlur = 8; }
    cx.strokeStyle = hot ? P.laneLit : '#a5f3fc'; cx.lineWidth = 3; rail(17); rail(-17);
    cx.shadowBlur = 0;
    // entry arrow under the covered mouth
    cx.fillStyle = hot ? P.laneLit : P.neon; cx.globalAlpha = 0.8;
    cx.beginPath(); cx.moveTo(465, 560); cx.lineTo(452, 585); cx.lineTo(478, 585); cx.closePath(); cx.fill(); cx.globalAlpha = 1;
  }
  return { init, resize, draw, tableRect };
})();
