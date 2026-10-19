/*
 * File: llm-calc-ui.js
 * Project: llm-calc (Lab) — R7 2026-10-20
 * Purpose: Reads inputs, recomputes on every change, renders results,
 *          handles ⓘ help popups, GPU presets and calibration.
 *          R2: "Real models" tap-to-copy list in each model setting's ⓘ.
 *          R4: every input saved to localStorage ('llm-calc.v1') on change and
 *          restored on load (+ Reset to defaults); compact results bar on
 *          phone; removed "Load whole model" and the official-vs-ours line.
 *          R5: text inputs (model/file name) saved too; Export lives in
 *          llm-calc-export.js.
 *          R7: Outputs switches (dependent ones greyed), sizes for selected
 *          outputs, grad accumulation, gradient checkpointing.
 *          Depends on llm-calc-math.js, llm-calc-help.js, llm-calc-examples.js.
 */
(function () {
  'use strict';
  const M = window.LLMCalcMath, H = window.LLMCalcHelp, X = window.LLMCalcExamples;
  const MODEL_KEYS = ['vocab', 'hidden', 'layers', 'ffn', 'heads', 'kvHeads', 'headDim', 'seq', 'tied', 'qkvBias'];
  const BOOL_KEYS = { tied: 1, qkvBias: 1 };
  const STORE_KEY = 'llm-calc.v1';
  const $ = id => document.getElementById(id);
  const num = id => parseFloat($(id).value) || 0;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const fmtM = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : (n / 1e6).toFixed(2) + 'M';
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmtMB = mb => mb >= 1000 ? (mb / 1000).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
  const fmtTime = s => { const m = s / 60; return m < 60 ? m.toFixed(1) + ' min' : Math.floor(m / 60) + ' h ' + Math.round(m % 60) + ' min'; };
  const rows = list => list.map(([k, v]) => '<tr><td>' + k + '</td><td>' + v + '</td></tr>').join('');

  // ---- Persistence: every input/select inside the inputs pane ----
  const fields = () => Array.from($('in').querySelectorAll('input, select'));
  let defaults = {};
  function snapshot() {
    const o = {};
    fields().forEach(el => { o[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    return o;
  }
  function apply(o) {
    fields().forEach(el => {
      if (!o || !Object.prototype.hasOwnProperty.call(o, el.id)) return;
      const v = o[el.id];
      if (el.type === 'checkbox') { if (typeof v === 'boolean') el.checked = v; }
      else if (el.tagName === 'SELECT') { if (Array.from(el.options).some(op => op.value === v)) el.value = v; }
      else if (typeof v === 'string' && (el.type === 'text' || v === '' || isFinite(Number(v)))) el.value = v;
    });
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(snapshot())); } catch (e) { /* storage off / full */ } }
  function load() {
    try { const o = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (o && typeof o === 'object') apply(o); } catch (e) { /* bad JSON: ignore */ }
  }
  function reset() {
    if (!confirm('Reset every setting to the defaults?')) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    apply(defaults); $('cOut').textContent = ''; recompute();
  }

  function readModel() {
    return { vocab: num('vocab'), hidden: num('hidden'), layers: num('layers'), ffn: num('ffn'),
      heads: num('heads'), kvHeads: num('kvHeads'), headDim: num('headDim'),
      tied: $('tied').checked, qkvBias: $('qkvBias').checked };
  }

  function recompute() {
    const m = readModel();
    const seq = num('seq');
    const t = { useTotal: $('useTotal').checked, totalTokens: num('totalTokens'), stories: num('stories'),
      tokensPerStory: num('tokensPerStory'), epochs: num('epochs'), batch: num('batch'), gpus: num('gpus'), accum: num('gradAccum') };
    const ckpt = $('gradCkpt').checked;
    const o = readOutputs();
    $('totalTokens').disabled = !t.useTotal;
    $('stories').disabled = $('tokensPerStory').disabled = t.useTotal;

    const warns = [];
    if (m.heads && m.hidden % m.heads) warns.push('Hidden size should divide evenly by heads.');
    if (m.kvHeads && m.heads % m.kvHeads) warns.push('Heads should divide evenly by KV heads.');
    if (m.headDim > 0 && m.headDim * m.heads !== m.hidden) warns.push('Head size × heads (' + fmt(m.headDim * m.heads) + ') is not hidden size — fine if a real model does it (Gemma 3), otherwise leave Head size empty.');
    const p = M.params(m);
    const params = fmtM(p.total);
    $('rParams').textContent = $('bParams').textContent = params;
    $('rBreak').innerHTML = rows([
      ['Embeddings' + (m.tied ? ' (tied)' : ' (untied ×2)'), fmt(p.embed)],
      ['Attention / layer' + (m.qkvBias ? ' (incl. ' + fmt(p.bias) + ' bias)' : ''), fmt(p.attn)], ['MLP / layer', fmt(p.mlp)], ['Norms / layer', fmt(p.norms)],
      ['All ' + fmt(m.layers) + ' layers', fmt(p.layersTotal)], ['Final norm', fmt(p.finalNorm)], ['<b>Total</b>', '<b>' + fmt(p.total) + '</b>']
    ]);
    const os = M.outputSizes(p.total, o);
    $('rSizes').innerHTML = os.list.length ? rows(os.list.map(f => [f.name, '~' + fmtMB(f.mb)]).concat([['<b>Total disk</b>', '<b>~' + fmtMB(os.total) + '</b>']])) : rows([['No outputs selected', '—']]);
    const ref = M.fileSizes(p.total);
    $('rSizesRef').textContent = 'Other formats (reference): fp16 ~' + fmtMB(ref[1].mb) + ' · Q4_K_M ~' + fmtMB(ref[3].mb);

    const tr = M.training(t, seq);
    $('rTokens').textContent = fmt(tr.tokens);
    $('rBlocks').textContent = fmt(tr.blocks);
    $('rEff').textContent = fmt(tr.effectiveBatch);
    $('rTps').textContent = fmt(tr.tokensPerStep);
    $('rSpe').textContent = $('rSpeBig').textContent = fmt(tr.stepsPerEpoch);
    $('rSteps').textContent = $('rStepsBig').textContent = $('bSteps').textContent = fmt(tr.totalSteps);

    const sec = M.timeSec(tr.tokensTrained, num('tps'), t.gpus, ckpt);
    $('rTime').textContent = $('bTime').textContent = isFinite(sec) ? fmtTime(sec) : '—';
    if (sec > 12 * 3600) warns.push('Longer than a Kaggle session (~12 h). Save checkpoints and resume.');
    if (sec > 30 * 3600) warns.push('More than the weekly Kaggle GPU quota (~30 h, approximate).');

    const mem = M.memory(p.total, t.batch, seq, m.hidden, m.layers, ckpt);
    const gb = mem.total / M.GB, limit = M.GPU_PRESETS[$('preset').value].mem;
    $('rMem').textContent = gb.toFixed(2) + ' GB / GPU';
    $('bMem').textContent = gb.toFixed(1) + ' GB';
    $('rMemBreak').innerHTML = rows([
      ['Weights + grads + AdamW (~16 B/param)', (mem.states / M.GB).toFixed(2) + ' GB'],
      [ckpt ? 'Activations (rough, checkpointing ×0.25)' : 'Activations (rough)', '~' + (mem.acts / M.GB).toFixed(2) + ' GB'],
      ['Total per GPU', (gb).toFixed(2) + ' GB of ' + limit + ' GB']
    ]);
    const over = gb > limit;
    $('rMem').classList.toggle('bad', over); $('bMem').classList.toggle('bad', over);
    if (over) warns.push('Memory over ' + limit + ' GB per GPU — lower batch, context or model size.');
    $('warns').innerHTML = warns.map(w => '<li>' + w + '</li>').join('');
    $('bDot').hidden = !warns.length;
  }

  // Effective output choices; dependent switches greyed when their parent is off.
  function readOutputs() {
    const gguf = $('exportGguf').checked, onnx = $('exportOnnx').checked;
    $('ggufType').disabled = $('exportModelfile').disabled = !gguf;
    $('exportOnnxInt8').disabled = !onnx;
    ['ggufType', 'exportModelfile', 'exportOnnxInt8'].forEach(k => $(k).closest('.field').classList.toggle('off', $(k).disabled));
    const n = []; if (!gguf) n.push('Modelfile only with GGUF.'); if (!onnx) n.push('ONNX int8 only with ONNX.');
    $('outNote').textContent = n.join(' ');
    return { hf: $('exportHf').checked, gguf, ggufType: $('ggufType').value, modelfile: gguf && $('exportModelfile').checked,
      onnx, onnxInt8: onnx && $('exportOnnxInt8').checked, zip: $('exportZip').checked };
  }
  function applyPreset() {
    const pr = M.GPU_PRESETS[$('preset').value];
    $('gpus').value = pr.gpus; $('tps').value = pr.tps;
  }
  function doCalibrate() {
    const v = M.calibrate(num('cSteps'), num('cMin'), num('cBatch'), num('cSeq'), num('gpus'));
    if (isFinite(v) && v > 0) { $('tps').value = Math.round(v); $('cOut').textContent = '→ ' + fmt(v) + ' tokens/sec per GPU'; recompute(); save(); flash(['tps']); }
    else $('cOut').textContent = 'Fill in all four boxes.';
  }

  // Value of one setting for a model, as shown in the list and as copied into the input.
  const exVal = (e, key) => key === 'headDim' ? (e.headDimAuto ? e.hidden / e.heads : e.headDim) : e[key];
  const showVal = (e, key) => {
    if (BOOL_KEYS[key]) return e[key] ? 'yes' : 'no';
    const v = fmt(exVal(e, key));
    if (key === 'seq' && e.id === 'mistral7b') return v + ' (window 4,096)';
    if (key === 'seq' && e.id === 'phi3') return v + ' (window 2,047)';
    if (key === 'seq' && e.id === 'gemma270') return v + ' (window 512)';
    if (key === 'headDim' && e.headDimAuto) return v + ' (auto)';
    return v;
  };
  function realModelsList(key) {
    const box = $('helpList');
    if (MODEL_KEYS.indexOf(key) < 0) { box.hidden = true; box.innerHTML = ''; return; }
    const cur = BOOL_KEYS[key] ? $(key).checked : key === 'headDim' ? (num('headDim') || num('hidden') / num('heads')) : num(key);
    box.innerHTML = '<h4>Real models — tap to copy</h4>' + X.MODELS.map(e => {
      const v = exVal(e, key);
      return '<button type="button" data-ex="' + e.id + '"' + (v === cur ? ' class="cur"' : '') + '><span>' + esc(e.name) +
        '</span><span>' + esc(showVal(e, key)) + '</span></button>';
    }).join('');
    box.hidden = false;
    box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const e = X.MODELS.find(x => x.id === b.dataset.ex);
      if (BOOL_KEYS[key]) $(key).checked = !!exVal(e, key); else $(key).value = exVal(e, key);
      $('help').close(); recompute(); save(); flash([key]);
    }));
  }
  function flash(keys) {
    keys.forEach(k => { const f = $(k).closest('.field'); f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash'); });
  }
  function showHelp(key, title) {
    $('helpTitle').textContent = title; $('helpText').textContent = H[key] || '';
    realModelsList(key);
    $('help').showModal();
  }
  function toggleBar() {
    const open = $('out').classList.toggle('open');
    $('rBar').setAttribute('aria-expanded', String(open));
  }
  function init() {
    defaults = snapshot();
    load();
    document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', () =>
      showHelp(b.dataset.help, b.closest('.field, h2')?.querySelector('label, span')?.textContent || 'Info')));
    $('helpClose').addEventListener('click', () => $('help').close());
    $('help').addEventListener('click', e => { if (e.target === $('help')) $('help').close(); });
    fields().forEach(el => {
      el.addEventListener('input', () => { recompute(); save(); });
      el.addEventListener('change', () => { if (el.id === 'preset') applyPreset(); recompute(); save(); });
    });
    $('cBtn').addEventListener('click', doCalibrate);
    $('resetBtn').addEventListener('click', reset);
    $('rBar').addEventListener('click', toggleBar);
    $('glossary').innerHTML = window.LLMCalcGlossary.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('');
    recompute();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
