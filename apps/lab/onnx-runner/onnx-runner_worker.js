/*
 * ONNX Runner — Web Worker. Loads ONNX Runtime Web, opens one session, runs it.
 * Messages in:  {type:'load', id, model:ArrayBuffer, backend:'auto'|'webgpu'|'wasm', ortScript, wasmPath}
 *               {type:'run', id, feeds:{name:{type, dims, data:ArrayBuffer}}}
 * Messages out: {type:'loaded', id, backend, inputs:[meta], outputs:[meta]}
 *               {type:'result', id, ms, outputs:{name:{type, dims, data:ArrayBuffer}}}
 *               {type:'error', id, message}
 * Text generation (see generate() below):
 *   in:  {type:'generate', id, ids:[int], opts:{maxNew, ctx, greedy, temperature, topK, topP, repPenalty, eosIds:[int], kv:{heads, headDim}}}
 *        {type:'stop'}  (stops the running generation after the current step)
 *   out: {type:'token', id, token, n, tps}  then  {type:'done', id, reason:'eos'|'max'|'stop', n, ms, tps, kv}
 * meta = {name, type, shape} (shape entries: number, name string, or null; shape null = unknown)
 */
/* global ort */
let session = null;
let loadedOrt = false;
let stopFlag = false;
let inMeta = [];

const ARRAYS = {
  float32: Float32Array, int64: BigInt64Array, int32: Int32Array, bool: Uint8Array,
  uint8: Uint8Array, int8: Int8Array, float16: Uint16Array, float64: Float64Array,
  uint16: Uint16Array, int16: Int16Array, uint32: Uint32Array, uint64: BigUint64Array,
};

function ensureOrt(script, wasmPath) {
  if (loadedOrt) return;
  importScripts(script);
  ort.env.wasm.wasmPaths = wasmPath;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  loadedOrt = true;
}

function meta(list, names) {
  return names.map((name, i) => {
    const m = list && list[i];
    if (m && m.name === name && m.isTensor !== false) return { name, type: m.type || null, shape: Array.isArray(m.shape) ? m.shape.map((d) => (typeof d === 'number' && d >= 0 ? d : (typeof d === 'string' ? d : null))) : null };
    return { name, type: null, shape: null };
  });
}

async function load(msg) {
  ensureOrt(msg.ortScript, msg.wasmPath);
  if (session) { try { await session.release(); } catch (_) { /* old */ } session = null; }
  const want = msg.backend === 'auto' ? (self.navigator && navigator.gpu ? ['webgpu', 'wasm'] : ['wasm']) : [msg.backend];
  let lastErr = null;
  for (const ep of want) {
    try {
      if (ep === 'webgpu' && !(self.navigator && navigator.gpu)) throw new Error('WebGPU is not available in this browser');
      session = await ort.InferenceSession.create(new Uint8Array(msg.model), { executionProviders: [ep], graphOptimizationLevel: 'all' });
      let im = null, om = null;
      try { im = session.inputMetadata; om = session.outputMetadata; } catch (_) { /* not supported */ }
      inMeta = meta(im, session.inputNames);
      postMessage({ type: 'loaded', id: msg.id, backend: ep, inputs: meta(im, session.inputNames), outputs: meta(om, session.outputNames) });
      return;
    } catch (e) { lastErr = e; session = null; }
  }
  throw lastErr || new Error('Could not open the model');
}

async function run(msg) {
  if (!session) throw new Error('No model loaded');
  const feeds = {};
  for (const [name, f] of Object.entries(msg.feeds)) {
    const A = ARRAYS[f.type];
    if (!A) throw new Error('Input "' + name + '": type ' + f.type + ' is not supported');
    feeds[name] = new ort.Tensor(f.type, new A(f.data), f.dims);
  }
  const t0 = performance.now();
  let past = null, pastStart = 0, n = 0, reason = 'max';
  const res = await session.run(feeds);
  const ms = performance.now() - t0;
  const outputs = {};
  const transfer = [];
  for (const name of session.outputNames) {
    const t = res[name];
    let data = t.location && t.location !== 'cpu' ? await t.getData() : t.data;
    if (Array.isArray(data)) data = Float32Array.from(data);   // string tensors are not supported
    const copy = data.slice();
    outputs[name] = { type: t.type, dims: Array.from(t.dims), data: copy.buffer };
    transfer.push(copy.buffer);
  }
  postMessage({ type: 'result', id: msg.id, ms, outputs }, transfer);
}


