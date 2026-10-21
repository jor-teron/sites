// Gear R2c3: feet, headwear and eyewear slots. Kai and Nova carry explicit gear values (characters.js);
// generated fighters roll theirs from their own seeded stream (see generator.js), so R2a/R2c1/R2c2 rolls never shift.
(function () {
  const C = NF.config, Dr = NF.draw, D = Math.PI / 180;
  // option -> [male weight, female weight]; wild = weight used for wild-blend fighters
  const TABLE = {
    feet: { wraps: [2, 1.2], barefoot: [1.5, 1], boots: [2.4, 2], sneakers: [3, 2.6], sandals: [1.2, 1.4], flipflops: [1, 1], crocs: [0.9, 0.9],
            heels: { w: [0, 0.6], wild: 6 }, highheels: { w: [0, 0.35], wild: 5 } },
    head: { none: [7, 7], helmet: [0.8, 0.6], cap: { w: [1.1, 0.8], noSpiky: true }, bandana: { w: [0.9, 0.8], noSpiky: true }, hood: [0.7, 0.7],
            headband: { w: [1, 0.9], noSpiky: true }, bunwrap: { w: [0.1, 1], noSpiky: true } },
    eyes: { none: [7.5, 7.5], glasses: [1, 1.1], sunglasses: [1.1, 1], visor: [0.6, 0.5], goggles: [0.6, 0.5] }
  };
  const CLOSED = ['boots', 'sneakers', 'crocs', 'heels', 'highheels'];   // shoes that cover the foot: fine with tights
  const LIFT = { heels: 10, highheels: 18 };                             // heel height raises the whole body a little
  const KAI = { feet: 'barefoot', head: 'none', eyes: 'none' }, NOVA = { feet: 'boots', head: 'none', eyes: 'none' };
  const gear = ch => ch.gear || (ch.outfit === 'suit' ? NOVA : KAI);
  const hidesHair = ch => ['helmet', 'hood'].includes(gear(ch).head);
  function roll(r, male, wild, legs, hairStyle) {
    const out = {};
    for (const slot of Object.keys(TABLE)) {
      const opts = Object.entries(TABLE[slot]).map(([k, v]) => {
        const d = Array.isArray(v) ? { w: v } : v; let w = wild && d.wild ? d.wild : d.w[male ? 0 : 1];
        if (slot === 'feet' && legs === 'tights' && !CLOSED.includes(k)) w = 0;   // tights need a closed shoe
        if (d.noSpiky && hairStyle === 'spiky') w = 0;                           // spiky hair keeps its own headband
        return [k, w];
      });
      let t = r() * opts.reduce((s, o) => s + o[1], 0);
      out[slot] = opts.find(o => (t -= o[1]) < 0 || o === opts[opts.length - 1])[0];
    }
    return out;
  }

  // ---------- feet (foot-local: x toward the toes, y toward the sole) ----------
  const poly = (ctx, P) => Dr.smoothPath(ctx, P, true);
  function shoe(ctx, L, pts, col, far, o = {}) {
    const P = pts.map(p => L(p[0], p[1])); poly(ctx, P);
    const a = L(20, -12), b = L(20, 40), g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, Dr.shade(col, (o.hi || 1.25) * far)); g.addColorStop(1, Dr.shade(col, 0.55 * far));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.3; ctx.strokeStyle = C.outline; ctx.stroke();
    return P;
  }
  const clipBand = (ctx, P, L, y0, y1, col) => { ctx.save(); poly(ctx, P); ctx.clip(); const q = [L(-50, y0), L(120, y0), L(120, y1), L(-50, y1)];
    ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.fillStyle = col; ctx.fill(); ctx.restore(); };
  const seg = (ctx, L, pts, col, lw) => { ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.lineWidth = lw; Dr.smoothPath(ctx, pts.map(p => L(p[0], p[1])), false); ctx.stroke(); };
  const FEET = {
    barefoot(ctx, A, fa, ch, o) { Dr.foot(ctx, A, fa, ch, Object.assign({}, o, { type: 'bare' })); },
    wraps(ctx, A, fa, ch, o, L, far) {
      Dr.foot(ctx, A, fa, ch, Object.assign({}, o, { type: 'bare' }));
      for (const [x0, x1] of [[-14, 6], [0, 20], [16, 38], [34, 54]]) { seg(ctx, L, [[x0, -14 + x0 * 0.3], [x1, 32]], C.outline, 7); seg(ctx, L, [[x0, -14 + x0 * 0.3], [x1, 32]], Dr.shade(ch.wrap, far), 5); }
    },
    sandals(ctx, A, fa, ch, o, L, far) {
      Dr.foot(ctx, A, fa, ch, Object.assign({}, o, { type: 'bare' }));
      shoe(ctx, L, [[-28, 30], [94, 30], [98, 34], [94, 39], [-26, 39], [-30, 34]], '#5a3a22', far);
      for (const s of [[[-18, -6], [-26, 26]], [[36, 6], [44, 30]], [[62, 14], [66, 30]]]) { seg(ctx, L, s, C.outline, 7); seg(ctx, L, s, Dr.shade(ch.shoeCol, far), 5); }
      seg(ctx, L, [[-24, -10], [12, -10]], C.outline, 7); seg(ctx, L, [[-24, -10], [12, -10]], Dr.shade(ch.shoeCol, far), 5);
    },
    flipflops(ctx, A, fa, ch, o, L, far) {
      Dr.foot(ctx, A, fa, ch, Object.assign({}, o, { type: 'bare' }));
      shoe(ctx, L, [[-28, 31], [92, 31], [96, 34], [92, 37], [-26, 37], [-30, 34]], ch.shoeCol, far);
      for (const s of [[[74, 26], [44, 8], [30, 30]]]) { seg(ctx, L, s, C.outline, 6); seg(ctx, L, s, Dr.shade(ch.shoeHi, far), 4); }
    },
    sneakers(ctx, A, fa, ch, o, L, far) {
      const P = shoe(ctx, L, [[-18, -16], [-27, 2], [-31, 20], [-28, 38], [10, 40], [60, 40], [90, 37], [99, 27], [93, 16], [66, 8], [38, -1], [16, -16]], ch.shoeCol, far);
      clipBand(ctx, P, L, 29, 44, Dr.shade('#f1efe8', far));
      seg(ctx, L, [[-28, 29], [40, 30], [97, 28]], 'rgba(0,0,0,0.35)', 1.5);
      seg(ctx, L, [[-8, 10], [40, 20], [80, 22]], Dr.alpha(ch.shoeHi, 0.9 * far), 3);                       // side swoosh
      for (const x of [18, 28, 38]) seg(ctx, L, [[x, -6 + x * 0.25], [x + 6, 0 + x * 0.25]], 'rgba(255,255,255,' + 0.7 * far + ')', 2);   // laces
    },
    crocs(ctx, A, fa, ch, o, L, far) {
      const P = shoe(ctx, L, [[-16, -10], [-26, 8], [-29, 26], [-23, 39], [20, 41], [70, 41], [97, 34], [102, 18], [88, 4], [58, -2], [30, -6], [12, -12]], ch.shoeCol, far, { hi: 1.4 });
      clipBand(ctx, P, L, 35, 46, Dr.shade(ch.shoeCol, 0.7 * far));
      ctx.fillStyle = 'rgba(0,0,0,' + 0.45 * far + ')';
      for (const [x, y] of [[40, 8], [54, 10], [68, 14], [82, 18], [48, 20], [62, 22], [76, 26], [90, 26], [34, 18]]) { const p = L(x, y); ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, 7); ctx.fill(); }
      seg(ctx, L, [[-26, 12], [-14, -6], [6, -2]], C.outline, 7); seg(ctx, L, [[-26, 12], [-14, -6], [6, -2]], Dr.shade(ch.shoeHi, far), 4.5);   // heel strap
      const r = L(4, -2); ctx.fillStyle = Dr.shade(ch.shoeHi, far); ctx.strokeStyle = C.outline; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(r.x, r.y, 4, 0, 7); ctx.fill(); ctx.stroke();
    },
    heels(ctx, A, fa, ch, o, L, far) { pump(ctx, L, ch, far, LIFT.heels); },
    highheels(ctx, A, fa, ch, o, L, far) { pump(ctx, L, ch, far, LIFT.highheels); }
  };
  function pump(ctx, L, ch, far, H) {
    // heel spike under the heel, then the shoe sloping down to a toe that meets the ground
    const sp = [L(-27, 22), L(-6, 22), L(-12, 34 + H * 1.6), L(H > 12 ? -15 : -21, 34 + H * 1.6)];
    ctx.beginPath(); sp.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = Dr.shade(ch.shoeCol, 0.6 * far); ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = C.outline; ctx.stroke();
    shoe(ctx, L, [[-14, -14], [-24, 0], [-27, 18], [-22, 30], [16, 30 + H * 0.35], [58, 31 + H * 0.85], [88, 33 + H], [97, 28 + H], [90, 18 + H * 0.7], [62, 8 + H * 0.4], [32, -2], [12, -14]], ch.shoeCol, far, { hi: 1.5 });
    seg(ctx, L, [[30, -2 + 0], [60, 8 + H * 0.4]], 'rgba(255,255,255,' + 0.35 * far + ')', 3);
    if (H > 12) { seg(ctx, L, [[-20, -8], [12, -12]], C.outline, 6); seg(ctx, L, [[-20, -8], [12, -12]], Dr.shade(ch.shoeHi, far), 4); }   // ankle strap
  }
  function foot(ctx, A, fa, ch, o) {
    const t = Dr.dirDown(fa), n = { x: -Math.cos(fa * D), y: Math.sin(fa * D) }, far = o.far ? C.farLimb : 1, f = ch.bones.foot;
    const L = (x, y) => ({ x: A.x + (t.x * x + n.x * y) * f, y: A.y + (t.y * x + n.y * y) * f });
    FEET[gear(ch).feet](ctx, A, fa, ch, o, L, far);
  }

  // ---------- headwear (head-local units, face to the right) ----------
  const P = a => a.map(p => ({ x: p[0], y: p[1] }));
  const hx = (h, f) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * f))).toString(16).padStart(2, '0')).join('');   // hex shade
  function fill(ctx, pts, col, o = {}) {
    const Q = P(pts); Dr.smoothPath(ctx, Q, true);
    const g = ctx.createLinearGradient(30, -80, -40, 10); g.addColorStop(0, Dr.shade(col, o.hi || 1.45)); g.addColorStop(0.5, col); g.addColorStop(1, Dr.shade(col, 0.5));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = o.lw || 2.2; ctx.strokeStyle = C.outline; ctx.stroke(); return Q;
  }
  const line = (ctx, pts, col, lw) => { ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.lineWidth = lw; Dr.smoothPath(ctx, P(pts), false); ctx.stroke(); };
  const big = ch => ['coily', 'curly'].includes(ch.hairStyle) ? 1.12 : 1;   // puffy hair: hat sits a little larger
  const scaled = (pts, k) => pts.map(p => [-6 + (p[0] + 6) * k, -24 + (p[1] + 24) * k]);
  const HEAD = {
    none() {},
    helmet(ctx, ch) {
      const Q = fill(ctx, [[45, -28], [43, -52], [26, -76], [0, -86], [-30, -80], [-52, -62], [-62, -36], [-60, -8], [-50, 10], [-34, 12], [-26, -2], [-12, -18], [6, -28], [26, -32]], ch.headCol, { hi: 1.6 });
      ctx.save(); Dr.smoothPath(ctx, Q, true); ctx.clip();
      line(ctx, [[30, -60], [0, -78], [-40, -66]], 'rgba(255,255,255,0.35)', 5);
      line(ctx, [[44, -40], [10, -58], [-40, -46], [-60, -20]], Dr.alpha(ch.glow, 0.9), 3);   // glow stripe
      ctx.restore();
      ctx.fillStyle = Dr.shade(ch.headCol, 0.8); ctx.strokeStyle = C.outline; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(-24, -14, 11, 13, 0, 0, 7); ctx.fill(); ctx.stroke();   // ear guard
      Dr.glowDot(ctx, { x: -24, y: -14 }, 6, ch.glow);
      line(ctx, [[-20, -2], [-4, 24], [14, 40]], C.outline, 4.5); line(ctx, [[-20, -2], [-4, 24], [14, 40]], Dr.shade(ch.headCol, 0.6), 2.5);   // chin strap
    },
    hood(ctx, ch) {
      const Q = fill(ctx, [[46, -40], [36, -68], [6, -88], [-30, -86], [-60, -64], [-72, -28], [-68, 10], [-54, 40], [-30, 58], [2, 60], [14, 50], [6, 40], [0, 20], [-2, -4], [6, -28], [18, -42], [34, -46]], ch.headCol, { hi: 1.35 });
      ctx.save(); Dr.smoothPath(ctx, Q, true); ctx.clip();
      line(ctx, [[40, -44], [16, -40], [4, -26], [0, 0], [8, 38], [14, 52]], 'rgba(0,0,0,0.45)', 9);   // shadow inside the opening
      line(ctx, [[-30, -80], [-58, -40], [-56, 20]], 'rgba(0,0,0,0.25)', 4);
      line(ctx, [[30, -70], [-10, -84]], 'rgba(255,255,255,0.22)', 5);
      ctx.restore();
      line(ctx, [[-6, 44], [0, 64]], Dr.shade(ch.headHi, 1), 2.5);   // drawstring
    },
    cap(ctx, ch) {
      const k = big(ch);
      fill(ctx, scaled([[40, -34], [38, -54], [20, -72], [-6, -78], [-32, -72], [-50, -54], [-54, -36], [-40, -32], [0, -38]], k), ch.headCol);
      fill(ctx, scaled([[30, -38], [62, -38], [70, -32], [64, -28], [36, -30]], k), hx(ch.headCol, 0.8));   // brim
      line(ctx, scaled([[-6, -78], [10, -40]], k), 'rgba(0,0,0,0.3)', 1.5);
      ctx.fillStyle = ch.headHi; const b = scaled([[-6, -78]], k)[0]; ctx.beginPath(); ctx.arc(b[0], b[1], 4, 0, 7); ctx.fill();
      line(ctx, scaled([[30, -50], [10, -62]], k), Dr.alpha(ch.glow, 0.8), 4);   // logo
    },
    bandana(ctx, ch) {
      const k = big(ch);
      const Q = fill(ctx, scaled([[41, -34], [37, -56], [18, -72], [-8, -78], [-34, -72], [-52, -54], [-58, -32], [-46, -24], [-10, -38]], k), ch.headCol);
      ctx.save(); Dr.smoothPath(ctx, Q, true); ctx.clip(); ctx.fillStyle = Dr.alpha(ch.headHi, 0.7);
      for (let y = -86; y < -20; y += 9) for (let x = -64 + (y % 2 ? 4 : 0); x < 50; x += 9) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }
      ctx.restore();
      const t = scaled([[-54, -30]], k)[0];
      fill(ctx, [[t[0], t[1]], [t[0] - 22, t[1] + 10], [t[0] - 16, t[1] + 18], [t[0] + 2, t[1] + 6]], hx(ch.headCol, 0.75));
      fill(ctx, [[t[0], t[1]], [t[0] - 12, t[1] + 26], [t[0] - 4, t[1] + 28], [t[0] + 4, t[1] + 6]], hx(ch.headCol, 0.85));
    },
    headband(ctx, ch) {
      const k = big(ch), a = scaled([[39, -36], [-6, -52], [-52, -30]], k);
      line(ctx, a, C.outline, 13); line(ctx, a, ch.headCol, 10); line(ctx, a.map(p => [p[0], p[1] - 2]), 'rgba(255,255,255,0.3)', 2);
      line(ctx, scaled([[20, -42], [6, -46]], k), Dr.alpha(ch.glow, 0.9), 4);
    },
    bunwrap(ctx, ch) {
      const cx = -30, cy = -74;
      fill(ctx, [[cx + 16, cy + 10], [cx + 20, cy - 8], [cx + 4, cy - 22], [cx - 18, cy - 18], [cx - 24, cy], [cx - 12, cy + 14]], ch.hair, { hi: 1.3 });   // the bun
      const Q = fill(ctx, [[cx + 14, cy + 6], [cx + 16, cy - 10], [cx + 2, cy - 20], [cx - 16, cy - 14], [cx - 20, cy + 2], [cx - 8, cy + 12]], ch.headCol);
      ctx.save(); Dr.smoothPath(ctx, Q, true); ctx.clip();
      for (let i = -3; i < 4; i++) line(ctx, [[cx - 24 + i * 8, cy + 14], [cx - 4 + i * 8, cy - 24]], 'rgba(0,0,0,0.22)', 2);
      ctx.restore();
      fill(ctx, [[cx - 18, cy + 6], [cx - 34, cy + 18], [cx - 28, cy + 24], [cx - 14, cy + 12]], hx(ch.headCol, 0.8), { lw: 1.6 });   // knot tail
    }
  };
  const EYES = {
    none() {},
    glasses(ctx, ch) {
      line(ctx, [[27, -13], [10, -15], [-10, -14]], C.outline, 3); line(ctx, [[27, -13], [10, -15], [-10, -14]], ch.eyeCol, 1.8);
      ctx.fillStyle = 'rgba(200,230,255,0.18)'; ctx.strokeStyle = C.outline; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.ellipse(35, -11, 8.5, 7, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = ch.eyeCol; ctx.lineWidth = 2; ctx.stroke();
      line(ctx, [[43, -12], [46, -13]], ch.eyeCol, 2.5);
      line(ctx, [[31, -15], [36, -16]], 'rgba(255,255,255,0.6)', 1.5);
    },
    sunglasses(ctx, ch) {
      line(ctx, [[27, -14], [10, -16], [-10, -14]], C.outline, 3.5); line(ctx, [[27, -14], [10, -16], [-10, -14]], ch.eyeCol, 2);
      ctx.beginPath(); ctx.moveTo(25, -18); ctx.lineTo(46, -18); ctx.quadraticCurveTo(46, -5, 36, -4); ctx.quadraticCurveTo(26, -4, 25, -18); ctx.closePath();
      const g = ctx.createLinearGradient(0, -18, 0, -4); g.addColorStop(0, '#2a2a34'); g.addColorStop(1, Dr.shade(ch.eyeCol, 0.5));
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = C.outline; ctx.lineWidth = 2.2; ctx.stroke();
      line(ctx, [[30, -15], [36, -9]], 'rgba(255,255,255,0.45)', 2);
    },
    visor(ctx, ch) {
      ctx.beginPath(); ctx.moveTo(48, -22); ctx.quadraticCurveTo(50, -12, 47, -3); ctx.lineTo(28, -2); ctx.quadraticCurveTo(6, -6, -6, -10); ctx.lineTo(-6, -20); ctx.quadraticCurveTo(10, -24, 30, -24); ctx.closePath();
      ctx.fillStyle = Dr.alpha(ch.glow, 0.42); ctx.fill(); ctx.strokeStyle = C.outline; ctx.lineWidth = 2; ctx.stroke();
      line(ctx, [[46, -20], [28, -22], [0, -18]], Dr.alpha('#ffffff', 0.55), 2); line(ctx, [[46, -5], [28, -4]], Dr.alpha(ch.glow, 0.95), 2.5);
      ctx.fillStyle = Dr.shade(ch.eyeCol, 0.8); ctx.beginPath(); ctx.arc(-6, -15, 5, 0, 7); ctx.fill(); ctx.stroke();
    },
    goggles(ctx, ch) {
      line(ctx, [[26, -14], [-10, -20], [-52, -24]], C.outline, 9); line(ctx, [[26, -14], [-10, -20], [-52, -24]], ch.eyeCol, 6);
      ctx.beginPath(); ctx.roundRect(24, -21, 24, 19, 7); ctx.fillStyle = Dr.shade(ch.eyeCol, 0.7); ctx.fill(); ctx.strokeStyle = C.outline; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(28, -18, 18, 13, 5); ctx.fillStyle = Dr.alpha(ch.glow, 0.5); ctx.fill(); ctx.stroke();
      line(ctx, [[31, -15], [37, -10]], 'rgba(255,255,255,0.6)', 2);
    }
  };
  const headwear = (ctx, ch) => HEAD[gear(ch).head](ctx, ch);
  const eyewear = (ctx, ch) => EYES[gear(ch).eyes](ctx, ch);
  const lift = ch => LIFT[gear(ch).feet] || 0;
  NF.gear = { TABLE, CLOSED, LIFT, KAI, NOVA, gear, hidesHair, roll, foot, headwear, eyewear, lift, FEET, HEAD, EYES };
})();
