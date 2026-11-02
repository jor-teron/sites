/*
  File: ai_gpu.js
  Project: devbench
  Role: Tiny WebGPU compute check: 512×512 FP32 matmul (naive WGSL), best of 3 batches of 4,
  plus a correctness check of two result cells against the CPU. Skips cleanly without WebGPU.
  Exposes window.DevbenchAiGpu.run(onProgress) -> { supported, gflops, ms, ok, adapter }.
*/

var DEVBENCH_WGPU_N = 512;

/* WGSL: one thread per output cell. */
var DEVBENCH_WGPU_SHADER = [
  "@group(0) @binding(0) var<storage, read> a: array<f32>;",
  "@group(0) @binding(1) var<storage, read> b: array<f32>;",
  "@group(0) @binding(2) var<storage, read_write> c: array<f32>;",
  "@compute @workgroup_size(8, 8)",
  "fn main(@builtin(global_invocation_id) g: vec3u) {",
  "  let n = " + DEVBENCH_WGPU_N + "u;",
  "  if (g.x >= n || g.y >= n) { return; }",
  "  var s = 0.0;",
  "  for (var k = 0u; k < n; k++) { s += a[g.y * n + k] * b[k * n + g.x]; }",
  "  c[g.y * n + g.x] = s;",
  "}"
].join("\n");

/* Resolve p, or fallback after ms (some browsers never settle requestAdapter). */
function devbenchWithin(p, ms, fallback) {
  return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(fallback); }, ms); })]);
}

/* Upload a Float32Array to a new storage buffer. */
function devbenchWgpuBuffer(device, data, usage) {
  var buf = device.createBuffer({ size: data.byteLength, usage: usage, mappedAtCreation: true });
  new Float32Array(buf.getMappedRange()).set(data);
  buf.unmap();
  return buf;
}

async function devbenchWgpuRun(onProgress) {
  if (!navigator.gpu) { return { supported: false, why: "no navigator.gpu" }; }
  var adapter = await devbenchWithin(navigator.gpu.requestAdapter().catch(function () { return null; }), 3000, null);
  if (!adapter) { return { supported: false, why: "no adapter" }; }
  var device = await adapter.requestDevice();
  try {
    var n = DEVBENCH_WGPU_N, size = n * n;
    var A = new Float32Array(size), B = new Float32Array(size);
    for (var i = 0; i < size; i++) { A[i] = Math.random() * 2 - 1; B[i] = Math.random() * 2 - 1; }
    var S = GPUBufferUsage.STORAGE;
    var a = devbenchWgpuBuffer(device, A, S), b = devbenchWgpuBuffer(device, B, S);
    var c = device.createBuffer({ size: size * 4, usage: S | GPUBufferUsage.COPY_SRC });
    var read = device.createBuffer({ size: size * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    var pipeline = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: DEVBENCH_WGPU_SHADER }), entryPoint: "main" } });
    var group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: a } }, { binding: 1, resource: { buffer: b } }, { binding: 2, resource: { buffer: c } }] });
    var dispatch = function (reps) {
      var enc = device.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, group);
      for (var r = 0; r < reps; r++) { pass.dispatchWorkgroups(n / 8, n / 8); }
      pass.end(); device.queue.submit([enc.finish()]);
      return device.queue.onSubmittedWorkDone();
    };
    await dispatch(1); /* warm-up: pipeline compile */
    onProgress(0.2);
    var best = Infinity, REPS = 4;
    for (var t = 0; t < 3; t++) {
      var t0 = performance.now(); await dispatch(REPS); best = Math.min(best, (performance.now() - t0) / REPS);
      onProgress(0.2 + 0.25 * (t + 1));
    }
    /* Check two cells against the CPU. */
    var enc = device.createCommandEncoder(); enc.copyBufferToBuffer(c, 0, read, 0, size * 4); device.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    var C = new Float32Array(read.getMappedRange().slice(0)); read.unmap();
    var cpu = function (row, col) { var s = 0; for (var k = 0; k < n; k++) { s += A[row * n + k] * B[k * n + col]; } return s; };
    var ok = Math.abs(C[0] - cpu(0, 0)) < 0.01 && Math.abs(C[size - 1] - cpu(n - 1, n - 1)) < 0.01;
    onProgress(1);
    var info = adapter.info || {};
    return { supported: true, n: n, ms: best, gflops: (2 * n * n * n) / (best / 1000) / 1e9, ok: ok,
      adapter: [info.vendor, info.architecture].filter(Boolean).join(" ") || "unknown" };
  } finally {
    device.destroy();
  }
}

window.DevbenchAiGpu = { run: devbenchWgpuRun };
