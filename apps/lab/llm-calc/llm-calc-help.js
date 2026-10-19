/*
 * File: llm-calc-help.js
 * Project: llm-calc (Lab) — R5 2026-10-19 (R2: head size, QKV bias; R4: removed Load whole model text; R5: help for export + training-config fields)
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
  weightDecay: 'Weight decay (saved in the config only — does not change the numbers here). Gently pulls the model\'s numbers toward zero so it does not memorize. Higher: stronger brake on memorizing, can under-learn. Lower: freer learning, more risk of memorizing. 0.1 is the usual value.',
  gradClip: 'Grad clip (config only). Caps how big one learning step can get, so a single weird batch cannot wreck training. Lower: safer but can slow learning. Higher or 0: fewer limits, more risk of loss spikes. 1.0 is standard.',
  seed: 'Seed (config only). A starting number for the randomness (shuffling, starting weights). Same seed = the same run again, so results can be compared. Any number works; changing it just gives a slightly different run.',
  valFraction: 'Validation fraction (config only). Share of the stories kept aside to check the model on text it never trained on. 0.05 = 5%. Higher: a more reliable check but less training data. Lower: more training data, a noisier check.',
  maxSamples: 'Max samples (config only). Use only the first N stories — handy for a quick test run. Leave empty to use all of them. Lower: much faster, but the model learns less.',
  modelName: 'Model name written into the config (MODEL_NAME). The training script uses it to name its output. Pick something short like tiny-v1; change it for every new experiment so runs do not overwrite each other.',
  fileName: 'You choose this. Download saves <name>.llmcfg.json (for the training script) and opens a print page where you tap "Save as PDF" to get <name>.pdf (for people). Characters like / \\ : * ? are removed.',
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
