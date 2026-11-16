/* DS-2a cockpit maths: DOM-free and three.js-free, so Node can test it.
   World: x east, y south (metres, as core/physics.js). Scene: x = world x, y = up, z = world y. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS = root.DS || {}, api);
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const DEG = 180 / Math.PI;
  const WHEEL_MAX_DEG = 150;          // drawn wheel turn at full steering input, each way
  const SPEEDO_MAX = 100, TACHO_MAX = 7000, DIAL_START = -120, DIAL_SWEEP = 240;

  // Steering wheel: physics steer -1..1 -> drawn rotation in degrees (clockwise = right).
  function wheelAngle(steer) { return clamp(steer || 0, -1, 1) * WHEEL_MAX_DEG; }
  // Pointer angle around the wheel centre in degrees: 0 = 12 o'clock, clockwise positive.
  function pointerAngle(cx, cy, px, py) { return Math.atan2(px - cx, cy - py) * DEG; }
  function angleDelta(now, before) { let d = (now - before) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; }
  // Drag the wheel itself: accumulate pointer rotation, so it works past 180 degrees.
  function dragSteer(state, deg) {
    const steer = clamp(state.steer + angleDelta(deg, state.lastDeg) / WHEEL_MAX_DEG, -1, 1);
    return { steer, lastDeg: deg };
  }
  // Near the hub the angle jumps wildly; use sideways movement there instead.
  function nearHub(cx, cy, px, py, radius) { return Math.hypot(px - cx, py - cy) < radius * .22; }

  // Analogue dial needle: value -> degrees from 12 o'clock.
  function needleAngle(value, max, start = DIAL_START, sweep = DIAL_SWEEP) { return start + clamp((value || 0) / max, 0, 1) * sweep; }
  function speedKmh(c) { return Math.round(Math.abs(c.v) * 3.6); }
  function gearLabel(c) { return c.gear === -1 ? 'R' : !c.gear ? 'N' : c.auto ? 'D' : String(c.gear); }
  // Gear lever gate. Manual: H pattern with R beside 5. Automatic: R, N, D in a line.
  function gateSlots(auto) {
    return auto ? [{ gear: -1, label: 'R', col: 1, row: 0 }, { gear: 0, label: 'N', col: 1, row: 1 }, { gear: 1, label: 'D', col: 1, row: 2 }] :
      [{ gear: 1, label: '1', col: 0, row: 0 }, { gear: 3, label: '3', col: 1, row: 0 }, { gear: 5, label: '5', col: 2, row: 0 },
        { gear: 0, label: 'N', col: 1, row: 1 },
        { gear: 2, label: '2', col: 0, row: 2 }, { gear: 4, label: '4', col: 1, row: 2 }, { gear: -1, label: 'R', col: 2, row: 2 }];
  }
  function gateSlotFor(c) { return gateSlots(c.auto).find(g => (c.auto && c.gear > 0) ? g.gear === 1 : g.gear === c.gear); }

  // Scene mapping and the car's own axes (scene x/z plane).
  function toScene(x, y, h = 0) { return { x, y: h, z: y }; }
  function axes(heading) { return { fx: Math.cos(heading), fz: Math.sin(heading), rx: -Math.sin(heading), rz: Math.cos(heading) }; }
  // c.z = road height under the car (DS-3 open-road hills), 0 elsewhere.
  function offset(c, forward, right, h) { const a = axes(c.heading); return { x: c.x + a.fx * forward + a.rx * right, y: h + (c.z || 0), z: c.y + a.fz * forward + a.rz * right }; }
  // Right-hand-drive (India, left-hand traffic): the driver sits right of the centre line.
  function driverSide(side) { return side === 'right' ? -1 : 1; }
  function driverCamera(c, side) {
    const eye = offset(c, -.25, .37 * driverSide(side), 1.18), a = axes(c.heading);
    return { position: eye, target: { x: eye.x + a.fx * 10, y: .95 + (c.z || 0), z: eye.z + a.fz * 10 }, fov: 70 };
  }
  // Interior mirror: top centre of the windscreen, looking straight back.
  function rearMirrorCamera(c) {
    const p = offset(c, .35, 0, 1.3), a = axes(c.heading);
    return { position: p, target: { x: p.x - a.fx * 10, y: 1.05 + (c.z || 0), z: p.z - a.fz * 10 }, fov: 38, flip: true };
  }
  // Door mirrors: just outside each front door, looking back and a little outwards.
  function sideMirrorCamera(c, which) {
    const s = which === 'right' ? 1 : -1, p = offset(c, .55, 1.0 * s, 1.0), a = axes(c.heading);
    return { position: p, target: { x: p.x - a.fx * 10 + a.rx * s * 2.2, y: .8 + (c.z || 0), z: p.z - a.fz * 10 + a.rz * s * 2.2 }, fov: 44, flip: true };
  }
  // Put the horizon in the upper part of the canvas (the dashboard covers the bottom),
  // using a taller virtual frame and a view offset. Returns values for setViewOffset.
  function cameraFrame(width, height, horizon = .42, hfov = 78) {
    width = Math.max(1, width); height = Math.max(1, height);
    const h = clamp(horizon, .2, .5), fullHeight = 2 * height * (1 - h), offsetY = fullHeight / 2 - height * h;
    let fov = 2 * Math.atan(Math.tan(hfov / 2 / DEG) * fullHeight / width) * DEG;
    fov = clamp(fov, 35, 105);
    return { fov, fullWidth: width, fullHeight, offsetX: 0, offsetY, width, height };
  }
  // WebGL viewport for a DOM mirror frame: CSS px, origin bottom-left of the canvas.
  function viewportFromRect(rect, canvasRect) {
    const x = Math.round(rect.left - canvasRect.left), top = Math.round(rect.top - canvasRect.top);
    const w = Math.round(rect.width), h = Math.round(rect.height);
    return { x, y: Math.round(canvasRect.height) - top - h, w, h, visible: w > 8 && h > 8 && x + w > 0 && top + h > 0 && x < canvasRect.width && top < canvasRect.height };
  }
  // Keep weak devices smooth: never above 1.5x, and 1x on very large canvases.
  function renderPixelRatio(dpr, cssWidth) { return clamp(dpr || 1, 1, cssWidth > 1500 ? 1 : 1.5); }
  function isPortrait(w, h) { return h > w * 1.1; }

  // Practice lot, matching the old top-down drawing (ui/render.js).
  function lotLayout() {
    const cones = [];
    for (let x = 15; x < 230; x += 14) for (const y of [12, 188]) cones.push([x, y]);
    const dashes = [];
    for (const y of [45, 70, 100, 170]) for (let x = 15; x < 220; x += 6) dashes.push([x, y, Math.min(3, 220 - x)]);
    return { width: 240, depth: 200, border: [3, 3, 234, 194], cones, dashes };
  }
  // Town, matching ui/town-render.js. o = lane offset (negative for left-hand traffic).
  function townLayout(side) {
    const o = side === 'right' ? 3.5 : -3.5;
    return { o, size: [260, 240], roads: [60, 180], roadWidth: 14, pavement: 18,
      roundabout: { x: 180, y: 180, road: 23, kerb: 12, island: 10 },
      buildings: [[82, 90, 'SCHOOL', '#c69172'], [125, 103, 'PARK', '#45765e'], [15, 95, 'SHOPS', '#718eb4'], [205, 90, 'CLINIC', '#a589a9']],
      zebra: Array.from({ length: 7 }, (_, i) => [113, 53 + i * 2, 6, 1]),
      stopLines: [[141.5, 60 + o - 3, .5, 6], [60 - o - 3, 51.5, 6, .5]],
      signal: { x: 145.35, y: o < 0 ? 51 : 69 },
      signs: [{ x: 92, y: 48, kind: 'speed', text: '30' }, { x: 60 - o + (o < 0 ? 6 : -6), y: 47, kind: 'stop', text: 'STOP' }, { x: 154, y: o < 0 ? 170 : 190, kind: 'yield', text: '' }],
      parking: [[86, 39, 39, 14], [190, 156, 25, 27]], bays: [[98, 43.5, 12, 3], [200, 163.5, 3, 7]] };
  }
  // What to draw for a lesson: rings (with travel direction), stop box and parking target.
  function lessonMarkers(def) {
    let prev = def.spawn;
    const rings = def.gates.map((p, i) => { const r = { x: p[0], y: p[1], n: i + 1, heading: Math.atan2(p[1] - prev[1], p[0] - prev[0]) }; prev = p; return r; });
    const box = def.finish && def.gates.length ? { x: def.gates[0][0], y: def.gates[0][1], w: 12, d: 8 } : null;
    const park = def.parking ? { x: def.parking.x, y: def.parking.y, w: def.parking.width, d: def.parking.height } : null;
    const path = [def.spawn.slice(0, 2)].concat(def.gates.map(p => p.slice(0, 2)));
    return { rings, box, park, path };
  }
  function nextHint(text) { return 'Next: ' + String(text || '').replace(/^Next:\s*/, ''); }
  // DS-4: engine button wording, mini-map preference (off unless explicitly on), floating lesson note fade.
  const NOTE_FADE_MS = 5000;
  function engineChrome(c) { return { text: c && c.engine ? 'Engine ON' : 'Engine OFF', running: !!(c && c.engine) }; }
  function settingsFrom(stored) {
    const s = Object.assign({ auto: false, side: 'left', muted: false, route: 1, minimap: false }, stored || {});
    s.minimap = s.minimap === true;
    return s;
  }
  function showMinimap(prefs, flat) { return !!flat || !!(prefs && prefs.minimap); }
  function noteFaded(shownAt, now, held, ms = NOTE_FADE_MS) { return !held && (now - shownAt) >= ms; }
  return { WHEEL_MAX_DEG, SPEEDO_MAX, TACHO_MAX, NOTE_FADE_MS, wheelAngle, pointerAngle, angleDelta, dragSteer, nearHub,
    needleAngle, speedKmh, gearLabel, gateSlots, gateSlotFor, toScene, axes, driverSide, driverCamera, rearMirrorCamera,
    sideMirrorCamera, cameraFrame, viewportFromRect, renderPixelRatio, isPortrait, lotLayout, townLayout, lessonMarkers, nextHint,
    engineChrome, settingsFrom, showMinimap, noteFaded };
});
