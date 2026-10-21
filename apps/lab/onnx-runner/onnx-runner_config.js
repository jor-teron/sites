/*
 * ONNX Runner — configuration. Read by the other onnx-runner_*.js files.
 * ONNX Runtime Web is pinned here (jsdelivr CDN); the worker loads it.
 */
const ONNX_CONFIG = {
  APP: { name: 'ONNX Runner', version: '1.0' },
  ortVersion: '1.22.0',
  ortScript: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.all.min.js',
  ortWasmPath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/',

  backends: ['auto', 'webgpu', 'wasm'],   // auto = WebGPU when available, else WASM
  types: ['float32', 'int64', 'int32', 'bool', 'uint8', 'float16'],
  symbolicDimDefault: 1,                  // a named dim ('batch', 'seq') starts as 1

  maxInputValues: 50_000_000,
  previewValues: 200,                     // values shown before "Show all"
  maxShownValues: 100_000,
  topK: 5,
  storageKey: 'onnx-runner.settings.v1',
  storeTextMax: 100_000,                  // longer input text is not remembered

  imageDefaults: { h: 224, w: 224, layout: 'NCHW', norm: 'unit', mean: '0.485,0.456,0.406', std: '0.229,0.224,0.225' },
};

/* Text generation (Generate tab). */
ONNX_CONFIG.transformersUrl = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.0';
ONNX_CONFIG.genDefaults = { maxNew: 100, ctx: 512, greedy: false, temperature: 0.8, topK: 40, topP: 0.95, repPenalty: 1.0, stop: '', addBos: true };
