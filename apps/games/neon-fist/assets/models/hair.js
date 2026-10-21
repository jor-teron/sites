// R2c1 hair textures for generated fighters (head-local units, face to the right): short, crop, straight,
// wavy, curly, coily, locs and braids. Spiky (Kai) and tail (Nova) stay in draw.js.
(function () {
  const C = NF.config, Dr = NF.draw;
  // outer contour of the hair cap (front hairline -> crown -> nape) and the inner hairline back to the front
  const OUTER = [[39, -32], [39, -47], [27, -63], [4, -72], [-20, -71], [-38, -65], [-48, -50], [-53, -32], [-50, -12], [-42, 6]];
  const INNER = [[-34, 4], [-30, -10], [-20, -24], [-2, -32], [10, -36], [22, -40], [32, -38]];
  const CX = -6, CY = -24;
  const pt = p => ({ x: p[0], y: p[1] });
  const puffed = (k, lift = 0) => OUTER.map((p, i) => { const w = i > 0 && i < OUTER.length - 1 ? k : 1 + (k - 1) * 0.3; return [CX + (p[0] - CX) * w, CY + (p[1] - CY) * w - lift]; });
  // resample a polyline and push every other point outward to make bumps (curls / coils)
  function bumpy(pts, n, amp) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < n; k++) {
      const t = k / n, a = pts[i], b = pts[i + 1], x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const dx = x - CX, dy = y - CY, l = Math.hypot(dx, dy) || 1, o = (out.length % 2 ? 1 : -0.3) * amp;
      out.push([x + dx / l * o, y + dy / l * o]);
    }
    out.push(pts[pts.length - 1]); return out;
  }
  function fillHair(ctx, pts, ch, lw = 2, a = 1) {
    const P = pts.map(pt); Dr.smoothPath(ctx, P, true);
    const g = ctx.createLinearGradient(30, -66, -40, 4);
    g.addColorStop(0, Dr.shade(ch.hair, 1.45)); g.addColorStop(0.45, ch.hair); g.addColorStop(1, Dr.shade(ch.hair, 0.42));
    ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1;
    if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = C.outline; ctx.stroke(); }
    return P;
  }
  const clipDo = (ctx, P, f) => { ctx.save(); Dr.smoothPath(ctx, P, true); ctx.clip(); f(); ctx.restore(); };
  const rim = (ctx, ch, r = 50) => { ctx.strokeStyle = Dr.alpha(ch.rim, 0.55); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(-4, -18, r, 2.5, 4.3); ctx.stroke(); };
  const strands = (ctx, n, a) => { ctx.lineWidth = 1.4; for (let i = 0; i < n; i++) { ctx.strokeStyle = i % 3 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.moveTo(36 - i * 3, -38 - i * 2.2); ctx.quadraticCurveTo(0, -62 + i, -40 + i, -40 + i * 4); ctx.stroke(); } };
  const coils = (ctx, P, ch, r, step) => {   // little ring texture for curly / coily hair
    clipDo(ctx, P, () => { for (let y = -80; y < 20; y += step) for (let x = -64 + ((y / step) % 2) * step / 2; x < 46; x += step) {
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(x, y, r, 0.3, 4.6); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.beginPath(); ctx.arc(x - 1, y - 1, r * 0.7, 3.4, 5.6); ctx.stroke(); } });
  };
  const capPts = (k, lift) => puffed(k, lift).concat(INNER);

  // ---- behind the head (drawn before the face) ----
  function back(ctx, ch) {
    const st = ch.hairStyle, long = !ch.male || ch.num % 3 === 0;
    if (st === 'straight' || st === 'wavy') {
      if (!long) return;
      const L = ch.male ? 40 : 74, wv = st === 'wavy' ? 6 : 0, edge = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; edge.push([-50 - 12 * t + Math.sin(t * 9) * wv, -30 + (L + 30) * t]); }
      const inner = [[-20, -30 + L * 0.9], [-24, 10], [-22, -40]];
      const P = fillHair(ctx, [[-12, -68], [-40, -60]].concat(edge, [[-44 + wv, -24 + L + 8]], inner), ch, 2);
      clipDo(ctx, P, () => { ctx.lineWidth = 1.5; for (let k = 0; k < 6; k++) { ctx.strokeStyle = k % 2 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.moveTo(-26 - k * 5, -60); for (let y = -50; y < L; y += 10) ctx.lineTo(-28 - k * 5 - (y + 50) * 0.12 + Math.sin(y / 9) * wv * 0.6, y); ctx.stroke(); } });
    } else if (st === 'coily') {
      const P = fillHair(ctx, bumpy([[-8, -82], [-40, -76], [-64, -52], [-70, -20], [-60, 10], [-40, 16]], 4, 4), ch, 2);
      coils(ctx, P, ch, 3, 7);
    } else if (st === 'curly' && long) {
      const P = fillHair(ctx, bumpy([[-14, -70], [-46, -60], [-62, -30], [-64, 10], [-56, 40], [-36, 44], [-26, 10], [-24, -40]], 3, 5), ch, 2);
      coils(ctx, P, ch, 3.5, 9);
    } else if (st === 'locs' || st === 'braids') {
      const n = st === 'locs' ? 6 : (long ? 3 : 2), L = st === 'locs' ? (long ? 110 : 70) : (long ? 120 : 60);
      for (let i = 0; i < n; i++) {
        const a = (-150 - i * (st === 'locs' ? 14 : 22)) * Math.PI / 180, x0 = CX + Math.cos(a) * 44, y0 = CY + Math.sin(-a) * -44;
        const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push({ x: x0 - 8 * t - i * 2 * t + Math.sin(t * 4 + i) * 3, y: y0 + L * t }); }
        const w = st === 'locs' ? 9 : 12;
        Dr.ribbon(ctx, pts, w, w * 0.75, Dr.shade(ch.hair, 1.15), Dr.shade(ch.hair, 0.6));
        if (st === 'braids') { ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.3;
          for (let k = 1; k < 12; k++) { const t = k / 12, p = pts[Math.floor(t * 6)], q = pts[Math.min(6, Math.floor(t * 6) + 1)], f = t * 6 % 1, x = p.x + (q.x - p.x) * f, y = p.y + (q.y - p.y) * f;
            ctx.beginPath(); ctx.moveTo(x - 5, y - 3); ctx.lineTo(x + 5, y + 2); ctx.stroke(); }
          const e = pts[6]; ctx.fillStyle = ch.accent; ctx.beginPath(); ctx.arc(e.x, e.y, 3.5, 0, 7); ctx.fill(); }
        else { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; for (const p of pts.slice(1)) { ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y + 1); ctx.stroke(); } }
      }
    }
  }
  // ---- over the skull (drawn after the face) ----
  function front(ctx, ch) {
    const st = ch.hairStyle;
    if (st === 'crop') {           // close-cropped: thin, semi-opaque cap with stipple
      const P = fillHair(ctx, [[38, -36], [37, -48], [26, -60], [4, -66], [-20, -64], [-36, -56], [-46, -40], [-48, -22], [-44, -6], [-36, -6], [-28, -16], [-16, -26], [0, -32], [14, -36], [28, -40]], ch, 0, 0.82);
      clipDo(ctx, P, () => { ctx.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = -66; y < 0; y += 4) for (let x = -50 + (y % 8 ? 2 : 0); x < 40; x += 4) ctx.fillRect(x, y, 1.3, 1.3); rim(ctx, ch, 48); });
      return;
    }
    if (st === 'short') {
      const P = fillHair(ctx, capPts(0.98, 0).concat(), ch);
      clipDo(ctx, P, () => { strands(ctx, 9, 0.14); rim(ctx, ch); });
      fillHair(ctx, [[20, -62], [38, -52], [42, -40], [34, -42], [22, -52]], ch, 1.5);     // little front quiff
      return;
    }
    if (st === 'straight' || st === 'wavy') {
      const P = fillHair(ctx, capPts(1.0, 0), ch);
      clipDo(ctx, P, () => { strands(ctx, 11, 0.16); rim(ctx, ch); });
      const fr = st === 'wavy' ? [[16, -64], [34, -54], [44, -36], [40, -24], [36, -32], [30, -44], [20, -52]] : [[16, -64], [36, -54], [42, -32], [38, -24], [34, -40], [24, -52]];
      const B = fillHair(ctx, fr, ch, 1.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(22, -58); ctx.quadraticCurveTo(36, -48, 38, -32); ctx.stroke();
      return;
    }
    if (st === 'curly' || st === 'coily') {
      const k = st === 'coily' ? 1.3 : 1.1, P = fillHair(ctx, bumpy(puffed(k, 4), st === 'coily' ? 4 : 3, st === 'coily' ? 3.5 : 5).concat(INNER), ch);
      coils(ctx, P, ch, st === 'coily' ? 2.6 : 3.4, st === 'coily' ? 6 : 8);
      clipDo(ctx, P, () => rim(ctx, ch, 54));
      return;
    }
    if (st === 'locs' || st === 'braids') {     // tight base with parted rows (cornrows for braids)
      const P = fillHair(ctx, capPts(0.99, 0), ch);
      clipDo(ctx, P, () => { ctx.lineWidth = st === 'braids' ? 2 : 1.6;
        for (let i = 0; i < 6; i++) { ctx.strokeStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.moveTo(38 - i * 2, -36 - i * 6); ctx.quadraticCurveTo(-4, -64 + i * 4, -50, -20 + i * 6); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(36 - i * 2, -39 - i * 6); ctx.quadraticCurveTo(-4, -67 + i * 4, -50, -23 + i * 6); ctx.stroke(); }
        rim(ctx, ch); });
    }
  }
  // facial hair: stubble or a short full beard + moustache (generated men only)
  function beard(ctx, ch, pts) {
    if (!ch.beard || ch.beard === 'none') return;
    const full = ch.face.full || 0;
    ctx.save(); Dr.smoothPath(ctx, pts, true); ctx.clip();
    if (ch.beard === 'stubble') {
      ctx.fillStyle = Dr.alpha(ch.hair > '#9' ? '#3a2a20' : ch.hair, 0.3);
      ctx.beginPath(); ctx.moveTo(-6, 16); ctx.quadraticCurveTo(14, 26, 30, 26); ctx.lineTo(44, 26); ctx.lineTo(44, 60); ctx.lineTo(-20, 60); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(20,12,10,0.28)'; for (let y = 22; y < 50; y += 3) for (let x = -4 + (y % 6 ? 1.5 : 0); x < 44; x += 3) if (y > 30 - x * 0.25) ctx.fillRect(x, y, 1, 1);
      ctx.restore(); return;
    }
    const g = ctx.createLinearGradient(0, 10, 0, 50); g.addColorStop(0, Dr.shade(ch.hair, 1.2)); g.addColorStop(1, Dr.shade(ch.hair, 0.6));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-10, 4); ctx.quadraticCurveTo(0, 22, 16, 26); ctx.quadraticCurveTo(30, 28, 35, 22); ctx.lineTo(44, 24); ctx.lineTo(50, 60 + full * 4); ctx.lineTo(-30, 60); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.2; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(-4 + i * 7, 22 + i); ctx.lineTo(-6 + i * 7, 40 + i); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = Dr.shade(ch.hair, 1.1); ctx.strokeStyle = C.outline; ctx.lineWidth = 1.2;      // moustache over the upper lip
    ctx.beginPath(); ctx.moveTo(45, 15.5); ctx.quadraticCurveTo(40, 13.5, 34, 17); ctx.quadraticCurveTo(33, 21, 35.5, 22); ctx.quadraticCurveTo(39, 18.5, 45.5, 18.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  NF.hair = { back, front, beard, STYLES: ['short', 'crop', 'straight', 'wavy', 'curly', 'coily', 'locs', 'braids'] };
})();
