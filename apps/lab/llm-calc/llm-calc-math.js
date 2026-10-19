/*
 * File: llm-calc-math.js
 * Project: llm-calc (Lab) — R7 2026-10-20 (R2: optional head size + QKV bias;
 *          R7: grad accumulation, gradient checkpointing, sizes for selected outputs)
 * Purpose: Pure formulas for the Tiny LLM Training Calculator (no DOM).
 *          Params of a Llama-style model, file sizes, steps, time, memory.
 *          Works in the browser (window.LLMCalcMath) and in Node (module.exports).
 */
(function (root) {
  'use strict';
  const MB = 1e6, GB = 1e9;
  // Bytes per parameter for each saved format (approximations).
  const FORMATS = [
    ['fp32', 4], ['fp16', 2], ['Q8_0 (GGUF)', 1.0625], ['Q4_K_M (GGUF)', 0.56],
    ['ONNX fp32', 4], ['ONNX int8', 1]
  ];
  const GPU_PRESETS = {
    T4:   { gpus: 1, tps: 28000, mem: 16, label: 'Kaggle T4 (1 GPU)' },
    T4x2: { gpus: 2, tps: 28000, mem: 16, label: 'Kaggle T4 x2' },
    P100: { gpus: 1, tps: 36400, mem: 16, label: 'Kaggle P100 (estimate ~1.3x T4)' }
  };
  const TWO_GPU_SCALE = 1.8;
  const scale = g => (g >= 2 ? TWO_GPU_SCALE * g / 2 : 1);

  function params(m) {
    // headDim: 0/empty = auto (hidden ÷ heads). Some models (Gemma 3) use a bigger head.
    const h = m.hidden, headDim = m.headDim > 0 ? m.headDim : h / m.heads;
    const qDim = m.heads * headDim, kvDim = m.kvHeads * headDim;
    // Q and O projections (h×qDim each) + K and V (h×kvDim each) + optional Q/K/V biases (Qwen).
    const bias = m.qkvBias ? qDim + 2 * kvDim : 0;
    const attn = 2 * h * qDim + 2 * h * kvDim + bias;
    const mlp = 3 * h * m.ffn;
    const norms = 2 * h;
    const perLayer = attn + mlp + norms;
    const embed = m.vocab * h * (m.tied ? 1 : 2);
    const finalNorm = h;
    return { headDim, bias, attn, mlp, norms, perLayer, layersTotal: perLayer * m.layers,
             embed, finalNorm, total: perLayer * m.layers + embed + finalNorm };
  }
  // R7: bytes/param per GGUF type, and the outputs the training script can save.
  const GGUF_BPP = { f32: 4, f16: 2, bf16: 2, q8_0: 1.0625 };
  const CKPT_ACT = 0.25;  // rough: checkpointing keeps ~1 activation per layer, recomputes the rest
  const CKPT_TIME = 1.25; // ~25% slower (recompute during backward)
  // o: { hf, gguf, ggufType, onnx, onnxInt8, zip } (effective values). Returns rows + total MB.
  function outputSizes(p, o) {
    const list = [];
    if (o.hf) list.push({ key: 'hf', name: 'HF (safetensors, fp32)', mb: p * 4 / MB });
    if (o.gguf) list.push({ key: 'gguf', name: 'GGUF ' + o.ggufType, mb: p * (GGUF_BPP[o.ggufType] || 1.0625) / MB });
    if (o.onnx) list.push({ key: 'onnx', name: 'ONNX fp32', mb: p * 4 / MB });
    if (o.onnx && o.onnxInt8) list.push({ key: 'onnx_int8', name: 'ONNX int8', mb: p * 1 / MB });
    const sum = list.reduce((a, f) => a + f.mb, 0);
    // ZIP of the above: weights barely compress, so roughly the same size (rough).
    if (o.zip && list.length) list.push({ key: 'zip', name: 'ZIP of outputs (rough)', mb: sum });
    return { list, total: list.reduce((a, f) => a + f.mb, 0) };
  }
  function fileSizes(p) { return FORMATS.map(([name, b]) => ({ name, bytesPerParam: b, mb: p * b / MB })); }

  function training(t, seq) {
    const tokens = t.useTotal ? t.totalTokens : t.stories * t.tokensPerStory;
    const blocks = Math.floor(tokens / seq);
    const accum = Math.max(1, Math.round(t.accum || 1));
    const perStep = t.batch * t.gpus * accum; // effective batch (R7)
    const stepsPerEpoch = Math.ceil(blocks / perStep);
    return { tokens, blocks, stepsPerEpoch, effectiveBatch: perStep, totalSteps: Math.ceil(stepsPerEpoch * t.epochs),
             tokensPerStep: perStep * seq, tokensTrained: tokens * t.epochs };
  }
  // Grad accumulation does not change time per token; checkpointing makes it ~25% slower.
  function timeSec(tokensTrained, tpsPerGpu, gpus, ckpt) { return tokensTrained / (tpsPerGpu * scale(gpus)) * (ckpt ? CKPT_TIME : 1); }
  // Calibrate: real run -> per-GPU tokens/sec.
  function calibrate(steps, minutes, batchTotal, seq, gpus) {
    return steps * batchTotal * seq / (minutes * 60) / scale(gpus);
  }
  // Per GPU; grad accumulation does not change it (same micro-batch).
  function memory(p, batch, seq, h, layers, ckpt) {
    const states = p * 16; // fp16 weights+grads, fp32 master, 2 Adam states
    const acts = batch * seq * h * layers * 34 * (ckpt ? CKPT_ACT : 1); // rough
    return { states, acts, total: states + acts };
  }
  const api = { MB, GB, FORMATS, GGUF_BPP, CKPT_ACT, CKPT_TIME, outputSizes, GPU_PRESETS, TWO_GPU_SCALE, params, fileSizes, training, timeSec, calibrate, memory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LLMCalcMath = api;
})(this);
