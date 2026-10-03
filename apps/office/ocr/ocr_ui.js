/*
 * OCR — ocr_ui.js
 * Toolbar, status line, panels (both are drop zones; tap to open before a file is loaded),
 * Preview / Text tabs on narrow screens, the Cloud Vision key popover, keyboard — and start-up.
 */
(function (OCR) {
  'use strict';

  const U = OCR.ui = {};
  const S = OCR.state;
  const $ = (id) => document.getElementById(id);
  const cfg = () => OCR.config;
  let ta;

  // ----- text box -----
  U.setText = (t, isResult, scrollEnd) => {
    ta.value = t || '';
    S.hasResult = !!(isResult && ta.value);
    if (scrollEnd) ta.scrollTop = ta.scrollHeight;
    if (S.hasResult) U.showTab('text');
    U.sync();
  };

  U.showTab = (tab) => {
    S.tab = tab;
    document.body.dataset.tab = tab;
    for (const b of document.querySelectorAll('#tabs [data-tab]')) b.classList.toggle('sel', b.dataset.tab === tab);
  };

  // ----- status line -----
  function setStatus(d) {
    const el = $('status');
    el.textContent = d.msg;
    el.className = d.kind || '';
    el.title = d.msg;
  }

  // ----- engine + key -----
  U.setEngine = (e) => {
    if (S.busy) return;
    S.engine = e === 'vision' ? 'vision' : 'tesseract';
    try { localStorage.setItem(cfg().storage.engine, S.engine); } catch (_) { /* ignore */ }
    if (S.engine !== 'vision') U.closeKey();
    U.sync();
  };

  U.openKey = () => {
    const pop = $('key-pop');
    $('key-input').value = OCR.engine.getKey();
    $('key-input').type = 'password'; $('key-show').textContent = 'Show';
    pop.hidden = false;
    const b = $('key-btn').getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, b.left)) + 'px';
    pop.style.top = (b.bottom + 6) + 'px';
    setTimeout(() => $('key-input').focus(), 0);
  };
  U.closeKey = () => { $('key-pop').hidden = true; };

  // ----- enable / disable / labels -----
  U.sync = () => {
    const d = S.doc, busy = S.busy, job = S.job, isPdf = !!(d && d.kind === 'pdf');
    const hasText = ta.value.trim().length > 0;
    document.body.classList.toggle('empty', !d && !hasText);
    document.body.classList.toggle('busy', busy);
    for (const b of document.querySelectorAll('#engine-seg [data-engine]')) {
      b.classList.toggle('sel', b.dataset.engine === S.engine);
      b.disabled = busy;
    }
    $('key-btn').hidden = S.engine !== 'vision';
    $('key-btn').classList.toggle('has-key', !!OCR.engine.getKey());

    $('nav').hidden = !isPdf;
    if (isPdf) {
      $('page-label').textContent = d.page + ' / ' + d.pages;
      $('prev').disabled = busy || d.page <= 1;
      $('next').disabled = busy || d.page >= d.pages;
      $('page-label').disabled = busy || d.pages < 2;
    }
    const start = $('start'), all = $('all');
    const startCancels = busy && (job === 'one' || job === 'queue');
    start.textContent = startCancels ? 'Cancel' : 'Start OCR';
    start.classList.toggle('danger', startCancels);
    start.disabled = startCancels ? false : (busy || !d);
    all.hidden = !isPdf;
    all.textContent = busy && job === 'all' ? 'Cancel' : 'All pages';
    all.classList.toggle('danger', busy && job === 'all');
    all.disabled = busy ? job !== 'all' : !isPdf;

    for (const id of ['copy', 'dl-txt', 'dl-docx']) $(id).disabled = !hasText || busy;
    ta.readOnly = busy || (!d && !hasText);
    for (const b of document.querySelectorAll('.corner-btn')) b.disabled = busy;
    $('camera-btn').disabled = busy;

    const img = $('preview');
    const url = d && d.previewUrl ? d.previewUrl : '';
    if (img.dataset.src !== url) { img.dataset.src = url; if (url) img.src = url; else img.removeAttribute('src'); }
    img.hidden = !url;
    $('hint-preview').hidden = !!d;
    $('hint-text').hidden = !!d || hasText;
  };

  // ----- page number entry (tap "3 / 20") -----
  function editPage() {
    const d = S.doc;
    if (!d || S.busy) return;
    const inp = $('page-input'), lab = $('page-label');
    inp.min = 1; inp.max = d.pages; inp.value = d.page;
    lab.hidden = true; inp.hidden = false; inp.focus(); inp.select();
  }
  function endEditPage(go) {
    const inp = $('page-input');
    if (inp.hidden) return;
    inp.hidden = true; $('page-label').hidden = false;
    if (go) OCR.jobs.goPage(parseInt(inp.value, 10) || 1);
  }

  // Act on pointerup (taps after a drag sometimes lose their click); click still works for keyboard.
  // The browser's click that follows a handled tap is ignored on every button (lastTap), so a
  // popup opening under the finger (QR box ✕) cannot be hit by that ghost click.
  let lastTap = 0;
  U.onTap = (el, fn) => {
    let downId = null;
    el.addEventListener('pointerdown', (e) => { if (e.button > 0) return; downId = e.pointerId; });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== downId) return;
      downId = null;
      if (el.disabled) return;
      lastTap = Date.now(); fn(e);
    });
    el.addEventListener('pointercancel', () => { downId = null; });
    el.addEventListener('click', (e) => { if (Date.now() - lastTap < 600 || el.disabled) return; fn(e); });
  };

  function key(e) {
    const t = e.target, inField = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT');
    const k = e.key;
    if (k === 'Escape') {
      if (!$('key-pop').hidden) { U.closeKey(); e.preventDefault(); return; }
      if (S.busy) { OCR.jobs.cancel(); e.preventDefault(); }
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const lk = k.toLowerCase();
      if (lk === 'o') { e.preventDefault(); OCR.io.pick(); }
      else if (k === 'Enter') { e.preventDefault(); if (!S.busy) OCR.jobs.runOne(); }
      else if (lk === 's') { e.preventDefault(); if (ta.value.trim() && !S.busy) OCR.io.saveTxt(); }
      return;
    }
    if (inField) return;
    if (k === 'ArrowLeft' || k === 'PageUp') { if (S.doc && S.doc.kind === 'pdf') { e.preventDefault(); OCR.jobs.goPage(S.doc.page - 1); } }
    else if (k === 'ArrowRight' || k === 'PageDown') { if (S.doc && S.doc.kind === 'pdf') { e.preventDefault(); OCR.jobs.goPage(S.doc.page + 1); } }
  }

  U.init = () => {
    ta = $('ocr-text');
    try { S.engine = localStorage.getItem(cfg().storage.engine) === 'vision' ? 'vision' : 'tesseract'; } catch (_) { /* ignore */ }

    for (const b of document.querySelectorAll('#engine-seg [data-engine]')) U.onTap(b, () => U.setEngine(b.dataset.engine));
    U.onTap($('key-btn'), () => ($('key-pop').hidden ? U.openKey() : U.closeKey()));
    U.onTap($('key-show'), () => {
      const inp = $('key-input'), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      $('key-show').textContent = show ? 'Hide' : 'Show';
    });
    U.onTap($('key-clear'), () => { $('key-input').value = ''; OCR.engine.setKey(''); OCR.status('Key cleared', ''); U.sync(); });
    U.onTap($('key-save'), () => {
      const k = $('key-input').value.trim();
      OCR.engine.setKey(k); U.closeKey();
      OCR.status(k ? 'Key saved' : 'Key cleared', k ? 'ok' : ''); U.sync();
    });
    $('key-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('key-save').click(); } });
    document.addEventListener('pointerdown', (e) => {
      if (!$('key-pop').hidden && !e.target.closest('#key-pop, #key-btn')) U.closeKey();
    });

    U.onTap($('prev'), () => OCR.jobs.goPage(S.doc.page - 1));
    U.onTap($('next'), () => OCR.jobs.goPage(S.doc.page + 1));
    U.onTap($('page-label'), editPage);
    $('page-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); endEditPage(true); }
      else if (e.key === 'Escape') { e.preventDefault(); endEditPage(false); }
    });
    $('page-input').addEventListener('blur', () => endEditPage(true));

    U.onTap($('start'), () => (S.busy ? OCR.jobs.cancel() : OCR.jobs.runOne()));
    U.onTap($('all'), () => (S.busy ? OCR.jobs.cancel() : OCR.jobs.runAll()));
    U.onTap($('copy'), () => OCR.io.copy());
    U.onTap($('dl-txt'), () => OCR.io.saveTxt());
    U.onTap($('dl-docx'), () => OCR.io.saveDocx());

    for (const b of document.querySelectorAll('#tabs [data-tab]')) U.onTap(b, () => U.showTab(b.dataset.tab));
    for (const b of document.querySelectorAll('.corner-btn.plus')) U.onTap(b, (e) => { e.stopPropagation(); OCR.io.pick(); });

    // Before anything is loaded, tapping either panel opens the file picker.
    for (const p of document.querySelectorAll('.panel')) {
      p.addEventListener('click', (e) => {
        if (e.target.closest('.corner-btn')) return;
        if (!S.doc && !ta.value.trim() && !S.busy) OCR.io.pick();
      });
    }
    ta.addEventListener('input', () => U.sync());
    window.addEventListener('keydown', key);

    OCR.on((kind, data) => { if (kind === 'status') setStatus(data); else U.sync(); });
    U.showTab('preview');
    U.sync();
  };

  function boot() {
    OCR.pdf.init();
    OCR.io.init();
    U.init();
    if (OCR.send) OCR.send.init();
    if (OCR.camera) OCR.camera.init();
    if (typeof Tesseract === 'undefined' || !OCR.pdf.available()) {
      OCR.status('Some app files failed to load — reload the page', 'err');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.OCR);
