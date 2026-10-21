/*
 * ONNX Runner — page logic: load model, build input editors, run in the worker, show outputs.
 * Input settings are remembered per model file name in localStorage (ONNX_CONFIG.storageKey).
 */
(() => {
  const C = ONNX_CONFIG, T = OnnxTensor;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const st = { worker: null, seq: 0, wait: {}, model: null, inputs: [], outputs: [], images: {}, last: null };

  /* ---------- worker ---------- */
  function call(msg, transfer) {
    if (!st.worker) {
      st.worker = new Worker('onnx-runner_worker.js');
      st.worker.onmessage = (e) => {
        const m = e.data, w = st.wait[m.id]; delete st.wait[m.id];
        if (m.type === 'token' || m.type === 'done') { if (st.onGen) st.onGen(m); return; }
      if (m.type === 'error' && st.genId === m.id && st.onGen) { st.onGen(m); return; }
      if (w) (m.type === 'error' ? w.no(new Error(m.message)) : w.ok(m));
      };
      st.worker.onerror = (e) => { Object.values(st.wait).forEach((w) => w.no(new Error(e.message || 'Worker failed'))); st.wait = {}; };
    }
    const id = ++st.seq;
    return new Promise((ok, no) => { st.wait[id] = { ok, no }; st.worker.postMessage({ ...msg, id }, transfer || []); });
  }

  function showError(msg) { const e = $('error'); e.hidden = !msg; e.textContent = msg || ''; }

  /* ---------- settings ---------- */
  function loadAll() { try { return JSON.parse(localStorage.getItem(C.storageKey)) || {}; } catch (_) { return {}; } }
  function saved() { return (st.model && loadAll()[st.model]) || {}; }
  function save() {
    if (!st.model) return;
    const all = loadAll(), s = {};
    for (const inp of st.inputs) {
      const card = $('in-' + inp.idx);
      const text = card.querySelector('.vals').value;
      s[inp.name] = {
        type: card.querySelector('.type').value, shape: card.querySelector('.shape').value,
        text: text.length <= C.storeTextMax ? text : '', mode: card.querySelector('.mode').value, image: imageOpts(card),
      };
    }
    all[st.model] = { inputs: s, softmax: $('softmax').checked };
    try { localStorage.setItem(C.storageKey, JSON.stringify(all)); } catch (_) { /* full */ }
  }

  /* ---------- model ---------- */
  /* Several files at once: one .onnx (a picker appears if there are more) + tokenizer / config files. */
  async function loadFiles(list) {
    const files = [...(list || [])];
    if (!files.length) return;
    showError('');
    const onnx = files.filter((f) => /\.onnx$/i.test(f.name));
    const other = files.filter((f) => OnnxText.isTokenizerFile(f.name));
    const bad = files.filter((f) => !onnx.includes(f) && !other.includes(f));
    if (!onnx.length && !other.length) { showError('No .onnx or tokenizer files in: ' + bad.map((f) => f.name).join(', ')); return; }
    if (other.length) await loadTokenizer(other);
    const pick = $('onnxPick');
    if (onnx.length > 1) {
      st.onnxFiles = onnx; pick.hidden = false;
      pick.innerHTML = onnx.map((f, i) => '<option value="' + i + '">' + esc(f.webkitRelativePath || f.name) + '</option>').join('');
      const def = Math.max(0, onnx.findIndex((f) => /^model\.onnx$/i.test(f.name)));
      pick.value = String(def);
      await loadFile(onnx[def]);
    } else if (onnx.length) { pick.hidden = true; await loadFile(onnx[0]); }
  }
  async function loadTokenizer(files) {
    try {
      $('tokInfo').textContent = 'Reading tokenizer…';
      const t = await OnnxText.load(files);
      if (!t) { $('tokInfo').textContent = 'No tokenizer found in: ' + files.map((f) => f.name).join(', '); return; }
      st.tok = t;
      $('tokInfo').innerHTML = '<b>Tokenizer:</b> ' + esc(t.label) + ' · vocab ' + t.size.toLocaleString() +
        (t.eosIds.length ? ' · EOS ' + t.eosIds.join('/') : ' · no EOS') + (t.bosId !== undefined ? ' · BOS ' + t.bosId : '') +
        (t.ctx ? ' · context ' + t.ctx : '') + (t.hasConfig ? ' · config.json' : '');
    } catch (e) { st.tok = null; $('tokInfo').textContent = 'No tokenizer loaded.'; showError('Tokenizer: ' + e.message); }
    document.dispatchEvent(new Event('onnx:changed'));
  }
  async function loadFile(file) {
    if (!file) return;
    showError('');
    $('modelInfo').textContent = 'Loading ' + file.name + ' (' + (file.size / 1e6).toFixed(2) + ' MB)…';
    $('run').disabled = true;
    try {
      const buf = await file.arrayBuffer();
      const r = await call({ type: 'load', model: buf, backend: $('backend').value, ortScript: C.ortScript, wasmPath: C.ortWasmPath }, [buf]);
      st.model = file.name; st.inputs = r.inputs.map((m, idx) => ({ ...m, idx })); st.outputs = r.outputs; st.images = {};
      $('modelInfo').textContent = file.name + ' · ' + (file.size / 1e6).toFixed(2) + ' MB · ORT Web ' + C.ortVersion;
      const b = $('backendBadge'); b.hidden = false; b.textContent = r.backend.toUpperCase();
      $('metaIn').innerHTML = metaTable('Inputs', r.inputs); $('metaOut').innerHTML = metaTable('Outputs', r.outputs);
      $('softmax').checked = !!saved().softmax;
      buildInputs(); $('outputs').innerHTML = '<span class="muted">Run the model to see outputs.</span>'; $('runTime').textContent = '';
      $('run').disabled = false;
      document.dispatchEvent(new Event('onnx:changed'));
    } catch (e) {
      $('modelInfo').textContent = 'No model loaded.'; st.model = null;
      showError('Could not open the model: ' + e.message);
    }
  }
  const shapeText = (s) => (s ? '[' + s.map((d) => (d === null ? '?' : d)).join(', ') + ']' : 'unknown');
  function metaTable(title, list) {
    return '<h3>' + title + '</h3><table class="meta"><tr><th>name</th><th>type</th><th>shape</th></tr>' +
      list.map((m) => '<tr><td>' + esc(m.name) + '</td><td>' + esc(m.type || '?') + '</td><td>' + esc(shapeText(m.shape)) + '</td></tr>').join('') + '</table>';
  }

  /* ---------- input editors ---------- */
  function buildInputs() {
    const s = saved().inputs || {};
    const box = $('inputs'); box.classList.remove('muted'); box.innerHTML = '';
    for (const inp of st.inputs) {
      const def = T.defaultShape(inp.shape), keep = s[inp.name] || {};
      const type = keep.type || (C.types.includes(inp.type) ? inp.type : 'float32');
      const unknown = !inp.shape || inp.shape.some((d) => typeof d !== 'number');
      const im = { ...C.imageDefaults, ...(keep.image || {}) };
      if (inp.shape && inp.shape.length === 4) {
        const sh = inp.shape;
        if (sh[1] === 3 && typeof sh[2] === 'number' && !keep.image) { im.layout = 'NCHW'; im.h = sh[2]; im.w = sh[3]; }
        else if (sh[3] === 3 && typeof sh[1] === 'number' && !keep.image) { im.layout = 'NHWC'; im.h = sh[1]; im.w = sh[2]; }
      }
      const card = document.createElement('div');
      card.className = 'card'; card.id = 'in-' + inp.idx;
      card.innerHTML =
        '<h3>' + esc(inp.name) + ' <span class="muted small">' + esc(inp.type || '?') + ' ' + esc(shapeText(inp.shape)) + '</span></h3>' +
        '<div class="row"><label>Type <select class="type">' + C.types.map((t) => '<option' + (t === type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
        '<label>Shape <input class="shape" type="text" value="' + esc(keep.shape || (def ? def.join(', ') : '1')) + '"></label>' +
        (unknown ? '<span class="muted small">unknown dims set to ' + C.symbolicDimDefault + ' — edit if needed</span>' : '') + '</div>' +
        '<div class="row"><label>Source <select class="mode"><option value="text">Values</option><option value="image">Image</option></select></label></div>' +
        '<div class="textMode"><div class="row small">Fill: ' + ['zeros', 'ones', 'random', 'range'].map((k) => '<button class="ghost fill" data-k="' + k + '">' + k + '</button>').join('') + '</div>' +
        '<textarea class="vals" spellcheck="false" placeholder="JSON [[1,2],[3,4]] or 1, 2, 3, 4"></textarea></div>' +
        '<div class="imageMode" hidden><div class="row"><input class="imgFile" type="file" accept="image/*"><img class="preview" hidden alt=""></div>' +
        '<div class="row">H <input class="num ih" type="number" min="1" value="' + im.h + '"> W <input class="num iw" type="number" min="1" value="' + im.w + '">' +
        '<select class="layout"><option' + (im.layout === 'NCHW' ? ' selected' : '') + '>NCHW</option><option' + (im.layout === 'NHWC' ? ' selected' : '') + '>NHWC</option></select>' +
        '<select class="norm"><option value="unit">0–1</option><option value="meanstd">mean/std</option><option value="raw">0–255</option></select></div>' +
        '<div class="row ms">mean <input class="mean" type="text" value="' + esc(im.mean) + '"> std <input class="std" type="text" value="' + esc(im.std) + '"></div>' +
        '<div class="muted small">Image inputs are float32, shape set from H/W/layout.</div></div>';
      box.appendChild(card);
      card.querySelector('.norm').value = im.norm;
      card.querySelector('.mode').value = keep.mode === 'image' ? 'image' : 'text';
      const vals = card.querySelector('.vals');
      if (keep.text) vals.value = keep.text;
      else { try { vals.value = T.fillText(type === 'int64' || type === 'int32' ? 'range' : 'zeros', type, T.parseShape(card.querySelector('.shape').value)); } catch (_) { /* big */ } }
      const sync = () => {
        const img = card.querySelector('.mode').value === 'image';
        card.querySelector('.textMode').hidden = img; card.querySelector('.imageMode').hidden = !img;
        card.querySelector('.ms').hidden = card.querySelector('.norm').value !== 'meanstd';
      };
      sync();
      card.addEventListener('change', (e) => {
        if (e.target.classList.contains('imgFile')) pickImage(inp, card, e.target.files[0]);
        sync(); save();
      });
      card.addEventListener('input', () => save());
      card.querySelectorAll('.fill').forEach((b) => b.onclick = () => {
        try {
          showError('');
          vals.value = T.fillText(b.dataset.k, card.querySelector('.type').value, T.parseShape(card.querySelector('.shape').value));
          save();
        } catch (e) { showError(inp.name + ': ' + e.message); }
      });
    }
  }
  function imageOpts(card) {
    return { h: +card.querySelector('.ih').value, w: +card.querySelector('.iw').value, layout: card.querySelector('.layout').value,
      norm: card.querySelector('.norm').value, mean: card.querySelector('.mean').value, std: card.querySelector('.std').value };
  }
  function pickImage(inp, card, file) {
    st.images[inp.name] = file || null;
    const p = card.querySelector('.preview');
    if (file) { p.src = URL.createObjectURL(file); p.hidden = false; } else p.hidden = true;
  }

  /* ---------- run ---------- */
  async function run() {
    if (!st.model || $('run').disabled) return;
    showError(''); $('run').disabled = true; $('runTime').textContent = 'Running…';
    try {
      const feeds = {}, transfer = [];
      for (const inp of st.inputs) {
        const card = $('in-' + inp.idx);
        let type, dims, data;
        try {
          if (card.querySelector('.mode').value === 'image') {
            const f = st.images[inp.name];
            if (!f) throw new Error('pick an image first');
            const t = await T.fromImage(f, imageOpts(card));
            type = 'float32'; dims = t.dims; data = t.data;
          } else {
            type = card.querySelector('.type').value;
            dims = T.parseShape(card.querySelector('.shape').value);
            data = T.fromText(type, dims, card.querySelector('.vals').value);
          }
          checkAgainstModel(inp, type, dims);
        } catch (e) { throw new Error('Input "' + inp.name + '": ' + e.message); }
        feeds[inp.name] = { type, dims, data: data.buffer };
        transfer.push(data.buffer);
      }
      save();
      const r = await call({ type: 'run', feeds }, transfer);
      st.last = r;
      $('runTime').textContent = r.ms.toFixed(1) + ' ms';
      renderOutputs();
    } catch (e) {
      $('runTime').textContent = '';
      showError(e.message);
    } finally { $('run').disabled = !st.model; }
  }
  function checkAgainstModel(inp, type, dims) {
    if (inp.type && inp.type !== type) throw new Error('the model expects ' + inp.type + ', but ' + type + ' is selected');
    if (!inp.shape) return;
    if (inp.shape.length !== dims.length) throw new Error('the model expects rank ' + inp.shape.length + ' ' + shapeText(inp.shape) + ', got [' + dims.join(', ') + ']');
    inp.shape.forEach((d, i) => { if (typeof d === 'number' && d !== dims[i]) throw new Error('dim ' + i + ' must be ' + d + ' ' + shapeText(inp.shape) + ', got ' + dims[i]); });
  }

  function fmt(v) { return Number.isInteger(v) ? String(v) : Math.abs(v) >= 1e-3 && Math.abs(v) < 1e5 ? v.toFixed(5) : v.toExponential(4); }
  function renderOutputs() {
    const r = st.last; if (!r) return;
    const box = $('outputs'); box.classList.remove('muted'); box.innerHTML = '';
    for (const o of st.outputs) {
      const out = r.outputs[o.name]; if (!out) continue;
      const vals = T.toNumbers(out.type, out.data);
      const card = document.createElement('div'); card.className = 'card out';
      const tk = T.topK(vals, out.dims, C.topK, $('softmax').checked);
      card.innerHTML = '<h3>' + esc(o.name) + ' <span class="muted small">' + esc(out.type) + ' [' + out.dims.join(', ') + '] · ' + vals.length.toLocaleString() + ' values</span></h3>' +
        (tk.rows.length ? '<div class="row small">argmax <b class="argmax">' + tk.argmax + '</b> <span class="muted">' + esc(tk.note) + '</span></div>' +
          '<table class="topk"><tr><th>#</th><th>index</th><th>' + ($('softmax').checked ? 'prob' : 'value') + '</th></tr>' +
          tk.rows.map((x, i) => '<tr><td>' + (i + 1) + '</td><td>' + x.index + '</td><td>' + fmt(x.value) + '</td></tr>').join('') + '</table>' : '') +
        '<div class="values"></div><div class="row"><button class="ghost more" hidden>Show all</button><button class="ghost copy">Copy JSON</button><span class="muted small copied"></span></div>';
      const vbox = card.querySelector('.values'), more = card.querySelector('.more');
      const show = (n) => { vbox.textContent = vals.slice(0, n).map(fmt).join(', ') + (vals.length > n ? ', … (' + (vals.length - n).toLocaleString() + ' more)' : ''); };
      show(C.previewValues);
      if (vals.length > C.previewValues) {
        more.hidden = false;
        more.onclick = () => { show(C.maxShownValues); more.hidden = true; };
      }
      card.querySelector('.copy').onclick = async () => {
        const txt = JSON.stringify({ name: o.name, type: out.type, dims: out.dims, data: vals });
        try { await navigator.clipboard.writeText(txt); card.querySelector('.copied').textContent = 'Copied'; }
        catch (_) { card.querySelector('.copied').textContent = 'Clipboard blocked'; }
      };
      box.appendChild(card);
    }
  }

  /* ---------- wire up ---------- */
  const hasGpu = !!navigator.gpu;
  $('backend').innerHTML = C.backends.map((b) => '<option value="' + b + '"' + (b === 'webgpu' && !hasGpu ? ' disabled' : '') + '>' +
    (b === 'auto' ? 'Auto (' + (hasGpu ? 'WebGPU, else WASM' : 'WASM') + ')' : b === 'webgpu' ? 'WebGPU' + (hasGpu ? '' : ' (not available)') : 'WASM') + '</option>').join('');
  const drop = $('drop');
  $('file').onchange = (e) => loadFiles(e.target.files);
  $('folder').onchange = (e) => loadFiles(e.target.files);
  $('pickFolder').onclick = () => $('folder').click();
  $('onnxPick').onchange = () => loadFile(st.onnxFiles[+$('onnxPick').value]);
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') $('file').click(); });
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  /* Dropped folders are walked (webkitGetAsEntry); plain files are used as they are. */
  async function walk(entry, out) {
    if (entry.isFile) out.push(await new Promise((ok, no) => entry.file(ok, no)));
    else if (entry.isDirectory) {
      const rd = entry.createReader();
      for (;;) { const batch = await new Promise((ok, no) => rd.readEntries(ok, no)); if (!batch.length) break; for (const x of batch) await walk(x, out); }
    }
  }
  drop.addEventListener('drop', async (e) => {
    const items = [...(e.dataTransfer.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (items.some((x) => x.isDirectory)) { const out = []; for (const x of items) await walk(x, out); loadFiles(out); }
    else loadFiles(e.dataTransfer.files);
  });
  $('run').onclick = run;
  $('softmax').onchange = () => { renderOutputs(); save(); };
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !$('tab-raw').hidden) { e.preventDefault(); run(); }
  });
  window.OnnxRunner = { state: st, run, loadFile, loadFiles, call, showError, esc };
})();
