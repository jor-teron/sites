/*
 * File: llm-calc-reverse.js
 * Project: llm-calc (Lab) — R10 2026-10-20 (R3 released after R9; R10: one Target row
 *          at the top, auto-fills the best match as you type, 'manual' after hand edits)
 * Purpose: Reverse calculation. Pick ONE target (params, GGUF file size MB at the
 *          current GGUF type, or training-time budget in minutes); keeps current
 *          vocab, context, tied, data, epochs, batch, hardware. Enumerates sensible
 *          Llama shapes, drops ones that would raise row alerts (memory, heads,
 *          Q4_K_M 256-multiples), returns the top 3. Uses llm-calc-math.js only.
 *          Target is saved with the other inputs (llm-calc.v1), not exported.
 */
(function (root) {
  'use strict';
  const M = root.LLMCalcMath || (typeof require !== 'undefined' ? require('./llm-calc-math.js') : null);

  // base: { vocab, seq, tied, kvRatio, data(t for M.training), tps, gpus, ckpt, limitGB, gguf, ggufType }
  function metrics(base, sh) {
    const m = { vocab: base.vocab, hidden: sh.hidden, layers: sh.layers, ffn: sh.ffn, heads: sh.heads, kvHeads: sh.kvHeads, headDim: 0, tied: base.tied, qkvBias: false };
    const p = M.params(m).total;
    const gg = M.outputSizes(p, { gguf: true, ggufType: base.ggufType }, { hidden: sh.hidden, ffn: sh.ffn, total: p, mlpTotal: M.params(m).mlp * sh.layers });
    const tr = M.training(base.data, base.seq);
    const min = M.timeSec(tr.tokensTrained, M.scaledTps(base.tps, p), base.gpus, base.ckpt) / 60;
    const mem = M.memoryFull({ p, batch: base.data.batch, seq: base.seq, h: sh.hidden, layers: sh.layers, heads: sh.heads, vocab: base.vocab, gpus: base.gpus, ckpt: base.ckpt }).gpu0 / M.GB;
    return { params: p, mb: gg.list[0].mb, minutes: min, memGB: mem };
  }
  function search(base, mode, target) {
    if (!(target > 0)) return [];
    const q4 = base.ggufType === 'q4_k_m', out = [];
    for (let hidden = 64; hidden <= 4096; hidden += 64) {
      if (q4 && hidden % 256) continue;                       // Q4_K_M needs 256-multiples
      const hd = [64, 32, 128].find(d => hidden % d === 0);   // head size 64 preferred
      const heads = hidden / hd;
      const kv = base.kvRatio > 1 && heads % base.kvRatio === 0 ? heads / base.kvRatio : heads;
      const ffn = Math.max(256, Math.round(hidden * 8 / 3 / 256) * 256); // SwiGLU ≈ 2.67× hidden
      for (let layers = 2; layers <= 48; layers++) {
        const sh = { hidden, layers, heads, kvHeads: kv, ffn };
        const r = metrics(base, sh);
        if (r.memGB > base.limitGB) continue;                 // must fit at current batch
        const v = mode === 'size' ? r.mb : mode === 'time' ? r.minutes : r.params;
        const err = Math.abs(v - target) / target;
        if (mode === 'time' && v > target * 1.05) continue;   // budget: stay (about) under
        const lo = hidden / 64, hi = hidden / 32;              // depth/width band
        const band = layers < lo ? (lo - layers) / lo : layers > hi ? (layers - hi) / hi : 0;
        out.push(Object.assign({}, sh, r, { score: err + 0.3 * band }));
      }
    }
    return out.sort((a, b) => a.score - b.score).slice(0, 3);
  }
  const api = { search, metrics, markManual: () => {} };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LLMCalcReverse = api;

  // ---------------- Browser only ----------------
  const $ = id => document.getElementById(id);
  const num = id => parseFloat($(id).value) || 0;
  const fmtM = n => (n / 1e6).toFixed(1) + 'M';
  let manual = false, timer = 0;
  function readBase() {
    const pr = M.GPU_PRESETS[$('preset').value];
    return { vocab: num('vocab'), seq: num('seq'), tied: $('tied').checked,
      kvRatio: num('kvHeads') > 0 ? Math.max(1, Math.round(num('heads') / num('kvHeads'))) : 1,
      data: { dataMode: $('dataMode').value, words: num('words'), totalTokens: num('totalTokens'), stories: num('stories'), tokensPerStory: num('tokensPerStory'),
        epochs: num('epochs'), batch: num('batch'), gpus: num('gpus'), accum: num('gradAccum') },
      tps: num('tps'), gpus: num('gpus'), ckpt: $('gradCkpt').checked,
      limitGB: pr.cpu ? num('ram') : pr.mem, ggufType: $('ggufType').value };
  }
  function status() {
    const mode = $('revMode').value;
    $('revTarget').disabled = mode === 'off';
    $('revTarget').closest('.field').classList.toggle('manual', manual && mode !== 'off');
    if (mode === 'off') $('revOut').textContent = '';
    else if (manual) $('revOut').textContent = 'manual — you changed the shape yourself. Type a new target to auto-fill again.';
  }
  function fill() {
    const mode = $('revMode').value;
    if (mode === 'off') return status();
    manual = false;
    const target = num('revTarget') * (mode === 'params' ? 1e6 : 1);
    const best = search(readBase(), mode, target)[0];
    if (!best) { $('revOut').textContent = 'No shape fits (memory or budget). Try another target, a smaller batch or checkpointing.'; return status(); }
    window.LLMCalcSetShape(best);
    $('revOut').textContent = 'Auto: ' + fmtM(best.params) + ' · hidden ' + best.hidden + ' · ' + best.layers + ' layers · ' + best.heads + ' heads · FFN ' + best.ffn;
    status();
  }
  api.markManual = () => { if ($('revMode').value !== 'off') { manual = true; status(); } };
  document.addEventListener('DOMContentLoaded', () => {
    const later = () => { clearTimeout(timer); timer = setTimeout(fill, 350); };
    $('revTarget').addEventListener('input', later); $('revMode').addEventListener('change', later);
    $('resetBtn').addEventListener('click', () => setTimeout(() => { manual = false; status(); }, 0));
    status();
  });
})(this);
