/*
 * Hub Photo Studio (HPS3) — ps_select.js: selections (one file, registered through PE.studio).
 *
 * Pixel store PE.pix (shared with ps_mask.js): immutable alpha buffers { w, h, data: Uint8Array } under a key.
 *   The edit settings (and so the undo history) only hold keys; buffers no history step uses any more are
 *   dropped after every change (PE.pix.gc), so memory stays small. A canvas copy (white, alpha = buffer) is
 *   cached for the buffers the current edits use.
 * Selection: S.edits.sel = { key } — an alpha mask in BACKGROUND-PHOTO space (like layers), at most
 *   C.studio.select.maxPixels big, so crop / rotate / flip / resize carry it along and the full-res save
 *   just draws it bigger. S.edits.adjSel = key | null — the selection Adjust / Looks were last changed with:
 *   they apply only inside it, in the preview (pe_view.js hook) and in Save / Print / Send / .ora
 *   (pe_io.js strip hook, ps_project.js), still applied only when you save.
 * Tools: rectangle / ellipse (M cycles), lasso (Shift+L), magic wand (W, tolerance, contiguous, sample the
 *   image or the selected layer). Shift = add, Alt = subtract (or the New / Add / Subtract chips on touch).
 *   Ctrl+A all, Esc / Ctrl+D deselect, Ctrl+I invert. Marching ants are worked out in screen space once per
 *   view change and only recoloured on the 200 ms tick.
 */
