/* Turbo Lap — road model: builds segments from track data, projection and lookup helpers. */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG;
  const U = TL.util = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    easeIn: (a, b, t) => a + (b - a) * Math.pow(t, 2),
    easeInOut: (a, b, t) => a + (b - a) * ((-Math.cos(t * Math.PI) / 2) + 0.5),
    mod: (v, m) => ((v % m) + m) % m,
    percentRemaining: (n, total) => (n % total) / total,
    // seeded random so scenery is the same every load
    rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); },
    overlap(x1, w1, x2, w2) { return !((x1 + w1 / 2) < (x2 - w2 / 2) || (x1 - w1 / 2) > (x2 + w2 / 2)); },
    fmtTime(t) {
      if (t == null || !isFinite(t)) return '--:--.--';
      const m = Math.floor(t / 60), s = t - m * 60;
      return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
    }
  };

  const road = TL.road = {
    segments: [], length: 0, trackLength: 0, track: null,
    cameraDepth: 1 / Math.tan((CFG.fieldOfView / 2) * Math.PI / 180),
    map: []                          // minimap points {x,y} per segment, normalised 0..1
  };
  road.playerZ = CFG.cameraHeight * road.cameraDepth;

  function lastY() { const s = road.segments; return s.length ? s[s.length - 1].p2.world.y : 0; }

  function addSegment(curve, y) {
    const n = road.segments.length, L = CFG.segmentLength;
    road.segments.push({
      index: n, curve,
      p1: { world: { y: lastY(), z: n * L }, camera: {}, screen: {} },
      p2: { world: { y, z: (n + 1) * L }, camera: {}, screen: {} },
      sprites: [], cars: [],
      color: Math.floor(n / CFG.rumbleLength) % 2 ? CFG.colors.dark : CFG.colors.light
    });
  }

  function addRoad(enter, hold, leave, curve, hill) {
    const startY = lastY(), endY = startY + hill * CFG.segmentLength, total = enter + hold + leave;
    let n;
    for (n = 0; n < enter; n++) addSegment(U.easeIn(0, curve, n / enter), U.easeInOut(startY, endY, n / total));
    for (n = 0; n < hold; n++)  addSegment(curve, U.easeInOut(startY, endY, (enter + n) / total));
    for (n = 0; n < leave; n++) addSegment(U.easeInOut(curve, 0, n / leave), U.easeInOut(startY, endY, (enter + hold + n) / total));
  }

  function addSprite(i, type, offset) { road.segments[i].sprites.push({ type, offset }); }

  road.build = function (track) {
    road.track = track;
    road.segments = [];
    track.sections.forEach(s => addRoad(s[0], s[1], s[2], s[3], s[4]));
    addRoad(50, 50, 50, 0, -lastY() / CFG.segmentLength);          // close the height loop
    const segs = road.segments, N = segs.length;
    road.length = N;
    road.trackLength = N * CFG.segmentLength;

    // start / finish: checkered strip + gantry
    for (let i = 0; i < 3; i++) segs[i].color = CFG.colors.start;
    segs[0].start = true;
    segs[2].sprites.push({ type: 'banner', offset: 0 });

    // scenery
    const rnd = U.rng(1337);
    track.scenery.forEach(r => {
      for (let i = Math.floor(r.from * N); i < Math.floor(r.to * N); i += r.every) {
        if (i < 6) continue;
        const sides = r.side === 'both' ? [-1, 1] : [r.side === 'left' ? -1 : 1];
        sides.forEach(sd => {
          const off = r.offset[0] + rnd() * (r.offset[1] - r.offset[0]);
          addSprite((i + (sd > 0 ? Math.floor(r.every / 2) : 0)) % N, r.type, sd * off);
        });
      }
    });
    // curve warning signs on the outside, a little before each bend starts
    for (let i = 20; i < N; i++) {
      const c = segs[i].curve, p = segs[i - 1].curve;
      if (Math.abs(c) > 0.5 && Math.abs(p) <= 0.5) {
        const at = i - 15, side = c > 0 ? -1 : 1;
        for (let k = 0; k < 3; k++) addSprite(at + k * 6, c > 0 ? 'signR' : 'signL', side * 1.25);
      }
    }
    buildMap();
  };

  // Integrate the bends into a 2-D outline for the minimap; spread the closing error evenly.
  function buildMap() {
    const segs = road.segments, N = segs.length, pts = [];
    let a = 0, x = 0, y = 0;
    const turn = segs.reduce((s, g) => s + g.curve, 0);
    const kk = Math.abs(turn) > 1 ? (2 * Math.PI) / turn : 0.004;
    for (let i = 0; i < N; i++) { pts.push({ x, y }); a += segs[i].curve * kk; x += Math.sin(a); y -= Math.cos(a); }
    const ex = x, ey = y;
    pts.forEach((p, i) => { p.x -= ex * i / N; p.y -= ey * i / N; });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    const s = Math.max(maxX - minX, maxY - minY) || 1;
    road.map = pts.map(p => ({ x: (p.x - minX) / s + (1 - (maxX - minX) / s) / 2, y: (p.y - minY) / s + (1 - (maxY - minY) / s) / 2 }));
  }

  road.findSegment = z => road.segments[Math.floor(U.mod(z, road.trackLength) / CFG.segmentLength) % road.length];

  road.project = function (p, camX, camY, camZ, width, height) {
    p.camera.x = (p.world.x || 0) - camX;
    p.camera.y = (p.world.y || 0) - camY;
    p.camera.z = (p.world.z || 0) - camZ;
    p.screen.scale = road.cameraDepth / p.camera.z;
    p.screen.x = Math.round(width / 2 + p.screen.scale * p.camera.x * width / 2);
    p.screen.y = Math.round(height / 2 - p.screen.scale * p.camera.y * height / 2);
    p.screen.w = Math.round(p.screen.scale * CFG.roadWidth * width / 2);
  };

  // Height of the road at any z (for cars / camera)
  road.heightAt = z => {
    const seg = road.findSegment(z), t = U.percentRemaining(U.mod(z, road.trackLength), CFG.segmentLength);
    return U.lerp(seg.p1.world.y, seg.p2.world.y, t);
  };
})();
