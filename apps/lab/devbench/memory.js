/*
  File: memory.js
  Project: devbench
  Role: Memory speed test. 64 MB buffer copy and sequential read.
  Exposes window.DevbenchMemory.run(onProgress) -> { copyGBps, readGBps }.
*/

/* Buffer size in bytes. 64 MB. */
const DEVBENCH_MEM_BYTES = 64 * 1024 * 1024;

/* Repeat count. Best pass is reported. */
const DEVBENCH_MEM_PASSES = 5;

/* Copy a buffer and sum it, timing each pass. */
async function devbenchMemRun(onProgress) {
  var src = new Float64Array(DEVBENCH_MEM_BYTES / 8);
  var dst = new Float64Array(DEVBENCH_MEM_BYTES / 8);
  for (var i = 0; i < src.length; i++) { src[i] = i & 1023; }
  var gb = DEVBENCH_MEM_BYTES / 1e9;
  var bestCopy = 0, bestRead = 0, sink = 0;
  for (var p = 0; p < DEVBENCH_MEM_PASSES; p++) {
    var t0 = performance.now();
    dst.set(src);
    var t1 = performance.now();
    var sum = 0;
    for (var j = 0; j < dst.length; j++) { sum += dst[j]; }
    var t2 = performance.now();
    sink += sum;
    /* Copy moves read + write, so count bytes twice. */
    bestCopy = Math.max(bestCopy, (2 * gb) / Math.max(0.001, (t1 - t0) / 1000));
    bestRead = Math.max(bestRead, gb / Math.max(0.001, (t2 - t1) / 1000));
    onProgress((p + 1) / DEVBENCH_MEM_PASSES);
    await new Promise(function (r) { setTimeout(r, 0); });
  }
  window.devbenchMemSink = sink;
  return { copyGBps: bestCopy, readGBps: bestRead };
}

window.DevbenchMemory = { run: devbenchMemRun };
