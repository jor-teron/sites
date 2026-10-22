/*
  File: network.js
  Project: devbench
  Role: Network ping (own site + PeerJS server) and download speed.
  Exposes window.DevbenchNet.ping(onProgress) and .download(onProgress).
  Download is only run from its own button, never from Run all.
*/

/* Ping count per target. */
const DEVBENCH_PING_RUNS = 5;

/* Medium same-origin file fetched several times for the speed test (~3.9 MB). */
const DEVBENCH_DL_FILE = "../../office/ocr/vendor/tesseract-core-lstm.wasm.js";
const DEVBENCH_DL_REPEAT = 3;
const DEVBENCH_DL_MB_APPROX = 12;

/* Own site when served over http(s), else the public Pages site. */
function devbenchOwnUrl() {
  return /^https?:$/.test(location.protocol) ? location.origin + "/" : "https://jor-teron.github.io/sites/";
}

/* Time small no-cache fetches against one URL. */
async function devbenchPingOne(url, opaque) {
  var times = [];
  for (var i = 0; i < DEVBENCH_PING_RUNS; i++) {
    var u = url + (url.indexOf("?") < 0 ? "?" : "&") + "pb=" + Date.now() + i;
    var t0 = performance.now();
    try {
      await fetch(u, { method: opaque ? "GET" : "HEAD", mode: opaque ? "no-cors" : "cors", cache: "no-store" });
      times.push(performance.now() - t0);
    } catch (err) { /* count as lost */ }
  }
  if (!times.length) { return null; }
  /* First hit includes DNS/TLS; still counted in avg, min shows the steady value. */
  var sum = times.reduce(function (a, b) { return a + b; }, 0);
  return { min: Math.min.apply(null, times), avg: sum / times.length, lost: DEVBENCH_PING_RUNS - times.length };
}

/* Ping both targets. */
async function devbenchPingRun(onProgress) {
  var own = await devbenchPingOne(devbenchOwnUrl(), false);
  onProgress(0.5);
  var peer = await devbenchPingOne("https://0.peerjs.com/", true);
  onProgress(1);
  return { own: own, peer: peer };
}

/* Fetch the medium file several times and measure throughput. */
async function devbenchDownloadRun(onProgress) {
  var bytes = 0, t0 = performance.now();
  for (var i = 0; i < DEVBENCH_DL_REPEAT; i++) {
    var res = await fetch(DEVBENCH_DL_FILE + "?dl=" + Date.now() + i, { cache: "no-store" });
    if (!res.ok) { throw new Error("Download file missing (" + res.status + ")"); }
    var buf = await res.arrayBuffer();
    bytes += buf.byteLength;
    onProgress((i + 1) / DEVBENCH_DL_REPEAT);
  }
  var sec = (performance.now() - t0) / 1000;
  return { mbps: (bytes * 8) / 1e6 / sec, mb: bytes / 1e6, sec: sec };
}

window.DevbenchNet = { ping: devbenchPingRun, download: devbenchDownloadRun, approxMB: DEVBENCH_DL_MB_APPROX };
