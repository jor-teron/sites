/*
 * Hub Photo Studio (HPS3) — ps_mask.js: layer masks (one file, registered through PE.studio).
 *
 * A layer's mask is layer.mask = { key, on } (key into PE.pix, see ps_select.js), an alpha buffer over the
 * layer's own box (w × box height, at most C.studio.mask.maxPixels), so moving / scaling / rotating the layer
 * carries it along. The background's mask is S.edits.bg.mask, over the whole original photo.
 * Opaque = shown, transparent = hidden. Masks apply in the preview, Save / Print / Send and the .ora export,
 * and are kept in the .hps as masks/<id>.png (alpha = visibility).
 * Mask brush (B): paint Hide / Show with size + hardness on the selected layer (or the background);
 * Mask on / off, Delete mask, Mask from selection; Delete with a selection hides that area (Clear).
 * One stroke = one undo step.
 */
(function (PE) {
  'use strict';
  const S = PE.state, V = PE.view, C = PE.config;
  const $ = (id) => document.getElementById(id);
  const MC = () => C.studio.mask;
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const R = PE.pix, L = PE.layers, Sel = PE.select;
  const M = PE.masks = { on: false, paint: 'hide', size: 60, hard: 70, stroke: null };

  R.refs.push((e, add) => {
    if (e.bg && e.bg.mask) add(e.bg.mask.key);
    for (const l of e.layers || []) if (l.mask) add(l.mask.key);
  });

  // ---------- target + geometry ----------
  M.targetId = () => (L.sel && L.sel !== 'bg' && L.get(L.sel) ? L.sel : 'bg');
  M.target = () => { const id = M.targetId(); return id === 'bg' ? L.bg() : L.get(id); };
  const maskOf = (t) => (t && t.mask && R.has(t.mask.key) ? t.mask : null);
  const isOn = (mk) => mk && mk.on !== false;
  function boxOf(id) {                        // the mask's own space: w × h units
    if (id === 'bg') { const P = S.photo; return { w: P.w, h: P.h }; }
    const l = L.get(id); return { w: l.w, h: L.boxH(l) };
  }
  function maskSize(id) {
    const b = boxOf(id), k = Math.min(1, Math.sqrt(MC().maxPixels / Math.max(1, b.w * b.h)));
    return { w: Math.max(1, Math.round(b.w * k)), h: Math.max(1, Math.round(b.h * k)) };
  }
  function setMask(id, mask) {               // records one undo step
    if (id === 'bg') S.apply((e) => { e.bg = Object.assign({}, L.bg(), { mask }); }, 'geom');
    else L.update(id, { mask });
    V.requestRender();
  }
  // A canvas (mask size) holding the target's mask, or a full "show" mask.
  function startCanvas(id) {
    const t = id === 'bg' ? L.bg() : L.get(id), mk = maskOf(t), z = mk ? R.get(mk.key) : maskSize(id), c = canvas(z.w, z.h), x = c.getContext('2d');
    if (mk) x.drawImage(R.canvas(mk.key), 0, 0); else { x.fillStyle = '#fff'; x.fillRect(0, 0, z.w, z.h); }
    return c;
  }
  // Draw the current selection (photo space) into a mask canvas of target id.
  function drawSelInto(x, id) {
    const P = S.photo, sc = R.canvas(Sel.key()), c = x.canvas;
    x.save();
    if (id === 'bg') x.drawImage(sc, 0, 0, c.width, c.height);
    else {
      const l = L.get(id), b = boxOf(id), k = l.scale || 1;
      x.scale(c.width / b.w, c.height / b.h); x.translate(b.w / 2, b.h / 2);
      x.scale(1 / k, 1 / k); x.rotate(-(l.rot || 0)); x.translate(-l.x, -l.y);
      x.drawImage(sc, 0, 0, P.w, P.h);
    }
    x.restore();
  }

  // ---------- drawing hooks ----------
  let tmpC = null, freeT = 0;
  function tmp(w, h) {
    if (!tmpC) tmpC = canvas(w, h);
    if (tmpC.width !== w || tmpC.height !== h) { tmpC.width = w; tmpC.height = h; }
    clearTimeout(freeT); freeT = setTimeout(() => { if (tmpC) { tmpC.width = tmpC.height = 0; tmpC = null; } }, 3000);
    const x = tmpC.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h);
    return x;
  }
  const baseLayer = L.drawLayer;
  // legacy (HPS2): L.drawLayer drew straight onto x; a masked layer now goes through a temp canvas.
  L.drawLayer = (x, l, raw) => {
    const mk = isOn(maskOf(l)) ? l.mask : null;
    if (!mk || !x.canvas || !x.getTransform) return baseLayer(x, l, raw);
    const tx = tmp(x.canvas.width, x.canvas.height), tf = x.getTransform();
    tx.setTransform(tf); tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = 'high';
    baseLayer(tx, l, true);
    const k = l.scale || 1, bh = L.boxH(l);
    tx.setTransform(tf); tx.translate(l.x, l.y); tx.rotate(l.rot || 0); tx.scale(k, k);
    tx.globalCompositeOperation = 'destination-in'; tx.drawImage(R.canvas(mk.key), -l.w / 2, -bh / 2, l.w, bh);
    tx.globalCompositeOperation = 'source-over';
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = raw ? 1 : Math.max(0, Math.min(1, l.opacity == null ? 1 : l.opacity));
    x.globalCompositeOperation = raw || !l.blend || l.blend === 'normal' ? 'source-over' : l.blend;
    x.drawImage(tmpC, 0, 0); x.restore();
  };
  L.bgMasked = () => isOn(maskOf(L.bg()));
  const baseBg = L.drawBg;
  L.drawBg = (x, P, cr, m, w, h, a, b, alpha) => {
    const bg = L.bg();
    if (!isOn(maskOf(bg)) || !x.canvas) return baseBg(x, P, cr, m, w, h, a, b, alpha);
    const tx = tmp(x.canvas.width, x.canvas.height);
    L.engineDraw(tx, P, cr, m, w, h, a, b);                     // draws with its own (absolute) transform
    // legacy (HPS3 first cut): tx.setTransform(m[0] * a, m[2] * a, m[1] * b, m[3] * b, w / 2, h / 2);   (b is undefined from Save -> NaN, mask skipped)
    const bb = b == null ? a : b;
    tx.setTransform(m[0] * a, m[2] * a, m[1] * bb, m[3] * bb, w / 2, h / 2);
    tx.translate(-cr.x - cr.w / 2, -cr.y - cr.h / 2);
    tx.globalCompositeOperation = 'destination-in'; tx.imageSmoothingEnabled = true;
    tx.drawImage(R.canvas(bg.mask.key), 0, 0, P.w, P.h);
    tx.globalCompositeOperation = 'source-over';
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = alpha; x.drawImage(tmpC, 0, 0); x.restore();
  };

  // ---------- brush ----------
  const stagePos = (e) => { const r = V.stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const modal = () => !!document.querySelector('.dlg-wrap:not([hidden])');
  const active = () => M.on && !!S.photo && !PE.crop.active && !PE.resize.open && !L.open && !modal();
  M.active = active;
  let hover = null;
  // screen point -> mask pixel, and the brush radius in mask px
  function toMask(id, p, Mp, c) {
    const q = L.toPhoto(p.x, p.y, Mp), b = boxOf(id);
    if (id === 'bg') return { x: q.x * c.width / b.w, y: q.y * c.height / b.h };
    const u = L.toLocal(L.get(id), q);
    return { x: (u.x + b.w / 2) * c.width / b.w, y: (u.y + b.h / 2) * c.height / b.h };
  }
  function radius(id, Mp, c) {
    const ppp = Math.hypot(Mp.A, Mp.C) || 1, b = boxOf(id);
    let r = (M.size / 2) / ppp;                                   // photo px
    if (id !== 'bg') r /= (L.get(id).scale || 1);
    return Math.max(0.5, r * c.width / b.w);
  }
  function dab(x, p, r) {
    const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, r), h = Math.min(0.99, M.hard / 100);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(h, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, r, 0, Math.PI * 2); x.fill();
  }
  function paintTo(st, p) {
    const x = st.c.getContext('2d'), q = toMask(st.id, p, st.Mp, st.c), r = st.r;
    x.globalCompositeOperation = M.paint === 'hide' ? 'destination-out' : 'source-over';
    const last = st.last || q, d = Math.hypot(q.x - last.x, q.y - last.y), step = Math.max(0.5, r * 0.25), n = Math.max(1, Math.ceil(d / step));
    for (let i = st.last ? 1 : 0; i <= n; i++) dab(x, { x: last.x + (q.x - last.x) * i / n, y: last.y + (q.y - last.y) * i / n }, r);
    x.globalCompositeOperation = 'source-over';
    st.last = q;
  }
  function onDown(e) {
    if (!active() || !e.target.closest || !e.target.closest('#stage') || e.target.closest('button, #empty, .ps-bar')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (M.stroke) return;
    PE.ui.closePopovers();
    const id = M.targetId(), t = M.target();
    if (!t || (id !== 'bg' && t.locked)) { PE.ui.toast('That layer is locked'); return; }
    const c = startCanvas(id), key = R.put(c.width, c.height, null);
    R.cv.set(key, c);                                            // painted live; read back on release
    const live = { key, on: true };
    if (id === 'bg') S.edits.bg = Object.assign({}, L.bg(), { mask: live }); else Object.assign(L.get(id), { mask: live });
    const Mp = L.mapping();
    M.stroke = { pid: e.pointerId, id, c, key, Mp, r: radius(id, Mp, c), last: null };
    try { V.stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    paintTo(M.stroke, stagePos(e)); redraw();
  }
  let rq = 0;
  function redraw() { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; V.rebuild(); }); }
  function onMove(e) {
    if (!M.stroke) {
      if (active() && e.target.closest && e.target.closest('#stage')) { hover = stagePos(e); V.stage.style.cursor = 'none'; V.requestRender(); }
      else if (hover) { hover = null; V.stage.style.cursor = ''; V.requestRender(); }
      return;
    }
    if (e.pointerId !== M.stroke.pid) return;
    e.stopImmediatePropagation(); e.preventDefault();
    hover = stagePos(e); paintTo(M.stroke, hover); redraw();
  }
  function onUp(e) {
    const st = M.stroke; if (!st || e.pointerId !== st.pid) return;
    e.stopImmediatePropagation(); M.stroke = null;
    R.bufs.set(st.key, { w: st.c.width, h: st.c.height, data: R.alphaOf(st.c) });
    S.commit('geom');                                            // the live mask is already in S.edits
  }
  function onCancel(e) {
    const st = M.stroke; if (!st || e.pointerId !== st.pid) return;
    e.stopImmediatePropagation(); M.stroke = null;
    S.edits = JSON.parse(JSON.stringify(S.history[S.index])); PE.emit('history');
  }
  function drawCursor() {
    if (!hover || !active()) return;
    const ctx = $('view').getContext('2d'), d = V.dpr, r = M.size / 2;
    ctx.save(); ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.beginPath(); ctx.arc(hover.x, hover.y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke();
    if (M.hard < 95) { ctx.beginPath(); ctx.arc(hover.x, hover.y, r * M.hard / 100, 0, Math.PI * 2); ctx.setLineDash([3, 3]); ctx.stroke(); }
    ctx.restore();
  }

  // ---------- commands ----------
  M.toggleOn = () => { const id = M.targetId(), mk = maskOf(M.target()); if (mk) setMask(id, { key: mk.key, on: !isOn(mk) }); };
  M.remove = () => {
    const id = M.targetId(); if (!maskOf(M.target())) return;
    PE.studio.ask({ title: 'Delete mask?', text: 'The whole layer shows again. You can undo this.', ok: 'Delete' }).then((ok) => { if (ok) setMask(id, null); });
  };
  M.fromSelection = () => {
    const id = M.targetId(); if (!Sel.key()) { PE.ui.toast('Make a selection first'); return; }
    const z = maskSize(id), c = canvas(z.w, z.h); drawSelInto(c.getContext('2d'), id);
    setMask(id, { key: R.fromCanvas(c), on: true });
  };
  M.clearSelection = () => {                // Delete with a selection: hide that area on the target
    const id = M.targetId(), t = M.target(); if (!Sel.key() || !t) return false;
    if (id !== 'bg' && t.locked) { PE.ui.toast('That layer is locked'); return true; }
    const c = startCanvas(id), x = c.getContext('2d'); x.globalCompositeOperation = 'destination-out'; drawSelInto(x, id);
    setMask(id, { key: R.fromCanvas(c), on: true });
    return true;
  };

  // ---------- option bar ----------
  function buildBar() {
    const b = document.createElement('div');
    b.id = 'ps-maskbar'; b.className = 'ps-bar'; b.hidden = true;
    b.innerHTML = '<b id="mb-target" class="ps-mut"></b>' +
      '<div class="seg" id="mb-paint"><button type="button" tabindex="-1" data-v="hide">Hide</button><button type="button" tabindex="-1" data-v="show">Show</button></div>' +
      '<label class="ps-barg">Size <input type="range" id="mb-size" min="2" max="400" step="1" tabindex="-1"></label>' +
      '<label class="ps-barg">Hardness <input type="range" id="mb-hard" min="0" max="100" step="1" tabindex="-1"></label>' +
      '<button type="button" tabindex="-1" class="chip" id="mb-on">Mask on</button>' +
      '<button type="button" tabindex="-1" class="chip" id="mb-sel">From selection</button>' +
      '<button type="button" tabindex="-1" class="chip" id="mb-del">Delete mask</button>' +
      '<button type="button" tabindex="-1" class="btn ghost" id="mb-done">Done</button>';
    document.body.appendChild(b);
    const on = PE.ui.onTap;
    for (const x of $('mb-paint').children) on(x, () => { M.paint = x.dataset.v; syncBar(); });
    $('mb-size').addEventListener('input', () => { M.size = +$('mb-size').value; });
    $('mb-hard').addEventListener('input', () => { M.hard = +$('mb-hard').value; });
    on($('mb-on'), M.toggleOn); on($('mb-sel'), M.fromSelection); on($('mb-del'), M.remove);
    on($('mb-done'), () => M.toggle(false));
  }
  function syncBar() {
    const b = $('ps-maskbar'); if (!b) return;
    b.hidden = !M.on || !S.photo;
    const tb = $('tb-mask'); if (tb) tb.classList.toggle('active', M.on);
    if (b.hidden) return;
    const t = M.target(), mk = maskOf(t);
    $('mb-target').textContent = 'Mask: ' + (M.targetId() === 'bg' ? 'Background' : (t && t.name) || 'Layer');
    for (const x of $('mb-paint').children) x.classList.toggle('sel', x.dataset.v === M.paint);
    $('mb-size').value = M.size; $('mb-hard').value = M.hard;
    $('mb-on').disabled = !mk; $('mb-del').disabled = !mk; $('mb-sel').disabled = !Sel.key();
    $('mb-on').classList.toggle('sel', isOn(mk)); $('mb-on').textContent = mk && !isOn(mk) ? 'Mask off' : 'Mask on';
  }
  M.syncBar = syncBar;
  M.toggle = (on) => {
    on = on == null ? !M.on : !!on;
    if (on) {
      if (!S.photo) return;
      if (PE.crop.active) PE.crop.cancel();
      if (L.open) L.toggle(false);
      if (Sel.on) Sel.toggle(false);
    } else { hover = null; V.stage.style.cursor = ''; }
    M.on = on; syncBar(); V.requestRender();
  };

  // ---------- .hps ----------
  const pngOf = (key) => new Promise((res) => R.canvas(key).toBlob((b) => res(b), 'image/png'));
  async function alphaFromBlob(blob) {
    const bm = await createImageBitmap(blob), c = canvas(bm.width, bm.height);
    c.getContext('2d').drawImage(bm, 0, 0); if (bm.close) bm.close();
    const k = R.fromCanvas(c); c.width = c.height = 0; return k;
  }
  // Rewrites the project JSON (keys -> masks/*.png) and returns the extra zip entries { name, data }.
  M.toHps = async (J, enc) => {
    const out = [], put = async (name, key) => { const b = await pngOf(key); out.push({ name, data: b, method: 'store' }); return name; };
    for (const l of J.layers || []) {
      if (l.mask && R.has(l.mask.key)) { const z = R.get(l.mask.key); l.mask = { src: await put('masks/' + l.id + '.png', l.mask.key), on: l.mask.on !== false, w: z.w, h: z.h }; }
      else delete l.mask;
    }
    if (J.background && J.background.mask && R.has(J.background.mask.key)) J.background.mask = { src: await put('masks/background.png', J.background.mask.key), on: J.background.mask.on !== false };
    else if (J.background) delete J.background.mask;
    if (J.edits) {
      delete J.edits.sel;
      if (J.edits.adjSel && R.has(J.edits.adjSel)) J.edits.adjSel = await put('masks/adjust.png', J.edits.adjSel);
      else delete J.edits.adjSel;
    }
    return out;
  };
  // Reads masks back into the new edits e. read(name) -> Promise<Blob|null>. raw = the project JSON.
  M.fromHps = async (raw, e, read) => {
    const load = async (src) => { if (typeof src !== 'string' || !/^masks\/[\w.-]+\.png$/.test(src)) return null; try { const b = await read(src); return b ? await alphaFromBlob(b) : null; } catch (err) { console.warn('[photo-studio] mask', err); return null; } };
    const byId = new Map((raw.layers || []).map((l) => [l && l.id, l]));
    for (const l of e.layers || []) { const r = byId.get(l.id); if (r && r.mask) { const k = await load(r.mask.src); if (k) l.mask = { key: k, on: r.mask.on !== false }; } }
    if (raw.background && raw.background.mask && e.bg) { const k = await load(raw.background.mask.src); if (k) e.bg.mask = { key: k, on: raw.background.mask.on !== false }; }
    delete e.sel;
    if (raw.edits && raw.edits.adjSel) { const k = await load(raw.edits.adjSel); if (k) e.adjSel = k; else delete e.adjSel; } else delete e.adjSel;
  };

  function init() {
    buildBar(); syncBar();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    const prevRender = V.onRender;
    V.onRender = () => { if (prevRender) prevRender(); drawCursor(); };
    const lt = L.toggle;
    L.toggle = (on) => { lt(on); if (L.open && M.on) M.toggle(false); };
    const st = Sel.toggle;
    Sel.toggle = (on, tool) => { st(on, tool); if (Sel.on && M.on) M.toggle(false); };
    PE.on((kind) => { if (kind === 'photo' && !S.photo) M.on = false; syncBar(); });
    window.addEventListener('keydown', (e) => {
      if (!S.photo || modal() || PE.resize.open || PE.crop.active || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const k = (e.key || '').toLowerCase(), stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (k === 'b' && !e.shiftKey) { M.toggle(); stop(); }
      else if ((k === 'delete' || k === 'backspace') && Sel.key() && !L.open) { if (M.clearSelection()) stop(); }
      else if (k === 'escape' && M.on && !Sel.key()) { M.toggle(false); stop(); }
      else if (M.on && (k === '[' || k === ']')) { M.size = Math.max(2, Math.min(400, Math.round(M.size * (k === ']' ? 1.25 : 0.8)))); syncBar(); V.requestRender(); stop(); }
    }, true);
  }

  PE.studio.feature({ id: 'mask', init: init });
  PE.studio.addTool({
    id: 'mask', title: 'Mask brush (B)',
    svg: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>',
    onTap() { M.toggle(); }
  });
})(window.PE);
