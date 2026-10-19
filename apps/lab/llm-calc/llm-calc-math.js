/*
 * File: llm-calc-math.js
 * Project: llm-calc (Lab) — R2 2026-10-19 (R2: optional head size + QKV bias)
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
  function fileSizes(p) { return FORMATS.map(([name, b]) => ({ name, bytesPerParam: b, mb: p * b / MB })); }

  function training(t, seq) {
    const tokens = t.useTotal ? t.totalTokens : t.stories * t.tokensPerStory;
    const blocks = Math.floor(tokens / seq);
    const perStep = t.batch * t.gpus;
    const stepsPerEpoch = Math.ceil(blocks / perStep);
    return { tokens, blocks, stepsPerEpoch, totalSteps: Math.ceil(stepsPerEpoch * t.epochs),
             tokensPerStep: perStep * seq, tokensTrained: tokens * t.epochs };
  }
  function timeSec(tokensTrained, tpsPerGpu, gpus) { return tokensTrained / (tpsPerGpu * scale(gpus)); }
  // Calibrate: real run -> per-GPU tokens/sec.
  function calibrate(steps, minutes, batchTotal, seq, gpus) {
    return steps * batchTotal * seq / (minutes * 60) / scale(gpus);
  }
  function memory(p, batch, seq, h, layers) {
    const states = p * 16; // fp16 weights+grads, fp32 master, 2 Adam states
    const acts = batch * seq * h * layers * 34; // rough
    return { states, acts, total: states + acts };
  }
  const api = { MB, GB, FORMATS, GPU_PRESETS, TWO_GPU_SCALE, params, fileSizes, training, timeSec, calibrate, memory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LLMCalcMath = api;
})(this);
