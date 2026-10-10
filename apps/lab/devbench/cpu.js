/*
  File: cpu.js
  Project: devbench
  Role: CPU stress test using one Web Worker per logical core.
  Exposes window.DevbenchCpu.run(onProgress) which resolves to a score object.
*/

/* Logical core count reported by the browser. Minimum 1. */
const DEVBENCH_CPU_CORES = Math.max(1, navigator.hardwareConcurrency || 1);

/* How long each worker runs the inner loop, in milliseconds. 10 seconds. */
const DEVBENCH_CPU_MS = 10000;

/*
  Worker source as a string so no extra worker file is required.
  The worker burns math until the time budget ends, then posts op count.
*/
const DEVBENCH_CPU_WORKER_SRC = `
  self.onmessage = function (event) {
    var ms = event.data.ms;
    var start = performance.now();
    var ops = 0;
    var x = 0.5;
    while (performance.now() - start < ms) {
      for (var i = 0; i < 20000; i++) {
        x = Math.sin(x) * Math.cos(x) + 1.0000001;
        ops++;
      }
    }
    self.postMessage({ ops: ops });
  };
`;

/*
  Run the CPU stress test.
  onProgress receives 0..1 while workers are in flight.
  Resolves with cores, total ops, seconds, and opsPerSec.
*/
function devbenchRunCpu(onProgress) {
  return new Promise(function (resolve, reject) {
    var blob = new Blob([DEVBENCH_CPU_WORKER_SRC], { type: "text/javascript" });
    var url = URL.createObjectURL(blob);
    var pending = DEVBENCH_CPU_CORES;
    var totalOps = 0;
    var started = performance.now();
    var workers = [];

    if (typeof onProgress === "function") {
      onProgress(0.05);
    }

    for (var n = 0; n < DEVBENCH_CPU_CORES; n++) {
      var worker = new Worker(url);
      workers.push(worker);
      worker.onmessage = function (event) {
        totalOps += event.data.ops;
        pending -= 1;
        if (typeof onProgress === "function") {
          onProgress((DEVBENCH_CPU_CORES - pending) / DEVBENCH_CPU_CORES);
        }
        if (pending === 0) {
          var seconds = (performance.now() - started) / 1000;
          URL.revokeObjectURL(url);
          workers.forEach(function (item) { item.terminate(); });
          resolve({
            cores: DEVBENCH_CPU_CORES,
            ops: totalOps,
            seconds: seconds,
            opsPerSec: totalOps / seconds
          });
        }
      };
      worker.onerror = function (err) {
        URL.revokeObjectURL(url);
        workers.forEach(function (item) { item.terminate(); });
        reject(err);
      };
      worker.postMessage({ ms: DEVBENCH_CPU_MS });
    }
  });
}

/* Public CPU API used by devbench.js. */
window.DevbenchCpu = {
  cores: DEVBENCH_CPU_CORES,
  run: devbenchRunCpu
};
