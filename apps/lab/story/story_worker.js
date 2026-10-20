/*
  File: story_worker.js
  Project: Story
  Description: Web Worker that owns transformers.js 3.7.0. Loads one model at
               a time and streams tokens back with postMessage so the page
               keeps painting. Messages in: load{key,id} | generate{prompt,opts}. Stop = the page terminates the worker
               (WASM inference never yields, so a stop message could not be handled mid-run).
               Messages out: progress{key,pct} | ready{key} | token{text,count} |
               done{text,tps} | error{msg}.
*/
import { pipeline, TextStreamer } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.0";

let pipe = null, pipeKey = null, loadingKey = null;
let generating = false, staleDispose = [];   // pipes replaced mid-generate, disposed after it

async function load(key, id) {
  if (pipeKey === key && pipe) { loadingKey = null; return self.postMessage({ type: "ready", key }); }
  if (loadingKey === key) return;   // same model already loading; its "ready" will answer
  loadingKey = key;
  const files = {};
  try {
    const p = await pipeline("text-generation", id, {
      dtype: "q8", device: "wasm",
      progress_callback: (e) => {
        if (e.status === "progress" && e.total) {
          files[e.file] = [e.loaded, e.total];
          let l = 0, t = 0;
          for (const [a, b] of Object.values(files)) { l += a; t += b; }
          self.postMessage({ type: "progress", key, pct: Math.round((l / t) * 100) });
        }
      },
    });
    if (loadingKey !== key) { try { await p.dispose(); } catch {} return; }  // superseded
    loadingKey = null;
    if (pipe) { if (generating) staleDispose.push(pipe); else { try { await pipe.dispose(); } catch {} } }
    pipe = p; pipeKey = key;
    self.postMessage({ type: "ready", key });
  } catch (err) {
    if (loadingKey === key) loadingKey = null;
    self.postMessage({ type: "error", key, msg: String(err && err.message || err) });
  }
}

async function generate(prompt, opts) {
  if (!pipe) return self.postMessage({ type: "error", msg: "model not loaded" });
  const cur = pipe; generating = true;
  let text = "", count = 0, t0 = 0;
  const streamer = new TextStreamer(cur.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk) => {
      if (!t0) t0 = performance.now();
      chunk = chunk.replace(/<\|[^|]*\|>/g, "");   // e.g. <|end_story|> not marked special
      if (!chunk) return;
      if (!text && /^\w/.test(chunk)) chunk = " " + chunk;   // llama tokenizer drops the joining space
      text += chunk;
      self.postMessage({ type: "token", text: chunk, count });   // count = tokens generated so far
    },
    token_callback_function: () => { count++; },
  });
  const start = performance.now();
  try {
    await cur(prompt, {
      max_new_tokens: opts.maxTokens, min_new_tokens: Math.min(80, opts.maxTokens),
      do_sample: true, temperature: opts.temperature,
      top_k: 40, repetition_penalty: 1.1, no_repeat_ngram_size: 3, streamer,
    });
    const sec = (performance.now() - start) / 1000;
    self.postMessage({ type: "done", text, tps: sec > 0 ? count / sec : 0 });
  } catch (err) {
    self.postMessage({ type: "error", msg: String(err && err.message || err) });
  } finally {
    generating = false;
    const old = staleDispose; staleDispose = [];
    for (const q of old) { try { await q.dispose(); } catch {} }
  }
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "load") load(m.key, m.id);
  else if (m.type === "generate") generate(m.prompt, m.opts);
};
