/*
  File: story_model.js
  Project: AI Story
  Description: Lazy model loading + streamed generation via transformers.js
               3.0.0 (CDN). Only the selected model is loaded (one at a time,
               to spare phone RAM). Uses q8 weights on WASM for broad support.
*/
const TF_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0";

/** Model catalogue: all real ONNX text-generation repos with tokenizer.json. */
export const MODELS = {
  lite: { id: "onnx-community/TinyStories-656K-ONNX", label: "Lite" },
  mini: { id: "onnx-community/TinyStories-3M-ONNX", label: "Mini" },
  pro:  { id: "onnx-community/IllaryiaStories-1M-ONNX", label: "Pro" },
};

let tf = null;
const cache = {};      // key -> pipeline (only the current one is kept)
let loading = null;    // { key, promise }

/** Load (or reuse) a model. onProgress(pct) during download. */
export async function loadModel(key, onProgress) {
  if (cache[key]) return cache[key];
  if (loading && loading.key === key) return loading.promise;
  const promise = (async () => {
    tf = tf || await import(TF_URL);
    const files = {};
    const pipe = await tf.pipeline("text-generation", MODELS[key].id, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p) => {
        if (p.status === "progress" && p.total) {
          files[p.file] = [p.loaded, p.total];
          let l = 0, t = 0;
          Object.values(files).forEach(([a, b]) => { l += a; t += b; });
          onProgress && onProgress(Math.round((l / t) * 100));
        }
      },
    });
    // free the previous model before keeping this one
    for (const k of Object.keys(cache)) { try { await cache[k].dispose(); } catch {} delete cache[k]; }
    cache[key] = pipe;
    return pipe;
  })();
  loading = { key, promise };
  try { return await promise; } finally { if (loading && loading.promise === promise) loading = null; }
}

/** Stream a continuation of prompt. onText(fullTextSoFar, tokPerSec). Returns final text. */
export async function generate(pipe, prompt, { maxTokens, temperature }, onText) {
  const start = performance.now();
  let text = "", count = 0;
  const streamer = new tf.TextStreamer(pipe.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk) => {
      text += chunk; count++;
      const sec = (performance.now() - start) / 1000;
      onText(text, sec > 0.3 ? count / sec : 0);
    },
  });
  const out = await pipe(prompt, {
    max_new_tokens: maxTokens,
    do_sample: true,
    temperature,
    top_k: 40,
    repetition_penalty: 1.15,
    return_full_text: false,
    streamer,
  });
  const final = (out && out[0] && out[0].generated_text) || text;
  return String(final).trim() || text.trim();
}
