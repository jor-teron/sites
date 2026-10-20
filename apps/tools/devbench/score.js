/*
  File: score.js
  Project: devbench
  Role: One overall score (0–100) and the game verdicts (moved from Browser Bench).
  Each part: 100 = a fast gaming PC (REF), log scale so a phone at 1/10 still gets ~50.
  Exposes window.DevbenchScore.compute(tests) and .verdicts(tests, features).
*/

/* Reference "fast PC" values and weights per part. Rough; calibrate on real devices. */
var DEVBENCH_SCORE_PARTS = [
  { key: "cpu", label: "CPU", w: 2, ref: 400e6, get: function (t) { return t.cpu && t.cpu.opsPerSec; } },
  { key: "gpu", label: "GPU", w: 2, ref: 20000, get: function (t) { return t.gpu && t.gpu.mpixPerSec; } },
  { key: "mem", label: "Memory", w: 1, ref: 20, get: function (t) { return t.mem && t.mem.copyGBps; } },
  { key: "js", label: "JavaScript", w: 2, ref: 20, get: function (t) { return t.js && t.js.roundsPerSec; } },
  { key: "disk", label: "Disk", w: 0.5, ref: 1000, get: function (t) { return t.disk && t.disk.writeMBps; } },
  { key: "sprites", label: "2D", w: 1, ref: 20000, get: function (t) { return t.sprites && t.sprites.maxSprites; } },
  { key: "tris", label: "3D", w: 2, ref: 2e9, get: function (t) { return t.tris && t.tris.trisPerSec; } },
  { key: "aimat", label: "AI (JS)", w: 1, ref: 3, get: function (t) { return t.aimat && t.aimat.f32Gflops; } },
  { key: "wasm", label: "WASM", w: 1, ref: 1500, get: function (t) { return t.wasm && t.wasm.wasmMops; } },
  { key: "webgpu", label: "AI (GPU)", w: 1, ref: 500, get: function (t) { return t.webgpu && t.webgpu.supported ? t.webgpu.gflops : t.webgpu ? 0 : null; } }
];

/* 0..100 for value v against ref (log base 100 of 1 + 99·v/ref). */
function devbenchPart(v, ref) {
  return Math.max(0, Math.min(100, 100 * Math.log(1 + 99 * Math.max(0, v) / ref) / Math.log(100)));
}

function devbenchComputeScore(tests) {
  var parts = {}, sum = 0, w = 0;
  DEVBENCH_SCORE_PARTS.forEach(function (p) {
    var v = p.get(tests);
    if (v == null || isNaN(v)) { return; }
    parts[p.key] = Math.round(devbenchPart(v, p.ref));
    sum += parts[p.key] * p.w; w += p.w;
  });
  return w ? { overall: Math.round(sum / w), parts: parts } : null;
}

/*
  Verdicts for our games. Raw flat triangles are much cheaper than lit Three.js meshes,
  so the 3D estimate uses a quarter of the raw rate.
*/
function devbenchVerdicts(tests, f) {
  var v = [];
  f = f || {};
  var tris = tests.tris ? tests.tris.trisPerFrame30 / 4 : null;
  if (!f.webgl1) { v.push(["Browser FPS", "no", "No WebGL — cannot run."]); }
  else if (tris == null) { v.push(["Browser FPS", "warn", "Run the 3D triangles test."]); }
  else if (tris >= 1e6) { v.push(["Browser FPS", "ok", "Runs well at 30 fps, room for higher detail."]); }
  else if (tris >= 3e5) { v.push(["Browser FPS", "ok", "Runs well at 30 fps."]); }
  else if (tris >= 1e5) { v.push(["Browser FPS", "warn", "Playable on low settings / fewer enemies."]); }
  else { v.push(["Browser FPS", "no", "Likely below 30 fps."]); }
  var sp = tests.sprites ? tests.sprites.maxSprites : null;
  var cores = navigator.hardwareConcurrency || 2;
  if (sp == null) { v.push(["AoE RTS", "warn", "Run the 2D sprites test."]); }
  else if (sp >= 3000 && cores >= 4) { v.push(["AoE RTS", "ok", "Runs smoothly, even on big maps."]); }
  else if (sp >= 800) { v.push(["AoE RTS", "warn", "Playable; big maps may slow down."]); }
  else { v.push(["AoE RTS", "no", "Likely to stutter."]); }
  var weak = tris != null && tris < 1e5;
  if (f.webxrAR) { v.push(["AR game", weak ? "warn" : "ok", "Full AR supported (Pet, Zombie, Ghost)." + (weak ? " GPU is weak — keep waves small." : "")]); }
  else if (f.camera && f.deviceOrientation) { v.push(["AR game", "warn", "No real AR: camera + tilt mode (Zombie, Ghost). Pet needs AR."]); }
  else { v.push(["AR game", "no", "No AR and no camera/tilt support."]); }
  return v.map(function (x) { return { game: x[0], level: x[1], note: x[2] }; });
}

window.DevbenchScore = { compute: devbenchComputeScore, verdicts: devbenchVerdicts, parts: DEVBENCH_SCORE_PARTS };
