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
  function limb(A, ang, len, pr, o = {}) {
    const u0 = o.u0 ?? 0, u1 = o.u1 ?? 1, fa = o.fa ?? 1, fb = o.fb ?? 1, inf = o.inf || 0, sc = o.sc || 1;
    const d = dirDown(ang), n = nrmDown(ang);
    const us = [u0]; for (const r of pr) if (r[0] > u0 && r[0] < u1) us.push(r[0]); us.push(u1);
    const front = [], back = [];
    for (const u of us) {
      const [f, b] = profAt(pr, u);
      front.push(P(A, d, n, u * len, f * sc * fa + inf));
      back.push(P(A, d, n, u * len, -(b * sc * fb + inf)));
    }
    const mid = P(A, d, n, (u0 + u1) / 2 * len, 0);
    const w = profAt(pr, (u0 + u1) / 2);
    return { front, back, d, n, mid, w: (w[0] + w[1]) / 2 * sc + inf };
  }

  // Fill an outline with a key-lit gradient, outline and rim light.
  function paint(ctx, sh, col, o = {}) {
    const far = o.far ? C.farLimb : 1;
    const pts = sh.front.concat(sh.back.slice().reverse());
    smoothPath(ctx, pts, true);
    const m = sh.mid, n = sh.n, w = sh.w * 1.1;
    const g = ctx.createLinearGradient(m.x + n.x * w, m.y + n.y * w, m.x - n.x * w, m.y - n.y * w);
    g.addColorStop(0, shade(col, (o.light ?? C.keyLight) * far));
    g.addColorStop(0.45, shade(col, far));
    g.addColorStop(1, shade(col, C.shadow * far));
    ctx.fillStyle = g; ctx.fill();
    if (o.outline !== false) { ctx.lineWidth = o.lw || 2.4; ctx.strokeStyle = C.outline; ctx.stroke(); }
    if (o.rim || o.folds || o.spec) {
      ctx.save(); smoothPath(ctx, pts, true); ctx.clip();
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
  function hand(ctx, W, ang, type, ch, o = {}) {
    const d = dirDown(ang), n = nrmDown(ang), far = o.far ? C.farLimb : 1, s = ch.id === 'nova' ? 0.86 : 1;
    const L = (x, y) => P(W, d, n, x * s, y * s);
    const skin = ch.skin;
    const fillG = (pts, col, lit = 1.2) => {
      smoothPath(ctx, pts, true);
      const a = L(10, 18), b = L(10, -18), g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, shade(col, lit * far)); g.addColorStop(1, shade(col, 0.6 * far));
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.outline; ctx.stroke();
    };
    const capsule = (a, b, w, col) => {
      ctx.lineCap = 'round'; ctx.strokeStyle = C.outline; ctx.lineWidth = w + 2.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = shade(col, far); ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + 0.18 * far + ')'; ctx.lineWidth = w * 0.3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    };
    const glove = ch.id === 'nova';
    if (type === 'fist') {
      const pts = [L(-3, -15), L(14, -17), L(30, -16), L(41, -11), L(45, 0), L(42, 10), L(32, 15), L(14, 16), L(-3, 14)];
      fillG(pts, skin);
      ctx.strokeStyle = 'rgba(60,25,15,' + 0.45 * far + ')'; ctx.lineWidth = 1.6;   // curled finger creases
      for (const y of [-8, -1, 6]) { const a = L(31, y), b = L(44, y + 1.5), c = L(39, y + 4); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(b.x, b.y, c.x, c.y); ctx.stroke(); }
      capsule(L(6, 13), L(28, 12), 9 * s, skin);                                         // thumb
      if (glove) {
        fillG([L(-4, -16), L(26, -17), L(31, -6), L(30, 8), L(25, 17), L(-4, 15)], ch.armour, 1.4);
        glowDot(ctx, L(30, -8), 16, ch.glow, far);
      } else {
        fillG([L(-5, -16), L(24, -17), L(28, -4), L(27, 10), L(22, 16), L(-5, 15)], ch.wrap, 1.05);
        wrapLines(ctx, L, far, 26);
      }
    } else {
      const palm = type === 'palm', fl = palm ? 34 : 26, curl = palm ? 0 : 12;
      const pts = [L(-3, -15), L(18, -16), L(30, -13), L(32, 0), L(30, 13), L(14, 16), L(-3, 14)];
      // fingers (behind the palm edge)
      [-11, -4, 3, 10].forEach((y, i) => {
        const len = fl - Math.abs(i - 1.3) * 3;
        capsule(L(26, y * 0.95), L(26 + len, y * (palm ? 1.1 : 0.9) - curl * (i === 0 ? 0.6 : 1)), 7.5 * s, skin);
      });
      fillG(pts, skin);
      capsule(L(8, 13), L(28, palm ? 26 : 20), 8.5 * s, skin);
      if (glove) { fillG([L(-4, -16), L(24, -16), L(30, -6), L(30, 8), L(24, 16), L(-4, 15)], ch.armour, 1.4); glowDot(ctx, L(22, 0), palm ? 26 : 16, ch.glow, far); }
      else { fillG([L(-5, -16), L(22, -16), L(26, 0), L(22, 16), L(-5, 15)], ch.wrap, 1.05); wrapLines(ctx, L, far, 22); }
    }
  }
  function wrapLines(ctx, L, far, x1) {
    ctx.strokeStyle = 'rgba(120,100,80,' + 0.5 * far + ')'; ctx.lineWidth = 1.3;
    for (let x = -2; x < x1; x += 6) { const a = L(x, -15), b = L(x + 5, 15); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
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
    const s = ch.headScale, H = J.head;
    ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(J.ang.head * D); ctx.scale(s, s);
    const pts = faceProfile(ch.face).map(p => ({ x: p[0], y: p[1] }));
    if (ch.id === 'nova') hairBackNova(ctx, ch);
    // skull + face
    smoothPath(ctx, pts, true);
    let g = ctx.createRadialGradient(26, -22, 6, 6, -6, 72);
    g.addColorStop(0, shade(ch.skin, 1.32)); g.addColorStop(0.5, ch.skin); g.addColorStop(1, shade(ch.skin, 0.58));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = C.outline; ctx.stroke();
    ctx.save(); smoothPath(ctx, pts, true); ctx.clip();
    // under-jaw and eye socket shadow, cheek glow, rim light
    g = ctx.createLinearGradient(0, 22, 0, 46); g.addColorStop(0, 'rgba(60,20,10,0)'); g.addColorStop(1, 'rgba(60,20,10,0.35)');
    ctx.fillStyle = g; ctx.fillRect(-60, 20, 120, 30);
    ctx.fillStyle = 'rgba(70,25,15,0.22)'; ctx.beginPath(); ctx.ellipse(31, -12, 9, 6, 0.1, 0, 7); ctx.fill();
    g = ctx.createRadialGradient(24, 6, 0, 24, 6, 14); g.addColorStop(0, ch.id === 'nova' ? 'rgba(235,120,120,0.28)' : 'rgba(200,100,80,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(8, -10, 34, 34);
    ctx.strokeStyle = alpha(ch.rim, 0.45); ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(6, -6, 56, 2.0, 4.2); ctx.stroke();
    ctx.restore();
    // ear
    ctx.fillStyle = shade(ch.skin, 0.92); ctx.strokeStyle = C.outline; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(-8, -4, 9, 15, -0.15, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(80,30,20,0.5)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(-7, -4, 6, -1.3, 1.6); ctx.stroke();
    // nose & mouth detail
    ctx.strokeStyle = 'rgba(80,30,20,0.55)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(41 + 8 * ch.face.nose, 8); ctx.quadraticCurveTo(38, 9, 39, 5); ctx.stroke();   // nostril
    ctx.beginPath(); ctx.moveTo(42.8, 21); ctx.lineTo(36, 21.5); ctx.stroke();                                // lip line
    ctx.fillStyle = alpha(ch.lips, 0.55 * ch.face.lips);
    ctx.beginPath(); ctx.ellipse(41.5, 18.7, 2.6, 2.2, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(41.6, 23.6, 2.8, 2.5 * ch.face.lips, 0, 0, 7); ctx.fill();
    // eye
    const open = 1 - st.blink;
    ctx.save(); ctx.translate(32, -11);
    if (open > 0.15) {
      ctx.scale(1, open);
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(2, -6, 6.5, -1.5); ctx.quadraticCurveTo(1, 4, -6, 2); ctx.closePath();
      ctx.fillStyle = '#f2ece6'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = ch.iris; ctx.beginPath(); ctx.arc(2.6, -0.2, 3.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#0a0606'; ctx.beginPath(); ctx.arc(3.4, -0.2, 1.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(2.2, -1.6, 0.9, 0, 7); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#1a0e0a'; ctx.lineWidth = ch.face.lashes ? 2.6 : 1.8;
      ctx.beginPath(); ctx.moveTo(-6.5, -2); ctx.quadraticCurveTo(2, -6.6, 7.5, -1.2); ctx.stroke();
      if (ch.face.lashes) { ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(6.5, -2); ctx.lineTo(9.5, -4.5); ctx.moveTo(4.5, -3.4); ctx.lineTo(7, -6.5); ctx.stroke(); }
    } else {
      ctx.strokeStyle = '#1a0e0a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, 0.5); ctx.quadraticCurveTo(1, 3, 7, 0); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(80,30,20,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(27, -16.5); ctx.quadraticCurveTo(33, -19.5, 39, -16); ctx.stroke();  // lid crease
    // brow
    ctx.strokeStyle = ch.brow; ctx.lineCap = 'round'; ctx.lineWidth = ch.id === 'kai' ? 4.4 : 3;
    ctx.beginPath(); ctx.moveTo(23, -21); ctx.quadraticCurveTo(33, -26 - (ch.id === 'nova' ? 1.5 : 0), 41, -22); ctx.stroke();
    if (ch.id === 'kai') hairKai(ctx, ch, st); else hairFrontNova(ctx, ch);
    ctx.restore();
  }
  function hairKai(ctx, ch, st) {
    const pts = [[37, -37], [35, -50], [24, -63], [30, -66], [10, -70], [14, -74], [-6, -71], [-8, -77], [-22, -68], [-30, -72], [-38, -58], [-48, -56], [-50, -38], [-56, -30],
      [-52, -14], [-46, 6], [-36, 12], [-30, -6], [-20, -20], [-4, -30], [6, -32], [6, -16], [12, -17], [14, -34], [26, -38]].map(p => ({ x: p[0], y: p[1] }));
    smoothPath(ctx, pts, true);
    const g = ctx.createLinearGradient(30, -70, -40, 10); g.addColorStop(0, '#3a2c26'); g.addColorStop(0.4, ch.hair); g.addColorStop(1, '#050404');
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.outline; ctx.stroke();
    ctx.save(); smoothPath(ctx, pts, true); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(30 - i * 9, -62 + i * 2); ctx.quadraticCurveTo(10 - i * 9, -50, -20 - i * 4, -30 + i * 3); ctx.stroke(); }
    ctx.strokeStyle = alpha(ch.rim, 0.6); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(-4, -18, 52, 2.6, 4.4); ctx.stroke();
    ctx.restore();
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

  NF.draw = { shade, alpha, smoothPath, limb, paint, torsoMap, torsoShape, hand, foot, head, ribbon, glowDot, profAt, dirDown, nrmDown, P };
})();
