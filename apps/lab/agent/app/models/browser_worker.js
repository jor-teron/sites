/* Agent — app/models/browser_worker.js: module Web Worker for the built-in Browser model (AG2).
   Owns Agent's own vendored Transformers.js 3.7.0 (vendor/transformers-3.7.0 + the plain ORT 1.22-dev wasm, 1 thread)
   and runs Story Mini = onnx-community/TinyStories-3M-ONNX (q8, ~20.6 MB) on wasm. Files are cached in Agent's own
   Cache API store 'agent-browser-model'. In: {type:'load'} | {type:'gen', prompt, max, temp}.
   Out: progress{loaded,total} | ready | token{text} | done{count,ms} | error{msg}. Stop = the page terminates this worker
   (wasm inference never yields, so a stop message could not be read mid-run). */
import { pipeline, TextStreamer, env } from '../../vendor/transformers-3.7.0/transformers.min.js';

const ID = 'onnx-community/TinyStories-3M-ONNX', CACHE = 'agent-browser-model';
let pipe = null, loading = null;

env.allowLocalModels = false;
env.useBrowserCache = false;                       // not the shared 'transformers-cache'; ours is set in load()
const V = new URL('../../vendor/transformers-3.7.0/', import.meta.url).href;
// the plain (non-WebGPU) ORT wasm: half the size of the bundled .jsep build and ~10 MB less memory; wasm EP only
env.backends.onnx.wasm.wasmPaths = { mjs: V + 'ort-wasm-simd-threaded.mjs', wasm: V + 'ort-wasm-simd-threaded.wasm' };
env.backends.onnx.wasm.numThreads = 1;             // no SharedArrayBuffer needed; keeps memory low

function post(m) { self.postMessage(m); }

async function open() {
  try { env.customCache = await caches.open(CACHE); env.useCustomCache = true; } catch (e) { env.useCustomCache = false; }
  const files = {};
  pipe = await pipeline('text-generation', ID, {
    dtype: 'q8', device: 'wasm', 
    session_options: { enableCpuMemArena: false, enableMemPattern: false },   // smaller peak memory (tablets)
    progress_callback: (e) => {
      if (e.status !== 'progress' || !e.total) return;
      files[e.file] = [e.loaded, e.total];
      let l = 0, t = 0; for (const k in files) { l += files[k][0]; t += files[k][1]; }
      post({ type: 'progress', loaded: l, total: t });
    },
  });
}
function load() { if (pipe) return Promise.resolve(); if (!loading) loading = open().finally(() => { loading = null; }); return loading; }

async function gen(m) {
  await load();
  let count = 0, first = true;
  const streamer = new TextStreamer(pipe.tokenizer, {
    skip_prompt: true, skip_special_tokens: true,
    callback_function: (t) => {
      t = t.replace(/<\|[^|]*\|>/g, '');           // markers the tokenizer does not flag as special
      if (!t) return;
      if (first && /^\w/.test(t) && /\w$/.test(m.prompt)) t = ' ' + t;   // keep the joining space
      first = false; post({ type: 'token', text: t });
    },
    token_callback_function: () => { count++; },
  });
  const t0 = performance.now();
  await pipe(m.prompt, { max_new_tokens: m.max, do_sample: true, temperature: m.temp, top_k: 40, repetition_penalty: 1.1, no_repeat_ngram_size: 3, streamer });
  post({ type: 'done', count, ms: performance.now() - t0 });
}

self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.type === 'load') { await load(); post({ type: 'ready' }); }
    else if (m.type === 'gen') await gen(m);
  } catch (err) { post({ type: 'error', msg: String((err && err.message) || err) }); }
};
