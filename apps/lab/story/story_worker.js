/*
  File: story_worker.js
  Project: AI Story
  Description: Web Worker that owns transformers.js 3.7.0. Loads one model at
               a time and streams tokens back with postMessage so the page
               keeps painting. Messages in: load{key,id} | generate{prompt,opts} | stop (page may also terminate the worker).
               Messages out: progress{key,pct} | ready{key} | token{text} |
               done{text,tps} | error{msg}.
*/
import { pipeline, TextStreamer, InterruptableStoppingCriteria } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.0";

let pipe = null, pipeKey = null, loadingKey = null;
const stopper = new InterruptableStoppingCriteria();

async function load(key, id) {
  if (pipeKey === key && pipe) return self.postMessage({ type: "ready", key });
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
    if (pipe) { try { await pipe.dispose(); } catch {} }
    pipe = p; pipeKey = key;
    self.postMessage({ type: "ready", key });
  } catch (err) {
    self.postMessage({ type: "error", key, msg: String(err && err.message || err) });
  }
}

async function generate(prompt, opts) {
  if (!pipe) return self.postMessage({ type: "error", msg: "model not loaded" });
  stopper.reset();
  let text = "", count = 0, t0 = 0;
  const streamer = new TextStreamer(pipe.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk) => {
      if (!t0) t0 = performance.now();
      chunk = chunk.replace(/<\|[^|]*\|>/g, "");   // e.g. <|end_story|> not marked special
      if (!chunk) return;
      if (!text && /^\w/.test(chunk)) chunk = " " + chunk;   // llama tokenizer drops the joining space
      text += chunk;
      self.postMessage({ type: "token", text: chunk });
    },
    token_callback_function: () => { count++; },
  });
  const start = performance.now();
  try {
    await pipe(prompt, {
      max_new_tokens: opts.maxTokens, min_new_tokens: Math.min(230, opts.maxTokens),  // ~150+ words
      do_sample: true, temperature: opts.temperature,
      top_k: 40, repetition_penalty: 1.1, no_repeat_ngram_size: 3, streamer, stopping_criteria: stopper,
    });
    const sec = (performance.now() - start) / 1000;
    self.postMessage({ type: "done", text, tps: sec > 0 ? count / sec : 0 });
  } catch (err) {
    self.postMessage({ type: "error", msg: String(err && err.message || err) });
  }
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "load") load(m.key, m.id);
  else if (m.type === "generate") generate(m.prompt, m.opts);
  else if (m.type === "stop") stopper.interrupt();
};
