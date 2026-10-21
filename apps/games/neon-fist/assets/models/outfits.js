// Outfits R2c2: clothing slots (top, legs, knee pads, arms, waist), each drawn by its own piece function.
// Kai and Nova carry explicit slot values; generated fighters roll theirs from the slot table (see generator.js).
(function () {
  const C = NF.config, Dr = NF.draw;
  // Slot table: option -> [male weight, female weight]. `only` limits an option to certain tops.
  const TABLE = {
    top:   { gi: [3, 1.5], suit: [1.6, 2.4], tee: [2.2, 1.8], tank: [2, 1.4], crop: [0.15, 2.6] },
    legs:  { long: [2.2, 1.6], capri: [0.9, 1.6], knee: [1.6, 1.3], shorts: [2, 2.2], tights: { w: [3, 3], only: ['suit'], boots: true } },
    pads:  { none: [4, 4], armour: [1.6, 1.6], strap: [2, 2], cap: [2, 2] },
    arms:  { wraps: [3, 2.4], fingerless: [2.4, 2.4], gloves: [2, 2.2], none: [1.8, 2] },
    waist: { belt: [3, 2.4], sash: [2, 2.4], armour: { w: [2.4, 2.4], only: ['suit'] }, none: { w: [1.6, 2], not: ['gi'] } }
  };
  const KAI = { top: 'gi', legs: 'long', pads: 'none', arms: 'wraps', waist: 'belt' };
  const NOVA = { top: 'suit', legs: 'tights', pads: 'armour', arms: 'gloves', waist: 'armour' };
  const slots = ch => ch.slots || (ch.outfit === 'suit' ? NOVA : KAI);
  // weighted, deterministic pick of one option per slot (r = seeded rng)
  function roll(r, male, wild, boots) {
    const out = {};
    for (const slot of Object.keys(TABLE)) {
      const opts = Object.entries(TABLE[slot]).map(([k, v]) => {
        const d = Array.isArray(v) ? { w: v } : v;
        let w = d.w[male ? 0 : 1];
        if (d.only && !d.only.includes(out.top)) w = 0;
        if (d.not && d.not.includes(out.top)) w = 0;
        if (d.boots && !boots) w = 0;                                   // tights need boots to cover the shin
        if (wild && slot === 'top' && k === 'crop' && male) w = 2.5;      // wildcard men love a crop top
        return [k, w];
      });
      let t = r() * opts.reduce((s, o) => s + o[1], 0);
      out[slot] = opts.find(o => (t -= o[1]) < 0 || o === opts[opts.length - 1])[0];
    }
    return out;
  }

  // ---------- shared bits ----------
  const hem = (ctx, pts, col, far, lw = 3.5) => { ctx.lineCap = 'round'; ctx.strokeStyle = Dr.alpha(col, far ? 0.45 : 0.9); ctx.lineWidth = lw; Dr.smoothPath(ctx, pts, false); ctx.stroke(); };
  const trimCol = ch => ch.trim || ch.glow;
  function skinTorso(ctx, T, fr, bk, ch, fv) {
    const body = Dr.torsoShape(T, fr, bk);
    Dr.paint(ctx, body, ch.skin, { rim: ch.rim, light: 1.3, spec: 0.1 });
    ctx.save(); Dr.smoothPath(ctx, Dr.outline(body), true); ctx.clip();
    const ln = (pts, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; Dr.smoothPath(ctx, pts, false); ctx.stroke(); };
    ln([T(0.62, fv(0.62) - 3), T(0.66, fv(0.66) - 16), T(0.74, fv(0.74) - 26)], 'rgba(70,30,15,0.4)', 3);       // pec / bust underside
    ln([T(0.12, fv(0.12) - 12), T(0.3, fv(0.3) - 10), T(0.55, fv(0.55) - 10)], 'rgba(70,30,15,0.28)', 2);       // abs centre line
    for (const u of [0.24, 0.36, 0.47]) ln([T(u, fv(u) - 3), T(u + 0.01, fv(u) - 18)], 'rgba(70,30,15,0.2)', 2);
    ln([T(0.2, fv(0.2) - 4), T(0.42, fv(0.42) - 3)], 'rgba(255,230,205,0.25)', 4);
    ctx.restore();
    return body;
  }
  // a shoulder strap for tank / crop tops
  function strap(ctx, T, fv, col, ch) {
    const pts = [T(0.86, fv(0.86) - 14), T(0.95, fv(0.95) - 10), T(1.02, -4)];
    ctx.lineCap = 'round'; ctx.strokeStyle = C.outline; ctx.lineWidth = 11; Dr.smoothPath(ctx, pts, false); ctx.stroke();
    ctx.strokeStyle = Dr.shade(col, 1.1); ctx.lineWidth = 8; ctx.stroke();
  }

  // ---------- tops (torso) ----------
  const TOP = {
    gi(f, ctx, T, fr, bk, fv, tw, line) {
      const J = f.J, ch = f.ch;
      const body = Dr.torsoShape(T, fr, bk, { inf: 3 });
      Dr.paint(ctx, body, ch.gi, { rim: ch.rim, folds: [[0.3, -14, 3, 0.7], [0.55, -10, 2.5, 0.6]], foldA: 0.45, light: 1.7 });
      ctx.save(); Dr.smoothPath(ctx, Dr.outline(body), true); ctx.clip();
      // diagonal cloth folds from the armpit toward the belt, lat shadow along the back
      for (const [ua, ub, va, vb] of [[0.78, 0.3, -20, 10], [0.7, 0.2, -34, -4], [0.86, 0.5, 0, 24]]) line([T(ua, va), T((ua + ub) / 2, (va + vb) / 2 - 6), T(ub, vb)], 'rgba(0,0,0,0.4)', 2.5);
      line([T(0.82, -30), T(0.6, -26), T(0.4, -14)], 'rgba(255,255,255,0.08)', 4);
      ctx.restore();
      // open neckline: chest skin with pecs and sternum (near pec large, far pec foreshortened)
      const us = [1, 0.95, 0.88, 0.8, 0.7, 0.62];
      const vw = 0.85 + 0.25 * tw;
      const inner = [T(0.56, fv(0.56) - 4), T(0.7, fv(0.7) - 22 * vw), T(0.84, fv(0.84) - 30 * vw), T(0.98, fv(0.98) - 20)];
      const pts = us.map(u => T(u, fv(u) + 1)).concat(inner);
      Dr.smoothPath(ctx, pts, true);
      const m = T(0.8, fv(0.8)), mi = T(0.8, fv(0.8) - 34), g = ctx.createLinearGradient(m.x, m.y, mi.x, mi.y);
      g.addColorStop(0, Dr.shade(ch.skin, 1.3)); g.addColorStop(1, Dr.shade(ch.skin, 0.66));
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.outline; ctx.stroke();
      ctx.save(); Dr.smoothPath(ctx, pts, true); ctx.clip();
      line([T(0.62, fv(0.62) - 3), T(0.66, fv(0.66) - 16), T(0.74, fv(0.74) - 26)], 'rgba(70,30,15,0.45)', 3);   // pec underside
      line([T(0.74, fv(0.74) - 6), T(0.84, fv(0.84) - 4), T(0.95, fv(0.95) - 6)], 'rgba(70,30,15,0.3)', 2);       // sternum / centre line
      line([T(0.7, fv(0.7) - 12), T(0.8, fv(0.8) - 18)], 'rgba(255,230,205,0.35)', 4);                        // pec highlight
      line([T(0.95, fv(0.95) - 10), T(0.9, fv(0.9) - 22)], 'rgba(70,30,15,0.3)', 2);                          // collarbone
      ctx.restore();
      // lapels: the near lapel crosses over with a red trim band, the far one shows as a thin edge
      const lap = inner.map((p, i) => i ? p : T(0.5, fv(0.5) - 2));
      ctx.lineCap = 'round'; ctx.strokeStyle = C.outline; ctx.lineWidth = 13; Dr.smoothPath(ctx, lap, false); ctx.stroke();
      ctx.strokeStyle = Dr.shade(ch.giTrim, 1.05); ctx.lineWidth = 10; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2.5; Dr.smoothPath(ctx, lap.map(p => ({ x: p.x - 2, y: p.y - 2 })), false); ctx.stroke();
      const farLap = us.slice(0, 5).map(u => T(u, fv(u) - 2));
      ctx.strokeStyle = Dr.shade(ch.giTrim, 0.7); ctx.lineWidth = 5; Dr.smoothPath(ctx, farLap, false); ctx.stroke();
      // collar behind the neck
      ctx.strokeStyle = C.outline; ctx.lineWidth = 12; Dr.smoothPath(ctx, [T(0.98, fv(0.98) - 20), T(1.02, -10), T(0.96, -26)], false); ctx.stroke();
      ctx.strokeStyle = Dr.shade(ch.giTrim, 0.85); ctx.lineWidth = 9; ctx.stroke();
    },
    suit(f, ctx, T, fr, bk, fv, tw, line) {
      const J = f.J, ch = f.ch;
      const body = Dr.torsoShape(T, fr, bk);
      Dr.paint(ctx, body, ch.suit, { rim: ch.rim, spec: 0.14 });
      ctx.save(); Dr.smoothPath(ctx, Dr.outline(body), true); ctx.clip();
      line([T(0.86, -24), T(0.62, -20), T(0.38, -6)], 'rgba(0,30,40,0.35)', 3);        // lat / waist curve
      line([T(0.26, 10), T(0.42, 4), T(0.6, 8)], 'rgba(255,255,255,0.12)', 5);        // oblique highlight
      line([T(0.1, -30), T(0.3, -22)], 'rgba(0,30,40,0.3)', 2.5);                      // lower back
      ctx.restore();
      // chest armour plate
      const us = [0.6, 0.68, 0.78, 0.86, 0.93];
      const plate = us.map(u => T(u, fv(u) + 3)).concat([T(0.95, fv(0.95) * 0.1), T(0.78, -6), T(0.6, fv(0.6) * 0.05)]);
      Dr.smoothPath(ctx, plate, true);
      const a = T(0.8, 60), b = T(0.8, -20), g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, ch.armourHi); g.addColorStop(1, Dr.shade(ch.armour, 0.6));
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = C.outline; ctx.stroke();
      ctx.strokeStyle = Dr.alpha(ch.glow, 0.85); ctx.lineWidth = 2.5; Dr.smoothPath(ctx, us.map(u => T(u, fv(u) - 6)), false); ctx.stroke();
      // segmented abdomen plates
      for (const [u0, u1] of [[0.48, 0.56], [0.38, 0.46], [0.28, 0.36]]) {
        const q = [T(u0, fv(u0) + 2), T(u1, fv(u1) + 2), T(u1, fv(u1) - 18), T(u0, fv(u0) - 18)];
        ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
        ctx.fillStyle = Dr.shade(ch.armour, 1.15); ctx.fill(); ctx.strokeStyle = C.outline; ctx.lineWidth = 1.8; ctx.stroke();
      }
      // back spine plate
      const bv = u => Dr.profAt(bk.map(r => [r[0], r[1], r[1]]), u)[0];
      const bp = [0.55, 0.66, 0.78, 0.9].map(u => T(u, -bv(u) - 3)).concat([T(0.9, -bv(0.9) * 0.45), T(0.55, -bv(0.55) * 0.5)]);
      Dr.smoothPath(ctx, bp, true); ctx.fillStyle = Dr.shade(ch.armour, 0.9); ctx.fill(); ctx.strokeStyle = C.outline; ctx.lineWidth = 2; ctx.stroke();
    },
    tee(f, ctx, T, fr, bk, fv, tw, line) {
      const ch = f.ch, body = Dr.torsoShape(T, fr, bk, { inf: 3 });
      Dr.paint(ctx, body, ch.top, { rim: ch.rim, folds: [[0.3, -12, 3, 0.6], [0.6, -8, 2.5, 0.5]], foldA: 0.35, light: 1.5 });
      ctx.save(); Dr.smoothPath(ctx, Dr.outline(body), true); ctx.clip();
      line([T(0.8, -24), T(0.55, -18), T(0.3, -6)], 'rgba(0,0,0,0.3)', 2.5);
      if (ch.topStripe) { ctx.strokeStyle = Dr.alpha(trimCol(ch), 0.8); ctx.lineWidth = 7; Dr.smoothPath(ctx, [T(0.74, fv(0.74) + 6), T(0.74, 0), T(0.74, -80)], false); ctx.stroke(); }
      ctx.restore();
      // crew collar
      ctx.lineCap = 'round'; ctx.strokeStyle = C.outline; ctx.lineWidth = 10; Dr.smoothPath(ctx, [T(0.96, fv(0.96) - 2), T(1.0, fv(1) - 14), T(1.01, -8)], false); ctx.stroke();
      ctx.strokeStyle = Dr.shade(ch.topTrim, 1); ctx.lineWidth = 7; ctx.stroke();
    },
    tank(f, ctx, T, fr, bk, fv, tw, line) {
      const ch = f.ch; skinTorso(ctx, T, fr, bk, ch, fv);
      const body = Dr.torsoShape(T, fr, bk, { inf: 3, u1: 0.86 });
      Dr.paint(ctx, body, ch.top, { rim: ch.rim, folds: [[0.35, -10, 2.5, 0.6]], foldA: 0.3, light: 1.5 });
      hem(ctx, [T(0.86, fv(0.86) + 2), T(0.88, fv(0.88) - 20), T(0.86, -10)], trimCol(ch), false, 3);
      strap(ctx, T, fv, ch.top, ch);
    },
    crop(f, ctx, T, fr, bk, fv, tw, line) {
      const ch = f.ch; skinTorso(ctx, T, fr, bk, ch, fv);
      const body = Dr.torsoShape(T, fr, bk, { inf: 3, u0: 0.56, u1: 0.9 });
      Dr.paint(ctx, body, ch.top, { rim: ch.rim, light: 1.5, spec: 0.12 });
      hem(ctx, [T(0.56, fv(0.56) + 2), T(0.55, 0), T(0.56, -50)], trimCol(ch), false, 3.5);
      strap(ctx, T, fv, ch.top, ch);
    }
  };

  // ---------- arms ----------
  function arm(f, ctx, s, far) {
    const J = f.J, ch = f.ch, B = ch.bones, A = J.ang, o = { far, rim: ch.rim }, S0 = J['shoulder' + s], sl = slots(ch);
    const fa = Dr.limb(J['elbow' + s], A['fa' + s], B.farm, ch.farm, { u0: -0.06 }), ua = Dr.limb(S0, A['ua' + s], B.uarm, ch.uarm, { u0: -0.08 });
    const hType = f.pose['hand' + s] || 'fist', suit = sl.top === 'suit';
    const faPart = (u0, u1, inf) => Dr.limb(J['elbow' + s], A['fa' + s], B.farm, ch.farm, { u0, u1, inf, capS: false, capE: false });
    // forearm
    if (suit) Dr.paint(ctx, fa, ch.suit, Object.assign({ lines: [[0.05, 0.6, 0.2, 0.25, 1.8, 0.3]] }, o));
    else Dr.paint(ctx, fa, ch.skin, Object.assign({ spec: 0.12, lines: [[0.05, 0.6, 0.15, 0.25, 2, 0.3], [0.1, 0.45, 0.6, 0.1, 1.6, 0.25, 1]] }, o));
    if (suit) {   // armoured gauntlet with a glow line
      Dr.paint(ctx, Dr.limb(J['elbow' + s], A['fa' + s], B.farm, ch.farm, { u0: 0.28, u1: 0.98, inf: 3 }), ch.armour, { far, spec: 0.2 });
      const g = Dr.limb(J['elbow' + s], A['fa' + s], B.farm, ch.farm, { u0: 0.35, u1: 0.92, inf: 3 });
      ctx.strokeStyle = Dr.alpha(ch.glow, far ? 0.4 : 0.9); ctx.lineWidth = 3; Dr.smoothPath(ctx, g.front, false); ctx.stroke();
    } else if (sl.arms === 'wraps') {
      Dr.paint(ctx, faPart(0.7, 1, 1.5), ch.wrap, { far, folds: [[0.2, 2, 1.2, 0.9], [0.5, 2, 1.2, 0.9], [0.8, 2, 1.2, 0.9]], foldA: 0.25 });
    } else if (sl.arms === 'fingerless' || sl.arms === 'gloves') {   // glove cuff
      const cu = faPart(sl.arms === 'gloves' ? 0.72 : 0.82, 1, 2.5);
      Dr.paint(ctx, cu, ch.gloveCol, { far, spec: 0.2 });
      ctx.strokeStyle = Dr.alpha(trimCol(ch), far ? 0.4 : 0.85); ctx.lineWidth = 2.2; Dr.smoothPath(ctx, [cu.front[0], cu.back[0]], false); ctx.stroke();
    }
    Dr.hand(ctx, J['wrist' + s], A['hd' + s], hType, ch, { far });
    // upper arm
    if (suit) {
      Dr.paint(ctx, ua, ch.suit, Object.assign({ spec: 0.15, lines: [[0.3, 0.9, -0.05, 0.1, 1.8, 0.3], [0.4, 0.8, 0.5, 0.1, 2.5, 0.25, 1]] }, o));
      const pd = Dr.limb(S0, A['ua' + s], B.uarm, ch.uarm, { u0: -0.1, u1: 0.3, inf: 4 });
      Dr.paint(ctx, pd, ch.armour, { far, spec: 0.25 });
      ctx.strokeStyle = Dr.alpha(ch.glow, far ? 0.35 : 0.8); ctx.lineWidth = 2.5; Dr.smoothPath(ctx, pd.back.slice(-3).concat(pd.front.slice(-1)), false); ctx.stroke();
      return;
    }
    Dr.paint(ctx, ua, ch.skin, Object.assign({ spec: 0.14, lines: [[-0.02, 0.36, 0.5, -0.45, 2.4, 0.35], [0.35, 0.9, -0.1, 0.1, 2, 0.28], [0.4, 0.75, 0.55, 0.1, 3, 0.3, 1], [0.2, 0.55, -0.6, -0.05, 2, 0.22, 1]] }, o));
    if (sl.top === 'gi') Dr.paint(ctx, Dr.limb(S0, A['ua' + s], B.uarm, ch.uarm, { u0: -0.1, u1: 0.14, inf: 3, capE: false }), ch.gi, { far, rim: ch.rim, light: 1.5 });   // sleeveless gi shoulder edge
    else if (sl.top === 'tee') {
      const sv = Dr.limb(S0, A['ua' + s], B.uarm, ch.uarm, { u0: -0.12, u1: 0.46, inf: 4, capE: false });
      Dr.paint(ctx, sv, ch.top, { far, rim: ch.rim, light: 1.5, folds: [[0.5, 6, 2.5, 0.7]], foldA: 0.3 });
      hem(ctx, [sv.front[sv.front.length - 1], sv.back[sv.back.length - 1]], ch.topTrim, far, 4);
    }
  }

  // ---------- legs + knee pads ----------
  const PANTS_SHIN_FOLDS = [[0.3, 14, 3, 0.7], [0.6, 10, 2.5, 0.8], [1, 6, 4, 0.9]];
  function pantsThigh(ctx, thigh, ch, o) {
    Dr.paint(ctx, thigh, ch.pants, Object.assign({ folds: [[0.25, 22, 3.5, 0.75], [0.5, 18, 3, 0.6], [0.75, 14, 3, 0.85]],
      lines: [[0.1, 0.85, 0.55, 0.12, 2.5, 0.22, 1], [0.85, 1.02, 0.1, 0.4, 3, 0.35]] }, o));
  }
  function pantsShin(ctx, f, s, u1, o) {
    const J = f.J, ch = f.ch, end = u1 < 0.8;
    const ps = Dr.limb(J['knee' + s], J.ang['sh' + s], ch.bones.shin, ch.pantsShin, { u0: -0.06, u1, capE: false });
    Dr.paint(ctx, ps, ch.pants, Object.assign(end ? { folds: [[0.4, 8, 2.5, 0.7]], lines: [[0.2, 0.75, -0.5, -0.15, 2.5, 0.3]] } : { folds: PANTS_SHIN_FOLDS,
      lines: [[0.2, 0.75, -0.5, -0.15, 2.5, 0.3], [0.15, 0.5, 0.6, 0.1, 2, 0.22, 1]] }, o));
    if (end) hem(ctx, [ps.front[ps.front.length - 1], ps.back[ps.back.length - 1]], ch.pantsTrim, o.far, 4.5);
  }
  const LEGS = {
    long(f, ctx, s, thigh, o) { pantsShin(ctx, f, s, 0.86, o); pantsThigh(ctx, thigh, f.ch, o); },
    capri(f, ctx, s, thigh, o) { pantsShin(ctx, f, s, 0.55, o); pantsThigh(ctx, thigh, f.ch, o); },
    knee(f, ctx, s, thigh, o) { pantsShin(ctx, f, s, 0.16, o); pantsThigh(ctx, thigh, f.ch, o); },
    shorts(f, ctx, s, thigh, o) {
      const J = f.J, ch = f.ch, H = J['hip' + s], a = J.ang['th' + s];
      Dr.paint(ctx, Dr.limb(H, a, ch.bones.thigh, ch.thigh, { u0: -0.05, u1: 1.04, capS: false, sc: ch.skinThigh || 1 }), ch.skin,
        Object.assign({ spec: 0.12, lines: [[0.15, 0.85, 0.35, 0.15, 2.2, 0.3], [0.6, 0.95, -0.4, 0.1, 2, 0.25]] }, o));
      const sh = Dr.limb(H, a, ch.bones.thigh, ch.thigh, { u0: -0.05, u1: 0.5, capS: false, capE: false, inf: 2 });
      Dr.paint(ctx, sh, ch.pants, Object.assign({ folds: [[0.4, 14, 3, 0.7], [0.8, 10, 2.5, 0.6]] }, o));
      hem(ctx, [sh.front[sh.front.length - 1], sh.back[sh.back.length - 1]], ch.pantsTrim, o.far, 4.5);
    },
    tights(f, ctx, s, thigh, o) {
      const J = f.J, ch = f.ch, H = J['hip' + s];
      // quads / hamstring separation and a suit seam follow the muscle shape
      Dr.paint(ctx, thigh, ch.suit, Object.assign({ spec: 0.18, lines: [[0.12, 0.85, 0.35, 0.18, 2.2, 0.35], [0.05, 0.6, -0.55, -0.1, 2, 0.3], [0.2, 0.8, 0.75, 0.05, 1.6, 0.35, 1]] }, o));
      Dr.paint(ctx, Dr.limb(H, J.ang['th' + s], ch.bones.thigh, ch.thigh, { u0: 0.2, u1: 0.62, fa: 1, fb: -0.15, inf: 3 }), ch.armour, { far: o.far, spec: 0.15 });
    }
  };
  const PADS = {
    none() {},
    armour(f, ctx, s, far) {
      const J = f.J, ch = f.ch, A = J.ang, k = J['knee' + s], d = Dr.dirDown(A['th' + s]);
      ctx.fillStyle = Dr.shade(ch.padCol || ch.armour, far ? C.farLimb : 1); ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(k.x + Dr.nrmDown(A['th' + s]).x * 14, k.y + Dr.nrmDown(A['th' + s]).y * 14, 15, 20, Math.atan2(d.y, d.x), 0, 7); ctx.fill(); ctx.stroke();
      Dr.glowDot(ctx, { x: k.x + Dr.nrmDown(A['th' + s]).x * 19, y: k.y + Dr.nrmDown(A['th' + s]).y * 19 }, 8, ch.glow, far ? 0.5 : 1);
    },
    strap(f, ctx, s, far) {   // elastic knee sleeve
      const J = f.J, ch = f.ch, covered = ['long', 'capri'].includes(slots(ch).legs);
      const b = Dr.limb(J['knee' + s], J.ang['sh' + s], ch.bones.shin, covered ? ch.pantsShin : ch.shin, { u0: -0.08, u1: 0.12, inf: 3, capS: false, capE: false });
      Dr.paint(ctx, b, ch.padCol, { far, spec: 0.2, folds: [[0.5, 2, 1.5, 0.9]], foldA: 0.3 });
      hem(ctx, [b.front[0], b.back[0]], trimCol(ch), far, 2.2); hem(ctx, [b.front[b.front.length - 1], b.back[b.back.length - 1]], trimCol(ch), far, 2.2);
    },
    cap(f, ctx, s, far) {     // round stitched pad on the kneecap
      const J = f.J, ch = f.ch, A = J.ang, k = J['knee' + s], n = Dr.nrmDown(A['th' + s]), d = Dr.dirDown(A['th' + s]), cx = k.x + n.x * 18, cy = k.y + n.y * 18;
      ctx.fillStyle = Dr.shade(ch.padCol, far ? C.farLimb : 1.1); ctx.strokeStyle = C.outline; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(cx, cy, 17, 22, Math.atan2(d.y, d.x), 0, 7); ctx.fill(); ctx.stroke();
      ctx.setLineDash([3, 3]); ctx.strokeStyle = Dr.alpha(ch.padHi, far ? 0.4 : 0.85); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(cx, cy, 12, 16, Math.atan2(d.y, d.x), 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = Dr.alpha(trimCol(ch), far ? 0.4 : 0.9); ctx.beginPath(); ctx.arc(cx + n.x * 3, cy + n.y * 3, 3.5, 0, 7); ctx.fill();
    }
  };
  function leg(f, ctx, s, far) {
    const J = f.J, ch = f.ch, B = ch.bones, A = J.ang, o = { far, rim: ch.rim }, H = J['hip' + s], sl = slots(ch);
    const thigh = Dr.limb(H, A['th' + s], B.thigh, ch.thigh, { u0: -0.05, u1: 1.06, capS: false });
    if (ch.outfit === 'suit') {   // boots (feet are unchanged in R2c2)
      Dr.paint(ctx, Dr.limb(J['knee' + s], A['sh' + s], B.shin, ch.boot), ch.bootCol, Object.assign({ spec: 0.22 }, o));
      Dr.foot(ctx, J['ankle' + s], A['ft' + s], ch, { far });
      Dr.paint(ctx, Dr.limb(J['knee' + s], A['sh' + s], B.shin, ch.boot, { u0: 0.08, u1: 0.16, inf: 2 }), ch.armourHi, { far, outline: true });
    } else {
      Dr.paint(ctx, Dr.limb(J['knee' + s], A['sh' + s], B.shin, ch.shin, { u0: -0.04 }), ch.skin, Object.assign({ spec: 0.12, lines: [[0.3, 0.7, -0.55, 0.15, 2, 0.25]] }, o));
      Dr.foot(ctx, J['ankle' + s], A['ft' + s], ch, { far });
    }
    LEGS[sl.legs](f, ctx, s, thigh, o);
    PADS[sl.pads](f, ctx, s, far);
  }

  // ---------- waist ----------
  function waist(f, ctx) {
    const J = f.J, ch = f.ch, T = Dr.torsoMap(J, ch.bones), { fr, bk } = f.torsoProfiles(), sl = slots(ch);
    if (sl.top === 'gi') {
      // gi skirt: two panels hanging from the belt that follow each thigh, split at the side
      const fv = u => Dr.profAt(fr.map(r => [r[0], r[1], r[1]]), u)[0], bv = u => Dr.profAt(bk.map(r => [r[0], r[1], r[1]]), u)[0];
      const panel = (s, side) => {
        const H = J['hip' + s], a = J.ang['th' + s], d = Dr.dirDown(a), n = Dr.nrmDown(a), L = f.ch.bones.thigh;
        const q = (u, v) => ({ x: H.x + d.x * u * L + n.x * v, y: H.y + d.y * u * L + n.y * v });
        return side > 0 ? [T(0.02, fv(0.02) + 5), q(0.2, 50), q(0.34, 47), q(0.36, 10), q(0.3, -24), T(0.02, -6)]
                        : [T(0.02, 8), q(0.28, 8), q(0.34, -30), q(0.3, -50), q(0.12, -52), T(0.02, -bv(0.02) - 5)];
      };
      for (const [s, side] of [['B', -1], ['F', 1]]) {
        const pts = panel(s, side);
        Dr.smoothPath(ctx, pts, true);
        const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
        g.addColorStop(0, Dr.shade(ch.gi, 1.35)); g.addColorStop(1, Dr.shade(ch.gi, 0.7));
        ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = C.outline; ctx.stroke();
        ctx.strokeStyle = ch.giTrim; ctx.lineWidth = 4; ctx.lineCap = 'round'; Dr.smoothPath(ctx, pts.slice(1, 4), false); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; Dr.smoothPath(ctx, [pts[0], { x: (pts[2].x + pts[3].x) / 2, y: (pts[2].y + pts[3].y) / 2 }], false); ctx.stroke();
      }
    }
    const c = f.chains;
    if (sl.waist === 'belt') {
      Dr.paint(ctx, Dr.torsoShape(T, fr, bk, { u0: -0.03, u1: 0.1, inf: 6 }), ch.belt, { light: 2.2 });
      const bt = ch.beltTails || ['#2a2830', '#0b0a0d', '#3a3742', '#121116'];
      Dr.ribbon(ctx, c.belt2.p, 10, 9, bt[0], bt[1]);
      Dr.ribbon(ctx, c.belt1.p, 11, 10, bt[2], bt[3]);
      const k = f.beltPt(); ctx.fillStyle = ch.beltKnot || '#1d1b20'; ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(k.x, k.y, 10, 9, 0, 0, 7); ctx.fill(); ctx.stroke();
    } else if (sl.waist === 'sash') {
      Dr.paint(ctx, Dr.torsoShape(T, fr, bk, { u0: -0.05, u1: 0.15, inf: 7 }), ch.sash, { light: 1.8, folds: [[0.3, -4, 2, 0.8], [0.6, -3, 2, 0.8]], foldA: 0.3, rim: ch.rim });
      Dr.ribbon(ctx, c.belt2.p, 14, 6, Dr.shade(ch.sash, 0.7), Dr.shade(ch.sash, 0.5));
      Dr.ribbon(ctx, c.belt1.p, 15, 7, Dr.shade(ch.sash, 1.05), Dr.shade(ch.sash, 0.75));
      const k = f.beltPt(); ctx.fillStyle = Dr.shade(ch.sash, 0.85); ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(k.x, k.y, 13, 11, 0.4, 0, 7); ctx.fill(); ctx.stroke();
    } else if (sl.waist === 'armour') {
      Dr.paint(ctx, Dr.torsoShape(T, fr, bk, { u0: -0.03, u1: 0.12, inf: 4 }), ch.armour, { spec: 0.2 });
      Dr.glowDot(ctx, T(0.05, 46), 14, ch.glow);
    } else {   // plain waistband of the legwear
      Dr.paint(ctx, Dr.torsoShape(T, fr, bk, { u0: -0.03, u1: 0.07, inf: 4 }), sl.legs === 'tights' ? ch.suit : ch.pants, { light: 1.6 });
      hem(ctx, [T(0.07, fr[0][1] + 6), T(0.08, 0), T(0.07, -bk[0][1] - 6)], trimCol(ch), false, 2);
    }
  }
  function neck(f, ctx) {
    const J = f.J, ch = f.ch, a = -J.ang.neck, len = Math.hypot(J.head.x - J.neckBase.x, J.head.y - J.neckBase.y) + 14;
    Dr.paint(ctx, Dr.limb(J.head, a, len, ch.neck), ch.skin, { rim: ch.rim, light: 1.05, folds: [[0.15, 6, 8, 0.9]], foldA: 0.25 });
    if (slots(ch).top === 'suit') Dr.paint(ctx, Dr.limb(J.head, a, len, ch.neck, { u0: 0.6, u1: 1, inf: 3 }), ch.armour, { spec: 0.2 });
  }
  function torso(f, ctx) {
    const J = f.J, ch = f.ch, T = Dr.torsoMap(J, ch.bones), { fr, bk } = f.torsoProfiles();
    const fv = u => Dr.profAt(fr.map(r => [r[0], r[1], r[1]]), u)[0];
    const tw = f.pose.twist || 0;
    const line = (pts, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; Dr.smoothPath(ctx, pts, false); ctx.stroke(); };
    TOP[slots(ch).top](f, ctx, T, fr, bk, fv, tw, line);
  }
  const hasTails = ch => ['belt', 'sash'].includes(slots(ch).waist);
  NF.outfits = { TABLE, KAI, NOVA, slots, roll, hasTails, arm, leg, torso, waist, neck, TOP, LEGS, PADS };
})();
