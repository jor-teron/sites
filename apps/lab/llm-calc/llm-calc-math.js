/*
 * File: llm-calc-math.js
 * Project: llm-calc (Lab) — R7 2026-10-20 (R2: optional head size + QKV bias;
 *          R7: grad accumulation, gradient checkpointing, sizes for selected outputs;
 *          R6 2026-10-20: speed scales ~1/params, words/tokens data modes,
 *          fuller memory (attention, logits, DataParallel GPU 0), overfit check;
 *          R8 2026-10-20: GGUF q4_k_m (train.py v3.7 default) + 256-multiple fallback;
 *          R9 2026-10-20: fix suggestions for inline alerts)
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
    // tps = tokens/sec per GPU for a 26M-param model (R6: scaled ~1/params). mem = usable GB.
    T4:   { gpus: 1, tps: 25000, mem: 15, label: 'Kaggle T4 (1 GPU)' },
    T4x2: { gpus: 2, tps: 25000, mem: 15, label: 'Kaggle T4 x2' },
    P100: { gpus: 1, tps: 32500, mem: 15, label: 'Kaggle P100 (estimate ~1.3x T4)' }
  };
  const TWO_GPU_SCALE = 1.8;
  const REF_PARAMS = 26e6; // speed box is "speed at 26M params"
  // R6: real speed ≈ reference × 26M / params, clamped (tiny models hit overheads; huge ones never 0).
  const speedFactor = p => Math.min(4, Math.max(0.01, REF_PARAMS / (p || REF_PARAMS)));
  const scaledTps = (refTps, p) => refTps * speedFactor(p);
  const WORD_TOKENS = 1.3;
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
  const GGUF_BPP = { q4_k_m: 0.56, q8_0: 1.0625, f16: 2, bf16: 2, f32: 4 };
  // Q4_K_M packs rows in blocks of 256; tensors whose row width is not a multiple of 256 fall back
  // to a bigger type (rough: counted as q8_0). Returns params stored that way.
  function q4Fallback(sh) {
    if (!sh) return 0;
    if (sh.hidden % 256) return sh.total; // nearly every tensor has hidden as its row width
    return sh.ffn % 256 ? sh.mlpTotal / 3 : 0; // down_proj rows are FFN wide
  }
  const CKPT_ACT = 0.25;  // rough: checkpointing keeps ~1 activation per layer, recomputes the rest
  const CKPT_TIME = 1.25; // ~25% slower (recompute during backward)
  // o: { hf, gguf, ggufType, onnx, onnxInt8, zip } (effective values). Returns rows + total MB.
  function outputSizes(p, o, sh) {
    const list = [];
    if (o.hf) list.push({ key: 'hf', name: 'HF (safetensors, fp32)', mb: p * 4 / MB });
    if (o.gguf) {
      const fb = o.ggufType === 'q4_k_m' ? Math.min(p, q4Fallback(sh)) : 0;
      list.push({ key: 'gguf', name: 'GGUF ' + o.ggufType + (fb ? ' (rough, some tensors bigger)' : ''),
        mb: ((p - fb) * (GGUF_BPP[o.ggufType] || 0.56) + fb * GGUF_BPP.q8_0) / MB });
    }
    if (o.onnx) list.push({ key: 'onnx', name: 'ONNX fp32', mb: p * 4 / MB });
    if (o.onnx && o.onnxInt8) list.push({ key: 'onnx_int8', name: 'ONNX int8', mb: p * 1 / MB });
    const sum = list.reduce((a, f) => a + f.mb, 0);
    // ZIP of the above: weights barely compress, so roughly the same size (rough).
    if (o.zip && list.length) list.push({ key: 'zip', name: 'ZIP of outputs (rough)', mb: sum });
    return { list, total: list.reduce((a, f) => a + f.mb, 0) };
  }
  function fileSizes(p) { return FORMATS.map(([name, b]) => ({ name, bytesPerParam: b, mb: p * b / MB })); }

  function training(t, seq) {
    const mode = t.dataMode || (t.useTotal ? 'tokens' : 'stories');
    const tokens = mode === 'tokens' ? t.totalTokens : mode === 'words' ? Math.round(t.words * WORD_TOKENS) : t.stories * t.tokensPerStory;
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
  // R6 fuller estimate, per GPU (o: p, batch, seq, h, layers, heads, vocab, gpus, ckpt).
  // Tuned on Jor's tiny110m (119.5M, vocab 24000, seq 512, batch 32, 2×T4 DataParallel): ~20 GB on
  // GPU 0 (real run OOMed at 14.56 GiB); batch 8 ≈ 6.6 GB. Rough!
  function memoryFull(o) {
    const ck = o.ckpt ? CKPT_ACT : 1;
    const states = o.p * 16;                                         // fp16 w+g, fp32 master, 2 Adam
    const acts = o.batch * o.seq * o.h * o.layers * 34 * ck;         // rough
    const attn = o.batch * o.heads * o.seq * o.seq * o.layers * 2 * ck; // attention scores, fp16
    const logits = o.batch * o.seq * o.vocab * 4 * 2;                // fp32 logits + their grads
    // DataParallel gathers every GPU's logits on GPU 0 for the loss (+ a softmax copy).
    const gather = o.gpus > 1 ? o.gpus * o.batch * o.seq * o.vocab * 4 * 2.5 : 0; // 2.5 tuned to the OOM
    const total = states + acts + attn + logits;
    return { states, acts, attn, logits, gather, total, gpu0: total + gather };
  }
  function overfit(tokensPerEpoch, p) {
    const r = tokensPerEpoch / p;
    return { ratio: r, level: r < 1 ? 'bad' : r < 20 ? 'note' : '' };
  }
  function memory(p, batch, seq, h, layers, ckpt) {
    const states = p * 16; // fp16 weights+grads, fp32 master, 2 Adam states
    const acts = batch * seq * h * layers * 34 * (ckpt ? CKPT_ACT : 1); // rough
    return { states, acts, total: states + acts };
  }
  // R9: one-tap fix suggestions. Nearest multiples of k around v (distinct, > 0).
  function nearMultiples(v, k) {
    const lo = Math.floor(v / k) * k, hi = Math.ceil(v / k) * k;
    return (lo === hi ? [lo] : [lo, hi]).filter(x => x > 0);
  }
  // Divisors of heads nearest to kv (one below, one above).
  function nearDivisors(heads, kv) {
    const d = []; for (let i = 1; i <= heads; i++) if (heads % i === 0) d.push(i);
    const lo = d.filter(x => x < kv).pop(), hi = d.find(x => x > kv);
    return [lo, hi].filter(x => x);
  }
  // Largest batch (< o.batch) whose GPU-0 memory fits limitGB, or 0 if even 1 does not fit.
  function fitBatch(o, limitGB) {
    for (let b = Math.floor(o.batch) - 1; b >= 1; b--) if (memoryFull(Object.assign({}, o, { batch: b })).gpu0 / GB <= limitGB) return b;
    return 0;
  }
  const api = { nearMultiples, nearDivisors, fitBatch, REF_PARAMS, WORD_TOKENS, speedFactor, scaledTps, memoryFull, overfit, MB, GB, FORMATS, GGUF_BPP, q4Fallback, CKPT_ACT, CKPT_TIME, outputSizes, GPU_PRESETS, TWO_GPU_SCALE, params, fileSizes, training, timeSec, calibrate, memory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LLMCalcMath = api;
})(this);
