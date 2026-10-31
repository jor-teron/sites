/*
 * Hub Photo Studio (HPS4) — ps_retouch.js: Retouch tools (one file, registered through PE.studio).
 *
 * Tools (one toolbar button, a floating option bar like Select / Mask):
 *   Healing brush (J), Red-eye (Shift+J), Clone stamp (S), Blur brush (U), Smudge brush (Shift+U).
 *   Clone / Healing: Alt+click (or the "Set source" chip on touch) picks the source; Aligned keeps the
 *   source offset between strokes, otherwise every stroke starts again from the source point.
 *   Healing = clone + shifting the copied colour to the average colour around the brush (keeps the texture).
 *   Red-eye: click on an eye, or drag a box around it; only strongly red pixels change.
 *   Size / Hardness / Strength, [ and ] resize. Esc closes the bar.
 * Paints on the selected layer (image layers) or the Background. An active HPS3 selection limits painting;
 * a layer mask still hides what it hides (retouched pixels sit under the mask).
 *
 * Storage: a target's retouch is a PATCH — an RGBA image over the target's own pixels (Background: the
 *   whole original photo; image layer: its picture), transparent where untouched, at most
 *   C.studio.retouch.maxPixels big. It lives in PE.pix as { w, h, rgba: true, tiles[] } (256 px tiles,
 *   shared between undo steps, so a stroke only costs the tiles it touched). Edits hold { key } only:
 *   S.edits.bg.retouch / layer.retouch. One stroke = one undo step; PE.pix.gc frees unused patches.
 * Drawing: the patch is laid over the source picture before Adjust / Looks, masks and layer opacity,
 *   through the L.drawBg / L.bgMasked / L.drawLayer hooks — so preview, Save, Print, Send, .ora and the
 *   magic wand all see it. Photo Editor v2 never loads this file (no engine hooks there).
 * .hps: retouch/<layer id>.png and retouch/background.png (RGBA). Older files have none; version stays 1.
 */
