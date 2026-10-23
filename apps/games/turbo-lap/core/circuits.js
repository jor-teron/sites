/* Turbo Lap — the 100 circuits (00..99). Every circuit is generated in code from its number with a seeded
   generator, so the same number always gives the same track. The output is the same data TL.TRACKS uses:
   sections [enter, hold, leave, curve, hill] plus scenery rules, plus laps and opponent strength.
   Circuit 50 is the hand-made Coastline Loop (TL.TRACKS[0]) exactly as it was; the others use its style.
   Scaling with the circuit number n (0..99): length 0.4x -> 1.0x (at 50) -> 1.6x of Coastline, laps by table,
   bends 2 -> 6 -> 7, hills 15 -> 40 -> 70, opponents faster / smarter / more rubber-banded. */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG, U = TL.util, K = CFG.circuits;
  const CLOSER = 150;                                  // road.build appends 150 segments to close the height loop
  const S = 25, M = 50, L = 100;

  const pad2 = n => (n < 10 ? '0' : '') + n;
  const clampN = n => Math.max(0, Math.min(K.count - 1, Math.floor(+n) || 0));
  // piecewise-linear through three anchor values at circuit 0, 50 and 99
  const tri = (a, n) => n <= 50 ? U.lerp(a[0], a[1], n / 50) : U.lerp(a[1], a[2], (n - 50) / 49);

  function lapsFor(n) { for (const [last, laps] of K.laps) if (n <= last) return laps; return K.laps[K.laps.length - 1][1]; }

  let coastSegs = 0;
  function coastLength() {
    if (!coastSegs) coastSegs = TL.TRACKS[0].sections.reduce((s, a) => s + a[0] + a[1] + a[2], 0) + CLOSER;
    return coastSegs;
  }
  function lengthFor(n) {                              // total segments, closing section included
    if (n === K.handMade) return coastLength();
    return Math.round(coastLength() * tri([K.lengthMin, 1, K.lengthMax], n));
  }

  // opponent list for circuit n: circuit 50 is the original list; speed and skill move linearly around it
  function opponentsFor(n) {
    const ds = (n - K.handMade) * K.speedPer, dk = (n - K.handMade) * K.skillPer;
    const rubber = tri(K.rubber, n);
    return CFG.opponents.map(o => ({
      ...o, rubber,
      speed: U.clamp(o.speed + ds, K.speedCap[0], K.speedCap[1]),
      skill: U.clamp(o.skill + dk, K.skillCap[0], K.skillCap[1])
    }));
  }

  // ---------- names ----------
  const ADJ = ['Crimson', 'Silver', 'Golden', 'Misty', 'Neon', 'Windy', 'Sunset', 'Frozen', 'Lazy', 'Rocky', 'Emerald', 'Dusty'];
  const NOUN = ['Harbour', 'Ridge', 'Canyon', 'Dunes', 'Meadow', 'Pass', 'Bay', 'Hills', 'Mesa', 'Valley', 'Peak', 'Flats'];
  function nameFor(n) {
    if (n === K.handMade) return TL.TRACKS[0].name;
    const r = U.rng(n * 40503 + 7); r(); r();
    return ADJ[Math.floor(r() * ADJ.length)] + ' ' + NOUN[Math.floor(r() * NOUN.length)];
  }

  // ---------- generator ----------
  function generate(n) {
    const rnd = U.rng(n * 7919 + 104729); rnd(); rnd(); rnd();
    const cmax = tri(K.curveMax, n), hmax = tri(K.hillMax, n), slope = tri(K.slopeMax, n), d = n / 99;
    const target = lengthFor(n);
    const R = (a, b) => a + (b - a) * rnd();
    const r1 = v => Math.round(v * 10) / 10;
    let peakC = false, peakH = false;                  // make sure each circuit shows its full bend / hill strength once
    let y = 0;                                         // running height (segments), used to keep the loop level
    const sections = [];
    let used = 0;                                      // segments in `sections`
    const add = s => { sections.push(s); used += s[0] + s[1] + s[2]; y += s[4]; };
    const dir = () => (rnd() < 0.62 ? 1 : -1);         // mostly right-handers so the minimap closes into a loop
    const hillSign = () => (Math.abs(y) > 0.6 * hmax ? -Math.sign(y) : (rnd() < 0.5 ? 1 : -1));
    // a hill of height h needs enough road under it to stay below the grade limit
    const hillLen = h => Math.round(U.clamp(h / slope, 75, 200) / 3);

    // each motif returns its sections; `room` is how many segments are left for it
    const motifs = [
      { name: 'straight', w: () => 3 - 2 * d, min: 100, make(room) {
        const len = Math.round(R(100, Math.min(200, room))); return [[S, len - 50, S, 0, 0]]; } },
      { name: 'bend', w: () => 4, min: 150, make(room) {
        const c = peakC ? r1(Math.max(1.2, cmax * R(0.3, 1))) : cmax, a = Math.round(R(40, 55)), h = Math.round(R(40, 90));
        peakC = true; return [[a, h, a, c * dir(), 0]]; } },
      { name: 'hillbend', w: () => 1 + 2 * d, min: 150, make() {
        const c = r1(Math.max(1, cmax * R(0.2, 0.6))), hh = r1(hmax * R(0.4, 0.8)) * hillSign(), t = hillLen(Math.abs(hh));
        return [[t, t, t, c * dir(), hh]]; } },
      { name: 'hill', w: () => 2, min: 150, make() {
        const hh = (peakH ? r1(hmax * R(0.45, 1)) : hmax) * hillSign(), t = hillLen(Math.abs(hh));
        peakH = true; return [[t, t, t, 0, hh]]; } },
      { name: 'bumps', w: () => (d > 0.08 ? 0.5 + 1.5 * d : 0), min: 75, make() {
        const b = r1(U.clamp(hmax * 0.5, 6, 28)), s = rnd() < 0.5 ? 1 : -1;
        return [[S, S, S, 0, b * s], [S, S, S, 0, -b * s], [S, S, S, 0, b * s], [S, S, S, 0, -b * s]]; } },
      { name: 'sbend', w: () => (cmax >= 3 ? 1 + d : 0), min: 150, make() {
        const c = r1(Math.min(cmax, cmax * R(0.6, 1))), s = dir();
        return [[S, S, S, c * s, 0], [S, S, S, -c * s, 0]]; } },
      { name: 'chicane', w: () => (n >= 15 ? 2 * d : 0), min: 150, make() {
        const c = r1(Math.max(1.5, cmax * R(0.45, 0.7))), s = dir();
        return [[S, S, S, c * s, 0], [S, S, S, -c * s, 0], [S, S, S, c * s, 0]]; } },
      { name: 'hairpin', w: () => (n >= 25 && cmax >= 4.5 ? 0.3 + 1.2 * d : 0), min: 100, make() {
        const c = r1(cmax * R(0.85, 1)), s = dir(), a = n > 70 ? 30 : S;
        return [[a, M, a, c * s, 0]]; } }
    ];

    add([S, M, S, 0, 0]);                              // start straight (like the Coastline Loop)
    const endRun = 100;                                // minimum run to the line before the closing section
    let last = '', guard = 0;
    while (guard++ < 200) {
      const room = target - CLOSER - used - endRun;
      const ok = motifs.filter(m => m.min <= room && m.name !== last && m.w() > 0);
      if (!ok.length) break;
      let tot = 0; ok.forEach(m => { tot += m.w(); });
      let pick = rnd() * tot, m = ok[0];
      for (const o of ok) { pick -= o.w(); if (pick <= 0) { m = o; break; } }
      const secs = m.make(room);
      const len = secs.reduce((s, a) => s + a[0] + a[1] + a[2], 0);
      const y2 = y + secs.reduce((s, a) => s + a[4], 0);                       // the run to the line must still be able to level the road
      if (len > room - Math.max(0, Math.ceil(Math.abs(y2) / slope) - endRun) || len > room) { last = m.name; continue; }
      secs.forEach(add);
      last = m.name;
    }
    // run to the line: fills the exact remaining length and levels the road (so the closer is nearly flat)
    const rest = target - CLOSER - used;
    const lvl = Math.abs(y) > 1 ? r1(-y) : 0;
    sections.push([S, rest - 2 * S, S, 0, lvl]);
    // minimap: make the net turn positive
    const net = sections.reduce((s, a) => s + a[3] * (a[0] / 2 + a[1] + a[2] / 2), 0);
    if (net < 0) sections.forEach(a => { a[3] = a[3] ? -a[3] : 0; });
    return sections;
  }

  // scenery rules: same style as the Coastline Loop, with seeded variety in density and placement
  function sceneryFor(n) {
    const rnd = U.rng(n * 31337 + 99); rnd(); rnd();
    const R = (a, b) => a + (b - a) * rnd();
    const a = R(0.3, 0.45), b = R(0.55, 0.75);
    return [
      { type: 'tree', from: 0.05, to: a, every: Math.round(R(5, 8)), offset: [1.4, 2.6], side: 'both' },
      { type: 'lamp', from: 0, to: R(0.08, 0.14), every: 12, offset: [1.15, 1.15], side: 'both' },
      { type: 'tree', from: a + 0.05, to: b, every: Math.round(R(4, 7)), offset: [1.3, 3.0], side: 'both' },
      { type: 'bush', from: 0.3, to: 0.95, every: Math.round(R(7, 11)), offset: [1.25, 2.2], side: 'both' },
      { type: 'lamp', from: b, to: Math.min(0.9, b + R(0.08, 0.16)), every: 10, offset: [1.15, 1.15], side: 'both' },
      { type: 'tree', from: 0.85, to: 1.0, every: Math.round(R(5, 7)), offset: [1.5, 2.8], side: 'both' }
    ];
  }

  const cache = {};
  TL.circuits = {
    count: K.count,
    pad2, clampN, lapsFor, lengthFor, opponentsFor, nameFor,
    label: n => 'Circuit ' + pad2(n),
    get(n) {
      n = clampN(n);
      if (cache[n]) return cache[n];
      const hand = n === K.handMade;
      const base = hand ? TL.TRACKS[0] : null;
      return cache[n] = {
        id: pad2(n), n, name: nameFor(n), laps: lapsFor(n), demo: n === 0,
        segments: lengthFor(n),
        sections: hand ? base.sections : generate(n),
        scenery: hand ? base.scenery : sceneryFor(n),
        opponents: opponentsFor(n),
        curveMax: hand ? 6 : tri(K.curveMax, n), hillMax: hand ? 40 : tri(K.hillMax, n)
      };
    }
  };
})();
