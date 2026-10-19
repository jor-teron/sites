/*
 * File: llm-calc-ui.js
 * Project: llm-calc (Lab) — R2 2026-10-19
 * Purpose: Reads inputs, recomputes on every change, renders results,
 *          handles ⓘ help popups, GPU presets and calibration.
 *          R2: "Real models" tap-to-copy list in each model setting's ⓘ,
 *          "Load whole model" picker, official vs calculated params.
 *          Depends on llm-calc-math.js, llm-calc-help.js, llm-calc-examples.js.
 */
(function () {
  'use strict';
  const M = window.LLMCalcMath, H = window.LLMCalcHelp, X = window.LLMCalcExamples;
  const MODEL_KEYS = ['vocab', 'hidden', 'layers', 'ffn', 'heads', 'kvHeads', 'headDim', 'seq', 'tied', 'qkvBias'];
  const BOOL_KEYS = { tied: 1, qkvBias: 1 };
  const $ = id => document.getElementById(id);
  const num = id => parseFloat($(id).value) || 0;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const fmtM = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : (n / 1e6).toFixed(2) + 'M';
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function readModel() {
    return { vocab: num('vocab'), hidden: num('hidden'), layers: num('layers'), ffn: num('ffn'),
      heads: num('heads'), kvHeads: num('kvHeads'), headDim: num('headDim'),
      tied: $('tied').checked, qkvBias: $('qkvBias').checked };
  }
  // Same architecture (context ignored: it does not change the parameter count)?
  function sameArch(m, e) {
    const hd = x => (x.headDim > 0 ? x.headDim : x.hidden / x.heads);
    return ['vocab', 'hidden', 'layers', 'ffn', 'heads', 'kvHeads'].every(k => m[k] === e[k]) &&
      hd(m) === hd(e) && m.tied === e.tied && m.qkvBias === e.qkvBias;
  }
  function showOfficial(m, total) {
    const e = X.MODELS.find(x => sameArch(m, x));
    const mine = !e && sameArch(m, X.MY_MODEL);
    const sel = $('loadModel');
    sel.value = e ? e.id : mine ? 'my' : 'custom';
    $('modelNote').hidden = !e; $('modelNote').textContent = e ? e.note : '';
    const o = $('rOfficial');
    if (!e) { o.hidden = true; return; }
    const d = (total - e.official) / e.official * 100;
    const ok = Math.abs(d) < 0.05;
    o.hidden = false;
    o.innerHTML = esc(e.name) + ' official: <b>' + fmtM(e.official) + '</b> · ours: <b>' + fmtM(total) + '</b> ' +
      (ok ? '<span class="ok">✓ ' + (d === 0 ? 'exact' : (d > 0 ? '+' : '') + d.toFixed(3) + '%') + '</span>'
          : '<span class="bad">' + (d > 0 ? '+' : '') + d.toFixed(1) + '%</span>');
  }
  const fmtMB = mb => mb >= 1000 ? (mb / 1000).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
  const fmtTime = s => { const m = s / 60; return m < 60 ? m.toFixed(1) + ' min' : Math.floor(m / 60) + ' h ' + Math.round(m % 60) + ' min'; };

  function recompute() {
    const m = readModel();
    const seq = num('seq');
    const t = { useTotal: $('useTotal').checked, totalTokens: num('totalTokens'), stories: num('stories'),
      tokensPerStory: num('tokensPerStory'), epochs: num('epochs'), batch: num('batch'), gpus: num('gpus') };
    $('totalTokens').disabled = !t.useTotal;
    $('stories').disabled = $('tokensPerStory').disabled = t.useTotal;

    const warns = [];
    if (m.heads && m.hidden % m.heads) warns.push('Hidden size should divide evenly by heads.');
    if (m.kvHeads && m.heads % m.kvHeads) warns.push('Heads should divide evenly by KV heads.');
    if (m.headDim > 0 && m.headDim * m.heads !== m.hidden) warns.push('Head size × heads (' + fmt(m.headDim * m.heads) + ') is not hidden size — fine if a real model does it (Gemma 3), otherwise leave Head size empty.');
    const p = M.params(m);
    $('rParams').textContent = fmtM(p.total);
    showOfficial(m, p.total);
    $('rBreak').innerHTML = [
      ['Embeddings' + (m.tied ? ' (tied)' : ' (untied ×2)'), p.embed],
      ['Attention / layer' + (m.qkvBias ? ' (incl. ' + fmt(p.bias) + ' bias)' : ''), p.attn], ['MLP / layer', p.mlp], ['Norms / layer', p.norms],
      ['All ' + m.layers + ' layers', p.layersTotal], ['Final norm', p.finalNorm]
    ].map(([k, v]) => '<tr><td>' + k + '</td><td>' + fmt(v) + '</td></tr>').join('');
    $('rSizes').innerHTML = M.fileSizes(p.total).map(f => '<tr><td>' + f.name + '</td><td>~' + fmtMB(f.mb) + '</td></tr>').join('');

    const tr = M.training(t, seq);
    $('rTokens').textContent = fmt(tr.tokens);
    $('rBlocks').textContent = fmt(tr.blocks);
    $('rTps').textContent = fmt(tr.tokensPerStep);
    $('rSpe').textContent = fmt(tr.stepsPerEpoch);
    $('rSteps').textContent = fmt(tr.totalSteps);

    const sec = M.timeSec(tr.tokensTrained, num('tps'), t.gpus);
    $('rTime').textContent = isFinite(sec) ? fmtTime(sec) : '—';
    if (sec > 12 * 3600) warns.push('Longer than a Kaggle session (~12 h). Save checkpoints and resume.');
    if (sec > 30 * 3600) warns.push('More than the weekly Kaggle GPU quota (~30 h, approximate).');

    const mem = M.memory(p.total, t.batch, seq, m.hidden, m.layers);
    const gb = mem.total / M.GB, limit = M.GPU_PRESETS[$('preset').value].mem;
    $('rMem').textContent = gb.toFixed(2) + ' GB / GPU';
    $('rMemBreak').textContent = 'weights+optimizer ' + (mem.states / M.GB).toFixed(2) + ' GB + activations ~' + (mem.acts / M.GB).toFixed(2) + ' GB (rough)';
    $('rMem').classList.toggle('bad', gb > limit);
    if (gb > limit) warns.push('Memory over ' + limit + ' GB per GPU — lower batch, context or model size.');
    $('warns').innerHTML = warns.map(w => '<li>' + w + '</li>').join('');
  }

  function applyPreset() {
    const pr = M.GPU_PRESETS[$('preset').value];
    $('gpus').value = pr.gpus; $('tps').value = pr.tps; recompute();
  }
  function doCalibrate() {
    const v = M.calibrate(num('cSteps'), num('cMin'), num('cBatch'), num('cSeq'), num('gpus'));
    if (isFinite(v) && v > 0) { $('tps').value = Math.round(v); $('cOut').textContent = '→ ' + fmt(v) + ' tokens/sec per GPU'; recompute(); }
    else $('cOut').textContent = 'Fill in all four boxes.';
  }

  // Value of one setting for a model, as shown in the list and as copied into the input.
  const exVal = (e, key) => key === 'headDim' ? (e.headDimAuto ? e.hidden / e.heads : e.headDim) : e[key];
  const showVal = (e, key) => {
    if (BOOL_KEYS[key]) return e[key] ? 'yes' : 'no';
    const v = fmt(exVal(e, key));
    if (key === 'seq' && e.id === 'mistral7b') return v + ' (window 4,096)';
    if (key === 'seq' && e.id === 'phi3') return v + ' (window 2,047)';
    if (key === 'seq' && e.id === 'gemma270') return v + ' (window 512*)';
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
      setField(key, exVal(e, key));
      $('help').close(); recompute(); flash([key]);
    }));
  }
  function setField(key, v) {
    if (BOOL_KEYS[key]) $(key).checked = !!v; else $(key).value = v;
  }
  function flash(keys) {
    keys.forEach(k => { const f = $(k).closest('.field'); f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash'); });
  }
  function loadModel() {
    const id = $('loadModel').value;
    const e = id === 'my' ? X.MY_MODEL : X.MODELS.find(x => x.id === id);
    if (!e) return;
    MODEL_KEYS.forEach(k => setField(k, k === 'headDim' ? (e.headDimAuto ? '' : e.headDim) : e[k]));
    recompute(); flash(MODEL_KEYS);
  }
  function showHelp(key, title) {
    $('helpTitle').textContent = title; $('helpText').textContent = H[key] || '';
    realModelsList(key);
    $('help').showModal();
  }
  function init() {
    document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', () =>
      showHelp(b.dataset.help, b.closest('.field, summary, .row')?.querySelector('label, span')?.textContent || 'Info')));
    $('helpClose').addEventListener('click', () => $('help').close());
    $('help').addEventListener('click', e => { if (e.target === $('help')) $('help').close(); });
    document.querySelectorAll('input, select').forEach(el => { if (el.id !== 'loadModel') el.addEventListener('input', recompute); });
    $('preset').addEventListener('change', applyPreset);
    $('loadModel').insertAdjacentHTML('beforeend', X.MODELS.map(e => '<option value="' + e.id + '">' + esc(e.name) + '</option>').join(''));
    $('loadModel').addEventListener('change', loadModel);
    $('cBtn').addEventListener('click', doCalibrate);
    $('glossary').innerHTML = window.LLMCalcGlossary.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('');
    recompute();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
