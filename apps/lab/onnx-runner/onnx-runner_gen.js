/*
 * ONNX Runner — Generate tab: prompt → tokenizer → worker sampling loop → streamed text.
 * Shown first when the model looks like a text model (int64 token ids in, logits [batch, seq, vocab] out).
 * Settings are remembered per model file name in localStorage (ONNX_CONFIG.storageKey + '.gen').
 */
(() => {
  const C = ONNX_CONFIG, R = window.OnnxRunner, st = R.state, esc = R.esc;
  const $ = (id) => document.getElementById(id);
  const KEY = C.storageKey + '.gen';
  const F = { maxNew: 'gMax', ctx: 'gCtx', greedy: 'gGreedy', temperature: 'gTemp', topK: 'gTopK', topP: 'gTopP', repPenalty: 'gRep', stop: 'gStop', addBos: 'gBos' };
  const g = { running: false, prompt: '', ids: [], text: '', V: null };

  /* ---------- tabs ---------- */
  function tab(name) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    $('tab-gen').hidden = name !== 'gen'; $('tab-raw').hidden = name !== 'raw';
  }
  document.querySelectorAll('.tab').forEach((b) => b.onclick = () => tab(b.dataset.tab));

  /* ---------- is this a text model? ---------- */
  function textModel() {
    if (!st.model) return null;
    const known = /^(attention_mask|position_ids|token_type_ids|past_key_values.*)$/;
    const ids = st.inputs.find((i) => i.name === 'input_ids') || (st.inputs.filter((i) => !known.test(i.name)).length === 1 ? st.inputs.find((i) => !known.test(i.name)) : null);
    if (!ids || (ids.type && ids.type !== 'int64')) return null;
    if (st.inputs.some((i) => i !== ids && !known.test(i.name))) return null;
    const out = st.outputs.find((o) => o.name === 'logits') || st.outputs[0];
    if (out.shape && out.shape.length !== 3 && out.shape.length !== 2) return null;
    const V = out.shape && typeof out.shape[out.shape.length - 1] === 'number' ? out.shape[out.shape.length - 1] : null;
    const seq = ids.shape && typeof ids.shape[1] === 'number' ? ids.shape[1] : null;
    return { idsName: ids.name, V, seq, kv: st.inputs.some((i) => /^past_key_values/.test(i.name)) };
  }

  /* ---------- settings ---------- */
  const all = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } };
  function read() {
    const o = {};
    for (const [k, id] of Object.entries(F)) { const el = $(id); o[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value; }
    return o;
  }
  function save() { if (!st.model) return; const a = all(); a[st.model] = { ...read(), prompt: $('prompt').value.slice(0, 20000) }; try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (_) { /* full */ } }
  function fill() {
    const tm = textModel(), keep = (st.model && all()[st.model]) || {};
    const d = { ...C.genDefaults, ctx: (st.tok && st.tok.ctx) || (tm && tm.seq) || C.genDefaults.ctx, addBos: !!(st.tok && st.tok.bosId !== undefined), ...keep };
    for (const [k, id] of Object.entries(F)) { const el = $(id); if (el.type === 'checkbox') el.checked = !!d[k]; else el.value = d[k]; }
    if (keep.prompt !== undefined) $('prompt').value = keep.prompt;
  }
  ['input', 'change'].forEach((t) => $('tab-gen').addEventListener(t, (e) => { if (e.target.id !== 'genOut') save(); }));

  /* ---------- state of the tab ---------- */
  function refresh() {
    const tm = textModel(), t = st.tok, warn = [];
    if (st.model && !tm) { $('genNote').textContent = 'This model does not look like a text model (int64 token ids → logits). Use the Tensors tab.'; tab('raw'); }
    else if (!st.model) $('genNote').textContent = 'Load a text model: token ids in (int64 input_ids), logits out, plus its tokenizer files.';
    else {
      $('genNote').innerHTML = 'Text model · ids input <b>' + esc(tm.idsName) + '</b>' + (tm.V ? ' · logits vocab ' + tm.V.toLocaleString() : '') +
        (tm.kv ? ' · KV cache (past_key_values) used' : ' · full sequence fed each step') + (t ? '' : ' · <b>load a tokenizer</b> (tokenizer.json, vocab.json + merges.txt, or a vocab JSON)');
      tab('gen');
    }
    const V = (tm && tm.V) || g.V;
    if (t && V && t.size !== V) warn.push('Tokenizer vocab size (' + t.size.toLocaleString() + ') differs from the model logits size (' + V.toLocaleString() + '). The tokenizer may not belong to this model' + (t.size < V ? ' (models often pad the vocab, which is fine)' : '') + '.');
    if (t && !t.eosIds.length) warn.push('No EOS token known: generation stops at Max new or a stop string. Add config.json to set eos_token_id.');
    if (t && t.notes && t.notes.length) warn.push(...t.notes);
    $('genWarn').hidden = !warn.length; $('genWarn').textContent = warn.join('\n');
    $('gen').disabled = !(tm && t) || g.running;
  }
  document.addEventListener('onnx:changed', () => { if (!g.running) { fill(); } refresh(); });

  /* ---------- output ---------- */
  function show() {
    $('genOut').innerHTML = '<span class="p">' + esc(g.prompt) + '</span><span class="g">' + esc(g.text) + '</span>';
    $('genOut').scrollTop = $('genOut').scrollHeight;
  }
  function done(reason, extra) {
    g.running = false; st.onGen = null; st.genId = null;
    $('stop').disabled = true; refresh();
    $('genStats').textContent = (extra || '') + ' · stopped: ' + reason;
  }
  function onGen(m) {
    if (m.type === 'error') { done('error'); R.showError('Generate: ' + m.message); return; }
    if (m.type === 'token') {
      if (m.V && g.V !== m.V) { g.V = m.V; refresh(); }
      g.ids.push(m.token);
      let text = st.tok.decode(g.ids);
      const stop = $('gStop').value;
      if (stop && text.includes(stop)) { text = text.slice(0, text.indexOf(stop)); g.stopHit = true; st.worker.postMessage({ type: 'stop' }); }
      g.text = text; show();
      $('genStats').textContent = m.n + ' tokens · ' + m.tps.toFixed(1) + ' tok/s';
      return;
    }
    done(g.stopHit ? 'stop string' : m.reason === 'eos' ? 'EOS' : m.reason === 'stop' ? 'Stop button' : 'max new tokens',
      m.n + ' tokens · ' + (m.ms / 1000).toFixed(2) + ' s · ' + m.tps.toFixed(1) + ' tok/s' + (m.kv ? ' · KV cache' : ''));
  }

  async function generate() {
    const tm = textModel(), t = st.tok;
    if (g.running || !tm || !t) return;
    R.showError('');
    const o = read();
    let ids;
    try {
      ids = t.encode($('prompt').value);
      if (o.addBos && t.bosId !== undefined && ids[0] !== t.bosId) ids.unshift(t.bosId);
      if (!ids.length) throw new Error('The prompt is empty' + (t.unknown && t.unknown() ? ' (all ' + t.unknown() + ' characters are unknown to the vocab)' : '') + '. Type something or tick Add BOS.');
      const V = tm.V || g.V;
      if (V) { const bad = ids.find((i) => i >= V); if (bad !== undefined) throw new Error('Token id ' + bad + ' is outside the model vocab (' + V + '). Wrong tokenizer?'); }
      if (!(o.maxNew >= 1)) throw new Error('Max new must be at least 1');
      if (tm.seq && o.ctx > tm.seq) throw new Error('Context ' + o.ctx + ' is larger than the model input length ' + tm.seq);
    } catch (e) { R.showError('Generate: ' + e.message); return; }
    save();
    g.running = true; g.prompt = $('prompt').value; g.ids = []; g.text = ''; g.stopHit = false;
    show();
    const unk = t.unknown ? t.unknown() : 0;
    $('genStats').textContent = 'prompt ' + ids.length + ' tokens' + (unk ? ' (' + unk + ' unknown skipped)' : '') + ' · running…';
    $('gen').disabled = true; $('stop').disabled = false;
    st.onGen = onGen;
    st.genId = ++st.seq;
    st.worker.postMessage({ type: 'generate', id: st.genId, ids, opts: { ...o, idsName: tm.idsName, eosIds: t.eosIds, kv: t.kv } });
  }

  $('gen').onclick = generate;
  $('stop').onclick = () => { if (g.running) st.worker.postMessage({ type: 'stop' }); };
  $('clear').onclick = () => { if (g.running) return; g.prompt = ''; g.text = ''; g.ids = []; $('prompt').value = ''; $('genOut').innerHTML = '<span class="muted">Output appears here.</span>'; $('genStats').textContent = ''; save(); };
  $('copyGen').onclick = async () => { try { await navigator.clipboard.writeText(g.prompt + g.text); $('genStats').textContent += ' · copied'; } catch (_) { $('genStats').textContent += ' · clipboard blocked'; } };
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !$('tab-gen').hidden) { e.preventDefault(); generate(); } });
  fill(); refresh();
  window.OnnxGen = { g, textModel, generate };
})();
