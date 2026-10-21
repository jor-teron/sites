# ONNX Runner

Run any single `.onnx` file in the browser. It uses ONNX Runtime Web 1.22.0, pinned and loaded from the jsdelivr CDN. Nothing is uploaded; the model stays on your device.

## 1. Files
- `index.html`: redirects to `onnx-runner.html`.
- `onnx-runner.html` / `onnx-runner.css`: the page; light and dark follow the system.
- `onnx-runner_config.js`: ORT and Transformers.js versions and CDN URLs, types, limits, defaults.
- `onnx-runner_tensor.js`: shape/value parsing, fill helpers, image → tensor, softmax / top-k.
- `onnx-runner_text.js`: tokenizer loading and auto-detection.
- `onnx-runner_logic.js`: model and file loading, the Tensors tab, settings memory.
- `onnx-runner_gen.js`: the Generate tab.
- `onnx-runner_worker.js`: a Web Worker that loads ORT, runs the session and runs the generation loop.

## 2. Loading
Drop the `.onnx` file together with its tokenizer files, or drop the whole folder. You can also click to pick several files, or use **Pick a folder…**. If there are several `.onnx` files, a picker appears; `model.onnx` is chosen first. You can drop tokenizer files later on their own.

The tokenizer is detected from the file names, in this order:
1. `tokenizer.json`, plus `tokenizer_config.json` / `special_tokens_map.json` if present. Loaded with Transformers.js 3.7.0 from the CDN; covers BPE, WordPiece and Unigram/SentencePiece saved as tokenizer.json.
2. `vocab.json` + `merges.txt` (GPT-2 style): turned into a byte-level BPE tokenizer.
3. Any other vocab JSON, either `{"token": id}` or `["tok0", "tok1", …]` (also `{"stoi": {…}}` or `{"chars": […]}`). If every token is one character it is char-level. If most tokens are multi-character without spaces it is word-level (split on spaces, joined with spaces). Otherwise it uses longest-match.

The model panel shows which tokenizer was loaded, its vocab size, the EOS/BOS ids and the context length. A warning appears if the vocab size differs from the model's logits size, or if no EOS is known.

Optional `config.json` / `generation_config.json` give the context length (`max_position_embeddings`, `n_positions`, `n_ctx`, `max_seq_len`, `block_size` or `context_length`), `eos_token_id` / `bos_token_id`, and the head sizes for KV-cache models.

## 3. Generate tab
This tab is shown first when the model looks like a text model: an int64 `input_ids` input (or a single int64 input) and logits `[batch, seq, vocab]` out. Other inputs are filled automatically: `attention_mask` (ones), `position_ids` (0…n-1) and `token_type_ids` (zeros).
- Type a prompt and press Generate or Ctrl+Enter. Tokens stream into the output box; the prompt is grey. Stop, Clear and Copy are next to it, and the tokens/s are shown.
- Settings: Max new tokens, Context (the last N tokens are fed; the default comes from config.json or the model input, else 512), Greedy, Temperature, Top-k, Top-p, Repetition penalty, Stop string and Add BOS.
- It stops on EOS, the stop string, Max new tokens or the Stop button.
- The loop runs in the worker. Each step feeds the whole (cropped) sequence and samples from the last position's logits.
- KV-cache exports (`past_key_values.*` in, `present.*` out, like Optimum's text-generation-with-past) run the prompt once and then one token per step. When the context fills up, it re-feeds the window.
- Settings and the prompt are saved per model file name.

## 4. Tensors tab (advanced)
1. The model panel lists input and output names, types and shapes. Named or unknown dims start at 1; change them in each input's Shape field.
2. For each input, choose a type (float32, int64, int32, bool, uint8, float16) and enter values as JSON or comma-separated numbers, or use the fill buttons (zeros, ones, random, range).
3. Image source: pick an image, set H × W, choose NCHW or NHWC, and normalise with 0–1, mean/std or raw 0–255.
4. Click Run or press Ctrl+Enter. Each output shows its type, shape, values (Show all expands), top-5 with argmax, an optional softmax, Copy JSON and the run time.
5. Bad value counts, numbers, ranks, dims or types show a message that names the input.

## 5. Limits
- Batch size 1 only for generation. There is no chat template; the prompt is used as it is.
- GPT-2 style files: only `<|endoftext|>` is treated as special.
- Word and longest-match vocabs skip unknown text and tell you how much.
- No models with external data (`.onnx_data`); merge them into one file first.
- Full-sequence models re-run the whole window every token, so speed drops with longer context.
- WASM runs single-threaded unless the page is cross-origin isolated. The input cap is 50M values. int64 outputs above 2^53 lose precision. String tensors are not supported.
