/*
  File: story_model.js
  Project: Story
  Description: Page-side client for story_worker.js. Model catalogue,
               lazy load (one model at a time), streamed generation, stop.
*/
export const MODELS = {
  lite: { id: "onnx-community/TinyStories-656K-ONNX", label: "Lite" }, // ~1 MB q8
  mini: { id: "onnx-community/TinyStories-3M-ONNX", label: "Mini" },   // ~20 MB q8
  pro:  { id: "Xenova/llama2.c-stories42M", label: "Pro" },            // ~44 MB q8
};

let worker = null;
let loadWait = null;   // { key, promise, resolve, reject, listeners:Set }
let gen = null;        // { onToken, resolve, reject }
let loadTimer = null;
let crashHook = null;
const LOAD_IDLE_MS = 90000;   // fail a load that shows no progress for this long

/** Register a callback run after the worker crashes (it is respawned empty). */
export function onCrash(fn) { crashHook = fn; }

function clearLoadTimer() { if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; } }
function armLoadTimer() {
  clearLoadTimer();
  loadTimer = setTimeout(() => fail("model load timed out"), LOAD_IDLE_MS);
}
function settleLoad(err) {
  clearLoadTimer();
  const w = loadWait; loadWait = null;
  if (w) err ? w.reject(err) : w.resolve();
}

function onMsg(e) {
  const m = e.data;
  if (m.type === "progress" && loadWait && loadWait.key === m.key) {
    armLoadTimer();
    loadWait.listeners.forEach((f) => f && f(m.pct));
  }
  else if (m.type === "ready" && loadWait && loadWait.key === m.key) settleLoad();
  else if (m.type === "token" && gen) gen.onToken(m.text, m.count);
  else if (m.type === "done" && gen) { gen.resolve(m); gen = null; }
  else if (m.type === "error") {
    if (m.key !== undefined) { if (loadWait && loadWait.key === m.key) settleLoad(new Error(m.msg)); }
    else if (gen) { gen.reject(new Error(m.msg)); gen = null; }
  }
}

/** Worker died or sent something unreadable: reject everything pending and start fresh. */
function fail(msg) {
  const err = new Error(msg);
  if (gen) { gen.reject(err); gen = null; }
  settleLoad(err);
  if (worker) worker.terminate();
  worker = null;   // respawned lazily on the next load, so a dead CDN can't loop
  if (crashHook) crashHook(err);
}

function spawn() {
  worker = new Worker(new URL("./story_worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onMsg;
  worker.onerror = (e) => { e.preventDefault && e.preventDefault(); fail(`story worker crashed: ${e.message || "script failed to load (offline?)"}`); };
  worker.onmessageerror = () => fail("story worker sent an unreadable message");
}
spawn();
function live() { if (!worker) spawn(); return worker; }

/** Load model key in the worker. Resolves when ready. Reuses an in-flight load of the same key. */
export function loadModel(key, onProgress) {
  if (loadWait && loadWait.key === key) { loadWait.listeners.add(onProgress); return loadWait.promise; }
  if (loadWait) settleLoad(new Error("superseded"));
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  loadWait = { key, promise, resolve, reject, listeners: new Set([onProgress]) };
  armLoadTimer();
  live().postMessage({ type: "load", key, id: MODELS[key].id });
  return promise;
}

/** Stream a continuation; onToken(chunk, tokenCount) per piece. Resolves {text,tps}. */
export function generate(prompt, opts, onToken) {
  return new Promise((resolve, reject) => {
    gen = { onToken, resolve, reject };
    live().postMessage({ type: "generate", prompt, opts: { maxTokens: opts.maxTokens, temperature: opts.temperature } });
  });
}

/**
 * Stop now. WASM inference doesn't yield between tokens, so a "stop" message
 * would only arrive at the end; instead kill the worker and start a fresh one.
 * The model must be loaded again (from browser cache, no re-download).
 */
export function stop() {
  if (worker) worker.terminate();
  spawn();
  if (gen) { gen.resolve({ stopped: true, tps: 0 }); gen = null; }
  settleLoad(new Error("superseded"));
}
