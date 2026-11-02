/*
 * Hub Photo Studio (HPS5) — ps_blank.js, "New blank" page.
 *  - ＋ at the top of the toolbar opens a card: Paper (A4, Letter, Indian Legal, Square, Custom),
 *    Orientation (Portrait / Landscape, hidden for Square), Background (White / Transparent), Create.
 *  - Create makes a 300 dpi blank PNG and opens it through the normal Open (PE.io.load), so it is the
 *    background layer and undo / layers / .hps all work as for a photo. S.photo.blank = { paper, w, h, wIn, hIn, bg }.
 *  - While a blank page is open, Open photo / drop / paste add the picture as an image LAYER (ps_layers.js L.addImage).
 *  - Transparent page: checkerboard drawn on the stage behind the page (preview only, never saved).
 *  - Print of a blank page: true paper size, no margin (PE.printBlob page option, pe_print.js).
 *  - Remembers the last choice in Studio's state key: PSSave.state().blank = { paper, orient, bg, cw, ch }.
 */
(function (PE) {
  'use strict';
  const S = PE.state, C = PE.config;
  const $ = (id) => document.getElementById(id);
  const DPI = 300;
  const PAPERS = {                      // portrait size in inches (custom = px)
    a4: { name: 'A4', wIn: 8.27, hIn: 11.69, w: 2480, h: 3508 },
    letter: { name: 'Letter', wIn: 8.5, hIn: 11, w: 2550, h: 3300 },
    legal: { name: 'Indian Legal', wIn: 8.5, hIn: 14, w: 2550, h: 4200 },
    square: { name: 'Square', wIn: 10, hIn: 10, w: 3000, h: 3000 }
  };
  const B = PE.blank = { open: false, creating: false };
  let ch = null;                        // current choice

  function load() {
    const s = Object.assign({ paper: 'a4', orient: 'p', bg: 'white', cw: 2000, ch: 2000 }, PSSave.state().blank || {});
    if (!PAPERS[s.paper] && s.paper !== 'custom') s.paper = 'a4';
    if (s.orient !== 'l') s.orient = 'p';
    if (s.bg !== 'clear') s.bg = 'white';
    return s;
  }
  function capPx() { return Math.min(C.limits.maxPixelsDesktop, C.limits.maxPixelsTouch); }
  // final size in px (+ inches for print)
  B.size = (c) => {
    if (c.paper === 'custom') {
      let w = Math.max(1, Math.round(+c.cw || 1)), h = Math.max(1, Math.round(+c.ch || 1));
      const k = Math.min(1, Math.sqrt(capPx() / (w * h)), C.limits.maxSide / Math.max(w, h));
      if (k < 1) { w = Math.max(1, Math.floor(w * k)); h = Math.max(1, Math.floor(h * k)); }
      return { w, h, wIn: w / DPI, hIn: h / DPI, name: 'Custom' };
    }
    const p = PAPERS[c.paper], l = c.orient === 'l' && c.paper !== 'square';
    return l ? { w: p.h, h: p.w, wIn: p.hIn, hIn: p.wIn, name: p.name } : { w: p.w, h: p.h, wIn: p.wIn, hIn: p.hIn, name: p.name };
  };
  B.isBlank = () => !!(S.photo && S.photo.blank);

  function sync() {
    for (const seg of document.querySelectorAll('#dlg-blank .seg')) {
      for (const b of seg.children) b.classList.toggle('sel', b.dataset.v === String(ch[seg.dataset.key]));
    }
    $('bl-orient').hidden = ch.paper === 'square';
    $('bl-custom').hidden = ch.paper !== 'custom';
    const z = B.size(ch);
    $('bl-info').textContent = z.w + ' × ' + z.h + ' px · 300 dpi';
  }
  B.show = () => {
    if (PE.resize.open || (PE.studio && PE.studio.open)) return;
    if (PE.crop.active) PE.crop.cancel();
    PE.ui.closePopovers();
    ch = load();
    $('bl-w').value = ch.cw; $('bl-h').value = ch.ch;
    sync();
    $('dlg-blank').hidden = false; B.open = true;
    $('tb-blank').classList.add('active');
  };
  B.close = () => { $('dlg-blank').hidden = true; B.open = false; $('tb-blank').classList.remove('active'); };

  B.create = async () => {
    ch.cw = Math.max(1, Math.round(+$('bl-w').value || 1)); ch.ch = Math.max(1, Math.round(+$('bl-h').value || 1));
    PSSave.setState('blank', Object.assign({}, ch));
    if (S.photo) {
      B.close();
      const ok = await PE.studio.ask({ title: 'Replace current work?', text: 'The open photo or project closes. Save it first if you need it.', ok: 'Replace', danger: true });
      if (!ok) return;
    } else B.close();
    const z = B.size(ch), cv = document.createElement('canvas');
    cv.width = z.w; cv.height = z.h;
    const x = cv.getContext('2d');
    if (ch.bg === 'white') { x.fillStyle = '#fff'; x.fillRect(0, 0, z.w, z.h); }
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    cv.width = cv.height = 1;
    if (!blob) { PE.ui.notify('Could not make the blank page.'); return; }
    B.creating = true;
    try { await PE.io.load(blob, 'Blank ' + z.name + '.png'); } finally { B.creating = false; }
    if (S.photo) S.photo.blank = { paper: ch.paper, w: z.w, h: z.h, wIn: z.wIn, hIn: z.hIn, bg: ch.bg };
    PE.view.requestRender();
  };

  // ---------- checkerboard behind a transparent page (stage preview only) ----------
  let pat = null;
  function checker(ctx) {
    if (!pat) {
      const t = document.createElement('canvas'); t.width = t.height = 16;
      const g = t.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#cccccc'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
      pat = ctx.createPattern(t, 'repeat');
    }
    return pat;
  }
  function hookRender() {
    const V = PE.view, canvas = $('view'), ctx = canvas.getContext('2d'), orig = V.renderNow;
    V.renderNow = () => {
      if (!(S.photo && S.photo.blank && S.photo.blank.bg === 'clear' && V.shown) || PE.crop.active) return orig();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.colors.stage; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const r = V.imageRect(), d = V.dpr;
      ctx.fillStyle = checker(ctx); ctx.fillRect(r.x * d, r.y * d, r.w * d, r.h * d);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(V.shown, r.x * d, r.y * d, r.w * d, r.h * d);
      if (V.onRender) V.onRender();
    };
  }

  function init() {
    const on = PE.ui.onTap;
    hookRender();
    on($('tb-blank'), () => (B.open ? B.close() : B.show()));
    on($('bl-cancel'), B.close);
    on($('bl-create'), B.create);
    on($('dlg-blank'), (e) => { if (e && e.target === $('dlg-blank')) B.close(); });
    for (const seg of document.querySelectorAll('#dlg-blank .seg')) {
      for (const b of seg.children) on(b, () => { ch[seg.dataset.key] = b.dataset.v; sync(); });
    }
    for (const id of ['bl-w', 'bl-h']) $(id).addEventListener('input', () => { ch.cw = +$('bl-w').value; ch.ch = +$('bl-h').value; sync(); });
    window.addEventListener('keydown', (e) => {
      if (!B.open) return;
      if (e.key === 'Escape') B.close();
      else if (e.key === 'Enter') B.create();
      if (e.key !== 'Tab' && !(e.target && e.target.tagName === 'INPUT' && /^[0-9]$|Backspace|Delete|Arrow/.test(e.key))) e.preventDefault();
      e.stopImmediatePropagation();
    }, true);

    // On a blank page, Open / drop / paste of a picture = a new image layer (outermost wrap of PE.io.load)
    const inner = PE.io.load, L = PE.layers;
    PE.io.load = (blob, name) => {
      const hps = PE.project && PE.project.isHps && blob && PE.project.isHps(blob, name);
      if (B.isBlank() && !B.creating && !hps && !(L && L.loadingProject) && L && L.addImage) {
        return L.addImage(blob, name).then((l) => { if (l && !L.open) L.toggle(true); return l; });
      }
      return inner(blob, name);
    };
    // Print: true paper size, no margin
    const print = PE.print;
    PE.print = () => {
      const b = S.photo && S.photo.blank;
      if (!b || !PE.printBlob) return print();
      const fmt = b.bg === 'clear' ? 'png' : 'jpeg';
      return PE.io.save(fmt, (blob) => PE.printBlob(blob, 'image', { page: { wIn: b.wIn, hIn: b.hIn } }));
    };
  }
  PE.studio.feature({ id: 'blank', init: init });
})(window.PE);
