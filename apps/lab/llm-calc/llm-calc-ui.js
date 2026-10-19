/*
 * File: llm-calc-ui.js
 * Project: llm-calc (Lab) — R1 2026-10-19
 * Purpose: Reads inputs, recomputes on every change, renders results,
 *          handles ⓘ help popups, GPU presets and calibration.
 *          Depends on llm-calc-math.js and llm-calc-help.js.
 */
(function () {
  'use strict';
  const M = window.LLMCalcMath, H = window.LLMCalcHelp;
  const $ = id => document.getElementById(id);
  const num = id => parseFloat($(id).value) || 0;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const fmtM = n => (n / 1e6).toFixed(2) + 'M';
  const fmtMB = mb => mb >= 1000 ? (mb / 1000).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
  const fmtTime = s => { const m = s / 60; return m < 60 ? m.toFixed(1) + ' min' : Math.floor(m / 60) + ' h ' + Math.round(m % 60) + ' min'; };

  function recompute() {
    const m = { vocab: num('vocab'), hidden: num('hidden'), layers: num('layers'), ffn: num('ffn'),
      heads: num('heads'), kvHeads: num('kvHeads'), tied: $('tied').checked };
    const seq = num('seq');
    const t = { useTotal: $('useTotal').checked, totalTokens: num('totalTokens'), stories: num('stories'),
      tokensPerStory: num('tokensPerStory'), epochs: num('epochs'), batch: num('batch'), gpus: num('gpus') };
    $('totalTokens').disabled = !t.useTotal;
    $('stories').disabled = $('tokensPerStory').disabled = t.useTotal;

    const warns = [];
    if (m.heads && m.hidden % m.heads) warns.push('Hidden size should divide evenly by heads.');
    if (m.kvHeads && m.heads % m.kvHeads) warns.push('Heads should divide evenly by KV heads.');
    const p = M.params(m);
    $('rParams').textContent = fmtM(p.total);
    $('rBreak').innerHTML = [
      ['Embeddings' + (m.tied ? ' (tied)' : ' (untied ×2)'), p.embed],
      ['Attention / layer', p.attn], ['MLP / layer', p.mlp], ['Norms / layer', p.norms],
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

  function showHelp(key, title) {
    $('helpTitle').textContent = title; $('helpText').textContent = H[key] || '';
    $('help').showModal();
  }
  function init() {
    document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', () =>
      showHelp(b.dataset.help, b.closest('.field, summary, .row')?.querySelector('label, span')?.textContent || 'Info')));
    $('helpClose').addEventListener('click', () => $('help').close());
    $('help').addEventListener('click', e => { if (e.target === $('help')) $('help').close(); });
    document.querySelectorAll('input, select').forEach(el => el.addEventListener('input', recompute));
    $('preset').addEventListener('change', applyPreset);
    $('cBtn').addEventListener('click', doCalibrate);
    $('glossary').innerHTML = window.LLMCalcGlossary.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('');
    recompute();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
