/*
 * OCR — ocr_send_phone.js  (phone side, page ocr_send.html; release 3: SharedLink)
 * Joins with SharedLink (shared/link):
 *   #hub=<code>              → the Hub's link (prefix 'jtsites-'); same saved code as the
 *                              Gamepad / File Drop ('shared-link-join-code')
 *   #code=<code>&p=jtocr-    → a standalone OCR computer (its own 4-digit code)
 *   no hash                  → the saved Hub code, else the code box (manual entry)
 * "Choose file" sends one file at a time tagged app:'ocr' (the Hub routes it into OCR).
 * SharedLink reconnects by itself; only Disconnect (here or on the computer) ends the link.
 */
(function (OCR) {
  'use strict';

  const A = OCR.config.accept;
  const X = OCR.sendCommon;
  const $ = (id) => document.getElementById(id);
  let busy = false;

  function setState(kind, msg) { const el = $('state'); el.className = 'state ' + kind; el.textContent = msg; }
  function detail(msg) { $('detail').textContent = msg || ''; }
  function progress(f) {
    $('prog').hidden = f == null;
    if (f != null) $('prog-bar').style.width = Math.round(f * 100) + '%';
  }
  function sync() {
    const on = SharedLink.connected;
    $('choose').disabled = !on || busy;
    $('retry').hidden = on || !SharedLink.code;
    $('code-form').hidden = on;
  }

  function target() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (h.get('hub')) return { prefix: 'jtsites-', code: h.get('hub') };
    if (h.get('code')) return { prefix: h.get('p') === 'jtocr-' ? 'jtocr-' : 'jtsites-', code: h.get('code') };
    let saved = '';
    try { saved = localStorage.getItem('shared-link-join-code') || ''; } catch (_) { /* blocked */ }
    return saved ? { prefix: 'jtsites-', code: saved } : null;
  }

  function join(t) {
    if (!t || !t.code) { setState('err', 'Enter the code shown on the computer or Hub'); sync(); return; }
    setState('connecting', 'Connecting · ' + t.code + '…');
    SharedLink.join({ prefix: t.prefix, code: String(t.code).toUpperCase() })
      .catch(() => setState('err', 'App files failed to load — reload the page'));
  }

  async function send(file) {
    if (!file) return;
    if (file.size > A.maxBytes) { detail('Too big (max ' + Math.round(A.maxBytes / 1048576) + ' MB)'); return; }
    const type = await X.sniffBlob(file);
    if (!type || A.types.indexOf(type) === -1) { detail('Not a JPG, PNG, WebP or PDF'); return; }
    busy = true; sync(); progress(0); detail(file.name);
    try {
      await SharedLink.sendFile(file, { app: 'ocr', onProgress: (d, t) => progress(t ? d / t : 1) });
      detail('✓ Sent ' + file.name);
    } catch (err) { detail('Connection lost — try again'); }
    busy = false; progress(null); sync();
  }

  function boot() {
    if (!window.SharedLink) { setState('err', 'App files failed to load — reload the page'); return; }
    SharedLink.on('status', (t, st) => { if (!SharedLink.connected) setState(st === 'error' ? 'err' : 'connecting', t); sync(); });
    SharedLink.on('open', () => { setState('ok', 'Connected · ' + SharedLink.code); sync(); });
    SharedLink.on('close', sync);
    SharedLink.on('bye', () => { SharedLink.stop(); setState('err', 'Disconnected — scan the QR again'); sync(); });
    $('choose').addEventListener('click', () => $('file').click());
    $('file').addEventListener('change', () => { const f = $('file').files[0]; $('file').value = ''; send(f); });
    $('retry').addEventListener('click', () => SharedLink.restart());
    $('code-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const c = $('code-in').value.trim().toUpperCase();
      if (c) join({ prefix: /^\d{4}$/.test(c) && $('code-ocr').checked ? 'jtocr-' : 'jtsites-', code: c });
    });
    $('disc').addEventListener('click', () => { SharedLink.stop(); setState('err', 'Disconnected'); sync(); });
    if (/^#?s=/.test(location.hash)) { setState('err', 'Old QR — tap QR on the computer and scan again'); sync(); return; }
    join(target());
    sync();
  }
  boot();
})(window.OCR);
