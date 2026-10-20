/*
 * File: llm-calc-export.js
 * Project: llm-calc (Lab) — R7 2026-10-20 (R7: output switches, grad accum, auto batch, checkpointing;
 *          R6: scaled speed, data mode, MIN_LR_RATIO, name charset [A-Za-z0-9._-], memory_gb = GPU 0;
 *          R8: GGUF q4_k_m, train.py v3.7 output defaults)
 * Purpose: Export for the training script + people. One Download button:
 *          (a) saves <name>.llmcfg.json (Kaggle Tutor "llmcalc-config" v1 spec:
 *              UPPER_CASE script settings + "_estimates" for comparison only);
 *          (b) fills a print-only one-page summary and calls window.print()
 *              with document.title = <name> so "Save as PDF" suggests <name>.pdf.
 *          Head size and QKV bias are NOT exported (script has no such option).
 *          Pure parts (sanitizeName, validate, buildConfig) also run in Node.
 *          Depends on llm-calc-math.js (browser: window.LLMCalcMath).
 */
(function (root) {
  'use strict';
  const M = root.LLMCalcMath || (typeof require !== 'undefined' ? require('./llm-calc-math.js') : null);

  // Strip path/illegal chars, trim, spaces -> '-', drop a typed extension. Case and dots kept.
  function sanitizeName(s) {
    let n = String(s || '').trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '');
    n = n.replace(/\.llmcfg\.json$/i, '').replace(/\.(json|pdf)$/i, '').replace(/\.llmcfg$/i, '');
    return n.replace(/^[.-]+|[.-]+$/g, '');
  }
  function validate(s) {
    const errs = [], notes = [];
    if (!(s.heads > 0) || s.hidden % s.heads) errs.push('Hidden size (' + s.hidden + ') must divide evenly by attention heads (' + s.heads + ').');
    if (!(s.kvHeads > 0) || s.heads % s.kvHeads) errs.push('Attention heads (' + s.heads + ') must divide evenly by KV heads (' + s.kvHeads + ').');
    if (s.headDim > 0 && s.heads > 0 && s.headDim !== s.hidden / s.heads) notes.push('Head size: not exported — the training script has no setting for this (it uses hidden ÷ heads = ' + (s.hidden / s.heads) + ').');
    if (s.qkvBias) notes.push('QKV bias: not exported — the training script has no setting for this.');
    return { errs, notes };
  }
  const int = v => Math.round(Number(v) || 0);
  const r1 = v => Math.round(v * 10) / 10;
  function estimates(s) {
    const p = M.params(s);
    const tr = M.training(Object.assign({}, s, { accum: s.gradAccum }), s.seq);
    const tps = M.scaledTps(s.tps, p.total);
    const sec = M.timeSec(tr.tokensTrained, tps, s.gpus, s.gradCkpt);
    const mem = M.memoryFull({ p: p.total, batch: s.batch, seq: s.seq, h: s.hidden, layers: s.layers, heads: s.heads, vocab: s.vocab, gpus: s.gpus, ckpt: s.gradCkpt });
    const o = outputs(s), os = M.outputSizes(p.total, o, { hidden: s.hidden, ffn: s.ffn, total: p.total, mlpTotal: p.mlp * s.layers });
    const sizes = {}; os.list.forEach(f => { sizes[f.key] = r1(f.mb); }); sizes.total = r1(os.total);
    return { p, tr, sec, mem, tps, o, os, sizes, fp32: r1(p.total * 4 / M.MB) };
  }
  // Effective output values (Modelfile needs GGUF, ONNX int8 needs ONNX). Missing keys = script defaults.
  function outputs(s) {
    const d = (v, def) => v === undefined ? def : !!v;
    const gguf = d(s.exportGguf, true), onnx = d(s.exportOnnx, false); // train.py v3.7 defaults
    return { hf: d(s.exportHf, false), gguf, ggufType: ['q4_k_m', 'q8_0', 'f16', 'bf16', 'f32'].indexOf(s.ggufType) >= 0 ? s.ggufType : 'q4_k_m',
      modelfile: gguf && d(s.exportModelfile, true), onnx, onnxInt8: onnx && d(s.exportOnnxInt8, false), zip: d(s.exportZip, false) };
  }
  // s: plain state object (see readState). Returns the JSON object in spec key order.
  function buildConfig(s, now) {
    const e = estimates(s);
    return {
      _format: 'llmcalc-config', _version: 1, _created: (now || new Date()).toISOString(),
      MODEL_NAME: sanitizeName(s.modelName),
      VOCAB: int(s.vocab), SEQ: int(s.seq), HIDDEN: int(s.hidden), LAYERS: int(s.layers), FFN: int(s.ffn),
      HEADS: int(s.heads), KV_HEADS: int(s.kvHeads), TIE_EMBEDDINGS: !!s.tied,
      EPOCHS: Number(s.epochs), BATCH_PER_GPU: int(s.batch), USE_ALL_GPUS: s.gpus > 1,
      LR: Number(s.lr), WARMUP: int(s.warmup), WEIGHT_DECAY: Number(s.weightDecay), GRAD_CLIP: Number(s.gradClip),
      SEED: int(s.seed), MAX_SAMPLES: s.maxSamples > 0 ? int(s.maxSamples) : null, VAL_FRACTION: Number(s.valFraction), MIN_LR_RATIO: s.minLr === undefined ? 0.1 : Number(s.minLr),
      EXPORT_HF: e.o.hf, EXPORT_GGUF: e.o.gguf, GGUF_TYPE: e.o.ggufType, EXPORT_MODELFILE: e.o.modelfile,
      EXPORT_ONNX: e.o.onnx, EXPORT_ONNX_INT8: e.o.onnxInt8, EXPORT_ZIP: e.o.zip,
      GRAD_ACCUM_STEPS: Math.max(1, int(s.gradAccum || 1)), AUTO_BATCH: s.autoBatch === undefined ? true : !!s.autoBatch,
      GRADIENT_CHECKPOINTING: !!s.gradCkpt,
      _estimates: {
        params: e.p.total, effective_batch: e.tr.effectiveBatch, steps_per_epoch: e.tr.stepsPerEpoch, total_steps: e.tr.totalSteps,
        est_minutes: isFinite(e.sec) ? Math.round(e.sec / 60) : null, sizes_mb: e.sizes, memory_gb: Math.round(e.mem.gpu0 / M.GB * 100) / 100,
        assumed_total_tokens: e.tr.tokens, gpu_preset: s.preset, tokens_per_sec: Math.round(e.tps), tokens_per_sec_at_26m: Number(s.tps), gpus: int(s.gpus)
      }
    };
  }
  const api = { sanitizeName, validate, buildConfig, estimates, outputs };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LLMCalcExport = api;

  // ---------------- Browser only ----------------
  const $ = id => document.getElementById(id);
  const num = id => parseFloat($(id).value) || 0;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const fmtM = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : (n / 1e6).toFixed(1) + 'M';
  const fmtMB = mb => mb >= 1000 ? (mb / 1000).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
  const fmtTime = s => { const m = s / 60; return m < 60 ? m.toFixed(1) + ' min' : Math.floor(m / 60) + ' h ' + Math.round(m % 60) + ' min'; };
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const tbl = (title, list) => '<h3>' + title + '</h3><table>' + list.map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>').join('') + '</table>';

  function readState() {
    const s = {};
    ['vocab', 'hidden', 'layers', 'ffn', 'heads', 'kvHeads', 'headDim', 'seq', 'stories', 'tokensPerStory', 'totalTokens',
     'epochs', 'batch', 'lr', 'warmup', 'weightDecay', 'gradClip', 'seed', 'valFraction', 'maxSamples', 'gpus', 'tps', 'gradAccum', 'words', 'minLr'].forEach(k => { s[k] = num(k); });
    ['tied', 'qkvBias', 'autoBatch', 'gradCkpt', 'exportHf', 'exportGguf', 'exportModelfile', 'exportOnnx', 'exportOnnxInt8', 'exportZip'].forEach(k => { s[k] = $(k).checked; });
    s.preset = $('preset').value; s.dataMode = $('dataMode').value; s.ggufType = $('ggufType').value; s.modelName = $('modelName').value.trim();
    return s;
  }
  function refresh() {
    const s = readState(), v = validate(s), name = sanitizeName($('fileName').value);
    $('expNote').textContent = v.notes.join(' ');
    $('expFiles').textContent = name ? 'Saves ' + name + '.llmcfg.json + ' + name + '.pdf' : '';
    if ($('expErr').dataset.kind !== 'name' || name) { $('expErr').textContent = v.errs.join(' '); $('expErr').dataset.kind = ''; }
  }
  function buildSummary(s, cfg, name) {
    const e = estimates(s), gpuTxt = (s.gpus > 1 ? s.gpus + '× ' : '') + (s.preset === 'P100' ? 'P100' : 'T4');
    const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
    const memGB = e.mem.gpu0 / M.GB, limit = M.GPU_PRESETS[s.preset].mem;
    const warns = Array.from(document.querySelectorAll('#warns li')).map(li => li.textContent);
    const mins = isFinite(e.sec) ? Math.round(e.sec / 60) : NaN;
    const timeTxt = isFinite(e.sec) ? (mins < 60 ? '~' + mins + ' min' : '~' + fmtTime(e.sec)) : '—';
    const what = '~' + fmtM(e.p.total) + ' parameters, ~' + Math.round(e.fp32) + ' MB in fp32 (all outputs ~' + fmtMB(e.os.total) + '), ' + timeTxt + ' training on ' + gpuTxt + '.';
    return '<h1>' + esc(s.modelName || name) + '</h1><p class="ps-date">LLM Calculator summary · ' + esc(when) + '</p>' +
      '<p class="ps-what"><b>What this means:</b> ' + esc(what) + '</p>' +
      '<div class="ps-cols">' +
      tbl('Model settings', [['Vocab size', fmt(s.vocab)], ['Hidden size', fmt(s.hidden)], ['Layers', fmt(s.layers)], ['FFN / MLP width', fmt(s.ffn)],
        ['Attention heads', fmt(s.heads)], ['KV heads', fmt(s.kvHeads)], ['Context length', fmt(s.seq)], ['Tied embeddings', s.tied ? 'yes' : 'no']]) +
      tbl('Training settings', [['Epochs', String(s.epochs)], ['Batch per GPU', fmt(s.batch)], ['GPUs', s.gpus + ' (' + s.preset + ')'], ['Learning rate', String(s.lr)],
        ['Warmup steps', fmt(s.warmup)], ['Min LR ratio', String(cfg.MIN_LR_RATIO)], ['Weight decay', String(s.weightDecay)], ['Grad clip', String(s.gradClip)], ['Seed', fmt(s.seed)],
        ['Validation fraction', String(s.valFraction)], ['Max samples', cfg.MAX_SAMPLES === null ? 'all' : fmt(cfg.MAX_SAMPLES)],
        ['Grad accumulation', fmt(cfg.GRAD_ACCUM_STEPS)], ['Auto batch', cfg.AUTO_BATCH ? 'on' : 'off'], ['Gradient checkpointing', cfg.GRADIENT_CHECKPOINTING ? 'on' : 'off']]) +
      '</div>' +
      tbl('Results', [['Parameters', fmt(e.p.total) + ' (' + fmtM(e.p.total) + ')'],
        ['Outputs', e.os.list.length ? e.os.list.map(f => f.name + ' ~' + fmtMB(f.mb)).join(', ') + (e.o.modelfile ? ', Ollama Modelfile' : '') : 'none'],
        ['Total disk (rough)', '~' + fmtMB(e.os.total)], ['Effective batch', fmt(e.tr.effectiveBatch)],
        ['Dataset tokens' + (s.dataMode === 'words' ? ' (' + fmt(s.words) + ' words × 1.3)' : s.dataMode === 'tokens' ? ' (measured)' : ''), fmt(e.tr.tokens)], ['Tokens per parameter', (e.tr.tokens / e.p.total).toFixed(2)], ['Blocks (tokens ÷ context)', fmt(e.tr.blocks)], ['Steps per epoch', fmt(e.tr.stepsPerEpoch)],
        ['Total steps', fmt(e.tr.totalSteps)], ['Estimated training time', isFinite(e.sec) ? fmtTime(e.sec) + ' at ' + fmt(e.tps) + ' tokens/sec per GPU (scaled for size)' : '—'],
        [s.gpus > 1 ? 'Memory on GPU 0 (rough)' : 'Memory per GPU (rough)', memGB.toFixed(2) + ' GB of ' + limit + ' GB']]) +
      (warns.length ? '<h3>Warnings</h3><ul>' + warns.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '') +
      '<p class="ps-foot">All numbers are approximate estimates. The file ' + esc(name) + '.llmcfg.json holds the same settings for the training script.</p>';
  }
  function download() {
    const name = sanitizeName($('fileName').value), err = $('expErr');
    if (!name) { err.textContent = 'Enter a file name first'; err.dataset.kind = 'name'; $('fileName').focus(); return; }
    const s = readState(), v = validate(s);
    if (v.errs.length) { err.textContent = v.errs.join(' ') + ' Fix this before downloading.'; return; }
    err.textContent = '';
    const cfg = buildConfig(s);
    const url = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name + '.llmcfg.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    $('printSum').innerHTML = buildSummary(s, cfg, name);
    setTimeout(() => {
      const old = document.title;
      const restore = () => { document.title = old; window.removeEventListener('afterprint', restore); };
      window.addEventListener('afterprint', restore);
      document.title = name;
      window.print();
      setTimeout(() => { if (!window.matchMedia('print').matches) restore(); }, 1000);
    }, 300);
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('dlBtn').addEventListener('click', download);
    $('in').addEventListener('input', refresh); $('in').addEventListener('change', refresh);
    $('resetBtn').addEventListener('click', () => setTimeout(refresh, 0));
    refresh();
  });
})(this);
