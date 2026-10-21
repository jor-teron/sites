/*
 * ONNX Runner — tensor helpers (no DOM except the image reader).
 * Shape text, value parsing per type, fill helpers, image → tensor, softmax / top-k.
 * Every problem throws an Error with a plain message the page can show.
 */
const OnnxTensor = (() => {
  const C = ONNX_CONFIG;
  const ARRAYS = { float32: Float32Array, int64: BigInt64Array, int32: Int32Array, bool: Uint8Array, uint8: Uint8Array, float16: Uint16Array };

  /* '1, 3, 224, 224' or '[1,3,224,224]' → [1,3,224,224]. Empty → [] (a scalar). */
  function parseShape(text) {
    const s = String(text || '').replace(/[[\]()\s]/g, '');
    if (!s) return [];
    return s.split(/[,x×]/).map((p) => {
      if (!/^\d+$/.test(p)) throw new Error('Shape "' + text + '": every dim must be a whole number ≥ 0 (got "' + p + '")');
      return +p;
    });
  }
  const size = (dims) => dims.reduce((a, b) => a * b, 1);

  /* Model shape → editable shape: named / unknown dims become 1. */
  function defaultShape(shape) {
    if (!shape) return null;
    return shape.map((d) => (typeof d === 'number' && d >= 0 ? d : C.symbolicDimDefault));
  }

  /* Text → flat list of tokens (strings). JSON arrays are flattened. */
  function tokens(text) {
    const s = String(text || '').trim();
    if (!s) return [];
    if (s[0] === '[') {
      let v;
      try { v = JSON.parse(s); } catch (e) { throw new Error('Values are not valid JSON: ' + e.message); }
      const out = [];
      (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else out.push(String(x)); })(v);
      return out;
    }
    return s.split(/[\s,;]+/).filter(Boolean);
  }

  /* float32 → IEEE half bits (for float16 inputs). */
  function toHalf(f) {
    const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, f);
    const x = b.getUint32(0), sign = (x >>> 16) & 0x8000;
    let e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
    if (e >= 31) return sign | 0x7c00 | (isNaN(f) ? 0x200 : 0);
    if (e <= 0) { if (e < -10) return sign; m = (m | 0x800000) >> (1 - e); return sign | (m >> 13); }
    return sign | (e << 10) | (m >> 13);
  }
  function fromHalf(h) {
    const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
    if (e === 31) return m ? NaN : s * Infinity;
    return s * Math.pow(2, e - 15) * (1 + m / 1024);
  }

  /* Build a typed array of `type` from text for `dims`. */
  function fromText(type, dims, text) {
    const A = ARRAYS[type];
    if (!A) throw new Error('Type ' + type + ' is not supported');
    const n = size(dims);
    if (n > C.maxInputValues) throw new Error('Shape [' + dims + '] has ' + n.toLocaleString() + ' values; the limit is ' + C.maxInputValues.toLocaleString());
    const t = tokens(text);
    if (t.length !== n) throw new Error('Shape [' + dims.join(', ') + '] needs ' + n.toLocaleString() + ' values, but ' + t.length.toLocaleString() + ' were given');
    const out = new A(n);
    for (let i = 0; i < n; i++) {
      const v = t[i];
      if (type === 'int64') {
        if (!/^-?\d+$/.test(v)) throw new Error('Value #' + (i + 1) + ' "' + v + '" is not a whole number (int64)');
        out[i] = BigInt(v);
      } else if (type === 'bool') {
        if (/^(true|1)$/i.test(v)) out[i] = 1; else if (/^(false|0)$/i.test(v)) out[i] = 0;
        else throw new Error('Value #' + (i + 1) + ' "' + v + '" is not a bool (true/false/1/0)');
      } else {
        const f = Number(v);
        if (!isFinite(f) && !/^-?(inf|infinity|nan)$/i.test(v)) throw new Error('Value #' + (i + 1) + ' "' + v + '" is not a number');
        if ((type === 'int32' || type === 'uint8') && !Number.isInteger(f)) throw new Error('Value #' + (i + 1) + ' "' + v + '" is not a whole number (' + type + ')');
        if (type === 'uint8' && (f < 0 || f > 255)) throw new Error('Value #' + (i + 1) + ' is outside 0–255 (uint8)');
        out[i] = type === 'float16' ? toHalf(f) : f;
      }
    }
    return out;
  }

  /* Fill helpers → text. kind: zeros | ones | random | range */
  function fillText(kind, type, dims) {
    const n = size(dims);
    if (n > 2_000_000) throw new Error('Fill: ' + n.toLocaleString() + ' values is too many to put in the text box');
    const isInt = type === 'int64' || type === 'int32' || type === 'uint8';
    const a = new Array(n);
    for (let i = 0; i < n; i++) {
      if (kind === 'zeros') a[i] = 0;
      else if (kind === 'ones') a[i] = 1;
      else if (kind === 'range') a[i] = type === 'bool' ? i % 2 : i;
      else a[i] = type === 'bool' ? (Math.random() < 0.5 ? 0 : 1) : isInt ? Math.floor(Math.random() * 10) : +(Math.random() * 2 - 1).toFixed(4);
    }
    return a.join(', ');
  }

  /* Image file → float32 tensor {dims, data}. opts: {h, w, layout:'NCHW'|'NHWC', norm:'unit'|'meanstd'|'raw', mean, std} */
  async function fromImage(file, opts) {
    const bmp = await createImageBitmap(file).catch(() => { throw new Error('That file is not an image the browser can read'); });
    const h = opts.h | 0, w = opts.w | 0;
    if (h < 1 || w < 1) throw new Error('Image size must be at least 1×1');
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const nums = (s, name) => {
      const v = String(s).split(/[\s,]+/).filter(Boolean).map(Number);
      if (v.length !== 3 || v.some((x) => !isFinite(x))) throw new Error(name + ' needs 3 numbers (R, G, B)');
      return v;
    };
    const mean = opts.norm === 'meanstd' ? nums(opts.mean, 'Mean') : [0, 0, 0];
    const std = opts.norm === 'meanstd' ? nums(opts.std, 'Std') : [1, 1, 1];
    if (std.some((x) => x === 0)) throw new Error('Std cannot be 0');
    const scale = opts.norm === 'raw' ? 1 : 1 / 255;
    const out = new Float32Array(3 * h * w);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = (px[p + ch] * scale - mean[ch]) / std[ch];
        out[opts.layout === 'NHWC' ? (y * w + x) * 3 + ch : ch * h * w + y * w + x] = v;
      }
    }
    return { dims: opts.layout === 'NHWC' ? [1, h, w, 3] : [1, 3, h, w], data: out, preview: c.toDataURL('image/png') };
  }

  /* Output buffer → plain numbers (int64 → Number; may round past 2^53). */
  function toNumbers(type, buf) {
    const A = { float32: Float32Array, float64: Float64Array, int64: BigInt64Array, uint64: BigUint64Array, int32: Int32Array, int8: Int8Array, uint8: Uint8Array, bool: Uint8Array, int16: Int16Array, uint16: Uint16Array, uint32: Uint32Array, float16: Uint16Array }[type] || Float32Array;
    const a = new A(buf);
    if (type === 'float16') return Array.from(a, fromHalf);
    if (type === 'int64' || type === 'uint64') return Array.from(a, (x) => Number(x));
    return Array.from(a);
  }

  /* Top-k of the last axis, taken at the last row (e.g. logits [batch, seq, vocab] → last token of batch 0). */
  function topK(values, dims, k, soft) {
    const last = dims.length ? dims[dims.length - 1] : values.length;
    if (!last) return { rows: [], note: '' };
    const start = Math.max(0, values.length - last);
    let row = values.slice(start, start + last);
    if (soft) {
      const m = Math.max(...row);
      const ex = row.map((v) => Math.exp(v - m));
      const s = ex.reduce((a, b) => a + b, 0);
      row = ex.map((v) => v / s);
    }
    const idx = row.map((v, i) => i).sort((a, b) => row[b] - row[a]).slice(0, k);
    const note = dims.length > 1 ? 'last axis (' + last + ') at the last position' : '';
    return { rows: idx.map((i) => ({ index: i, value: row[i] })), argmax: idx[0], note };
  }

  return { parseShape, size, defaultShape, tokens, fromText, fillText, fromImage, toNumbers, topK };
})();