(function (PE) {
  'use strict';
  const S = PE.state, V = PE.view, C = PE.config, T = PE.transform;
  const $ = (id) => document.getElementById(id);
  const SC = () => C.studio.select;
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // ---------- pixel store ----------
  const R = PE.pix = { bufs: new Map(), cv: new Map(), seq: 0 };
  R.put = (w, h, data) => { const k = 'p' + (++R.seq); R.bufs.set(k, { w, h, data }); return k; };
  R.get = (k) => (k && R.bufs.get(k)) || null;
  R.has = (k) => !!R.get(k);
  R.canvas = (k) => {
    const b = R.get(k); if (!b) return null;
    let c = R.cv.get(k);
    if (!c) {
      c = canvas(b.w, b.h);
      const id = new ImageData(b.w, b.h), d = id.data;
      for (let i = 0, j = 0; j < b.data.length; i += 4, j++) { d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = b.data[j]; }
      c.getContext('2d').putImageData(id, 0, 0);
      R.cv.set(k, c);
    }
    return c;
  };
  R.alphaOf = (c) => {
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data, a = new Uint8Array(c.width * c.height);
    for (let i = 3, j = 0; i < d.length; i += 4, j++) a[j] = d[i];
    return a;
  };
  R.fromCanvas = (c) => R.put(c.width, c.height, R.alphaOf(c));
  // every key an edit snapshot uses (ps_mask.js adds its own)
  R.refs = [(e, add) => { if (e.sel) add(e.sel.key); if (e.adjSel) add(e.adjSel); }];
  R.gc = () => {
    const used = new Set(), add = (k) => { if (k) used.add(k); };
    for (const e of S.history.concat([S.edits])) if (e) for (const f of R.refs) f(e, add);
    const cur = new Set(); if (S.edits) for (const f of R.refs) f(S.edits, (k) => k && cur.add(k));
    for (const k of [...R.bufs.keys()]) if (!used.has(k)) R.bufs.delete(k);
    for (const k of [...R.cv.keys()]) if (!cur.has(k)) { const c = R.cv.get(k); c.width = c.height = 0; R.cv.delete(k); }
  };

  const Sel = PE.select = { on: false, tool: 'rect', mode: 'new', tol: 32, contiguous: true, sample: 'image', drag: null, liveAdj: false };
  Sel.key = () => { const e = S.edits; return e && e.sel && R.has(e.sel.key) ? e.sel.key : null; };
  Sel.size = () => { const P = S.photo, k = Math.min(1, Math.sqrt(SC().maxPixels / (P.w * P.h))); return { w: Math.max(1, Math.round(P.w * k)), h: Math.max(1, Math.round(P.h * k)) }; };

  // ---------- set / combine ----------
  Sel.set = (data) => {                      // data: Uint8Array at Sel.size(), or null = none
    let k = null;
    if (data) { let any = false; for (let i = 0; i < data.length; i++) if (data[i]) { any = true; break; } if (any) { const z = Sel.size(); k = R.put(z.w, z.h, data); } }
    const had = !!Sel.key();
    if (!k && !had) return;
    S.apply((e) => { e.sel = k ? { key: k } : null; }, 'sel');
  };
  Sel.combine = (shape, mode) => {           // shape: Uint8Array at Sel.size()
    const old = R.get(Sel.key());
    mode = mode || 'new';
    if (mode === 'new' || !old) { if (mode !== 'sub') Sel.set(shape); return; }
    const o = old.data, n = new Uint8Array(o.length);
    if (mode === 'add') for (let i = 0; i < o.length; i++) n[i] = Math.max(o[i], shape[i]);
    else for (let i = 0; i < o.length; i++) n[i] = Math.min(o[i], 255 - shape[i]);
    Sel.set(n);
  };
  Sel.all = () => { if (!S.photo) return; const z = Sel.size(); Sel.set(new Uint8Array(z.w * z.h).fill(255)); };
  Sel.none = () => Sel.set(null);
  Sel.invert = () => {
    if (!S.photo) return;
    const b = R.get(Sel.key()); if (!b) { Sel.all(); return; }
    const n = new Uint8Array(b.data.length); for (let i = 0; i < n.length; i++) n[i] = 255 - b.data[i];
    Sel.set(n);
  };
  // Fill a polygon given in photo px into a fresh buffer.
  function polyBuf(pts) {
    const P = S.photo, z = Sel.size(), c = canvas(z.w, z.h), x = c.getContext('2d');
    x.setTransform(z.w / P.w, 0, 0, z.h / P.h, 0, 0);
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath();
    x.fillStyle = '#fff'; x.fill();
    const a = R.alphaOf(c); c.width = c.height = 0; return a;
  }

  // ---------- magic wand ----------
  function sampleData() {
    const P = S.photo, z = Sel.size(), c = canvas(z.w, z.h), x = c.getContext('2d', { willReadFrequently: true });
    const L = PE.layers, id = Sel.sample === 'layer' && L && L.sel ? L.sel : null;
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    const full = { x: 0, y: 0, w: P.w, h: P.h }, m = [1, 0, 0, 1];
    if (L && L.drawAll) L.drawAll(x, P, full, m, z.w, z.h, z.w / P.w, z.h / P.h, id ? { only: id } : undefined);
    else V.drawPhoto(x, P, full, m, z.w, z.h, z.w / P.w, z.h / P.h);
    const d = x.getImageData(0, 0, z.w, z.h).data; c.width = c.height = 0;
    return { d, w: z.w, h: z.h };
  }
  Sel.wand = (px, py, mode) => {
    const P = S.photo; if (!P) return;
    const { d, w, h } = sampleData(), sx = Math.floor(px * w / P.w), sy = Math.floor(py * h / P.h);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
    const s = (sy * w + sx) * 4, r0 = d[s], g0 = d[s + 1], b0 = d[s + 2], a0 = d[s + 3], tol = Sel.tol;
    const near = (i) => { const j = i * 4; return Math.abs(d[j] - r0) <= tol && Math.abs(d[j + 1] - g0) <= tol && Math.abs(d[j + 2] - b0) <= tol && Math.abs(d[j + 3] - a0) <= tol; };
    const out = new Uint8Array(w * h);
    if (!Sel.contiguous) { for (let i = 0; i < out.length; i++) if (near(i)) out[i] = 255; }
    else {                                   // scanline flood fill
      const st = [sx, sy];
      while (st.length) {
        const y = st.pop(), x0 = st.pop(); let x = x0, row = y * w;
        if (out[row + x] || !near(row + x)) continue;
        while (x > 0 && !out[row + x - 1] && near(row + x - 1)) x--;
        let upOn = false, dnOn = false;
        for (; x < w && !out[row + x] && near(row + x); x++) {
          out[row + x] = 255;
          if (y > 0) { const u = row - w + x, ok = !out[u] && near(u); if (ok && !upOn) { st.push(x, y - 1); upOn = true; } else if (!ok) upOn = false; }
          if (y < h - 1) { const u = row + w + x, ok = !out[u] && near(u); if (ok && !dnOn) { st.push(x, y + 1); dnOn = true; } else if (!ok) dnOn = false; }
        }
      }
    }
    Sel.combine(out, mode);
  };

  // ---------- Adjust only inside the selection (engine hook) ----------
  Sel.regionKey = () => {
    const e = S.edits; if (!e) return null;
    const k = Sel.liveAdj ? (e.sel && e.sel.key) : e.adjSel;
    return k && R.has(k) ? k : null;
  };
  // Draw an alpha buffer kept in photo space into an output of outW × outH (the oriented crop), from row offY.
  Sel.drawPhotoMask = (ctx, key, outW, outH, offY) => {
    const P = S.photo, e = S.edits, c = R.canvas(key); if (!c || !P) return false;
    const cr = PE.crop.active ? { x: 0, y: 0, w: P.w, h: P.h } : e.crop, m = e.m, sw = T.swaps(m);
    const a = (sw ? outH : outW) / cr.w, b = (sw ? outW : outH) / cr.h;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(m[0] * a, m[2] * a, m[1] * b, m[3] * b, outW / 2, outH / 2 - (offY || 0));
    ctx.translate(-cr.x - cr.w / 2, -cr.y - cr.h / 2);
    ctx.drawImage(c, 0, 0, P.w, P.h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return true;
  };
  V.adjustMask = (ctx, w, h, offY) => { const k = Sel.regionKey(); return k ? Sel.drawPhotoMask(ctx, k, w, h, offY) : false; };

  // ---------- marching ants (screen space) ----------
  let edge = null, edgeSig = '', ov = null;
  function mapDev() {
    const M = PE.layers.mapping(), d = V.dpr;
    return [M.A * d, M.C * d, M.B * d, M.D * d, (M.rx - M.A * M.cx - M.B * M.cy) * d, (M.ry - M.C * M.cx - M.D * M.cy) * d];
  }
  function buildEdges(key, W, H, tf) {
    const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true }), e = S.edits, P = S.photo;
    x.setTransform(...tf);
    const cr = PE.crop.active ? { x: 0, y: 0, w: P.w, h: P.h } : e.crop;
    x.beginPath(); x.rect(cr.x, cr.y, cr.w, cr.h); x.clip();
    x.drawImage(R.canvas(key), 0, 0, P.w, P.h);
    const a = x.getImageData(0, 0, W, H).data; c.width = c.height = 0;
    const list = [], on = (i) => a[i * 4 + 3] >= 128;
    for (let y = 0; y < H; y++) for (let xx = 0, i = y * W; xx < W; xx++, i++) {
      if (!on(i)) continue;
      if (xx === 0 || yy0(y) || xx === W - 1 || y === H - 1 || !on(i - 1) || !on(i + 1) || !on(i - W) || !on(i + W)) list.push(i);
    }
    return { W, H, list: Int32Array.from(list) };
  }
  const yy0 = (y) => y === 0;
  function drawAnts() {
    const key = Sel.key(), cv = $('view');
    if (!key || !S.photo || !PE.layers.mapping) return;
    const tf = mapDev(), sig = key + '|' + cv.width + 'x' + cv.height + '|' + tf.map((v) => v.toFixed(3)).join(',') + '|' + PE.crop.active + '|' + JSON.stringify(S.edits.crop);
    if (sig !== edgeSig) { edgeSig = sig; edge = buildEdges(key, cv.width, cv.height, tf); }
    if (!edge.list.length) return;
    if (!ov || ov.width !== edge.W || ov.height !== edge.H) ov = canvas(edge.W, edge.H);
    const ox = ov.getContext('2d'), id = ox.createImageData(edge.W, edge.H), d = id.data, ph = Math.floor(performance.now() / 200) % 8, W = edge.W;
    for (const i of edge.list) {
      const v = (((i % W) + ((i / W) | 0) + ph) & 7) < 4 ? 255 : 0, j = i * 4;
      d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255;
    }
    ox.putImageData(id, 0, 0);
    const ctx = cv.getContext('2d'); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(ov, 0, 0); ctx.restore();
  }
  function drawDrag() {
    const g = Sel.drag; if (!g || !g.moved) return;
    const ctx = $('view').getContext('2d'), d = V.dpr;
    ctx.save(); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.beginPath();
    if (g.tool === 'lasso') g.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    else if (g.tool === 'ellipse') ctx.ellipse((g.s0.x + g.s1.x) / 2, (g.s0.y + g.s1.y) / 2, Math.abs(g.s1.x - g.s0.x) / 2, Math.abs(g.s1.y - g.s0.y) / 2, 0, 0, Math.PI * 2);
    else ctx.rect(Math.min(g.s0.x, g.s1.x), Math.min(g.s0.y, g.s1.y), Math.abs(g.s1.x - g.s0.x), Math.abs(g.s1.y - g.s0.y));
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.setLineDash([5, 4]); ctx.stroke();
    ctx.restore();
  }

  // ---------- pointer ----------
  const stagePos = (e) => { const r = V.stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const modal = () => !!document.querySelector('.dlg-wrap:not([hidden])');
  const active = () => Sel.on && !!S.photo && !PE.crop.active && !PE.resize.open && !(PE.layers && PE.layers.open) && !modal();
  Sel.active = active;
  const modeOf = (e) => (e.altKey ? 'sub' : e.shiftKey ? 'add' : Sel.mode);
  function onDown(e) {
    if (!active() || !e.target.closest || !e.target.closest('#stage') || e.target.closest('button, #empty, .ps-bar')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (Sel.drag) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    e.stopImmediatePropagation(); e.preventDefault();
    PE.ui.closePopovers();
    const p = stagePos(e), mode = modeOf(e);
    if (Sel.tool === 'wand') { const q = PE.layers.toPhoto(p.x, p.y); PE.ui.busy('Selecting…'); setTimeout(() => { try { Sel.wand(q.x, q.y, mode); } finally { PE.ui.busy(false); V.requestRender(); } }, 0); return; }
    try { V.stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    Sel.drag = { pid: e.pointerId, tool: Sel.tool, mode, s0: p, s1: p, pts: [p], moved: false };
  }
  function onMove(e) {
    const g = Sel.drag;
    if (!g) { if (e.pointerType === 'mouse' && active() && e.target.closest && e.target.closest('#stage')) V.stage.style.cursor = 'crosshair'; return; }
    if (e.pointerId !== g.pid) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const p = stagePos(e);
    if (!g.moved && Math.hypot(p.x - g.s0.x, p.y - g.s0.y) < 4) return;
    g.moved = true; g.s1 = p;
    if (g.tool === 'lasso') { const q = g.pts[g.pts.length - 1]; if (Math.hypot(p.x - q.x, p.y - q.y) >= 2) g.pts.push(p); }
    V.requestRender();
  }
  function onUp(e) {
    const g = Sel.drag; if (!g || e.pointerId !== g.pid) return;
    e.stopImmediatePropagation(); Sel.drag = null;
    if (!g.moved) { if (g.mode === 'new') Sel.none(); V.requestRender(); return; }   // a tap deselects
    let pts;
    if (g.tool === 'lasso') pts = g.pts.length > 2 ? g.pts : null;
    else if (g.tool === 'ellipse') {
      const cx = (g.s0.x + g.s1.x) / 2, cy = (g.s0.y + g.s1.y) / 2, rx = Math.abs(g.s1.x - g.s0.x) / 2, ry = Math.abs(g.s1.y - g.s0.y) / 2;
      pts = []; for (let i = 0; i < 72; i++) { const t = i / 72 * Math.PI * 2; pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) }); }
    } else pts = [g.s0, { x: g.s1.x, y: g.s0.y }, g.s1, { x: g.s0.x, y: g.s1.y }];
    if (pts) { const M = PE.layers.mapping(); Sel.combine(polyBuf(pts.map((p) => PE.layers.toPhoto(p.x, p.y, M))), g.mode); }
    V.requestRender();
  }
  function onCancel(e) { if (Sel.drag && e.pointerId === Sel.drag.pid) { e.stopImmediatePropagation(); Sel.drag = null; V.requestRender(); } }

  // ---------- option bar ----------
  const TOOLS = [['rect', '▭', 'Rectangle (M)'], ['ellipse', '◯', 'Ellipse (M)'], ['lasso', '✎', 'Lasso (Shift+L)'], ['wand', '✦', 'Magic wand (W)']];
  function buildBar() {
    const b = document.createElement('div');
    b.id = 'ps-selbar'; b.className = 'ps-bar'; b.hidden = true;
    b.innerHTML = '<div class="seg" id="sb-tools">' + TOOLS.map((t) => '<button type="button" tabindex="-1" data-v="' + t[0] + '" title="' + t[2] + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div class="seg" id="sb-mode" title="Shift adds, Alt subtracts"><button type="button" tabindex="-1" data-v="new">New</button><button type="button" tabindex="-1" data-v="add">Add</button><button type="button" tabindex="-1" data-v="sub">Subtract</button></div>' +
      '<span id="sb-wand" class="ps-barg"><label>Tolerance <input type="range" id="sb-tol" min="0" max="128" step="1" tabindex="-1"></label><b id="sb-tol-v"></b>' +
      '<button type="button" tabindex="-1" class="chip" id="sb-contig">Contiguous</button><button type="button" tabindex="-1" class="chip" id="sb-sample" title="Sample the whole image or only the selected layer">Image</button></span>' +
      '<button type="button" tabindex="-1" class="chip" id="sb-all" title="Select all (Ctrl+A)">All</button><button type="button" tabindex="-1" class="chip" id="sb-none" title="Deselect (Esc, Ctrl+D)">None</button>' +
      '<button type="button" tabindex="-1" class="chip" id="sb-inv" title="Invert (Ctrl+I)">Invert</button>' +
      '<button type="button" tabindex="-1" class="btn ghost" id="sb-done">Done</button>';
    document.body.appendChild(b);
    const on = PE.ui.onTap;
    for (const x of $('sb-tools').children) on(x, () => { Sel.tool = x.dataset.v; syncBar(); });
    for (const x of $('sb-mode').children) on(x, () => { Sel.mode = x.dataset.v; syncBar(); });
    $('sb-tol').addEventListener('input', () => { Sel.tol = +$('sb-tol').value; syncBar(); });
    on($('sb-contig'), () => { Sel.contiguous = !Sel.contiguous; syncBar(); });
    on($('sb-sample'), () => { Sel.sample = Sel.sample === 'image' ? 'layer' : 'image'; syncBar(); });
    on($('sb-all'), () => { Sel.all(); V.requestRender(); });
    on($('sb-none'), () => { Sel.none(); V.requestRender(); });
    on($('sb-inv'), () => { Sel.invert(); V.requestRender(); });
    on($('sb-done'), () => Sel.toggle(false));
  }
  function syncBar() {
    const b = $('ps-selbar'); if (!b) return;
    b.hidden = !Sel.on || !S.photo;
    for (const x of $('sb-tools').children) x.classList.toggle('sel', x.dataset.v === Sel.tool);
    for (const x of $('sb-mode').children) x.classList.toggle('sel', x.dataset.v === Sel.mode);
    $('sb-wand').hidden = Sel.tool !== 'wand';
    $('sb-tol').value = Sel.tol; $('sb-tol-v').textContent = Sel.tol;
    $('sb-contig').classList.toggle('sel', Sel.contiguous);
    $('sb-sample').textContent = Sel.sample === 'image' ? 'Image' : 'Layer';
    for (const t of ['select', 'wand']) { const x = $('tb-' + t); if (x) x.classList.toggle('active', Sel.on && (t === 'wand') === (Sel.tool === 'wand')); }
  }
  Sel.syncBar = syncBar;
  Sel.toggle = (on, tool) => {
    on = on == null ? !Sel.on : !!on;
    if (tool) Sel.tool = tool;
    if (on) {
      if (!S.photo) return;
      if (PE.crop.active) PE.crop.cancel();
      if (PE.layers && PE.layers.open) PE.layers.toggle(false);
      if (PE.masks && PE.masks.on) PE.masks.toggle(false);
    } else { Sel.drag = null; V.stage.style.cursor = ''; }
    Sel.on = on; syncBar(); V.requestRender();
  };

  // ---------- init ----------
  function init() {
    buildBar(); syncBar();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    const prevRender = V.onRender;
    V.onRender = () => { if (prevRender) prevRender(); drawAnts(); drawDrag(); };
    setInterval(() => { if (Sel.key() && !document.hidden) V.requestRender(); }, 200);
    // opening Layers closes the selection tools
    const lt = PE.layers.toggle;
    PE.layers.toggle = (on) => { lt(on); if (PE.layers.open && Sel.on) Sel.toggle(false); };
    PE.on((kind) => {
      if (kind === 'adjlive') { if (!Sel.liveAdj && Sel.key() !== (S.edits.adjSel || null)) { Sel.liveAdj = true; } return; }
      if (kind === 'adj' && S.edits) {
        // Adjust / Looks follow the selection active when they were last changed (stored in this history step).
        const was = S.edits.adjSel || null, eff = PE.adjust.effective(S.edits);
        const now = PE.adjust.isIdentity(eff) && !eff.sh ? null : Sel.key();
        Sel.liveAdj = false;
        if (now !== was) { S.edits.adjSel = now; if (S.history[S.index]) S.history[S.index].adjSel = now; V.rebuild(); }
      } else if (kind === 'history' || kind === 'photo') Sel.liveAdj = false;
      if (kind === 'photo') { edgeSig = ''; if (!S.photo) Sel.on = false; }
      R.gc(); syncBar();
      if (kind === 'sel') { edgeSig = ''; V.requestRender(); }
    });
    // keys (capture, before the engine and Studio keys)
    window.addEventListener('keydown', (e) => {
      if (!S.photo || modal() || PE.resize.open) return;
      const t = e.target;
      if (t && ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const k = (e.key || '').toLowerCase(), stop = () => { e.preventDefault(); e.stopImmediatePropagation(); V.requestRender(); };
      if (e.ctrlKey || e.metaKey) {
        if (e.altKey || e.shiftKey) return;
        if (k === 'a') { Sel.all(); stop(); } else if (k === 'd') { Sel.none(); stop(); } else if (k === 'i') { Sel.invert(); stop(); }
        return;
      }
      if (e.altKey || PE.crop.active) return;
      if (k === 'escape' && Sel.key() && !(PE.layers && PE.layers.open && PE.layers.sel)) { Sel.none(); stop(); return; }
      if (k === 'escape' && Sel.on) { Sel.toggle(false); stop(); return; }
      if (k === 'l' && e.shiftKey) { Sel.toggle(true, 'lasso'); stop(); return; }
      if (k === 'm' && !e.shiftKey) { Sel.toggle(true, Sel.on && Sel.tool === 'rect' ? 'ellipse' : 'rect'); stop(); return; }
      if (k === 'w' && !e.shiftKey) { Sel.toggle(Sel.on && Sel.tool === 'wand' ? false : true, 'wand'); stop(); }
    }, true);
  }

  PE.studio.feature({ id: 'select', init: init });
  PE.studio.addTool({
    id: 'select', title: 'Select (M marquee, Shift+L lasso)',
    svg: '<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2.5"/>',
    onTap() { Sel.toggle(Sel.on && Sel.tool !== 'wand' ? false : true, Sel.tool === 'wand' ? 'rect' : null); }
  });
  PE.studio.addTool({
    id: 'wand', title: 'Magic wand (W)',
    svg: '<path d="M5 19L15 9"/><path d="M17 3v3M17 9v3M14 6h-0M20 6h0M14.5 6h-1.5M21 6h-1.5"/>',
    onTap() { Sel.toggle(Sel.on && Sel.tool === 'wand' ? false : true, 'wand'); }
  });
})(window.PE);
