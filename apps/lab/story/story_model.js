/*
  File: story_model.js
  Project: AI Story
  Description: Page-side client for story_worker.js. Model catalogue,
               lazy load (one model at a time), streamed generation, stop.
*/
export const MODELS = {
  lite: { id: "onnx-community/TinyStories-656K-ONNX", label: "Lite" }, // ~1 MB q8
  mini: { id: "onnx-community/TinyStories-3M-ONNX", label: "Mini" },   // ~20 MB q8
  pro:  { id: "Xenova/llama2.c-stories42M", label: "Pro" },            // ~44 MB q8
};

let worker = null;
let loadWait = null;   // { key, resolve, reject, onProgress }
let gen = null;        // { onToken, resolve, reject }

function onMsg(e) {
  const m = e.data;
  if (m.type === "progress" && loadWait && loadWait.key === m.key) loadWait.onProgress && loadWait.onProgress(m.pct);
  else if (m.type === "ready" && loadWait && loadWait.key === m.key) { loadWait.resolve(); loadWait = null; }
  else if (m.type === "token" && gen) gen.onToken(m.text);
  else if (m.type === "done" && gen) { gen.resolve(m); gen = null; }
  else if (m.type === "error") {
    if (gen) { gen.reject(new Error(m.msg)); gen = null; }
    else if (loadWait) { loadWait.reject(new Error(m.msg)); loadWait = null; }
  }
}
function spawn() {
  worker = new Worker(new URL("./story_worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onMsg;
}
spawn();

/** Load model key in the worker. Resolves when ready. */
export function loadModel(key, onProgress) {
  if (loadWait) loadWait.reject(new Error("superseded"));
  return new Promise((resolve, reject) => {
    loadWait = { key, resolve, reject, onProgress };
    worker.postMessage({ type: "load", key, id: MODELS[key].id });
  });
}

/** Stream a continuation; onToken(chunk) per piece. Resolves {text,tps}. */
export function generate(prompt, opts, onToken) {
  return new Promise((resolve, reject) => {
    gen = { onToken, resolve, reject };
    worker.postMessage({ type: "generate", prompt, opts: { maxTokens: opts.maxTokens, temperature: opts.temperature } });
  });
}

/**
 * Stop now. WASM inference doesn't yield between tokens, so a "stop" message
 * would only arrive at the end; instead kill the worker and start a fresh one.
 * The model must be loaded again (from browser cache, no re-download).
 */
export function stop() {
  worker.terminate(); spawn();
  if (gen) { gen.resolve({ stopped: true, tps: 0 }); gen = null; }
  if (loadWait) { loadWait.reject(new Error("superseded")); loadWait = null; }
}
