// Rendering of body parts: anatomical bezier outlines, soft key light, rim light, cloth and faces.
// Everything is drawn in character units (100 = head height), fighter facing right.
(function () {
  const C = NF.config, D = Math.PI / 180;

  // ---------- colour helpers ----------
  const colCache = {};
  function rgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function shade(hex, f) {
    const k = hex + f; if (colCache[k]) return colCache[k];
    const c = rgb(hex).map(v => Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1) * 0.55));
    return (colCache[k] = 'rgb(' + c.join(',') + ')');
  }
  function alpha(hex, a) { const c = rgb(hex); return 'rgba(' + c.join(',') + ',' + a + ')'; }

  // ---------- geometry helpers ----------
  const dirDown = a => ({ x: Math.sin(a * D), y: Math.cos(a * D) });
  const nrmDown = a => ({ x: Math.cos(a * D), y: -Math.sin(a * D) });   // "front" side of a hanging bone
  const P = (p, d, n, u, v) => ({ x: p.x + d.x * u + n.x * v, y: p.y + d.y * u + n.y * v });

  // Catmull-Rom spline through points, as cubic beziers.
  function smoothPath(ctx, pts, closed, begin = true) {
    const n = pts.length; if (n < 2) return;
    if (begin) ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    const g = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
                        p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
    }
    if (closed) ctx.closePath();
  }

  function profAt(pr, u) {
    if (u <= pr[0][0]) return [pr[0][1], pr[0][2]];
    for (let i = 1; i < pr.length; i++) if (u <= pr[i][0]) {
      const a = pr[i - 1], b = pr[i], t = (u - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    const l = pr[pr.length - 1]; return [l[1], l[2]];
  }

  // Outline of a bone segment from A along down-angle `ang`, length `len`, using profile.
  // Rounded caps at both ends (o.capS / o.capE = false to keep a flat, hidden end) blend joints.
  function limb(A, ang, len, pr, o = {}) {
    const u0 = o.u0 ?? 0, u1 = o.u1 ?? 1, fa = o.fa ?? 1, fb = o.fb ?? 1, inf = o.inf || 0, sc = o.sc || 1;
    const d = dirDown(ang), n = nrmDown(ang);
    const us = [u0]; for (const r of pr) if (r[0] > u0 && r[0] < u1) us.push(r[0]); us.push(u1);
    const front = [], back = [];
    const fw = u => { const [f, b] = profAt(pr, u); return [f * sc * fa + inf, b * sc * fb + inf]; };
    for (const u of us) { const [f, b] = fw(u); front.push(P(A, d, n, u * len, f)); back.push(P(A, d, n, u * len, -b)); }
    const cap = (u, s) => { const [f, b] = fw(u); return P(A, d, n, u * len + s * (f + b) * 0.36, (f - b) / 2); };
    const mid = P(A, d, n, (u0 + u1) / 2 * len, 0);
    const w = profAt(pr, (u0 + u1) / 2);
    return { front, back, d, n, mid, w: (w[0] + w[1]) / 2 * sc + inf,
      capS: o.capS === false ? null : cap(u0, -1), capE: o.capE === false ? null : cap(u1, 1),
      at: (u, vf) => { const [f, b] = fw(u); return P(A, d, n, u * len, vf >= 0 ? vf * f : vf * b); } };
  }
  function outline(sh) {
    return sh.front.concat(sh.capE ? [sh.capE] : [], sh.back.slice().reverse(), sh.capS ? [sh.capS] : []);
  }

  // Fill an outline with a key-lit gradient, outline and rim light.
  // o.lines: muscle / seam lines [uA, uB, vFrac, bow, width, alpha, light?] drawn inside the shape.
  function paint(ctx, sh, col, o = {}) {
    const far = o.far ? C.farLimb : 1;
    const pts = outline(sh);
    smoothPath(ctx, pts, true);
    const m = sh.mid, n = sh.n, w = sh.w * 1.1;
    const g = ctx.createLinearGradient(m.x + n.x * w, m.y + n.y * w, m.x - n.x * w, m.y - n.y * w);
    g.addColorStop(0, shade(col, (o.light ?? C.keyLight) * far));
    g.addColorStop(0.45, shade(col, far));
    g.addColorStop(1, shade(col, C.shadow * far));
    ctx.fillStyle = g; ctx.fill();
    if (o.outline !== false) { ctx.lineWidth = o.lw || 2.4; ctx.strokeStyle = C.outline; ctx.stroke(); }
    if (o.rim || o.folds || o.spec || o.lines) {
      ctx.save(); smoothPath(ctx, pts, true); ctx.clip();
      if (o.lines && sh.at) {
        ctx.lineCap = 'round';
        for (const L of o.lines) {
          const [ua, ub, vf, bow, lw, a, lit] = L, um = (ua + ub) / 2;
          const p0 = sh.at(ua, vf), p2 = sh.at(ub, vf), pm = sh.at(um, vf + bow);
          ctx.strokeStyle = lit ? 'rgba(255,235,215,' + a * far + ')' : 'rgba(40,12,6,' + a * far + ')';
          ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
          ctx.quadraticCurveTo(2 * pm.x - (p0.x + p2.x) / 2, 2 * pm.y - (p0.y + p2.y) / 2, p2.x, p2.y); ctx.stroke();
        }
      }
      if (o.folds) {
        ctx.strokeStyle = 'rgba(0,0,0,' + (o.foldA || 0.28) + ')'; ctx.lineCap = 'round';
        for (const f of o.folds) {          // [u, sag, width, len]
          const k = Math.floor(f[0] * (sh.front.length - 1));
          const a = sh.front[Math.min(k, sh.front.length - 1)], b = sh.back[Math.min(k, sh.back.length - 1)];
          const len = f[3] ?? 0.8;
          const mx = (a.x + b.x) / 2 + sh.d.x * f[1], my = (a.y + b.y) / 2 + sh.d.y * f[1];
          ctx.lineWidth = f[2] || 3;
          ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * (1 - len) * 0.2, a.y + (b.y - a.y) * (1 - len) * 0.2);
          ctx.quadraticCurveTo(mx, my, a.x + (b.x - a.x) * len, a.y + (b.y - a.y) * len); ctx.stroke();
        }
      }
      if (o.spec) {   // soft specular streak along the lit side
        ctx.strokeStyle = 'rgba(255,255,255,' + o.spec * far + ')'; ctx.lineWidth = sh.w * 0.35;
        const fr = sh.front.map(p => ({ x: p.x - n.x * sh.w * 0.35, y: p.y - n.y * sh.w * 0.35 }));
        smoothPath(ctx, fr, false); ctx.stroke();
      }
      if (o.rim) {
        ctx.strokeStyle = o.rim; ctx.globalAlpha = o.far ? 0.22 : 0.5; ctx.lineWidth = o.rimW || 5;
        smoothPath(ctx, sh.back, false); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  // ---------- torso mapping (pelvis -> waist -> chest -> neck base) ----------
  function torsoMap(J, B) {
    const segs = [[J.hip, J.ang.low, B.low], [J.waist, J.ang.up, B.up], [J.chest, J.ang.neck, B.neckBase]];
    const total = B.low + B.up + B.neckBase;
    return function (u, v) {
      let l = u * total, i = 0;
      while (i < 2 && l > segs[i][2]) { l -= segs[i][2]; i++; }
      const [p, a] = segs[i];
      const d = { x: Math.sin(a * D), y: -Math.cos(a * D) }, n = { x: Math.cos(a * D), y: Math.sin(a * D) };
      return { x: p.x + d.x * l + n.x * v, y: p.y + d.y * l + n.y * v };
    };
  }
  function torsoShape(T, front, back, o = {}) {
    const inf = o.inf || 0, u0 = o.u0 ?? -9, u1 = o.u1 ?? 9;
    const lerpAt = (arr, u) => profAt(arr.map(r => [r[0], r[1], r[1]]), u)[0];
    const pick = arr => {
      const us = arr.map(r => r[0]).filter(u => u > u0 && u < u1);
      if (o.u0 !== undefined) us.unshift(u0); if (o.u1 !== undefined) us.push(u1);
      return us.length ? us : arr.map(r => r[0]);
    };
    const fr = pick(front).map(u => T(u, lerpAt(front, u) + inf));
    const bk = pick(back).map(u => T(u, -(lerpAt(back, u) + inf)));
    const m = T(0.55, 0);
    const n = { x: T(0.55, 1).x - m.x, y: T(0.55, 1).y - m.y };
    return { front: fr, back: bk, mid: m, n, d: { x: -n.y, y: n.x }, w: 55 };
  }

  // ---------- hands ----------
  // Hand-local frame: x runs from the wrist toward the knuckles, y toward the thumb side.
  function hand(ctx, W, ang, type, ch, o = {}) {
    const d = dirDown(ang), n = nrmDown(ang), far = o.far ? C.farLimb : 1, s = ch.id === 'nova' ? 0.84 : 1.04;
    const L = (x, y) => P(W, d, n, x * s, y * s);
    const glove = ch.id === 'nova', skin = ch.skin;
    const crease = (a = 0.45) => 'rgba(60,22,12,' + a * far + ')';
    const fill = (pts, col, lit = 1.2, lw = 2) => {
      smoothPath(ctx, pts, true);
      const a = L(14, 18), b = L(14, -18), g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, shade(col, lit * far)); g.addColorStop(1, shade(col, 0.58 * far));
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = C.outline; ctx.stroke();
    };
    const line = (pts, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; smoothPath(ctx, pts.map(p => L(p[0], p[1])), false); ctx.stroke(); };
    const finCol = glove ? ch.armourHi : skin;
    // a finger as a tapered, jointed shape through a polyline of [x, y] joints with half-width w
    const finger = (jts, w, col) => {
      const P2 = jts.map(p => L(p[0], p[1])), Lp = [], Rp = [];
      for (let i = 0; i < P2.length; i++) {
        const a0 = P2[Math.max(0, i - 1)], b0 = P2[Math.min(P2.length - 1, i + 1)];
        let dx = b0.x - a0.x, dy = b0.y - a0.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const ww = w * s * (1 - 0.22 * i / (P2.length - 1));
        Lp.push({ x: P2[i].x - dy * ww, y: P2[i].y + dx * ww }); Rp.push({ x: P2[i].x + dy * ww, y: P2[i].y - dx * ww });
      }
      const e = P2[P2.length - 1], e1 = P2[P2.length - 2], el = Math.hypot(e.x - e1.x, e.y - e1.y) || 1;
      const tip = { x: e.x + (e.x - e1.x) / el * w * s * 0.8, y: e.y + (e.y - e1.y) / el * w * s * 0.8 };
      smoothPath(ctx, Lp.concat([tip], Rp.reverse()), true);
      const g = ctx.createLinearGradient(Lp[0].x, Lp[0].y, Rp[Rp.length - 1].x, Rp[Rp.length - 1].y);
      g.addColorStop(0, shade(col, 1.15 * far)); g.addColorStop(1, shade(col, 0.62 * far));
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = C.outline; ctx.stroke();
      ctx.strokeStyle = crease(0.35); ctx.lineWidth = 1.1;           // joint creases
      for (let i = 1; i < P2.length - 1; i++) { const p = P2[i], q = Lp[i]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo((p.x + q.x) / 2, (p.y + q.y) / 2); ctx.stroke(); }
      if (!glove) { const nl = L(jts[jts.length - 1][0], jts[jts.length - 1][1]); ctx.fillStyle = 'rgba(255,225,210,' + 0.35 * far + ')'; ctx.beginPath(); ctx.ellipse(nl.x, nl.y, 2.6 * s, 2 * s, 0, 0, 7); ctx.fill(); }
    };
    if (type === 'fist') {
      // back of hand + four rolled fingers ending in a knuckle ridge
      const ridge = [];
      for (let i = 0; i < 4; i++) { const y = -12 + i * 7.6; ridge.push(L(44, y - 2.8), L(47, y)); }
      const pts = [L(-3, -15), L(16, -17), L(32, -16.5)].concat(ridge, [L(45, 15), L(36, 17), L(16, 16), L(-3, 14)]);
      fill(pts, finCol, 1.25);
      // knuckle highlights and finger creases (folded middle phalanges)
      for (let i = 0; i < 4; i++) {
        const y = -12 + i * 7.6;
        if (i) line([[33, y - 3.8], [41, y - 3.6], [46, y - 3.8]], crease(0.5), 1.3);
        const k = L(41, y); ctx.fillStyle = glove ? alpha(ch.glow, 0.5 * far) : 'rgba(255,225,200,' + 0.45 * far + ')';
        ctx.beginPath(); ctx.ellipse(k.x, k.y, 3 * s, 2.2 * s, ang * D, 0, 7); ctx.fill();
      }
      line([[30, -15], [31, 0], [30, 15]], crease(0.35), 1.2);               // second knuckle row
      // thumb folded across the front of the fingers
      finger([[6, 13], [20, 16], [33, 11.5]], 5.2, finCol);
      if (glove) {
        fill([L(-4, -16), L(20, -17.5), L(27, -8), L(27, 8), L(20, 17.5), L(-4, 15.5)], ch.armour, 1.45);
        line([[0, -16], [26, -12]], alpha(ch.armourHi, 0.9 * far), 1.4); line([[0, 15], [24, 13]], 'rgba(0,0,0,' + 0.4 * far + ')', 1.2);  // seams
        ctx.strokeStyle = alpha(ch.glow, 0.9 * far); ctx.lineWidth = 2.2; smoothPath(ctx, [L(37, -14), L(39, 0), L(37, 14)], false); ctx.stroke();
        glowDot(ctx, L(38, 0), 13, ch.glow, far);
      } else {
        fill([L(-6, -16.5), L(18, -17.5), L(29, -15), L(30, 0), L(29, 15), L(18, 17), L(-6, 15.5)], ch.wrap, 1.05, 1.8);
        wrapLines(ctx, L, far, 26);
      }
    } else {
      const palm = type === 'palm';
      // fingers: straight for a palm strike, softly curled for the open guard
      const fy = [-11.5, -4, 3.5, 10.5], fl = [21, 23.5, 22, 17];
      fy.forEach((y, i) => {
        const l = fl[i], c = palm ? 0.06 : 0.22, b0 = [27, y * 0.96];
        const j1 = [b0[0] + l * 0.48, y - l * c * 0.25], j2 = [b0[0] + l * 0.82, y - l * c * 0.75], j3 = [b0[0] + l * 1.02 - l * c * 0.4, y - l * c * 1.35];
        finger([b0, j1, j2, j3], 3.7, finCol);
      });
      const pts = [L(-3, -15), L(18, -16.5), L(30, -14), L(31, 0), L(30, 14), L(16, 16.5), L(-3, 14)];
      fill(pts, finCol, 1.2);
      line([[8, 6], [18, 2], [28, 4]], crease(0.32), 1.2);                  // palm crease
      // thumb, splayed away from the palm
      finger(palm ? [[6, 12], [17, 21], [27, 25]] : [[6, 12], [16, 20], [27, 21]], 5, finCol);
      if (glove) {
        fill([L(-4, -16), L(20, -17), L(27, -6), L(27, 8), L(20, 17), L(-4, 15)], ch.armour, 1.45);
        line([[0, -16], [25, -12]], alpha(ch.armourHi, 0.9 * far), 1.4);
        glowDot(ctx, L(24, 0), palm ? 26 : 15, ch.glow, far);
      } else { fill([L(-6, -16.5), L(20, -17), L(26, 0), L(20, 16.5), L(-6, 15.5)], ch.wrap, 1.05, 1.8); wrapLines(ctx, L, far, 22); }
    }
  }
  function wrapLines(ctx, L, far, x1) {
    ctx.lineCap = 'round';
    for (let x = -4; x < x1; x += 5.5) {
      const a = L(x, -16), b = L(x + 6, 16), m = L(x + 3.5, 0);
      ctx.strokeStyle = 'rgba(110,90,70,' + 0.55 * far + ')'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(m.x, m.y, b.x, b.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + 0.35 * far + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x + 1.2, a.y); ctx.quadraticCurveTo(m.x + 1.2, m.y, b.x + 1.2, b.y); ctx.stroke();
    }
  }
  function glowDot(ctx, p, r, col, far = 1) {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, 'rgba(255,255,255,' + 0.9 * far + ')'); g.addColorStop(0.25, alpha(col, 0.8 * far)); g.addColorStop(1, alpha(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
  }

  // ---------- feet ----------
  function foot(ctx, A, fa, ch, o = {}) {
    const t = dirDown(fa), n = { x: -Math.cos(fa * D), y: Math.sin(fa * D) }, far = o.far ? C.farLimb : 1, f = ch.bones.foot;
    const L = (x, y) => ({ x: A.x + (t.x * x + n.x * y) * f, y: A.y + (t.y * x + n.y * y) * f });
    const grad = (col) => { const a = L(20, -12), b = L(20, 34), g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, shade(col, 1.2 * far)); g.addColorStop(1, shade(col, 0.55 * far)); return g; };
    if (ch.id === 'nova') {
      const pts = [L(-16, -22), L(-25, 0), L(-28, 22), L(-24, 33), L(10, 35), L(52, 34), L(84, 31), L(95, 24), L(89, 13), L(60, 6), L(30, -4), L(15, -22)];
      smoothPath(ctx, pts, true); ctx.fillStyle = grad(ch.bootCol); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = C.outline; ctx.stroke();
      ctx.save(); smoothPath(ctx, pts, true); ctx.clip();
      ctx.fillStyle = shade('#0a0b12', far); ctx.beginPath(); const s0 = L(-40, 29), s1 = L(110, 29), s2 = L(110, 45), s3 = L(-40, 45);
      ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s3.x, s3.y); ctx.fill();
      ctx.strokeStyle = alpha(ch.glow, 0.85 * far); ctx.lineWidth = 2.5; smoothPath(ctx, [L(-24, 22), L(20, 26), L(70, 24), L(92, 20)], false); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + 0.2 * far + ')'; ctx.lineWidth = 3; smoothPath(ctx, [L(14, -12), L(40, 2), L(76, 12)], false); ctx.stroke();
      ctx.restore();
    } else {
      const pts = [L(-12, -14), L(-21, 2), L(-27, 18), L(-22, 30), L(2, 33), L(42, 33), L(70, 31), L(86, 28), L(92, 22), L(86, 16), L(64, 11), L(36, 3), L(14, -10)];
      smoothPath(ctx, pts, true); ctx.fillStyle = grad(ch.skin); ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = C.outline; ctx.stroke();
      ctx.strokeStyle = 'rgba(70,30,15,' + 0.45 * far + ')'; ctx.lineWidth = 1.4;
      for (const x of [74, 81]) { const a = L(x, 18), b = L(x + 2, 29); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,220,190,' + 0.25 * far + ')'; const ab = L(-4, -4); ctx.beginPath(); ctx.ellipse(ab.x, ab.y, 6, 4, 0, 0, 7); ctx.fill();
    }
  }

  // ---------- head ----------
  function faceProfile(f) {
    const n = f.nose, j = f.jaw;
    return [
      [-6, -60], [16, -57], [31, -46], [38, -31], [41, -22], [38, -15], [40, -9],
      [40 + 12 * n, 3 + 2 * n], [41 + 9 * n, 9], [43, 11.5], [42.5, 14], [44, 18.5], [41.5, 21], [43, 24.5],
      [39, 29], [40 * (0.94 + 0.06 * j), 35], [36 * (0.9 + 0.1 * j), 41.5], [24, 43 + 2 * j], [8, 38 + 3 * j], [-4, 30 + 2 * j],
      [-16, 20], [-34, 14], [-46, -2], [-49, -24], [-37, -48], [-20, -58]
    ];
  }
  function head(ctx, J, ch, st) {
    const s = ch.headScale, H = J.head, ang = st.angry || 0, pain = st.pain || 0, kai = ch.id === 'kai';
    ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(J.ang.head * D); ctx.scale(s, s);
    const pts = faceProfile(ch.face).map(p => ({ x: p[0], y: p[1] }));
    if (!kai) hairBackNova(ctx, ch);
    const stroke = (col, lw, f) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); f(); ctx.stroke(); };
    // skull + face
    smoothPath(ctx, pts, true);
    let g = ctx.createRadialGradient(26, -22, 6, 6, -6, 72);
    g.addColorStop(0, shade(ch.skin, 1.32)); g.addColorStop(0.5, ch.skin); g.addColorStop(1, shade(ch.skin, 0.58));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = C.outline; ctx.stroke();
    ctx.save(); smoothPath(ctx, pts, true); ctx.clip();
    // under-jaw shadow, jaw line, cheek hollow, eye socket, temple
    g = ctx.createLinearGradient(0, 22, 0, 46); g.addColorStop(0, 'rgba(60,20,10,0)'); g.addColorStop(1, 'rgba(60,20,10,0.38)');
    ctx.fillStyle = g; ctx.fillRect(-60, 20, 120, 30);
    g = ctx.createLinearGradient(-30, 0, 10, 10); g.addColorStop(0, 'rgba(60,20,10,0.32)'); g.addColorStop(1, 'rgba(60,20,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-40, -10); ctx.quadraticCurveTo(-10, 6, 6, 40); ctx.lineTo(-50, 40); ctx.fill();   // side of the head turns away
    if (kai) { ctx.fillStyle = 'rgba(40,28,26,0.16)'; ctx.beginPath(); ctx.moveTo(8, 38); ctx.quadraticCurveTo(26, 30, 40, 30); ctx.lineTo(40, 44); ctx.lineTo(-4, 44); ctx.fill(); }  // stubble shadow
    const soft = kai ? 1 : 0.55;
    stroke('rgba(60,20,10,' + 0.13 * soft + ')', 7, () => { ctx.moveTo(-6, 22); ctx.quadraticCurveTo(10, 36, 30, 38); });        // jaw line
    stroke('rgba(60,20,10,' + 0.09 * soft + ')', 6, () => { ctx.moveTo(30, 4); ctx.quadraticCurveTo(20, 10, 14, 20); });         // under cheekbone
    const nz = ch.face.nose;
    stroke('rgba(255,235,215,0.4)', 2.2, () => { ctx.moveTo(39.5, -14); ctx.quadraticCurveTo(41 + 4 * nz, -4, 42 + 8 * nz, 2); });  // nose bridge light
    stroke('rgba(80,30,20,' + (0.1 + 0.18 * ang) * soft + ')', 2.4, () => { ctx.moveTo(36, 10); ctx.quadraticCurveTo(33, 15, 35 - ang, 21); });  // nasolabial
    g = ctx.createRadialGradient(24, -2, 0, 24, -2, 12); g.addColorStop(0, 'rgba(255,230,205,0.4)'); g.addColorStop(1, 'rgba(255,230,205,0)');
    ctx.fillStyle = g; ctx.fillRect(10, -14, 28, 24);                                                                           // cheekbone light
    ctx.fillStyle = 'rgba(70,25,15,' + (0.24 + 0.1 * ang) + ')'; ctx.beginPath(); ctx.ellipse(32, -12, 10, 6.5, 0.1, 0, 7); ctx.fill();  // socket
    g = ctx.createRadialGradient(26, 8, 0, 26, 8, 13); g.addColorStop(0, kai ? 'rgba(200,100,80,0.15)' : 'rgba(235,120,120,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(10, -6, 32, 30);
    stroke('rgba(255,240,225,0.35)', 2.4, () => { ctx.moveTo(40, -27); ctx.quadraticCurveTo(42, -40, 36, -52); });             // forehead highlight
    ctx.strokeStyle = alpha(ch.rim, 0.45); ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(6, -6, 56, 2.0, 4.2); ctx.stroke();
    ctx.restore();
    // ear: helix, antihelix, lobe
    ctx.save(); ctx.translate(-8, -3); ctx.rotate(-0.15);
    ctx.beginPath(); ctx.moveTo(4, -15); ctx.bezierCurveTo(-8, -18, -13, -4, -9, 6); ctx.bezierCurveTo(-7, 12, -3, 17, 2, 16); ctx.bezierCurveTo(5, 15, 4, 10, 6, 6); ctx.closePath();
    g = ctx.createLinearGradient(-10, 0, 6, 0); g.addColorStop(0, shade(ch.skin, 0.75)); g.addColorStop(1, shade(ch.skin, 1.05));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = C.outline; ctx.lineWidth = 1.8; ctx.stroke();
    stroke('rgba(80,30,20,0.55)', 1.5, () => { ctx.moveTo(1, -10); ctx.bezierCurveTo(-6, -11, -7, 0, -3, 5); ctx.quadraticCurveTo(0, 8, 2, 6); });
    ctx.fillStyle = 'rgba(70,25,15,0.4)'; ctx.beginPath(); ctx.ellipse(1, 1, 2.5, 3.5, 0, 0, 7); ctx.fill();
    ctx.restore();
    // nose: wing and nostril
    stroke('rgba(80,30,20,0.5)', 1.6, () => { ctx.moveTo(41 + 8 * nz, 8.5); ctx.quadraticCurveTo(35, 10, 36, 4); ctx.quadraticCurveTo(37.5, 1, 41, 2.5); });
    ctx.fillStyle = 'rgba(50,15,10,0.55)'; ctx.beginPath(); ctx.ellipse(40 + 6 * nz, 8.4, 2.2, 1.1, 0.2, 0, 7); ctx.fill();
    // lips with philtrum; mouth corner tightens/turns down when angry, opens slightly in pain
    const cy = 21.5 + ang * 1.2 - pain * 0.5;
    ctx.fillStyle = alpha(ch.lips, 0.7 * ch.face.lips);
    ctx.beginPath(); ctx.moveTo(43.2, 17.4); ctx.quadraticCurveTo(44.4, 19.4, 43.4, 20.8); ctx.lineTo(36, cy); ctx.quadraticCurveTo(39, 18.5, 43.2, 17.4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(43.2, 21.2); ctx.quadraticCurveTo(45, 24 + 1.5 * ch.face.lips, 40.5, 26 + ch.face.lips); ctx.quadraticCurveTo(37, 25, 36, cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,220,0.35)'; ctx.beginPath(); ctx.ellipse(41.8, 23.4, 1.6, 0.9, 0, 0, 7); ctx.fill();
    stroke('rgba(60,15,12,0.7)', 1.5, () => { ctx.moveTo(43.6, 21); ctx.quadraticCurveTo(40, 21 + pain * 2.2, 35.5, cy); });
    stroke('rgba(80,30,20,0.3)', 1.2, () => { ctx.moveTo(43.4, 12); ctx.quadraticCurveTo(42.2, 14.5, 43.2, 17); });
    // eye: white, iris with gradient, pupil, catch-light, upper and lower lids
    const open = (1 - st.blink) * (1 - 0.3 * ang - 0.35 * pain);
    ctx.save(); ctx.translate(32.5, -11);
    if (open > 0.15) {
      ctx.save(); ctx.scale(1, open);
      ctx.beginPath(); ctx.moveTo(-6, -1.5); ctx.quadraticCurveTo(1.5, -6.5, 7, -1.2); ctx.quadraticCurveTo(1, 4.2, -6, 1.8); ctx.closePath();
      ctx.fillStyle = '#efe7e0'; ctx.fill();
      ctx.save(); ctx.clip();
      g = ctx.createRadialGradient(3, 0.8, 0.3, 3, -0.3, 4); g.addColorStop(0, shade(ch.iris, 1.6)); g.addColorStop(0.7, ch.iris); g.addColorStop(1, shade(ch.iris, 0.5));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(3, -0.3, 2.9, 3.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#080404'; ctx.beginPath(); ctx.ellipse(3.6, -0.3, 1.3, 1.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(40,20,20,0.35)'; ctx.fillRect(-7, -7, 15, 4);                     // lid shadow on the eyeball
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(2.3, -1.7, 0.95, 0, 7); ctx.fill();
      ctx.restore();
      ctx.restore();
      ctx.strokeStyle = '#140a08'; ctx.lineCap = 'round'; ctx.lineWidth = ch.face.lashes ? 2.8 : 2.2;
      ctx.beginPath(); ctx.moveTo(-6.5, -1.5 * open); ctx.quadraticCurveTo(1.5, -6.8 * open, 7.6, -1.2 * open); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,25,20,0.55)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-4, 2.2 * open); ctx.quadraticCurveTo(2, 4.4 * open, 6.4, -0.4); ctx.stroke();
      if (ch.face.lashes) { ctx.strokeStyle = '#140a08'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(6.8, -1.6); ctx.lineTo(10, -4); ctx.moveTo(4.6, -3.4 * open); ctx.lineTo(7.2, -6.6); ctx.stroke(); }
    } else {
      ctx.strokeStyle = '#140a08'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, 0.5); ctx.quadraticCurveTo(1, 3, 7, 0); ctx.stroke();
    }
    ctx.restore();
    stroke('rgba(80,30,20,0.38)', 1.2, () => { ctx.moveTo(27, -16.5 + ang * 1.5); ctx.quadraticCurveTo(33, -19.8 + ang * 2, 39.5, -16 + ang * 1.5); });  // lid crease
    // brow: tapered shape; inner end drops when angry, lifts in pain
    const bi = -22.5 + ang * 4.5 - pain * 3.5, bo = -23 - ang * 1 + pain * 1.2, bt = kai ? 3.4 : 2.1;
    ctx.fillStyle = ch.brow; ctx.beginPath();
    ctx.moveTo(42, bi + 0.8); ctx.quadraticCurveTo(33, bi - 5.5 + ang * 1.5, 22, bo + 1.5);
    ctx.quadraticCurveTo(32, bi - 5.5 - bt * 2 + ang * 1.2, 41.5, bi - bt); ctx.closePath(); ctx.fill();
    if (ang > 0.1) stroke('rgba(80,30,20,' + 0.4 * ang + ')', 1.2, () => { ctx.moveTo(41.5, -27); ctx.quadraticCurveTo(39.5, -30, 40.5, -33); });  // furrow
    if (kai) hairKai(ctx, ch, st); else hairFrontNova(ctx, ch);
    ctx.restore();
  }
  function hairKai(ctx, ch, st) {
    const pts = [[37, -37], [35, -50], [24, -63], [10, -70], [-6, -71], [-22, -68], [-38, -58], [-50, -38], [-56, -30],
      [-52, -14], [-46, 6], [-36, 12], [-30, -6], [-20, -20], [-4, -30], [6, -32], [6, -16], [12, -17], [14, -34], [26, -38]].map(p => ({ x: p[0], y: p[1] }));
    const base = (pp) => { smoothPath(ctx, pp, true); const g = ctx.createLinearGradient(30, -70, -40, 10); g.addColorStop(0, '#3a2c26'); g.addColorStop(0.4, ch.hair); g.addColorStop(1, '#050404'); return g; };
    // spiky tufts in two layers (back darker, front lighter), swept back from the hairline
    const tuft = (th, r0, len, w, sweep, col, hi) => {
      const c = { x: -4, y: -16 }, t = th * D, sw = (th - sweep) * D;
      const rA = { x: c.x + Math.cos(t - w) * r0, y: c.y + Math.sin(t - w) * r0 }, rB = { x: c.x + Math.cos(t + w) * r0, y: c.y + Math.sin(t + w) * r0 };
      const tip = { x: c.x + Math.cos(t) * r0 + Math.cos(sw) * len, y: c.y + Math.sin(t) * r0 + Math.sin(sw) * len };
      const m = { x: (rA.x + tip.x) / 2 + Math.cos(t) * 3, y: (rA.y + tip.y) / 2 + Math.sin(t) * 3 };
      ctx.beginPath(); ctx.moveTo(rA.x, rA.y); ctx.quadraticCurveTo(m.x, m.y, tip.x, tip.y); ctx.quadraticCurveTo((rB.x + tip.x) / 2, (rB.y + tip.y) / 2, rB.x, rB.y); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = C.outline; ctx.stroke();
      if (hi) { ctx.strokeStyle = 'rgba(255,240,230,0.18)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo((rA.x + rB.x) / 2, (rA.y + rB.y) / 2); ctx.quadraticCurveTo(m.x, m.y, tip.x, tip.y); ctx.stroke(); }
    };
    for (const [th, len, sw] of [[-62, 24, 40], [-88, 30, 46], [-112, 32, 48], [-136, 30, 42], [-160, 26, 34], [-182, 20, 24], [-200, 16, 14]]) tuft(th, 50, len, 0.26, sw, '#0b0908');
    ctx.fillStyle = base(pts); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.outline; ctx.stroke();
    ctx.save(); smoothPath(ctx, pts, true); ctx.clip();
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) { ctx.strokeStyle = i % 3 ? 'rgba(255,240,230,0.12)' : 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(34 - i * 7.5, -60 + i * 1.6); ctx.quadraticCurveTo(10 - i * 8, -48, -22 - i * 3.5, -26 + i * 3); ctx.stroke(); }
    ctx.strokeStyle = alpha(ch.rim, 0.6); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(-4, -18, 52, 2.6, 4.4); ctx.stroke();
    ctx.restore();
    for (const [th, len, sw] of [[-70, 20, 52], [-96, 24, 52], [-122, 24, 46], [-148, 20, 36]]) tuft(th, 46, len, 0.2, sw, '#2a201c', true);
    // sideburn
    ctx.fillStyle = 'rgba(13,10,9,0.85)'; ctx.beginPath(); ctx.moveTo(6, -30); ctx.quadraticCurveTo(9, -22, 7, -14); ctx.lineTo(3, -15); ctx.quadraticCurveTo(2, -24, 1, -30); ctx.fill();
    // headband
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.outline; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(37, -36); ctx.quadraticCurveTo(-6, -52, -50, -30); ctx.stroke();
    const g2 = ctx.createLinearGradient(0, -52, 0, -28); g2.addColorStop(0, '#ffffff'); g2.addColorStop(1, '#a9a4a0');
    ctx.strokeStyle = g2; ctx.lineWidth = 12; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(30, -38); ctx.quadraticCurveTo(-6, -50, -44, -31); ctx.stroke();
    ctx.fillStyle = '#e9e5df'; ctx.strokeStyle = C.outline; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(-51, -29, 8, 9, 0.3, 0, 7); ctx.fill(); ctx.stroke();  // knot
  }
  function hairBackNova(ctx, ch) {
    // volume behind the skull
    const pts = [[-14, -66], [-40, -58], [-54, -36], [-52, -10], [-44, 8], [-30, 6], [-24, -40]].map(p => ({ x: p[0], y: p[1] }));
    smoothPath(ctx, pts, true); ctx.fillStyle = shade(ch.hair, 0.45); ctx.fill();
  }
  function hairFrontNova(ctx, ch) {
    const pts = [[39, -30], [39, -47], [27, -63], [4, -72], [-20, -71], [-38, -65], [-48, -50], [-53, -32], [-50, -12], [-42, 6], [-34, 4], [-30, -10],
      [-20, -24], [-2, -32], [10, -36], [22, -40], [32, -38]].map(p => ({ x: p[0], y: p[1] }));
    smoothPath(ctx, pts, true);
    const g = ctx.createLinearGradient(30, -64, -40, 0); g.addColorStop(0, shade(ch.hair, 1.5)); g.addColorStop(0.45, ch.hair); g.addColorStop(1, shade(ch.hair, 0.4));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.outline; ctx.stroke();
    ctx.save(); smoothPath(ctx, pts, true); ctx.clip();
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 11; i++) {   // combed-back strands toward the tie
      ctx.strokeStyle = i % 3 ? 'rgba(255,255,255,0.16)' : 'rgba(30,0,60,0.3)';
      ctx.beginPath(); ctx.moveTo(36 - i * 2, -36 - i * 2.4); ctx.quadraticCurveTo(0, -58 + i, -34, -60); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(26, -56); ctx.quadraticCurveTo(0, -68, -24, -64); ctx.stroke();
    ctx.strokeStyle = alpha(ch.rim, 0.65); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(-4, -18, 50, 2.5, 4.3); ctx.stroke();
    ctx.restore();
    // side-swept bang with white streak
    const b = [[18, -60], [34, -50], [42, -32], [36, -24], [34, -34], [24, -48]].map(p => ({ x: p[0], y: p[1] }));
    smoothPath(ctx, b, true); ctx.fillStyle = shade(ch.hair, 1.25); ctx.fill(); ctx.strokeStyle = C.outline; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = ch.hairTip; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(22, -57); ctx.quadraticCurveTo(36, -46, 38, -30); ctx.stroke();
    // hair tie
    ctx.save(); ctx.translate(-34, -62); ctx.rotate(-0.5);
    ctx.fillStyle = ch.armour; ctx.strokeStyle = C.outline; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-7, -9, 14, 18, 4); ctx.fill(); ctx.stroke();
    ctx.restore(); glowDot(ctx, { x: -34, y: -62 }, 9, ch.glow);
  }

  // ---------- ribbons (hair, tails) ----------
  function ribbon(ctx, pts, w0, w1, colA, colB, o = {}) {
    if (pts.length < 2) return;
    const L = [], R = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const t = i / (pts.length - 1), w = (w0 + (w1 - w0) * Math.pow(t, o.pow || 1)) / 2 * (o.bulge ? 1 + Math.sin(t * Math.PI) * o.bulge : 1);
      L.push({ x: pts[i].x - dy * w, y: pts[i].y + dx * w }); R.push({ x: pts[i].x + dy * w, y: pts[i].y - dx * w });
    }
    const shape = L.concat(R.reverse());
    smoothPath(ctx, shape, true);
    const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
    g.addColorStop(0, colA); g.addColorStop(1, colB);
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.outline; ctx.stroke();
    if (o.strands) {
      ctx.save(); smoothPath(ctx, shape, true); ctx.clip();
      for (let k = -2; k <= 2; k++) {
        ctx.strokeStyle = k % 2 ? 'rgba(255,255,255,0.22)' : 'rgba(20,0,40,0.3)'; ctx.lineWidth = 1.5;
        smoothPath(ctx, pts.map((p, i) => { const t = i / (pts.length - 1); return { x: p.x + k * (w0 / 6) * (1 - t), y: p.y + k * 2 }; }), false); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Ponytail as several strand ribbons following one spring chain, each offset and phase-shifted.
  function ponytail(ctx, pts, ch, t) {
    if (!pts || pts.length < 2) return;
    const N = pts.length, strands = [[-1.1, 13, 0.55, 0], [1.0, 12, 0.7, 1.7], [0.2, 16, 1.0, 3.1], [-0.4, 10, 1.25, 4.4], [0.7, 8, 1.45, 5.3]];
    for (const [off, w, lit, ph] of strands) {
      const q = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, k = i / (N - 1);
        const o = off * (10 + 8 * Math.sin(k * Math.PI)) * (1 - 0.5 * k) + Math.sin(t * 2.2 + ph + k * 4) * 4 * k;
        return { x: p.x - dy / l * o, y: p.y + dx / l * o };
      });
      ribbon(ctx, q, w * 2, 2.5, shade(ch.hair, lit), lit > 1.2 ? ch.hairTip : shade(ch.hairTip, 0.75 + lit * 0.2), { strands: true, bulge: 0.4, pow: 1.2 });
    }
  }

  NF.draw = { ponytail, outline, shade, alpha, smoothPath, limb, paint, torsoMap, torsoShape, hand, foot, head, ribbon, glowDot, profAt, dirDown, nrmDown, P };
})();
