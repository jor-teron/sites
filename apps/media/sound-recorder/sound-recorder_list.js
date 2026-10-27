/* Sound Recorder — Recordings screen: list with mini waveform, rename / delete (own dialogs), download, import. */
(() => {
  'use strict';
  const { $, toast } = SR;
  let items = [];
  const when = (ms) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

  async function load() {
    try { items = await SRStore.all(); } catch (_) { items = []; toast('Storage not available'); }
    render();
  }
  function render() {
    const ul = $('l-items');
    ul.innerHTML = items.map((r) => '<li data-id="' + r.id + '"' + (r.id === SR.S.cur ? ' class="cur"' : '') + '><div class="meta"><div class="nm">' + SR.esc(r.name) +
      '</div><div class="sub">' + when(r.date) + ' · <b>' + SR.fmt(r.dur) + '</b> · ' + size(r.size || 0) + '</div><canvas></canvas></div><div class="acts">' +
      '<button type="button" data-a="ren" aria-label="Rename" title="Rename">&#9998;</button>' +
      '<button type="button" data-a="dl" aria-label="Download" title="Download">&#8595;</button>' +
      '<button type="button" data-a="del" aria-label="Delete" title="Delete">&#128465;</button></div></li>').join('');
    $('l-empty').hidden = items.length > 0;
    $('l-count').textContent = items.length ? items.length + (items.length === 1 ? ' recording' : ' recordings') : '';
    requestAnimationFrame(thumbs);
  }
  function thumbs() {
    const c = SRWave.colors();
    ul().querySelectorAll('li').forEach((li) => {
      const r = items.find((x) => x.id === li.dataset.id); if (!r) return;
      SRWave.draw(li.querySelector('canvas'), r.peaks, r.pps, 0, Math.max(r.dur, r.peaks.length / r.pps, 0.1), { colors: c });
    });
  }
  const ul = () => $('l-items');

  async function act(a, r) {
    if (a === 'ren') {
      const v = await SR.ask({ text: 'Rename recording', value: r.name, ok: 'Rename' });
      if (v == null || !v || v === r.name) return;
      const old = r.name; r.name = v.slice(0, 80);
      try { await SRStore.rename(r.id, r.name); render(); SR.emit('changed', { renamed: r.id }); }
      catch (_) { r.name = old; toast('Could not rename'); load(); }
    } else if (a === 'del') {
      const ok = await SR.ask({ text: 'Delete "' + r.name + '"? This cannot be undone.', ok: 'Delete', danger: true });
      if (!ok) return;
      try { await SRStore.del(r.id); items = items.filter((x) => x !== r); render(); toast('Deleted'); SR.emit('changed', { deleted: r.id }); }
      catch (_) { toast('Could not delete'); load(); }
    } else if (a === 'dl') {
      try {
        const full = await SRStore.get(r.id); if (!full || !full.blob) { toast('Recording not found'); load(); return; }
        const n = await SRSave.save(full.blob, SRSave.fileName(r.name, SRSave.ext(full.blob.type || r.mime))); toast('Downloading ' + n);
      } catch (_) { toast('Could not read this recording'); }
    }
  }
  async function importFile(f) {
    if (!f) return;
    toast('Reading ' + f.name + '…');
    try {
      const { peaks, dur } = await SRAudio.decodePeaks(f, (p) => toast('Analysing ' + Math.round(p * 100) + '%'));
      const d = Date.now();
      const rec = { id: 'r' + d.toString(36) + Math.random().toString(36).slice(2, 6), name: f.name.replace(/\.[^.]+$/, '') || 'Imported', date: d, dur, mime: f.type || 'audio/*', size: f.size, blob: f, peaks, pps: SRAudio.PPS };
      await SRStore.put(rec); toast('Imported · ' + SR.fmt(dur));
      SR.emit('changed', { added: rec.id });
    } catch (_) { toast('Could not read this audio file'); }
  }

  SR.on('init', () => {
    ul().addEventListener('click', (e) => {
      const li = e.target.closest('li'); if (!li) return;
      const r = items.find((x) => x.id === li.dataset.id); if (!r) return;
      const b = e.target.closest('button[data-a]');
      if (b) act(b.dataset.a, r); else SR.emit('open', r.id);
    });
    $('l-file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; importFile(f); };
    load();
  });
  SR.on('changed', load);
  SR.on('cur', render);
  SR.on('settings', (k) => { if (k === 'theme' || k === 'all') requestAnimationFrame(thumbs); });
  SR.on('mode', ({ m }) => { if (m === 'list') requestAnimationFrame(thumbs); });
  addEventListener('resize', () => requestAnimationFrame(thumbs));
  SR.list = { items: () => items, importFile };
})();
