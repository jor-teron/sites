/*
 * File: llm-calc-ui.js
 * Project: llm-calc (Lab) — R10 2026-10-20 (R10: shape dropdowns + nearest-option
 *          migration, head size auto, CPU preset + system RAM check; R8: q4_k_m 256-multiple warning;
 *          R9: alerts shown inline on the row they concern, with one-tap 'Use X' fixes)
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
 *          R6: speed scaled by size, data mode (stories/words/tokens), overfit
 *          warning, fuller memory with GPU 0 (DataParallel), safe model name.
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
  // ---- R10: shape dropdowns ----
  const SHAPE = { hidden: 1, heads: 1, kvHeads: 1, ffn: 1, seq: 1 };
  const fillSel = (el, opts) => { el.innerHTML = opts.map(v => '<option value="' + v + '">' + fmt(v) + '</option>').join(''); };
  // Set a numeric select to the nearest option (tie -> lower); old saved values migrate this way.
  function setVal(el, v) {
    if (el.tagName === 'SELECT' && SHAPE[el.id]) {
      const opts = Array.from(el.options).map(o => Number(o.value));
      if (opts.length && isFinite(Number(v)) && v !== '') el.value = String(M.nearest(opts, Number(v)));
      if (el.id === 'hidden' || el.id === 'heads') refreshHeads();
    } else el.value = v;
  }
  function refreshHeads() {
    const h = Number($('hidden').value), hs = $('heads'), kv = $('kvHeads');
    const curH = Number(hs.value || hs.dataset.def), curK = Number(kv.value || kv.dataset.def);
    fillSel(hs, M.headsOpts(h)); hs.value = String(M.nearest(M.headsOpts(h), curH));
    const d = M.divisors(Number(hs.value)); fillSel(kv, d); kv.value = String(M.nearest(d, curK));
    $('headDim').value = h / Number(hs.value);
  }
  window.LLMCalcSetShape = function (vals) { // used by llm-calc-reverse.js auto-fill
    ['hidden', 'heads', 'kvHeads', 'ffn', 'layers'].forEach(k => { if (vals[k] !== undefined) setVal($(k), vals[k]); });
    $('qkvBias').checked = false; recompute(); save();
  };
  function buildSelects() {
    fillSel($('hidden'), M.HIDDEN_OPTS); fillSel($('ffn'), M.FFN_OPTS); fillSel($('seq'), M.SEQ_OPTS);
    ['hidden', 'ffn', 'seq'].forEach(k => { $(k).value = $(k).dataset.def; });
    refreshHeads();
  }
  function apply(o) {
    fields().forEach(el => {
      if (!o || !Object.prototype.hasOwnProperty.call(o, el.id) || el.id === 'headDim') return;
      const v = o[el.id];
      if (el.type === 'checkbox') { if (typeof v === 'boolean') el.checked = v; }
      else if (SHAPE[el.id]) setVal(el, v);
      else if (el.tagName === 'SELECT') { if (Array.from(el.options).some(op => op.value === v)) el.value = v; }
      else if (typeof v === 'string' && (el.type === 'text' || v === '' || isFinite(Number(v)))) el.value = v;
    });
    refreshHeads();
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(snapshot())); } catch (e) { /* storage off / full */ } }
  function load() {
    try { const o = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (o && typeof o === 'object') { if (o.useTotal === true && !o.dataMode) o.dataMode = 'tokens'; apply(o); } } catch (e) { /* bad JSON: ignore */ }
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
    const t = { dataMode: $('dataMode').value, words: num('words'), totalTokens: num('totalTokens'), stories: num('stories'),
      tokensPerStory: num('tokensPerStory'), epochs: num('epochs'), batch: num('batch'), gpus: num('gpus'), accum: num('gradAccum'), minSteps: num('minSteps') };
    const ckpt = $('gradCkpt').checked;
    const o = readOutputs();
    $('totalTokens').disabled = t.dataMode !== 'tokens'; $('words').disabled = t.dataMode !== 'words';
    $('stories').disabled = $('tokensPerStory').disabled = t.dataMode !== 'stories';
    ['totalTokens', 'words', 'stories', 'tokensPerStory'].forEach(k => $(k).closest('.field').classList.toggle('off', $(k).disabled));

    const warns = [], al = [];
    // al: inline alerts { row, lvl: 'bad'|'amber', text, fixes: [values] }
    const A = (row, lvl, text, fixes) => al.push({ row, lvl, text, fixes: fixes || [] });
    ['vocab', 'hidden', 'layers', 'ffn', 'heads', 'kvHeads', 'seq', 'epochs', 'batch', 'tps', 'gradAccum'].forEach(k => {
      if (!(num(k) > 0)) A(k, 'bad', 'Must be a number above 0.', k === 'gradAccum' ? [1] : []);
    });
    if (m.heads > 0 && m.hidden % m.heads) A('hidden', 'bad', 'Hidden ' + fmt(m.hidden) + ' must divide evenly by heads (' + fmt(m.heads) + ').', M.nearMultiples(m.hidden, m.heads));
    if (m.kvHeads > 0 && m.heads % m.kvHeads) A('kvHeads', 'bad', 'Heads (' + fmt(m.heads) + ') must divide evenly by KV heads.', M.nearDivisors(m.heads, m.kvHeads));
    if (m.vocab > 0 && m.vocab % 64) A('vocab', 'amber', 'Vocab ' + fmt(m.vocab) + ' is not a multiple of 64 — GPUs run a bit faster with multiples of 64.', M.nearMultiples(m.vocab, 64));
    if (m.headDim > 0 && m.headDim * m.heads !== m.hidden) A('headDim', 'amber', 'Head size × heads (' + fmt(m.headDim * m.heads) + ') is not hidden size — fine if a real model does it (Gemma 3), otherwise leave Head size empty.');
    const p = M.params(m);
    const params = fmtM(p.total);
    $('rParams').textContent = $('bParams').textContent = params;
    $('rBreak').innerHTML = rows([
      ['Embeddings' + (m.tied ? ' (tied)' : ' (untied ×2)'), fmt(p.embed)],
      ['Attention / layer' + (m.qkvBias ? ' (incl. ' + fmt(p.bias) + ' bias)' : ''), fmt(p.attn)], ['MLP / layer', fmt(p.mlp)], ['Norms / layer', fmt(p.norms)],
      ['All ' + fmt(m.layers) + ' layers', fmt(p.layersTotal)], ['Final norm', fmt(p.finalNorm)], ['<b>Total</b>', '<b>' + fmt(p.total) + '</b>']
    ]);
    const os = M.outputSizes(p.total, o, { hidden: m.hidden, ffn: m.ffn, total: p.total, mlpTotal: p.mlp * m.layers });
    if (o.gguf && o.ggufType === 'q4_k_m') ['hidden', 'ffn'].forEach(k => { if (m[k] > 0 && m[k] % 256) A(k, 'amber', (k === 'ffn' ? 'FFN ' : 'Hidden ') + fmt(m[k]) + " isn't a multiple of 256, so Q4_K_M stores those tensors in a bigger format (file a bit larger).", M.nearMultiples(m[k], 256)); });
    $('rSizes').innerHTML = os.list.length ? rows(os.list.map(f => [f.name, '~' + fmtMB(f.mb)]).concat([['<b>Total disk</b>', '<b>~' + fmtMB(os.total) + '</b>']])) : rows([['No outputs selected', '—']]);
    const ref = M.fileSizes(p.total);
    $('rSizesRef').textContent = 'Other formats (reference): fp16 ~' + fmtMB(ref[1].mb) + '';

    const tr = M.training(t, seq);
    $('rTokens').textContent = fmt(tr.tokens);
    $('rBlocks').textContent = fmt(tr.blocks);
    $('rEff').textContent = fmt(tr.effectiveBatch);
    $('rTps').textContent = fmt(tr.tokensPerStep);
    $('rSpe').textContent = $('rSpeBig').textContent = $('rSpeHint').textContent = fmt(tr.stepsPerEpoch);
    if (M.MEASURED_RUNS) $('rMeasured').textContent = M.MEASURED_RUNS;
    $('rSteps').textContent = $('rStepsBig').textContent = $('bSteps').textContent = fmt(tr.totalSteps);
    $('rMinNote').textContent = tr.raised ? 'Min steps ' + fmt(tr.minSteps) + ' raises the total: data repeats ~' + tr.repeats.toFixed(1) + ' times.' : '';

    $('rTpp').textContent = p.total ? (tr.tokens / p.total).toFixed(2) : '—';
    const of = M.overfit(tr.tokens, p.total);
    const dataRow = t.dataMode === 'words' ? 'words' : t.dataMode === 'tokens' ? 'totalTokens' : 'stories';
    if (of.level === 'bad') A(dataRow, 'bad', 'Overfit risk: only ' + of.ratio.toFixed(2) + ' tokens per parameter per epoch — the model will memorise the data. Use more data or a smaller model.');
    else if (of.level === 'note') A(dataRow, 'amber', 'Note: ' + of.ratio.toFixed(1) + ' tokens per parameter (guideline ~20). Fine for experiments; more data helps.');
    const tps = M.scaledTps(num('tps'), p.total);
    $('rSpeed').innerHTML = rows([['Speed at 26M (your box)', fmt(num('tps')) + ' tok/s'], ['Scaled for ' + fmtM(p.total) + ' (×' + M.speedFactor(p.total).toFixed(2) + ')', fmt(tps) + ' tok/s per GPU'],
      ['All GPUs' + (t.gpus > 1 ? ' (×1.8)' : '') + (ckpt ? ', checkpointing ÷1.25' : ''), fmt(tps * (t.gpus > 1 ? M.TWO_GPU_SCALE * t.gpus / 2 : 1) / (ckpt ? M.CKPT_TIME : 1)) + ' tok/s']]);
    const sec = M.timeSec(tr.tokensTrained, tps, t.gpus, ckpt);
    $('rTime').textContent = $('bTime').textContent = isFinite(sec) ? fmtTime(sec) : '—';
    if (sec > 12 * 3600) warns.push('Longer than a Kaggle session (~12 h). Save checkpoints and resume.');
    if (sec > 30 * 3600) warns.push('More than the weekly Kaggle GPU quota (~30 h, approximate).');

    const mem = M.memoryFull({ p: p.total, batch: t.batch, seq, h: m.hidden, layers: m.layers, heads: m.heads, vocab: m.vocab, gpus: t.gpus, ckpt });
    const pr = M.GPU_PRESETS[$('preset').value], cpu = !!pr.cpu;
    const gb = mem.gpu0 / M.GB, limit = cpu ? Infinity : pr.mem;
    $('rMem').textContent = gb.toFixed(2) + ' GB' + (cpu ? ' (RAM)' : t.gpus > 1 ? ' on GPU 0' : ' / GPU');
    $('bMem').textContent = gb.toFixed(1) + ' GB';
    $('rMemBreak').innerHTML = rows([
      ['Weights + grads + AdamW (~16 B/param)', (mem.states / M.GB).toFixed(2) + ' GB'],
      [ckpt ? 'Activations (rough, checkpointing ×0.25)' : 'Activations (rough)', '~' + (mem.acts / M.GB).toFixed(2) + ' GB'],
      ['Attention scores' + (ckpt ? ' (×0.25)' : ''), '~' + (mem.attn / M.GB).toFixed(2) + ' GB'],
      ['Logits + grads (batch × context × vocab)', '~' + (mem.logits / M.GB).toFixed(2) + ' GB'],
      ['Each GPU', (mem.total / M.GB).toFixed(2) + ' GB'],
    ].concat(t.gpus > 1 ? [['GPU 0 extra (DataParallel gathers logits)', '~' + (mem.gather / M.GB).toFixed(2) + ' GB']] : []).concat([
      ['<b>' + (t.gpus > 1 ? 'GPU 0 total' : 'Total per GPU') + '</b>', '<b>' + gb.toFixed(2) + (cpu ? ' GB (in system RAM)' : ' GB of ' + limit + ' GB') + '</b>']]));
    const over = gb > limit;
    $('rMem').classList.toggle('bad', over); $('bMem').classList.toggle('bad', over);
    if (over) {
      const fb = M.fitBatch({ p: p.total, batch: t.batch, seq, h: m.hidden, layers: m.layers, heads: m.heads, vocab: m.vocab, gpus: t.gpus, ckpt }, limit);
      A('batch', 'bad', 'Likely out of memory: ' + gb.toFixed(1) + ' GB' + (t.gpus > 1 ? ' on GPU 0' : '') + ' > ' + limit + ' GB usable. ' +
        (fb ? 'Largest batch that fits: ' + fb + ' (raise Grad accumulation to keep the effective batch).' : 'Even batch 1 does not fit — lower context or vocab, or turn on checkpointing.'), fb ? [fb] : []);
    }
    // R10: system RAM (dataset + export copies; on CPU also all of training).
    const hr = M.hostRam(tr.tokens, p.total), ramGB = (hr.total + (cpu ? mem.total : 0)) / M.GB, ramLim = num('ram');
    $('rRam').innerHTML = rows([['Dataset (~4 B/token)', (hr.data / M.GB).toFixed(2) + ' GB'], ['Model copies while exporting (~3× fp32)', (hr.exports / M.GB).toFixed(2) + ' GB']]
      .concat(cpu ? [['Training (CPU)', (mem.total / M.GB).toFixed(2) + ' GB']] : []).concat([['<b>Total</b>', '<b>' + ramGB.toFixed(2) + ' GB of ' + fmt(ramLim) + ' GB</b>']]));
    if (ramLim > 0 && ramGB > ramLim) A('ram', 'bad', 'Needs ~' + ramGB.toFixed(1) + ' GB of system RAM, more than ' + fmt(ramLim) + ' GB. Use Max samples, a smaller model or fewer outputs.');
    renderAlerts(al);
    const nRows = new Set(al.map(x => x.row)).size;
    $('warns').innerHTML = (nRows ? '<li class="cnt">' + nRows + (nRows === 1 ? ' setting needs' : ' settings need') + ' attention (see the marked rows)</li>' : '') +
      warns.map(w => '<li>' + w + '</li>').join('');
    $('bDot').hidden = !(warns.length || nRows);
  }

  // R9: draw alerts under their rows; red = real problem, amber = gentle hint.
  function renderAlerts(al) {
    document.querySelectorAll('#in .alert').forEach(e => e.remove());
    document.querySelectorAll('#in .field.al-bad, #in .field.al-amber').forEach(f => f.classList.remove('al-bad', 'al-amber'));
    const by = {};
    al.forEach(x => { (by[x.row] = by[x.row] || []).push(x); });
    Object.keys(by).forEach(row => {
      const f = $(row).closest('.field'), list = by[row], bad = list.some(x => x.lvl === 'bad');
      f.classList.add(bad ? 'al-bad' : 'al-amber');
      const box = document.createElement('div');
      box.className = 'alert ' + (bad ? 'bad' : 'amber'); box.setAttribute('role', 'alert');
      list.forEach(x => {
        const p = document.createElement('p'); p.className = 'atext ' + x.lvl; p.textContent = x.text; box.appendChild(p);
        if (x.fixes.length) {
          const r = document.createElement('div'); r.className = 'fixes';
          x.fixes.forEach(v => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'btn fix'; b.textContent = 'Use ' + fmt(v);
            b.addEventListener('click', () => { setVal($(row), v); recompute(); save(); flash([row]); $(row).dispatchEvent(new Event('change', { bubbles: true })); });
            r.appendChild(b);
          });
          box.appendChild(r);
        }
      });
      f.after(box);
    });
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
    $('gpus').value = pr.gpus; $('tps').value = pr.tps; $('ram').value = pr.ram;
  }
  function doCalibrate() {
    const v = M.calibrate(num('cSteps'), num('cMin'), num('cBatch'), num('cSeq'), num('gpus'));
    // Run measured on the CURRENT model size -> convert back to the 26M reference speed.
    const ref = v / M.speedFactor(M.params(readModel()).total);
    if (isFinite(v) && v > 0) { $('tps').value = Math.round(ref); $('cOut').textContent = '→ ' + fmt(v) + ' tokens/sec per GPU for this model (' + fmt(ref) + ' at 26M)'; recompute(); save(); flash(['tps']); }
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
      if (BOOL_KEYS[key]) $(key).checked = !!exVal(e, key); else if (key !== 'headDim') setVal($(key), exVal(e, key));
      if (SHAPE[key] && window.LLMCalcReverse) window.LLMCalcReverse.markManual();
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
    buildSelects();
    defaults = snapshot();
    load();
    document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', () =>
      showHelp(b.dataset.help, b.closest('.field, h2')?.querySelector('label, span')?.textContent || 'Info')));
    $('helpClose').addEventListener('click', () => $('help').close());
    $('help').addEventListener('click', e => { if (e.target === $('help')) $('help').close(); });
    fields().forEach(el => {
      el.addEventListener('input', e => {
        if (el.id === 'modelName') { const c = el.value.replace(/[^A-Za-z0-9._-]/g, ''); if (c !== el.value) el.value = c; }
        if (e.isTrusted && el.id === 'layers' && window.LLMCalcReverse) window.LLMCalcReverse.markManual();
        recompute(); save(); });
      el.addEventListener('change', e => {
        if (el.id === 'preset') applyPreset();
        if (el.id === 'hidden' || el.id === 'heads') refreshHeads();
        if (e.isTrusted && (SHAPE[el.id] || el.id === 'layers') && el.id !== 'seq' && window.LLMCalcReverse) window.LLMCalcReverse.markManual();
        recompute(); save(); });
    });
    $('cBtn').addEventListener('click', doCalibrate);
    $('resetBtn').addEventListener('click', reset);
    $('rBar').addEventListener('click', toggleBar);
    $('glossary').innerHTML = window.LLMCalcGlossary.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('');
    recompute();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
