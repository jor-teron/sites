/*
  File: tests.js
  Project: devbench
  Role: Test registry. One entry per test: id, tab (speed / games / ai), name, desc,
  extra (true = only in Settings, not in Run all) and run(ctx) -> result object with .text.
  ctx = { progress(0..1), stage (div for visual tests) }. Engines live in their own files.
*/

/* Number with grouped digits and fixed decimals. */
function devbenchFmt(value, digits) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

window.DEVBENCH_TESTS = [
  { id: "cpu", tab: "speed", name: "CPU", desc: "All cores, 2 s maths loop. Operations per second.",
    run: async function (c) {
      var r = await window.DevbenchCpu.run(c.progress);
      r.text = r.cores + " cores · " + devbenchFmt(r.opsPerSec / 1e6, 0) + " M ops/s"; return r;
    } },
  { id: "gpu", tab: "speed", name: "GPU fill rate", desc: "Blended full-screen layers for 2 s, not capped by the screen refresh.",
    run: async function (c) {
      var r = await window.DevbenchGpu.run(document.getElementById("gpu-canvas"), c.progress);
      r.text = devbenchFmt(r.mpixPerSec, 0) + " Mpix/s · " + devbenchFmt(r.fillsPer60HzFrame, 0) + " layers per 60 Hz frame"; return r;
    } },
  { id: "mem", tab: "speed", name: "Memory", desc: "32 MB copy and read, best of 3.",
    run: async function (c) {
      var r = await window.DevbenchMemory.run(c.progress);
      r.text = "copy " + devbenchFmt(r.copyGBps, 1) + " GB/s · read " + devbenchFmt(r.readGBps, 1) + " GB/s"; return r;
    } },
  { id: "js", tab: "speed", name: "JavaScript", desc: "Sort, JSON, regex and DOM work for 2 s.",
    run: async function (c) {
      var r = await window.DevbenchJs.run(c.progress);
      r.text = devbenchFmt(r.roundsPerSec, 2) + " rounds/s · " + devbenchFmt(r.msPerRound, 0) + " ms/round"; return r;
    } },
  { id: "disk", tab: "speed", name: "Disk", desc: "16 MB write then read in private browser storage.",
    run: async function (c) {
      var r = await window.DevbenchDisk.run(c.progress);
      r.text = "write " + devbenchFmt(r.writeMBps, 0) + " MB/s · read " + devbenchFmt(r.readMBps, 0) + " MB/s"; return r;
    } },
  { id: "jpeg", tab: "speed", name: "JPEG", desc: "3 MP photo encode and decode, average of 3.",
    run: async function (c) {
      var r = await window.DevbenchMedia.jpeg(c.progress);
      r.text = "encode " + devbenchFmt(r.encMs, 0) + " ms · decode " + devbenchFmt(r.decMs, 0) + " ms"; return r;
    } },
  { id: "ping", tab: "speed", name: "Ping", desc: "5 tiny requests to this site and the PeerJS server.",
    run: async function (c) {
      var r = await window.DevbenchNet.ping(c.progress);
      var f = function (x) { return x ? "min " + devbenchFmt(x.min, 0) + " ms" : "unreachable"; };
      r.text = "site " + f(r.own) + " · PeerJS " + f(r.peer); return r;
    } },
  { id: "sprites", tab: "games", name: "2D sprites", desc: "Moving sprites until it drops under 30 fps (~4 s).",
    run: async function (c) {
      var r = await window.DevbenchSprites.run(c.stage, c.progress);
      r.text = devbenchFmt(r.maxSprites, 0) + " sprites at 30 fps"; return r;
    } },
  { id: "tris", tab: "games", name: "3D triangles", desc: "Raw WebGL triangles for 2 s (no Three.js).",
    run: async function (c) {
      var r = await window.DevbenchTris.run(c.stage, c.progress);
      r.text = devbenchFmt(r.trisPerFrame30 / 1e6, 2) + " M triangles per frame at 30 fps"; return r;
    } },
  { id: "aimat", tab: "ai", name: "Matrix maths (JS)", desc: "256×256 matmul in a background worker, best of 3.",
    run: async function (c) {
      var r = await window.DevbenchAi.matmul(c.progress);
      r.text = "FP32 " + devbenchFmt(r.f32Gflops, 2) + " GFLOPS · integer arrays " + devbenchFmt(r.intGops, 2) + " GOPS"; return r;
    } },
  { id: "wasm", tab: "ai", name: "WebAssembly", desc: "Tiny hand-written WASM loop vs the same JS loop.",
    run: async function (c) {
      var r = await window.DevbenchAi.wasm(c.progress);
      r.text = r.supported ? "WASM " + devbenchFmt(r.wasmMops, 0) + " Mops/s · JS " + devbenchFmt(r.jsMops, 0) + " · " + devbenchFmt(r.ratio, 1) + "× faster" : "Not supported";
      return r;
    } },
  { id: "webgpu", tab: "ai", name: "WebGPU matmul", desc: "512×512 matmul on the GPU, checked against the CPU.",
    run: async function (c) {
      var r = await window.DevbenchAiGpu.run(c.progress);
      r.text = r.supported ? devbenchFmt(r.gflops, 1) + " GFLOPS · " + (r.ok ? "result correct ✓" : "result mismatch ✗") : "Not supported (" + r.why + ")";
      return r;
    } },
  { id: "sustained", tab: "ai", extra: true, name: "Sustained (15 s)", desc: "FP32 matmul in the worker for 15 s; chart shows throttling.",
    run: async function (c) {
      var cv = document.createElement("canvas"); cv.className = "chart"; c.stage.replaceChildren(cv);
      var pts = [];
      var r = await window.DevbenchAi.sustained(15, c.progress, function (v) { pts.push(v); window.DevbenchChart.draw(cv, pts); });
      window.DevbenchChart.draw(cv, r.samples);
      r.text = "avg " + devbenchFmt(r.avg, 2) + " GFLOPS · drop " + devbenchFmt(Math.max(0, r.dropPct), 0) + "% first → last second"; return r;
    } },
  { id: "video", tab: "speed", extra: true, name: "Video", desc: "WebCodecs encode + decode, 60 frames at 720p.",
    run: async function (c) {
      var r = await window.DevbenchMedia.video(c.progress);
      r.text = !r.supported ? "Not supported" : r.codec + " · encode " + devbenchFmt(r.encFps, 0) + " fps · " +
        (r.decFps == null ? "decode not supported" : "decode " + devbenchFmt(r.decFps, 0) + " fps");
      return r;
    } },
  { id: "download", tab: "speed", extra: true, name: "Download speed", desc: "Uses ~12 MB of data.",
    run: async function (c) {
      var r = await window.DevbenchNet.download(c.progress);
      r.text = devbenchFmt(r.mbps, 1) + " Mbps · " + devbenchFmt(r.mb, 1) + " MB used"; return r;
    } }
];
