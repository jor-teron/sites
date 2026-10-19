/*
 * File: llm-calc-examples.js
 * Project: llm-calc (Lab) — R2 2026-10-19
 * Purpose: Real-model reference data for the "Real models" lists under each
 *          model setting and the "Load whole model" picker. Data only.
 *          Every architecture value was read from the model's real
 *          config.json on Hugging Face on 2026-10-19
 *          (https://huggingface.co/<src>/resolve/main/config.json).
 *          "official" = total parameter count Hugging Face reports for the
 *          repo's safetensors weights (api/models/<src> → safetensors.total).
 *          headDim: config "head_dim" when the config has one, otherwise
 *          hidden ÷ heads (marked headDimAuto: true).
 *          Works in the browser (window.LLMCalcExamples) and in Node.
 */
(function (root) {
  'use strict';
  // Jor's own model (the R1 defaults), restorable from the picker.
  const MY_MODEL = { vocab: 8192, hidden: 512, layers: 7, ffn: 1376, heads: 8, kvHeads: 8,
    headDim: 64, headDimAuto: true, seq: 256, tied: true, qkvBias: false };

  const MODELS = [
    // src: HuggingFaceTB/SmolLM2-135M
    { id: 'smol135', name: 'SmolLM2 135M', src: 'HuggingFaceTB/SmolLM2-135M',
      vocab: 49152, hidden: 576, layers: 30, ffn: 1536, heads: 9, kvHeads: 3, headDim: 64, headDimAuto: true,
      seq: 8192, tied: true, qkvBias: false, official: 134515008,
      note: 'Plain Llama layout, so our formula should match almost exactly.' },
    // src: HuggingFaceTB/SmolLM2-360M
    { id: 'smol360', name: 'SmolLM2 360M', src: 'HuggingFaceTB/SmolLM2-360M',
      vocab: 49152, hidden: 960, layers: 32, ffn: 2560, heads: 15, kvHeads: 5, headDim: 64, headDimAuto: true,
      seq: 8192, tied: true, qkvBias: false, official: 361821120,
      note: 'Plain Llama layout, same family as 135M.' },
    // src: Qwen/Qwen2.5-0.5B
    { id: 'qwen05', name: 'Qwen2.5 0.5B', src: 'Qwen/Qwen2.5-0.5B',
      vocab: 151936, hidden: 896, layers: 24, ffn: 4864, heads: 14, kvHeads: 2, headDim: 64, headDimAuto: true,
      seq: 32768, tied: true, qkvBias: true, official: 494032768,
      note: 'Qwen adds small bias numbers to Q, K and V (the "QKV bias" switch). Its huge 152k vocab is about 28% of the model. Sliding window is in the config but switched off.' },
    // src: Qwen/Qwen2.5-1.5B
    { id: 'qwen15', name: 'Qwen2.5 1.5B', src: 'Qwen/Qwen2.5-1.5B',
      vocab: 151936, hidden: 1536, layers: 28, ffn: 8960, heads: 12, kvHeads: 2, headDim: 128, headDimAuto: true,
      seq: 131072, tied: true, qkvBias: true, official: 1543714304,
      note: 'QKV bias like 0.5B. Config lists 131,072 context (sliding window switched off).' },
    // src: unsloth/Llama-3.2-1B (ungated mirror of meta-llama/Llama-3.2-1B)
    { id: 'llama1b', name: 'Llama 3.2 1B', src: 'unsloth/Llama-3.2-1B',
      vocab: 128256, hidden: 2048, layers: 16, ffn: 8192, heads: 32, kvHeads: 8, headDim: 64, headDimAuto: false,
      seq: 131072, tied: true, qkvBias: false, official: 1235814400,
      note: '131,072 context comes from RoPE scaling (×32 from an original 8,192). The 128k vocab is about 21% of the model.' },
    // src: unsloth/Llama-3.2-3B (ungated mirror of meta-llama/Llama-3.2-3B)
    { id: 'llama3b', name: 'Llama 3.2 3B', src: 'unsloth/Llama-3.2-3B',
      vocab: 128256, hidden: 3072, layers: 28, ffn: 8192, heads: 24, kvHeads: 8, headDim: 128, headDimAuto: false,
      seq: 131072, tied: true, qkvBias: false, official: 3212749824,
      note: 'Same RoPE-scaled 131,072 context as the 1B.' },
    // src: unsloth/gemma-3-270m-it (ungated mirror of google/gemma-3-270m-it)
    { id: 'gemma270', name: 'Gemma 3 270M', src: 'unsloth/gemma-3-270m-it',
      vocab: 262144, hidden: 640, layers: 18, ffn: 2048, heads: 4, kvHeads: 1, headDim: 256, headDimAuto: false,
      seq: 32768, tied: true, qkvBias: false, official: 268098176,
      note: 'Head size is 256, bigger than hidden ÷ heads (160) — the "Head size" box handles that. The 262k vocab is about 63% of the whole model. Gemma also has extra norms per layer (tiny, not counted). 5 of every 6 layers use a 512-token sliding window. tie_word_embeddings is not written in config.json; Gemma\'s default is tied, which the weight count confirms.' },
    // src: microsoft/Phi-3-mini-4k-instruct
    { id: 'phi3', name: 'Phi-3 mini 4k', src: 'microsoft/Phi-3-mini-4k-instruct',
      vocab: 32064, hidden: 3072, layers: 32, ffn: 8192, heads: 32, kvHeads: 32, headDim: 96, headDimAuto: true,
      seq: 4096, tied: false, qkvBias: false, official: 3821079552,
      note: 'Phi-3 stores Q/K/V as one fused matrix and gate/up as another; that changes the file layout, not the count. Full attention (no GQA). Config sliding window: 2,047.' },
    // src: TinyLlama/TinyLlama-1.1B-Chat-v1.0
    { id: 'tinyllama', name: 'TinyLlama 1.1B', src: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
      vocab: 32000, hidden: 2048, layers: 22, ffn: 5632, heads: 32, kvHeads: 4, headDim: 64, headDimAuto: true,
      seq: 2048, tied: false, qkvBias: false, official: 1100048384,
      note: 'Plain Llama 2 layout with untied embeddings.' },
    // src: mistralai/Mistral-7B-v0.1
    { id: 'mistral7b', name: 'Mistral 7B v0.1', src: 'mistralai/Mistral-7B-v0.1',
      vocab: 32000, hidden: 4096, layers: 32, ffn: 14336, heads: 32, kvHeads: 8, headDim: 128, headDimAuto: true,
      seq: 32768, tied: false, qkvBias: false, official: 7241732096,
      note: 'The "big" reference. Config says 32,768 positions but attention uses a 4,096-token sliding window.' }
  ];
  // Which setting each model input maps to, with a short label for the lists.
  const FIELDS = {
    vocab: 'Vocab size', hidden: 'Hidden size', layers: 'Layers', ffn: 'FFN width', heads: 'Heads',
    kvHeads: 'KV heads', headDim: 'Head size', seq: 'Context', tied: 'Tied', qkvBias: 'QKV bias'
  };
  const api = { MY_MODEL, MODELS, FIELDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LLMCalcExamples = api;
})(this);