/* ---------- text generation ---------- */
function sample(logits, off, V, seen, o) {
  const row = new Float32Array(V);
  for (let i = 0; i < V; i++) row[i] = logits[off + i];
  if (o.repPenalty && o.repPenalty !== 1) for (const t of seen) if (t < V) row[t] = row[t] > 0 ? row[t] / o.repPenalty : row[t] * o.repPenalty;
  let best = 0;
  for (let i = 1; i < V; i++) if (row[i] > row[best]) best = i;
  if (o.greedy || !(o.temperature > 0)) return best;
  let idx = Array.from({ length: V }, (_, i) => i).sort((a, b) => row[b] - row[a]);
  if (o.topK > 0) idx = idx.slice(0, o.topK);
  const m = row[idx[0]];
  let p = idx.map((i) => Math.exp((row[i] - m) / o.temperature));
  let sum = p.reduce((a, b) => a + b, 0);
  p = p.map((x) => x / sum);
  if (o.topP > 0 && o.topP < 1) {
    let c = 0, k = 0;
    while (k < p.length && c < o.topP) c += p[k++];
    idx = idx.slice(0, k); p = p.slice(0, k);
    sum = p.reduce((a, b) => a + b, 0); p = p.map((x) => x / sum);
  }
  let r = Math.random();
  for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) return idx[i]; }
  return idx[idx.length - 1];
}

const i64 = (arr) => BigInt64Array.from(arr, (x) => BigInt(x));

/* One forward pass. tokens = the ids fed this step; start = position of tokens[0]; past = {name: ort.Tensor} or null. */
async function step(tokens, start, past, o) {
  const L = tokens.length, feeds = {}, pastLen = past ? start : 0;
  for (const m of inMeta) {
    const n = m.name;
    if (n === (o.idsName || 'input_ids')) feeds[n] = new ort.Tensor('int64', i64(tokens), [1, L]);
    else if (n === 'attention_mask') feeds[n] = new ort.Tensor(m.type || 'int64', m.type === 'int32' ? new Int32Array(pastLen + L).fill(1) : new BigInt64Array(pastLen + L).fill(1n), [1, pastLen + L]);
    else if (n === 'position_ids') feeds[n] = new ort.Tensor('int64', i64(tokens.map((_, i) => start + i)), [1, L]);
    else if (n === 'token_type_ids') feeds[n] = new ort.Tensor('int64', new BigInt64Array(L), [1, L]);
    else if (/^past_key_values/.test(n)) {
      if (past && past[n]) feeds[n] = past[n];
      else {
        const sh = m.shape || [];
        const heads = typeof sh[1] === 'number' ? sh[1] : o.kv && o.kv.heads;
        const hd = typeof sh[3] === 'number' ? sh[3] : o.kv && o.kv.headDim;
        if (!heads || !hd) throw new Error('KV-cache input "' + n + '" has unknown heads/head size; load config.json with the model');
        feeds[n] = new ort.Tensor(m.type || 'float32', m.type === 'float16' ? new Uint16Array(0) : new Float32Array(0), [1, heads, 0, hd]);
      }
    } else throw new Error('Generate does not know how to fill input "' + n + '"; use the Tensors tab');
  }
  const res = await session.run(feeds);
  const lt = res.logits || res[session.outputNames[0]];
  const logits = lt.location && lt.location !== 'cpu' ? await lt.getData() : lt.data;
  let next = null;
  if (inMeta.some((m) => /^past_key_values/.test(m.name))) {
    next = {};
    for (const m of inMeta) if (/^past_key_values/.test(m.name)) next[m.name] = res[m.name.replace('past_key_values', 'present')];
  }
  return { logits, V: lt.dims[lt.dims.length - 1], rows: lt.dims.length === 3 ? lt.dims[1] : 1, past: next };
}

async function generate(msg) {
  if (!session) throw new Error('No model loaded');
  const o = msg.opts, all = msg.ids.slice(), eos = new Set(o.eosIds || []);
  const kv = inMeta.some((m) => /^past_key_values/.test(m.name));
  const ctx = Math.max(2, o.ctx | 0);
  stopFlag = false;
  const t0 = performance.now();
  let past = null, pastStart = 0, n = 0, reason = 'max';
  while (n < o.maxNew) {
    if (stopFlag) { reason = 'stop'; break; }
    let r;
    if (kv && past) {
      r = await step([all[all.length - 1]], all.length - 1 - pastStart, past, o);
    } else {
      const win = all.slice(-ctx);   // crop to the last ctx tokens
      r = await step(win, 0, null, o);
      pastStart = all.length - win.length;
    }
    if (kv && all.length + 1 - pastStart > ctx) r.past = null;   // window full: next step re-feeds the window
    past = r.past;
    const tok = sample(r.logits, (r.rows - 1) * r.V, r.V, all, o);
    all.push(tok); n++;
    const secs = (performance.now() - t0) / 1000;
    postMessage({ type: 'token', id: msg.id, token: tok, n, tps: n / secs, V: r.V });
    if (eos.has(tok)) { reason = 'eos'; break; }
    await new Promise((res) => setTimeout(res, 0));   // let a 'stop' message in
  }
  const ms = performance.now() - t0;
  postMessage({ type: 'done', id: msg.id, reason, n, ms, tps: n / (ms / 1000), kv });
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') await load(msg);
    else if (msg.type === 'run') await run(msg);
    else if (msg.type === 'generate') await generate(msg);
    else if (msg.type === 'stop') stopFlag = true;
  } catch (err) {
    postMessage({ type: 'error', id: msg.id, message: String((err && err.message) || err) });
  }
};
