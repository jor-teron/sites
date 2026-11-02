/*
  File: ai.js
  Project: devbench
  Role: Page side of the light AI tests. Talks to ai_worker.js (one shared worker) and
  exposes window.DevbenchAi.matmul(onProgress), .wasm(onProgress), .sustained(seconds, onProgress, onSample).
  The WebGPU check lives in ai_gpu.js.
*/

var devbenchAiWorker = null;
var devbenchAiSeq = 0;
var devbenchAiPending = {};

/* Start the worker on first use. Workers need http(s); file:// pages get a clear error. */
function devbenchAiGetWorker() {
  if (devbenchAiWorker) { return devbenchAiWorker; }
  devbenchAiWorker = new Worker("ai_worker.js");
  devbenchAiWorker.onmessage = function (e) {
    var d = e.data, p = devbenchAiPending[d.id];
    if (!p) { return; }
    if (d.progress != null && p.onProgress) { p.onProgress(d.progress); }
    if (d.sample != null && p.onSample) { p.onSample(d.sample); }
    if (d.result) { delete devbenchAiPending[d.id]; p.resolve(d.result); }
    if (d.error) { delete devbenchAiPending[d.id]; p.reject(new Error(d.error)); }
  };
  devbenchAiWorker.onerror = function (err) {
    Object.keys(devbenchAiPending).forEach(function (k) { devbenchAiPending[k].reject(new Error("AI worker failed (open over http)")); });
    devbenchAiPending = {};
    devbenchAiWorker = null;
    if (err && err.preventDefault) { err.preventDefault(); }
  };
  return devbenchAiWorker;
}

/* Send one command; resolves with the worker's result. */
function devbenchAiAsk(msg, onProgress, onSample) {
  return new Promise(function (resolve, reject) {
    var id = ++devbenchAiSeq;
    devbenchAiPending[id] = { resolve: resolve, reject: reject, onProgress: onProgress, onSample: onSample };
    msg.id = id;
    try { devbenchAiGetWorker().postMessage(msg); } catch (err) { delete devbenchAiPending[id]; reject(err); }
  });
}

/* FP32 and integer-array matmul, n = 256, best of 3 each. */
async function devbenchAiMatmul(onProgress) {
  var f = await devbenchAiAsk({ cmd: "matmul", n: 256, kind: "f32" }, function (p) { onProgress(p * 0.5); });
  var i = await devbenchAiAsk({ cmd: "matmul", n: 256, kind: "int" }, function (p) { onProgress(0.5 + p * 0.5); });
  return { f32Gflops: f.gops, f32Ms: f.ms, intGops: i.gops, intMs: i.ms };
}

/* WASM loop vs JS loop. */
function devbenchAiWasm(onProgress) {
  return devbenchAiAsk({ cmd: "wasm" }, onProgress);
}

/* Sustained FP32 matmul (n = 128) for `seconds`, sampling GFLOPS each second. */
function devbenchAiSustained(seconds, onProgress, onSample) {
  return devbenchAiAsk({ cmd: "sustained", n: 128, seconds: seconds }, onProgress, onSample);
}

window.DevbenchAi = { matmul: devbenchAiMatmul, wasm: devbenchAiWasm, sustained: devbenchAiSustained };
