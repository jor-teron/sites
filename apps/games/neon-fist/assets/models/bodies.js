// R2c1 bodies and looks for generated fighters: body type, height, and a realistic world-wide mix of
// skin tones, hair textures and subtle facial features. Rolled from its own seeded stream (see generator.js).
(function () {
  const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const tone = (h, f) => hex(rgb(h).map(v => f <= 1 ? v * f : v + (255 - v) * (f - 1)));
  const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
  const wpick = (r, w) => { const e = Object.entries(w); let t = r() * e.reduce((s, x) => s + x[1], 0); for (const [k, v] of e) if ((t -= v) < 0) return k; return e[e.length - 1][0]; };

  // 16 skin tones, fair -> deep; each gets a matching deeper shade and lip colour
  const TONES = ['#f6dcc8', '#f1d0b5', '#ecc6a6', '#e8bc98', '#e2b08c', '#d9a27a', '#cf9670', '#c98a62', '#b97a52', '#a96c46',
    '#9a5f3a', '#8a5532', '#784729', '#673b22', '#55301b', '#432415'];
  const SKIN = TONES.map(s => [s, mix(tone(s, 0.64), '#5a2010', 0.12), mix(tone(s, 0.8), '#a8484a', 0.32)]);
  // natural hair colours [base, tip]
  const NAT = [['#0e0b0a', '#3a302a'], ['#1f1510', '#5a4030'], ['#3a2414', '#8a6040'], ['#5a3a1e', '#b08050'],
    ['#8a5a2a', '#d8a868'], ['#c9a060', '#fff2c8'], ['#8a2a1a', '#ffb070'], ['#9a9890', '#e8e6e0']];
  // looks: skin index range, hair colour weights, hair texture weights, facial feature ranges [min, max]
  const LOOKS = {
    a: { skin: [9, 15], col: [6, 3, 1, 0, 0, 0, 0, 0.3], tex: { coily: 3, locs: 2, braids: 2, crop: 2, short: 1.4, curly: 1 },
      f: { noseW: [1.18, 1.34], bridge: [-0.6, 0], lips: [1.12, 1.32], eyeH: [0.98, 1.06], lid: [0.9, 1], browArc: [0, 0.6], jaw: [1, 1.08] } },
    e: { skin: [1, 6], col: [6, 3, 0.4, 0, 0, 0, 0, 0.3], tex: { straight: 3, short: 2, spiky: 1.6, tail: 1, wavy: 0.5, crop: 0.8 },
      f: { noseW: [1, 1.1], bridge: [-0.7, -0.25], lips: [0.95, 1.08], eyeH: [0.78, 0.9], lid: [0.15, 0.45], browArc: [-0.4, 0.2], jaw: [0.95, 1.04] } },
    s: { skin: [5, 11], col: [5, 4, 1, 0, 0, 0, 0, 0.3], tex: { straight: 2, wavy: 2.5, curly: 1, tail: 1.5, short: 1.5, braids: 0.6 },
      f: { noseW: [1.04, 1.16], bridge: [0, 0.5], lips: [1, 1.14], eyeH: [1, 1.08], lid: [0.8, 1], browArc: [0.2, 0.8], jaw: [0.96, 1.04] } },
    w: { skin: [0, 5], col: [1, 2, 2.5, 2, 1.5, 1.6, 0.8, 0.3], tex: { straight: 2, wavy: 2, curly: 1, short: 2, spiky: 1.5, tail: 1.5, crop: 1 },
      f: { noseW: [0.88, 1], bridge: [0.3, 0.9], lips: [0.84, 1], eyeH: [0.96, 1.06], lid: [0.85, 1], browArc: [-0.2, 0.5], jaw: [0.98, 1.1] } },
    l: { skin: [4, 10], col: [4, 4, 2, 1, 0.3, 0, 0.2, 0.3], tex: { wavy: 2.5, curly: 2, straight: 1.5, short: 1.5, tail: 1, braids: 0.5, crop: 0.8 },
      f: { noseW: [1, 1.12], bridge: [0.3, 0.9], lips: [1, 1.15], eyeH: [0.98, 1.06], lid: [0.85, 1], browArc: [0, 0.7], jaw: [0.98, 1.08] } }
  };
  const LONG = ['tail', 'straight', 'wavy', 'locs', 'braids'], SHORTH = ['short', 'crop', 'spiky'];

  function looks(r, male) {
    const keys = Object.keys(LOOKS), a = keys[Math.floor(r() * keys.length)];
    let b = a, t = 0;
    if (r() < 0.32) { b = keys[Math.floor(r() * keys.length)]; t = 0.25 + r() * 0.3; }     // natural mixing
    const A = LOOKS[a], Bk = LOOKS[b], lerp = (x, y) => x + (y - x) * t;
    const si = Math.round(lerp(A.skin[0], Bk.skin[0]) + (lerp(A.skin[1], Bk.skin[1]) - lerp(A.skin[0], Bk.skin[0])) * r());
    const face = {};
    for (const k of Object.keys(A.f)) { const u = r(); face[k] = +lerp(A.f[k][0] + (A.f[k][1] - A.f[k][0]) * u, Bk.f[k][0] + (Bk.f[k][1] - Bk.f[k][0]) * u).toFixed(3); }
    face.browT = +(0.85 + r() * 0.35).toFixed(2);
    const tw = {};
    for (const [k, v] of Object.entries(A.tex)) tw[k] = (tw[k] || 0) + v * (1 - t);
    for (const [k, v] of Object.entries(Bk.tex)) tw[k] = (tw[k] || 0) + v * t;
    for (const k of Object.keys(tw)) tw[k] *= male ? (SHORTH.includes(k) ? 1.6 : k === 'tail' ? 0.4 : 1) : (LONG.includes(k) ? 1.5 : k === 'crop' ? 0.3 : 1);
    const tex = wpick(r, tw);
    const cw = A.col.map((v, i) => v * (1 - t) + Bk.col[i] * t), col = NAT[+wpick(r, Object.assign({}, cw))];
    const beard = male ? wpick(r, { none: 4.5, stubble: 3, beard: a === 'e' ? 1 : 2.6 }) : 'none';
    return { look: t ? a + '+' + b : a, skin: SKIN[Math.max(0, Math.min(15, si))], face, tex, col, beard, natural: r() };
  }

  // body type + height
  const TYPES = { fat: 2, muscular: 2.5, lean: 2.5, average: 3 };
  function roll(r) {
    const type = wpick(r, TYPES), h = +(0.86 + r() * 0.28).toFixed(3);       // 0.86 short & stocky .. 1.14 tall & lanky
    const legL = +(0.97 + r() * 0.07 + (h - 1) * 0.35).toFixed(3), armL = +(0.96 + r() * 0.08 + (h - 1) * 0.25).toFixed(3);
    const P = { fat: { m: [1.16, 1.28], sh: [1, 1.1], hip: [1.06, 1.16], arm: 1.12, leg: 1.12 },
      muscular: { m: [1.04, 1.12], sh: [1.14, 1.26], hip: [0.94, 1.02], arm: 1.26, leg: 1.1 },
      lean: { m: [0.84, 0.91], sh: [0.9, 1.0], hip: [0.92, 1.02], arm: 0.9, leg: 0.94 },
      average: { m: [0.96, 1.04], sh: [0.96, 1.06], hip: [0.96, 1.06], arm: 1, leg: 1 } }[type];
    const rr = a => a[0] + (a[1] - a[0]) * r(), stock = Math.max(0, 1 - h) * 0.9;   // short = stockier, tall = lankier
    return { type, h, legL, armL, m: +(rr(P.m) * (1 + stock - Math.max(0, h - 1) * (type === 'fat' ? 0.1 : 0.5))).toFixed(3), sh: +rr(P.sh).toFixed(3), hip: +rr(P.hip).toFixed(3),
      arm: P.arm, leg: P.leg, belly: type === 'fat' ? +(20 + r() * 12).toFixed(1) : 0, head: +(0.97 + r() * 0.06).toFixed(3), jit: [r(), r(), r(), r()] };
  }

  // torso profile resampled on a fine grid so a belly / chest / waist shape reads smoothly
  const G = [-0.14, -0.06, 0.02, 0.1, 0.18, 0.26, 0.34, 0.42, 0.5, 0.58, 0.66, 0.74, 0.8, 0.86, 0.92, 1];
  const at = (p, u) => { if (u <= p[0][0]) return p[0][1]; for (let i = 1; i < p.length; i++) if (u <= p[i][0]) { const a = p[i - 1], b = p[i]; return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]); } return p[p.length - 1][1]; };
  const bump = (u, c, w) => Math.exp(-Math.pow((u - c) / w, 2));
  function torso(p, B, front, female) {
    return G.map(u => {
      const s = u > 0.55 ? B.sh : u < 0.35 ? B.hip : B.hip + (B.sh - B.hip) * (u - 0.35) / 0.2;
      let v = at(p, u) * s * B.m;
      if (B.type === 'fat') v += front ? B.belly * bump(u, 0.3, 0.2) + 5 * bump(u, 0.72, 0.1) : B.belly * 0.35 * bump(u, 0.22, 0.16);
      if (B.type === 'muscular') { v *= 1 - 0.1 * bump(u, 0.36, 0.1); v += front ? (female ? 3 : 7) * bump(u, 0.74, 0.09) : 6 * bump(u, 0.7, 0.12); }
      if (B.type === 'lean') v *= 1 - 0.06 * bump(u, 0.36, 0.12);
      return [u, +v.toFixed(2)];
    });
  }
  NF.bodies = { roll, looks, torso, SKIN, NAT, LOOKS, TYPES, tone, mix };
})();
