/*
 * File: llm-calc-help.js
 * Project: llm-calc (Lab) — R2 2026-10-19 (R2: head size, QKV bias, load model)
 * Purpose: Plain-English help text for every setting (shown by the ⓘ buttons)
 *          and the glossary. Text only, no logic.
 */
window.LLMCalcHelp = {
  vocab: 'How many different word-pieces (tokens) the model knows. Higher: covers more words, but the embedding table grows (vocab × hidden) so the file gets bigger. Lower: smaller model, but words get split into more pieces.',
  hidden: 'The width of the model — how many numbers describe each token inside it. Higher: smarter but size grows roughly with its square, and training is slower. Lower: tiny and fast, but learns less.',
  layers: 'How many transformer blocks are stacked. Each layer adds the same number of parameters. Higher: deeper thinking, bigger and slower. Lower: smaller and faster, simpler output.',
  ffn: 'The width of the "feed-forward" (MLP) part inside each layer, usually ~2.7× hidden. Higher: more knowledge capacity, more parameters. Lower: lighter model.',
  heads: 'Attention heads split the hidden size into parallel "viewpoints" (hidden ÷ heads = head size). Hidden must divide evenly. Changing it barely changes size; it changes how attention looks at text.',
  kvHeads: 'Key/value heads. Equal to heads = normal attention. Fewer (e.g. 2 or 4) = "grouped-query attention": a bit smaller and faster to run, with a small quality cost. Must divide heads evenly.',
  seq: 'Context length: how many tokens the model sees at once. Higher: remembers longer text, but uses much more training memory. Lower: less memory, shorter memory of the story.',
  tied: 'Tied embeddings reuse the input word table as the output table. On: saves vocab × hidden parameters. Off: a separate output table, bigger file, sometimes slightly better.',
  headDim: 'Head size: how many numbers each attention head works with. Leave it empty ("auto") and it is hidden ÷ heads, which is what most models use. A few models (Gemma 3) pick a bigger head. Higher: bigger attention part, more parameters. Lower: the opposite.',
  qkvBias: 'Adds a small extra "bias" number to every query, key and value output. Qwen models use it; Llama, SmolLM and Mistral do not. It adds only a few thousand parameters, so it barely changes size.',
  loadModel: 'Fills every model setting with a real model\'s values from its Hugging Face config.json. The results card then shows our calculated count next to the official one, so you can see the math is right. Pick "My model (default)" to get your own settings back. Note: it also sets Context to that model\'s maximum, which can make the training memory huge — lower it to your training length.',
  stories: 'How many training stories (examples) you have. More data: better model, longer training per epoch. Less: faster but the model may memorize.',
  tokensPerStory: 'Average length of one story in tokens. Multiplied by the number of stories it gives total tokens.',
  useTotal: 'Turn on to type the total token count directly instead of stories × tokens per story.',
  totalTokens: 'Total tokens in your dataset (one pass). Used only when the override switch is on.',
  epochs: 'How many times training reads the whole dataset. Higher: learns more, but too many causes memorizing (overfitting) and takes longer. Lower: faster, may under-learn.',
  batch: 'How many blocks one GPU processes per step. Higher: fewer steps and smoother learning, but more memory. Lower: less memory, more steps.',
  gpus: 'Number of GPUs. 2 (Kaggle T4 x2) doubles the batch per step; speed is about 1.8× not 2× because GPUs must sync.',
  lr: 'Learning rate (info only — does not change the numbers here). How big each learning step is. Too high: training explodes (loss jumps). Too low: learns very slowly. 3e-4 is a common start for tiny models.',
  warmup: 'Warmup steps (info only). The learning rate starts near zero and ramps up over these steps, which keeps the start stable. Typically 1–5% of total steps.',
  preset: 'Pick your GPU. It sets the number of GPUs and a typical speed. P100 speed is a rough guess.',
  tps: 'Tokens per second ONE GPU trains. The T4 value (28,000) is calibrated from your real run. Use Calibrate below to set it from a run of your own.',
  calibrate: 'Enter a real finished run: steps, minutes, total batch (all GPUs) and context. It works out the true per-GPU speed and puts it in the speed box.'
};
window.LLMCalcGlossary = [
  ['Token', 'A word or piece of a word. "playing" may be "play" + "ing". Models read and write tokens.'],
  ['Vocab', 'The full list of tokens the model knows.'],
  ['Context', 'How many tokens the model looks at at once (sequence length).'],
  ['Parameters', 'The learned numbers inside the model. More parameters = bigger file, more capacity.'],
  ['Epoch', 'One full pass over the whole dataset.'],
  ['Batch', 'A group of examples processed together in one step.'],
  ['Step', 'One update of the model\'s parameters after looking at one batch.'],
  ['Quantization', 'Storing parameters with fewer bits (e.g. 8 or 4 instead of 32) to shrink the file, with a small quality loss.'],
  ['GGUF', 'A file format used by llama.cpp; supports Q8_0, Q4_K_M and other quantized types.'],
  ['ONNX', 'A portable model format; used for running models in the browser (Transformers.js).'],
  ['AdamW', 'The usual optimizer. It keeps 2 extra numbers per parameter, which is why training needs ~16 bytes per parameter.'],
  ['Warmup', 'Slowly raising the learning rate at the start so training does not blow up.']
];
