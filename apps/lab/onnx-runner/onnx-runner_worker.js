/*
 * ONNX Runner — Web Worker. Loads ONNX Runtime Web, opens one session, runs it.
 * Messages in:  {type:'load', id, model:ArrayBuffer, backend:'auto'|'webgpu'|'wasm', ortScript, wasmPath}
 *               {type:'run', id, feeds:{name:{type, dims, data:ArrayBuffer}}}
 * Messages out: {type:'loaded', id, backend, inputs:[meta], outputs:[meta]}
 *               {type:'result', id, ms, outputs:{name:{type, dims, data:ArrayBuffer}}}
 *               {type:'error', id, message}
 * meta = {name, type, shape} (shape entries: number, name string, or null; shape null = unknown)
 */
/* global ort */
let session = null;
let loadedOrt = false;

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

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') await load(msg);
    else if (msg.type === 'run') await run(msg);
  } catch (err) {
    postMessage({ type: 'error', id: msg.id, message: String((err && err.message) || err) });
  }
};