(function (PE) {
  'use strict';
  const S = PE.state, V = PE.view, C = PE.config;
  const $ = (id) => document.getElementById(id);
  const RC = () => C.studio.retouch;
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const R = PE.pix, L = PE.layers, Sel = PE.select, M = PE.masks;
  const TS = 256;                                                  // tile size
  const TOOLS = [['heal', 'Healing'], ['clone', 'Clone'], ['redeye', 'Red-eye'], ['blur', 'Blur'], ['smudge', 'Smudge']];
  const RT = PE.retouch = { on: false, tool: 'heal', size: 40, hard: 50, str: { heal: 100, clone: 100, redeye: 100, blur: 60, smudge: 60 },
    aligned: true, src: null, offset: null, setSrc: false, stroke: null, live: null };

  // ---------- RGBA patches in PE.pix ----------
  R.refs.push((e, add) => {
    if (e.bg && e.bg.retouch) add(e.bg.retouch.key);
    for (const l of e.layers || []) if (l.retouch) add(l.retouch.key);
  });
  const baseCanvas = R.canvas;
  // legacy (HPS3): R.canvas only knew alpha buffers; RGBA patches are built from their tiles.
  R.canvas = (k) => {
    const b = R.get(k); if (!b || !b.rgba) return baseCanvas(k);
    let c = R.cv.get(k);
    if (!c) {
      c = canvas(b.w, b.h); const x = c.getContext('2d');
      forTiles(b.w, b.h, (t, tx, ty, tw, th) => { const d = b.tiles[t]; if (d) x.putImageData(new ImageData(d, tw, th), tx, ty); });
      R.cv.set(k, c);
    }
    return c;
  };
  function forTiles(w, h, fn) {
    const nx = Math.ceil(w / TS), ny = Math.ceil(h / TS);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) fn(j * nx + i, i * TS, j * TS, Math.min(TS, w - i * TS), Math.min(TS, h - j * TS));
  }
  // Tiles from a full RGBA array; reuse old tiles where nothing changed (dirty: Set of tile indexes, or null = all).
  function putPatch(w, h, data, old, dirty) {
    const tiles = [];
    forTiles(w, h, (t, tx, ty, tw, th) => {
      if (old && dirty && !dirty.has(t)) { tiles[t] = old.tiles[t] || null; return; }
      const d = new Uint8ClampedArray(tw * th * 4); let any = false;
      for (let y = 0; y < th; y++) {
        const s = ((ty + y) * w + tx) * 4; d.set(data.subarray(s, s + tw * 4), y * tw * 4);
      }
      for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; }
      tiles[t] = any ? d : null;
    });
    if (!tiles.some(Boolean)) return null;
    const k = 'p' + (++R.seq); R.bufs.set(k, { w, h, rgba: true, tiles }); return k;
  }
  function patchData(b) {                                          // full RGBA array of a patch
    const d = new Uint8ClampedArray(b.w * b.h * 4);
    forTiles(b.w, b.h, (t, tx, ty, tw, th) => {
      const s = b.tiles[t]; if (!s) return;
      for (let y = 0; y < th; y++) d.set(s.subarray(y * tw * 4, (y + 1) * tw * 4), ((ty + y) * b.w + tx) * 4);
    });
    return d;
  }

  // ---------- targets ----------
  RT.targetId = () => (L.sel && L.sel !== 'bg' && L.get(L.sel) ? L.sel : 'bg');
  const tgt = (id) => (id === 'bg' ? L.bg() : L.get(id));
  const patchOf = (t) => (t && t.retouch && R.has(t.retouch.key) ? t.retouch.key : null);
  function sourceOf(id) {                                          // { bitmap, w, h } the patch lies over
    if (id === 'bg') { const P = S.photo; return P ? { bitmap: P.bitmap, w: P.w, h: P.h } : null; }
    const l = L.get(id); if (!l || l.type !== 'image') return null;
    const im = L.images.get(l.src); return im && im.bitmap ? { bitmap: im.bitmap, w: im.w || l.w, h: im.h || l.h } : null;
  }
  function patchSize(src) {
    const k = Math.min(1, Math.sqrt(RC().maxPixels / Math.max(1, src.w * src.h)));
    return { w: Math.max(1, Math.round(src.w * k)), h: Math.max(1, Math.round(src.h * k)) };
  }
  function patchCanvas(id) {
    if (RT.live && RT.live.id === id) return RT.live.c;
    const k = patchOf(tgt(id)); return k ? R.canvas(k) : null;
  }

  // ---------- drawing hooks ----------
  const comps = new Map();                                         // id -> { sig, c }
  function composite(id, bitmap, w, h) {
    const pc = patchCanvas(id); if (!pc) return null;
    const live = RT.live && RT.live.id === id;
    const sig = live ? 'live' + RT.live.n : patchOf(tgt(id));
    let e = comps.get(id);
    if (e && e.sig === sig && e.bm === bitmap && !live) return e.c;
    if (!e) { e = { c: canvas(w, h) }; comps.set(id, e); }
    if (e.c.width !== w || e.c.height !== h) { e.c.width = w; e.c.height = h; }
    const x = e.c.getContext('2d'); x.clearRect(0, 0, w, h);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(bitmap, 0, 0, w, h); x.drawImage(pc, 0, 0, w, h);
    e.sig = sig; e.bm = bitmap;
    return e.c;
  }
  function freeComps() {                                           // drop composites no current target uses
    for (const [id, e] of [...comps]) {
      const t = id === 'bg' ? (S.photo ? L.bg() : null) : L.get(id);
      if (!t || (!patchOf(t) && !(RT.live && RT.live.id === id))) { e.c.width = e.c.height = 0; comps.delete(id); }
    }
  }
  const hasBg = () => !!S.photo && !!patchCanvas('bg');
  const baseBgMasked = L.bgMasked;
  // legacy (HPS3): L.bgMasked = only "the background mask is on"; a retouched background also needs L.drawBg.
  L.bgMasked = () => baseBgMasked() || hasBg();
  const baseBg = L.drawBg;
  L.drawBg = (x, P, cr, m, w, h, a, b, alpha) => {
    let Q = P;
    if (P && P.bitmap && hasBg()) { const c = composite('bg', P.bitmap, P.w, P.h); if (c) Q = Object.assign({}, P, { bitmap: c }); }
    return baseBg(x, Q, cr, m, w, h, a, b, alpha);
  };
  const baseLayer = L.drawLayer;
  L.drawLayer = (x, l, raw) => {
    if (!l || l.type !== 'image' || !patchCanvas(l.id)) return baseLayer(x, l, raw);
    const imgs = L.images, im = imgs.get(l.src);
    if (!im || !im.bitmap) return baseLayer(x, l, raw);
    const c = composite(l.id, im.bitmap, im.w || l.w, im.h || l.h);
    imgs.set(l.src, Object.assign({}, im, { bitmap: c }));       // only for this one draw
    try { return baseLayer(x, l, raw); } finally { imgs.set(l.src, im); }
  };

  // ---------- geometry: screen -> patch ----------
  const stagePos = (e) => { const r = V.stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function toPatch(id, p, Mp, z) {
    const q = L.toPhoto(p.x, p.y, Mp);
    if (id === 'bg') { const P = S.photo; return { x: q.x * z.w / P.w, y: q.y * z.h / P.h }; }
    const l = L.get(id), u = L.toLocal(l, q);
    return { x: (u.x + l.w / 2) * z.w / l.w, y: (u.y + l.h / 2) * z.h / l.h };
  }
  function radiusIn(id, Mp, z) {
    const ppp = Math.sqrt(Math.abs(Mp.A * Mp.D - Mp.B * Mp.C)) || 1;
    let r = (RT.size / 2) / ppp;
    if (id === 'bg') return Math.max(0.5, r * z.w / S.photo.w);
    const l = L.get(id); r /= (l.scale || 1); return Math.max(0.5, r * z.w / Math.max(1, l.w));
  }
  function selWeights(id, z) {                                     // Uint8Array at patch size, or null = everywhere
    const k = Sel.key(); if (!k) return null;
    const c = canvas(z.w, z.h), x = c.getContext('2d'), P = S.photo, sc = R.canvas(k);
    if (id === 'bg') x.drawImage(sc, 0, 0, z.w, z.h);
    else {
      const l = L.get(id), kk = l.scale || 1;
      x.scale(z.w / l.w, z.h / l.h); x.translate(l.w / 2, l.h / 2);
      x.scale(1 / kk, 1 / kk); x.rotate(-(l.rot || 0)); x.translate(-l.x, -l.y);
      x.drawImage(sc, 0, 0, P.w, P.h);
    }
    const a = R.alphaOf(c); c.width = c.height = 0; return a;
  }

  // ---------- stroke ----------
  function begin(id) {
    const t = tgt(id), src = sourceOf(id);
    if (!t || !src) { PE.ui.toast('Retouch works on the photo and on picture layers'); return null; }
    if (id !== 'bg' && t.locked) { PE.ui.toast('That layer is locked'); return null; }
    const z = patchSize(src), ok = patchOf(t), old = ok ? R.get(ok) : null;
    const wc = canvas(z.w, z.h), wx = wc.getContext('2d', { willReadFrequently: true });
    wx.imageSmoothingEnabled = true; wx.imageSmoothingQuality = 'high';
    wx.drawImage(src.bitmap, 0, 0, z.w, z.h);
    if (old) wx.drawImage(R.canvas(ok), 0, 0, z.w, z.h);       // a patch from before a Resize is scaled
    const W = wx.getImageData(0, 0, z.w, z.h); wc.width = wc.height = 0;
    const lc = canvas(z.w, z.h), lx = lc.getContext('2d', { willReadFrequently: true });
    const keep = old && old.w === z.w && old.h === z.h;
    // legacy (HPS4 first cut): const LD = keep ? new ImageData(patchData(old), z.w, z.h) : lx.createImageData(z.w, z.h);
    let LD;
    if (keep) LD = new ImageData(patchData(old), z.w, z.h);
    else if (old) { lx.drawImage(R.canvas(ok), 0, 0, z.w, z.h); LD = lx.getImageData(0, 0, z.w, z.h); }
    else LD = lx.createImageData(z.w, z.h);
    lx.putImageData(LD, 0, 0);
    RT.live = { id, c: lc, n: 0 };
    return { id, z, W: W.data, O: new Uint8ClampedArray(W.data), LD, lx, sel: selWeights(id, z), dirty: new Set(), old: keep ? old : null, last: null, carry: null };
  }
  function finish(st) {
    const key = putPatch(st.z.w, st.z.h, st.LD.data, st.old, st.old ? st.dirty : null);
    RT.live = null; st.lx.canvas.width = st.lx.canvas.height = 0;
    if (!st.dirty.size) { V.rebuild(); return; }
    const v = key ? { key } : null;
    if (st.id === 'bg') S.apply((e) => { e.bg = Object.assign({}, L.bg(), { retouch: v }); if (!v) delete e.bg.retouch; }, 'geom');
    else L.update(st.id, { retouch: v });
    freeComps(); V.requestRender();
  }
  // weight of a dab pixel at distance d (0..1)
  const fall = (d, r) => { const h = Math.min(0.99, RT.hard / 100) * r; return d <= h ? 1 : d >= r ? 0 : 1 - (d - h) / (r - h); };
  function commitRect(st, x0, y0, x1, y1, touched) {             // copy touched work pixels into the live patch
    const w = st.z.w, W = st.W, D = st.LD.data;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x; if (!touched[(y - y0) * (x1 - x0 + 1) + (x - x0)]) continue;
      const o = i * 4; D[o] = W[o]; D[o + 1] = W[o + 1]; D[o + 2] = W[o + 2]; D[o + 3] = Math.max(W[o + 3], 1);
      st.dirty.add(Math.floor(y / TS) * Math.ceil(w / TS) + Math.floor(x / TS));
    }
    st.lx.putImageData(st.LD, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    RT.live.n++;
  }
  function meanAt(O, w, h, cx, cy, r) {
    const m = [0, 0, 0]; let n = 0, s = Math.max(1, Math.floor(r / 6));
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y += s)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x += s) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue;
        const o = (y * w + x) * 4; m[0] += O[o]; m[1] += O[o + 1]; m[2] += O[o + 2]; n++;
      }
    return n ? [m[0] / n, m[1] / n, m[2] / n] : null;
  }
  function dab(st, c, r) {
    const { w, h } = st.z, W = st.W, O = st.O, sel = st.sel, tool = RT.tool, k = RT.str[tool] / 100;
    const x0 = Math.max(0, Math.floor(c.x - r)), y0 = Math.max(0, Math.floor(c.y - r)), x1 = Math.min(w - 1, Math.ceil(c.x + r)), y1 = Math.min(h - 1, Math.ceil(c.y + r));
    if (x1 < x0 || y1 < y0) return;
    const bw = x1 - x0 + 1, touched = new Uint8Array(bw * (y1 - y0 + 1));
    let ox = 0, oy = 0, shift = null, blur = null, kb = 0;
    if (tool === 'clone' || tool === 'heal') {
      ox = Math.round(st.off.x); oy = Math.round(st.off.y);
      if (tool === 'heal') { const a = meanAt(O, w, h, c.x + ox, c.y + oy, r), b = meanAt(O, w, h, c.x, c.y, r); if (a && b) shift = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; }
    } else if (tool === 'blur') {
      kb = Math.max(1, Math.round(r / 5));
      const bx0 = Math.max(0, x0 - kb), by0 = Math.max(0, y0 - kb), bx1 = Math.min(w - 1, x1 + kb), by1 = Math.min(h - 1, y1 + kb), ew = bx1 - bx0 + 1, eh = by1 - by0 + 1;
      const tmp = new Float32Array(ew * eh * 3), out = new Float32Array(ew * eh * 3);
      for (let y = 0; y < eh; y++) for (let ch = 0; ch < 3; ch++) {   // horizontal box
        let s = 0, n = 0;
        for (let x = -kb; x < ew + kb; x++) {
          const xi = x + kb; if (xi >= 0 && xi < ew) { s += W[((by0 + y) * w + bx0 + xi) * 4 + ch]; n++; }
          const xo = x - kb - 1; if (xo >= 0 && xo < ew) { s -= W[((by0 + y) * w + bx0 + xo) * 4 + ch]; n--; }
          if (x >= 0 && x < ew) tmp[(y * ew + x) * 3 + ch] = s / n;
        }
      }
      for (let x = 0; x < ew; x++) for (let ch = 0; ch < 3; ch++) {   // vertical box
        let s = 0, n = 0;
        for (let y = -kb; y < eh + kb; y++) {
          const yi = y + kb; if (yi >= 0 && yi < eh) { s += tmp[(yi * ew + x) * 3 + ch]; n++; }
          const yo = y - kb - 1; if (yo >= 0 && yo < eh) { s -= tmp[(yo * ew + x) * 3 + ch]; n--; }
          if (y >= 0 && y < eh) out[(y * ew + x) * 3 + ch] = s / n;
        }
      }
      blur = { out, ew, bx0, by0 };
    } else if (tool === 'smudge' && !st.carry) {
      st.carry = { r: Math.ceil(r), d: new Float32Array((2 * Math.ceil(r) + 1) ** 2 * 3).fill(-1) };
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y); if (d >= r) continue;
      const o = (y * w + x) * 4;
      let a = fall(d, r) * k * (sel ? sel[y * w + x] / 255 : 1); if (a <= 0) continue;
      let v0, v1, v2;
      if (tool === 'clone' || tool === 'heal') {
        const sx = x + ox, sy = y + oy; if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const so = (sy * w + sx) * 4; v0 = O[so]; v1 = O[so + 1]; v2 = O[so + 2];
        if (shift) { v0 += shift[0]; v1 += shift[1]; v2 += shift[2]; }
      } else if (tool === 'blur') {
        const bo = ((y - blur.by0) * blur.ew + (x - blur.bx0)) * 3; v0 = blur.out[bo]; v1 = blur.out[bo + 1]; v2 = blur.out[bo + 2];
      } else {                                                    // smudge: carry the colour along
        const cr = st.carry.r, ci = Math.round(x - c.x) + cr, cj = Math.round(y - c.y) + cr;
        if (ci < 0 || cj < 0 || ci > 2 * cr || cj > 2 * cr) continue;
        const co = (cj * (2 * cr + 1) + ci) * 3, cd = st.carry.d;
        if (cd[co] < 0) { cd[co] = W[o]; cd[co + 1] = W[o + 1]; cd[co + 2] = W[o + 2]; continue; }
        v0 = cd[co]; v1 = cd[co + 1]; v2 = cd[co + 2];
        const n0 = W[o] + (v0 - W[o]) * a, n1 = W[o + 1] + (v1 - W[o + 1]) * a, n2 = W[o + 2] + (v2 - W[o + 2]) * a;
        cd[co] = n0; cd[co + 1] = n1; cd[co + 2] = n2;
        W[o] = n0; W[o + 1] = n1; W[o + 2] = n2; touched[(y - y0) * bw + x - x0] = 1; continue;
      }
      W[o] += (v0 - W[o]) * a; W[o + 1] += (v1 - W[o + 1]) * a; W[o + 2] += (v2 - W[o + 2]) * a;
      touched[(y - y0) * bw + x - x0] = 1;
    }
    commitRect(st, x0, y0, x1, y1, touched);
  }
  function strokeTo(st, p) {
    const q = toPatch(st.id, p, st.Mp, st.z), r = st.r, last = st.last;
    const sp = RT.tool === 'smudge' ? 0.12 : RT.tool === 'blur' ? 0.33 : 0.25;
    if (!last) { dab(st, q, r); st.last = q; return; }
    const d = Math.hypot(q.x - last.x, q.y - last.y), step = Math.max(0.5, r * sp);
    if (d < step) return;
    const n = Math.ceil(d / step);
    for (let i = 1; i <= n; i++) dab(st, { x: last.x + (q.x - last.x) * i / n, y: last.y + (q.y - last.y) * i / n }, r);
    st.last = q;
  }
  function redEye(st, a, b) {                                       // a, b: patch points (box corners)
    const { w, h } = st.z, W = st.W, sel = st.sel, k = RT.str.redeye / 100;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x))), x1 = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x)));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y))), y1 = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y)));
    if (x1 < x0 || y1 < y0) return 0;
    const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
    const touched = new Uint8Array((x1 - x0 + 1) * (y1 - y0 + 1)); let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const e = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2; if (e >= 1) continue;
      const o = (y * w + x) * 4, R0 = W[o], g = W[o + 1], bl = W[o + 2], m = (g + bl) / 2;
      if (R0 < 50 || R0 < m * 1.4) continue;
      const red = Math.min(1, (R0 - m * 1.4) / 50), edge = e < 0.7 ? 1 : (1 - e) / 0.3;
      const a2 = red * edge * k * (sel ? sel[y * w + x] / 255 : 1); if (a2 <= 0) continue;
      W[o] = R0 + (m * 0.9 - R0) * a2; W[o + 1] = g * (1 - 0.1 * a2); W[o + 2] = bl * (1 - 0.1 * a2);
      touched[(y - y0) * (x1 - x0 + 1) + x - x0] = 1; n++;
    }
    if (n) commitRect(st, x0, y0, x1, y1, touched);
    return n;
  }

  // ---------- pointer ----------
  const modal = () => !!document.querySelector('.dlg-wrap:not([hidden])');
  const active = () => RT.on && !!S.photo && !PE.crop.active && !PE.resize.open && !L.open && !modal();
  RT.active = active;
  let hover = null, rq = 0;
  function redraw() { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; V.rebuild(); }); }
  function onDown(e) {
    if (!active() || !e.target.closest || !e.target.closest('#stage') || e.target.closest('button, #empty, .ps-bar')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (RT.stroke) return;
    PE.ui.closePopovers();
    const id = RT.targetId(), p = stagePos(e), Mp = L.mapping(), tool = RT.tool;
    if ((tool === 'clone' || tool === 'heal') && (e.altKey || RT.setSrc)) {
      const src = sourceOf(id); if (!src) { PE.ui.toast('Retouch works on the photo and on picture layers'); return; }
      const z = patchSize(src);
      RT.src = { id, pt: toPatch(id, p, Mp, z), photo: L.toPhoto(p.x, p.y, Mp) }; RT.offset = null; RT.setSrc = false;
      PE.ui.toast('Source set'); syncBar(); V.requestRender(); return;
    }
    if ((tool === 'clone' || tool === 'heal') && (!RT.src || RT.src.id !== id)) { PE.ui.toast('Alt+click (or Set source) to pick where to copy from'); return; }
    const st = begin(id); if (!st) return;
    st.pid = e.pointerId; st.Mp = Mp; st.r = radiusIn(id, Mp, st.z); st.p0 = p;
    if (tool === 'clone' || tool === 'heal') {
      const q = toPatch(id, p, Mp, st.z);
      if (!RT.aligned || !RT.offset) RT.offset = { x: RT.src.pt.x - q.x, y: RT.src.pt.y - q.y };
      st.off = RT.offset;
    }
    RT.stroke = st;
    try { V.stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (tool !== 'redeye') { strokeTo(st, p); redraw(); }
  }
  function onMove(e) {
    const st = RT.stroke;
    if (!st) {
      if (active() && e.target.closest && e.target.closest('#stage')) { hover = stagePos(e); V.stage.style.cursor = RT.tool === 'redeye' ? 'crosshair' : 'none'; V.requestRender(); }
      else if (hover) { hover = null; V.stage.style.cursor = ''; V.requestRender(); }
      return;
    }
    if (e.pointerId !== st.pid) return;
    e.stopImmediatePropagation(); e.preventDefault();
    hover = stagePos(e);
    if (RT.tool === 'redeye') { st.p1 = hover; V.requestRender(); return; }
    strokeTo(st, hover); redraw();
  }
  function onUp(e) {
    const st = RT.stroke; if (!st || e.pointerId !== st.pid) return;
    e.stopImmediatePropagation(); RT.stroke = null;
    if (RT.tool === 'redeye') {
      const p1 = st.p1 || st.p0;
      let a, b;
      if (Math.hypot(p1.x - st.p0.x, p1.y - st.p0.y) < 6) { const s = RT.size / 2; a = { x: st.p0.x - s, y: st.p0.y - s }; b = { x: st.p0.x + s, y: st.p0.y + s }; }
      else { a = st.p0; b = p1; }
      const cs = [a, b, { x: a.x, y: b.y }, { x: b.x, y: a.y }].map((q) => toPatch(st.id, q, st.Mp, st.z));
      const xs = cs.map((q) => q.x), ys = cs.map((q) => q.y);
      const n = redEye(st, { x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) });
      if (!n) PE.ui.toast('No red eye found there');
    }
    finish(st);
  }
  function onCancel(e) {
    const st = RT.stroke; if (!st || e.pointerId !== st.pid) return;
    e.stopImmediatePropagation(); RT.stroke = null; RT.live = null; st.lx.canvas.width = st.lx.canvas.height = 0;
    freeComps(); V.rebuild();
  }
  function drawCursor() {
    if (!active()) return;
    const ctx = $('view').getContext('2d'), d = V.dpr;
    ctx.save(); ctx.setTransform(d, 0, 0, d, 0, 0);
    const ring = (x, y, r, dash) => {
      ctx.setLineDash(dash || []); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke();
    };
    const st = RT.stroke;
    if (RT.tool === 'redeye' && st && st.p1) {
      const x = Math.min(st.p0.x, st.p1.x), y = Math.min(st.p0.y, st.p1.y), w = Math.abs(st.p1.x - st.p0.x), h = Math.abs(st.p1.y - st.p0.y);
      ctx.setLineDash([4, 3]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeRect(x, y, w, h);
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.strokeRect(x, y, w, h);
    } else if (hover) {
      ring(hover.x, hover.y, RT.size / 2);
      if (RT.tool !== 'redeye' && RT.hard < 95) ring(hover.x, hover.y, RT.size / 2 * RT.hard / 100, [3, 3]);
    }
    // clone / heal source marker
    if ((RT.tool === 'clone' || RT.tool === 'heal') && RT.src && RT.src.id === RT.targetId()) {
      let s = null;
      if (st && st.off && hover) { const Mp = L.mapping(); const q = toPatch(st.id, hover, Mp, st.z); s = fromPatch(st.id, { x: q.x + st.off.x, y: q.y + st.off.y }, st.z, Mp); }
      else if (!st) s = L.toScreen(RT.src.photo.x, RT.src.photo.y);
      if (s) { ctx.setLineDash([]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(s.x - 7, s.y); ctx.lineTo(s.x + 7, s.y); ctx.moveTo(s.x, s.y - 7); ctx.lineTo(s.x, s.y + 7); ctx.stroke(); }
    }
    ctx.restore();
  }
  function fromPatch(id, q, z, Mp) {
    if (id === 'bg') { const P = S.photo; return L.toScreen(q.x * P.w / z.w, q.y * P.h / z.h, Mp); }
    const l = L.get(id), p = L.localPt(l, q.x * l.w / z.w - l.w / 2, q.y * l.h / z.h - l.h / 2);
    return L.toScreen(p.x, p.y, Mp);
  }

  // ---------- commands ----------
  RT.clear = () => {
    const id = RT.targetId(); if (!patchOf(tgt(id))) return;
    PE.studio.ask({ title: 'Remove retouching?', text: 'All retouch strokes on this layer go. You can undo this.', ok: 'Remove' }).then((ok) => {
      if (!ok) return;
      if (id === 'bg') S.apply((e) => { e.bg = Object.assign({}, L.bg()); delete e.bg.retouch; }, 'geom'); else L.update(id, { retouch: null });
      freeComps(); V.requestRender();
    });
  };

  // ---------- option bar ----------
  function buildBar() {
    const b = document.createElement('div');
    b.id = 'ps-retouchbar'; b.className = 'ps-bar'; b.hidden = true;
    b.innerHTML = '<b id="rb-target" class="ps-mut"></b>' +
      '<div class="seg" id="rb-tool">' + TOOLS.map((t) => '<button type="button" tabindex="-1" data-v="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      '<label class="ps-barg">Size <input type="range" id="rb-size" min="2" max="400" step="1" tabindex="-1"></label>' +
      '<label class="ps-barg" id="rb-hardg">Hardness <input type="range" id="rb-hard" min="0" max="100" step="1" tabindex="-1"></label>' +
      '<label class="ps-barg">Strength <input type="range" id="rb-str" min="5" max="100" step="1" tabindex="-1"></label>' +
      '<button type="button" tabindex="-1" class="chip" id="rb-src">Set source</button>' +
      '<button type="button" tabindex="-1" class="chip" id="rb-al">Aligned</button>' +
      '<button type="button" tabindex="-1" class="chip" id="rb-clear">Remove retouch</button>' +
      '<button type="button" tabindex="-1" class="btn ghost" id="rb-done">Done</button>';
    document.body.appendChild(b);
    const on = PE.ui.onTap;
    for (const x of $('rb-tool').children) on(x, () => { RT.tool = x.dataset.v; syncBar(); V.requestRender(); });
    $('rb-size').addEventListener('input', () => { RT.size = +$('rb-size').value; });
    $('rb-hard').addEventListener('input', () => { RT.hard = +$('rb-hard').value; });
    $('rb-str').addEventListener('input', () => { RT.str[RT.tool] = +$('rb-str').value; });
    on($('rb-src'), () => { RT.setSrc = !RT.setSrc; syncBar(); if (RT.setSrc) PE.ui.toast('Tap where to copy from'); });
    on($('rb-al'), () => { RT.aligned = !RT.aligned; RT.offset = null; syncBar(); });
    on($('rb-clear'), RT.clear);
    on($('rb-done'), () => RT.toggle(false));
  }
  function syncBar() {
    const b = $('ps-retouchbar'); if (!b) return;
    b.hidden = !RT.on || !S.photo;
    const tb = $('tb-retouch'); if (tb) tb.classList.toggle('active', RT.on);
    if (b.hidden) return;
    const id = RT.targetId(), t = tgt(id), cs = RT.tool === 'clone' || RT.tool === 'heal';
    $('rb-target').textContent = 'Retouch: ' + (id === 'bg' ? 'Background' : (t && t.name) || 'Layer');
    for (const x of $('rb-tool').children) x.classList.toggle('sel', x.dataset.v === RT.tool);
    $('rb-size').value = RT.size; $('rb-hard').value = RT.hard; $('rb-str').value = RT.str[RT.tool];
    $('rb-hardg').hidden = RT.tool === 'redeye';
    $('rb-src').hidden = $('rb-al').hidden = !cs;
    $('rb-src').classList.toggle('sel', RT.setSrc); $('rb-al').classList.toggle('sel', RT.aligned);
    $('rb-clear').disabled = !patchOf(t);
  }
  RT.syncBar = syncBar;
  RT.toggle = (on, tool) => {
    on = on == null ? !RT.on : !!on;
    if (tool) RT.tool = tool;
    if (on) {
      if (!S.photo) return;
      if (PE.crop.active) PE.crop.cancel();
      if (L.open) L.toggle(false);
      if (Sel.on) Sel.toggle(false);
      if (M && M.on) M.toggle(false);
    } else { hover = null; V.stage.style.cursor = ''; RT.setSrc = false; }
    RT.on = on; syncBar(); V.requestRender();
  };

  // ---------- .hps ----------
  const pngOf = (key) => new Promise((res) => R.canvas(key).toBlob((b) => res(b), 'image/png'));
  async function patchFromBlob(blob) {
    const bm = await createImageBitmap(blob, { premultiplyAlpha: 'none' }), c = canvas(bm.width, bm.height), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bm, 0, 0); if (bm.close) bm.close();
    const d = x.getImageData(0, 0, c.width, c.height).data, k = putPatch(c.width, c.height, d, null, null);
    c.width = c.height = 0; return k;
  }
  // Rewrites the project JSON (keys -> retouch/*.png) and returns the extra zip entries.
  RT.toHps = async (J) => {
    const out = [], put = async (name, key) => { out.push({ name, data: await pngOf(key), method: 'store' }); return name; };
    for (const l of J.layers || []) {
      if (l.retouch && R.has(l.retouch.key)) l.retouch = { src: await put('retouch/' + l.id + '.png', l.retouch.key) };
      else delete l.retouch;
    }
    if (J.background && J.background.retouch && R.has(J.background.retouch.key)) J.background.retouch = { src: await put('retouch/background.png', J.background.retouch.key) };
    else if (J.background) delete J.background.retouch;
    return out;
  };
  RT.fromHps = async (raw, e, read) => {
    const load = async (src) => { if (typeof src !== 'string' || !/^retouch\/[\w.-]+\.png$/.test(src)) return null; try { const b = await read(src); return b ? await patchFromBlob(b) : null; } catch (err) { console.warn('[photo-studio] retouch', err); return null; } };
    const byId = new Map((raw.layers || []).map((l) => [l && l.id, l]));
    for (const l of e.layers || []) { const r = byId.get(l.id); delete l.retouch; if (r && r.retouch && l.type === 'image') { const k = await load(r.retouch.src); if (k) l.retouch = { key: k }; } }
    if (e.bg) { delete e.bg.retouch; if (raw.background && raw.background.retouch) { const k = await load(raw.background.retouch.src); if (k) e.bg.retouch = { key: k }; } }
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
    L.toggle = (on) => { lt(on); if (L.open && RT.on) RT.toggle(false); };
    const st = Sel.toggle;
    Sel.toggle = (on, tool) => { st(on, tool); if (Sel.on && RT.on) RT.toggle(false); };
    if (M) { const mt = M.toggle; M.toggle = (on) => { mt(on); if (M.on && RT.on) RT.toggle(false); }; }
    PE.on((kind) => {
      if (kind === 'adjlive') return;
      if (kind === 'photo') { RT.src = null; RT.offset = null; if (!S.photo) RT.on = false; }
      if (kind === 'history' || kind === 'photo') freeComps();
      syncBar();
    });
    window.addEventListener('keydown', (e) => {
      if (!S.photo || modal() || PE.resize.open || PE.crop.active || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const k = (e.key || '').toLowerCase(), stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      const pick = (tool) => { if (RT.on && RT.tool === tool) RT.toggle(false); else RT.toggle(true, tool); stop(); };
      if (k === 'j') pick(e.shiftKey ? 'redeye' : 'heal');
      else if (k === 's' && !e.shiftKey) pick('clone');
      else if (k === 'u') pick(e.shiftKey ? 'smudge' : 'blur');
      else if (k === 'escape' && RT.on && !Sel.key()) { RT.toggle(false); stop(); }
      else if (RT.on && (k === '[' || k === ']')) { RT.size = Math.max(2, Math.min(400, Math.round(RT.size * (k === ']' ? 1.25 : 0.8)))); syncBar(); V.requestRender(); stop(); }
    }, true);
  }

  PE.studio.feature({ id: 'retouch', init: init });
  PE.studio.addTool({
    id: 'retouch', title: 'Retouch: Healing (J), Red-eye (Shift+J), Clone (S), Blur (U), Smudge (Shift+U)',
    svg: '<path d="M4 20l6-6"/><path d="M14.5 4.5l5 5-7 7-5-5z"/><path d="M16 3l5 5"/>',
    onTap() { RT.toggle(); }
  });
})(window.PE);
