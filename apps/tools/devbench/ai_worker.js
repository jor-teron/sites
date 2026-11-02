/*
  File: ai_worker.js
  Project: devbench
  Role: Background worker for the light AI tests (keeps the page smooth).
  Messages in:  { id, cmd: "matmul", n, kind: "f32" | "int" }  -> best-of-3 matmul after one warm-up
                { id, cmd: "wasm" }                             -> tiny hand-written WASM loop vs the same JS loop
                { id, cmd: "sustained", n, seconds }            -> repeated matmuls, one GFLOPS sample per second
  Messages out: { id, progress } while running, then { id, result } or { id, error }.
  No libraries, no downloads.
*/

/* C = A * B, FP32, ikj loop order. Own function per type so the JIT sees one array type. */
function matmulF32(a, b, n) {
  var c = new Float32Array(n * n);
  for (var i = 0; i < n; i++) {
    for (var k = 0; k < n; k++) {
      var aik = a[i * n + k];
      for (var j = 0; j < n; j++) { c[i * n + j] += aik * b[k * n + j]; }
    }
  }
  return c;
}

/* Same loop with Int8Array inputs and an Int32Array result (JS still uses normal numbers). */
function matmulInt(a, b, n) {
  var c = new Int32Array(n * n);
  for (var i = 0; i < n; i++) {
    for (var k = 0; k < n; k++) {
      var aik = a[i * n + k];
      for (var j = 0; j < n; j++) { c[i * n + j] += aik * b[k * n + j]; }
    }
  }
  return c;
}

/* Random inputs plus a ready-to-call work function. */
function makeWork(kind, n) {
  var isInt = kind === "int";
  var a = isInt ? new Int8Array(n * n) : new Float32Array(n * n);
  var b = isInt ? new Int8Array(n * n) : new Float32Array(n * n);
  for (var i = 0; i < a.length; i++) {
    a[i] = isInt ? Math.floor(Math.random() * 21) - 10 : Math.random() * 2 - 1;
    b[i] = isInt ? Math.floor(Math.random() * 21) - 10 : Math.random() * 2 - 1;
  }
  return isInt ? function () { return matmulInt(a, b, n); } : function () { return matmulF32(a, b, n); };
}

/* Warm-up once, then best of 3. Returns ms and GOPS (2 n^3 ops per matmul). */
function benchMatmul(id, n, kind) {
  var work = makeWork(kind, n);
  work();
  var best = Infinity;
  for (var r = 0; r < 3; r++) {
    var t = performance.now(); work(); best = Math.min(best, performance.now() - t);
    self.postMessage({ id: id, progress: (r + 1) / 3 });
  }
  return { n: n, kind: kind, ms: best, gops: (2 * n * n * n) / (best / 1000) / 1e9 };
}

/*
  Hand-written WASM module, 74 bytes:
  (func (export "run") (param $n i32) (param $a f32) (result f32) (local $x f32)
    loop until $n == 0: $x = $x * $a + 1.0; $n = $n - 1)  -> returns $x
*/
var WASM_BYTES = new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,125,1,125,3,2,1,0,7,7,1,3,114,117,110,0,0,
  10,41,1,39,1,1,125,2,64,3,64,32,0,69,13,1,32,2,32,1,148,67,0,0,128,63,146,33,2,32,0,65,1,107,33,0,12,0,11,11,32,2,11]);

/* The same loop in plain JS with float32 rounding, for comparison. */
function jsLoop(n, a) {
  var x = 0;
  for (var i = 0; i < n; i++) { x = Math.fround(Math.fround(x * a) + 1); }
  return x;
}

/* Best of 3 for one loop function; Mops = 2 ops (mul + add) per iteration. */
function bestLoop(fn, iters) {
  fn(iters / 50, 0.5);
  var best = Infinity;
  for (var r = 0; r < 3; r++) { var t = performance.now(); fn(iters, 0.5); best = Math.min(best, performance.now() - t); }
  return { ms: best, mops: (2 * iters) / (best / 1000) / 1e6 };
}

/* WASM vs JS loop, 5 M iterations each. */
function benchWasm(id) {
  if (typeof WebAssembly !== "object") { return { supported: false }; }
  var run = new WebAssembly.Instance(new WebAssembly.Module(WASM_BYTES)).exports.run;
  var iters = 5000000;
  var w = bestLoop(run, iters);
  self.postMessage({ id: id, progress: 0.5 });
  var j = bestLoop(jsLoop, iters);
  return { supported: true, wasmMops: w.mops, jsMops: j.mops, ratio: w.mops / j.mops };
}

/* Repeated FP32 matmuls for `seconds`; one GFLOPS sample per second (for the throttling chart). */
function benchSustained(id, n, seconds) {
  var work = makeWork("f32", n);
  var ops = 2 * n * n * n, samples = [], start = performance.now(), slotStart = start, slotOps = 0;
  work();
  while (performance.now() - start < seconds * 1000) {
    work(); slotOps += ops;
    var now = performance.now();
    if (now - slotStart >= 1000) {
      samples.push(slotOps / ((now - slotStart) / 1000) / 1e9);
      self.postMessage({ id: id, progress: Math.min(1, (now - start) / (seconds * 1000)), sample: samples[samples.length - 1] });
      slotStart = now; slotOps = 0;
    }
  }
  var first = samples[0] || 0, last = samples[samples.length - 1] || 0;
  var avg = samples.reduce(function (s, v) { return s + v; }, 0) / Math.max(1, samples.length);
  return { n: n, seconds: seconds, samples: samples, avg: avg, first: first, last: last, dropPct: first ? (1 - last / first) * 100 : 0 };
}

self.onmessage = function (e) {
  var d = e.data;
  try {
    var result = d.cmd === "matmul" ? benchMatmul(d.id, d.n, d.kind)
      : d.cmd === "wasm" ? benchWasm(d.id)
      : d.cmd === "sustained" ? benchSustained(d.id, d.n, d.seconds)
      : null;
    if (!result) { throw new Error("unknown cmd " + d.cmd); }
    self.postMessage({ id: d.id, result: result });
  } catch (err) {
    self.postMessage({ id: d.id, error: String(err && err.message || err) });
  }
};
