# ONNX Runner

Run any single `.onnx` file in the browser. It uses ONNX Runtime Web 1.22.0, pinned and loaded from the jsdelivr CDN. Nothing is uploaded; the model stays on your device.

## 1. Files
- `index.html`: redirects to `onnx-runner.html`.
- `onnx-runner.html` / `onnx-runner.css`: the page; light and dark follow the system.
- `onnx-runner_config.js`: ORT version and CDN URLs, types, limits, image defaults, storage key.
- `onnx-runner_tensor.js`: shape/value parsing, fill helpers, image → tensor, softmax / top-k.
- `onnx-runner_logic.js`: the UI, input editors, outputs, settings memory.
- `onnx-runner_worker.js`: a Web Worker that loads ORT, opens the session and runs it.

## 2. Use
1. Drop a `.onnx` file on the model panel, or click to pick one. Choose a backend first: Auto (WebGPU if available, else WASM), WebGPU or WASM.
2. The model panel lists input and output names, types and shapes. Named or unknown dims (such as `batch` or `seq`) start at 1; change them in each input's Shape field.
3. For each input, choose a type (float32, int64, int32, bool, uint8, float16) and enter values as JSON (`[[1,2],[3,4]]`) or comma-separated numbers. The fill buttons give zeros, ones, random values or a range.
4. Image source: pick an image, set H × W, choose NCHW or NHWC, and normalise with 0–1, mean/std (ImageNet by default) or raw 0–255. The result is float32 `[1,3,H,W]` or `[1,H,W,3]`.
5. Click Run or press Ctrl+Enter. Each output shows its type, shape, the first 200 values (Show all expands to 100k), top-5 with argmax and an optional softmax, and Copy JSON. The run time and backend are shown at the top.
6. Input settings (type, shape, values up to 100k characters, image options) are saved per model file name in localStorage.

## 3. Errors
Wrong value counts, bad numbers, rank or fixed-dim mismatches, and type mismatches show a plain message that names the input. Model load and runtime errors from ORT are shown as they are.

## 4. llm-calc models
Exports from llm-calc's `train.py` work:
- The torch export takes `input_ids` (int64 `[batch, seq]`) and gives `logits` `[batch, seq, vocab]`. Set the shape (e.g. `1, 8`) and enter token ids. Top-k uses the last position, which is the next-token prediction.
- The int8 dynamic-quantized copy runs the same way.
- The Optimum KV-cache export has extra inputs (`attention_mask`, `position_ids`, `past_key_values.*`). Fill `attention_mask` with ones and `position_ids` with range. Set the past length dim to 0 so the past inputs are empty.

## 5. Limits
- Raw mode only: no tokenizer, no text generation loop, and no external-data (`.onnx_data`) models.
- WASM runs single-threaded unless the page is cross-origin isolated.
- Inputs are capped at 50M values. int64 outputs are shown as JS numbers, so values above 2^53 lose precision. String tensors are not supported.
