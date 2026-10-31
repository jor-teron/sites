/*
 * Hub Photo Studio (HPS2) — ps_project.js: the .hps project file (our own, openly documented in
 * photo-studio_readme.md) and the .ora (OpenRaster) export for GIMP / Krita. Both are plain ZIPs (ps_zip.js).
 *
 * .hps = ZIP:  project.json  { format:'hps', version:1, app, release, name, created, canvas{w,h,origW,origH},
 *                              output{w,h}, edits{m,crop,adj,preset,k}, background{name,visible,opacity,src,type,fileName},
 *                              images{ id:{path,name,type,w,h} }, layers[ bottom … top ] }
 *              images/      the original files, byte for byte (background + each image layer)
 *              masks/       HPS3: <layer id>.png, background.png, adjust.png — alpha = visibility (optional)
 *              layers/      PNGs for painted raster layers (none in HPS2; reserved, read if listed)
 *              preview.png  ≤ 256 px flattened preview
 * .ora = ZIP:  mimetype (first, stored) 'image/openraster', stack.xml, data/*.png (one full-size PNG per layer,
 *              crop / rotate / resize / Adjust applied), Thumbnails/thumbnail.png (≤ 256), mergedimage.png.
 * Open: the normal Open (Ctrl+O, picker, drop) also takes a .hps; plus "Open project" in the Save menu.
 */
(function (PE) {
  'use strict';
  const S = PE.state, V = PE.view, T = PE.transform, C = PE.config;
  const L = PE.layers, $ = (id) => document.getElementById(id);
  const VERSION = 1;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, z) => Math.max(a, Math.min(z, v));
  const nextFrame = () => new Promise((r) => setTimeout(r, 0));
  const P_ = PE.project = { VERSION, busy: false, last: null };
  const notify = (m) => (PE.ui.notify ? PE.ui.notify(m) : PE.ui.toast(m, 4000));

  // ---------- open wrapper: .hps through the normal Open; remember the original photo file ----------
  const engineLoad = PE.io.load;
  let pending = null;
  P_.isHps = (blob, name) => /\.hps$/i.test(name || blob.name || '');
  PE.io.load = (blob, name) => {
    if (blob && P_.isHps(blob, name)) return P_.open(blob, name);
    pending = blob ? { blob: blob, name: name || blob.name || 'photo', type: blob.type || '' } : null;
    return engineLoad(blob, name);
  };
  const closeImages = (m) => { for (const v of m.values()) if (v.bitmap && v.bitmap.close) v.bitmap.close(); };
  PE.on((kind) => {
    if (kind !== 'photo' || L.loadingProject) return;
    closeImages(L.images); L.images = new Map(); L.seq = 0; L.imgSeq = 0;
    L.bgFile = pending; pending = null;
    const ph = S.photo;
    if (ph && ph.scaled) {
      const mp = (ph.origW * ph.origH / 1e6).toFixed(1);
      setTimeout(() => notify('This photo is ' + mp + ' MP. Photo Studio works on photos up to about ' + Math.round(C.studio.layers.maxPixels / 1e6) +
        ' MP so layers stay smooth on this device, so it opened at ' + ph.w + ' × ' + ph.h + '.\nYour original file is not changed.'), 50);
    }
  });

  // ---------- helpers ----------
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type || 'image/png', q));
  const free = (c) => { if (c && c.width) { c.width = 0; c.height = 0; } };
  const baseName = () => ((S.photo && S.photo.name) || 'photo').replace(/\.[^.\/]+$/, '').replace(/[^\w.\- ]+/g, '_').trim() || 'photo';
  const extOf = (type, name) => {
    const m = /\.([a-z0-9]{2,5})$/i.exec(name || '');
    if (m) return m[1].toLowerCase();
    return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/avif': 'avif' })[type] || 'img';
  };
  const typeOf = (ext) => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif' })[ext] || '';
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

  // Adjust / Looks (+ Sharpen when asked) on a whole canvas, strip by strip, into a new canvas.
  async function adjustCanvas(c, sharpen) {
    const eff = PE.adjust.effective(S.edits);
    const lut = PE.adjust.isIdentity(eff) ? null : PE.adjust.build(eff);
    const amt = sharpen && eff.sh ? PE.adjust.sharpenAmount(eff.sh) : 0;
    if (!lut && !amt) return c;
    const W = c.width, H = c.height, rows = C.save.stripRows || 512;
    const x = c.getContext('2d', { willReadFrequently: true }), out = canvas(W, H), ox = out.getContext('2d');
    let t = performance.now();
    for (let y = 0; y < H; y += rows) {
      const hh = Math.min(rows, H - y), top = amt ? Math.max(0, y - 1) : y, bot = amt ? Math.min(H, y + hh + 1) : y + hh, n = bot - top;
      const id = x.getImageData(0, top, W, n);
      if (lut) PE.adjust.process(id.data, lut);
      if (amt) { const o = new ImageData(W, n); PE.adjust.sharpen(id.data, o.data, W, n, y - top, y - top + hh, amt); ox.putImageData(o, 0, top, 0, y - top, W, hh); }
      else ox.putImageData(id, 0, top);
      if (performance.now() - t > 50) { await nextFrame(); t = performance.now(); }
    }
    // HPS3: Adjust / Looks only inside the selection they were made with (same hook as the preview / save)
    if (PE.view.adjustMask) {
      const mk = canvas(W, H);
      if (PE.view.adjustMask(mk.getContext('2d'), W, H, 0)) {
        ox.save(); ox.globalCompositeOperation = 'destination-in'; ox.drawImage(mk, 0, 0);
        ox.globalCompositeOperation = 'destination-over'; ox.drawImage(c, 0, 0); ox.restore();
      }
      free(mk);
    }
    free(c);
    return out;
  }
  // Small flattened picture (preview.png, thumbnail.png): same geometry as the screen preview.
  async function renderSmall(maxSide) {
    const Ph = S.photo, e = S.edits, O = T.outputSize(), k = Math.min(1, maxSide / Math.max(O.w, O.h));
    const w = Math.max(1, Math.round(O.w * k)), h = Math.max(1, Math.round(O.h * k));
    const c = canvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    const sc = T.scaledCrop(e), kk = w / O.w;
    V.drawPhoto(x, Ph, e.crop, e.m, w, h, kk * sc.w / e.crop.w, kk * sc.h / e.crop.h);
    return adjustCanvas(c, false);
  }
  // One part ('bg' or a layer id) alone, full output size, raw (opacity / blend go to stack.xml).
  async function renderPart(only) {
    const Ph = S.photo, e = S.edits, O = T.outputSize(), B = T.baseSize();
    let c = canvas(B.w, B.h);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    L.drawAll(x, Ph, e.crop, e.m, B.w, B.h, 1, 1, { only: only });
    if (O.w !== B.w || O.h !== B.h) { await nextFrame(); const r = PE.resize.resample(c, O.w, O.h); if (r !== c) { free(c); c = r; } }
    c = await adjustCanvas(c, true);
    const blob = await toBlob(c);
    free(c);
    if (!blob) throw new Error('encode failed');
    return blob;
  }
  async function bitmapPng(bm) { const c = canvas(bm.width, bm.height); c.getContext('2d').drawImage(bm, 0, 0); const b = await toBlob(c); free(c); return b; }
  async function flatPng() {
    let got = null;
    await PE.io.save('png', (b) => { got = b; });
    if (!got) throw new Error('flatten failed');
    return got;
  }
  async function run(msg, fn) {
    if (!S.photo || P_.busy || PE.io.isBusy()) return null;
    if (PE.crop.active) PE.crop.apply();
    P_.busy = true; PE.ui.busy(msg);
    await nextFrame();
    try { return await fn(); }
    catch (err) { PE.ui.busy(false); console.warn('[photo-studio]', err); notify('That did not work: ' + (err && err.friendly ? err.message : 'the photo may be too large for this device.')); return null; }
    finally { P_.busy = false; }
  }

  // ---------- project.json ----------
  P_.json = (bgPath, bgType, bgName, imgs) => {
    const e = clone(S.edits), Ph = S.photo, O = T.outputSize();
    const layers = e.layers || [], bg = L.bg();
    delete e.layers; delete e.bg;
    return {
      format: 'hps', version: VERSION, app: C.app, release: C.release, name: baseName(), created: new Date().toISOString(),
      canvas: { w: Ph.w, h: Ph.h, origW: Ph.origW, origH: Ph.origH }, output: { w: O.w, h: O.h },
      edits: e,
      background: { name: bg.name, visible: bg.visible, opacity: bg.opacity, src: bgPath, type: bgType, fileName: bgName },
      images: imgs, layers: layers
    };
  };

  P_.save = () => run('Saving project…', async () => {
    const t0 = performance.now(), Ph = S.photo;
    let bgf = L.bgFile && L.bgFile.blob ? L.bgFile : null;
    if (!bgf) bgf = { blob: await bitmapPng(Ph.bitmap), name: baseName() + '.png', type: 'image/png' };
    const bgExt = extOf(bgf.blob.type || bgf.type, bgf.name), bgPath = 'images/background.' + bgExt;
    const entries = [], imgs = {};
    const used = [...new Set(L.list().filter((l) => l.type === 'image').map((l) => l.src))];
    const files = [];
    for (const src of used) {
      const im = L.images.get(src); if (!im) continue;
      const blob = im.blob || await bitmapPng(im.bitmap), ext = im.blob ? extOf(im.type, im.name) : 'png';
      const path = 'images/' + src + '.' + ext;
      imgs[src] = { path: path, name: im.name, type: blob.type || im.type, w: im.w, h: im.h };
      files.push({ name: path, data: blob, method: 'store' });
    }
    const J = P_.json(bgPath, bgf.blob.type || bgf.type || typeOf(bgExt), bgf.name, imgs);
    const masks = PE.masks ? await PE.masks.toHps(J) : [];    // HPS3: layer masks -> masks/*.png (rewrites J)
    const prev = await renderSmall(256), prevBlob = await toBlob(prev); free(prev);
    entries.push({ name: 'project.json', data: JSON.stringify(J, null, 1), method: 'deflate' });
    entries.push(...masks);
    entries.push({ name: bgPath, data: bgf.blob, method: 'store' });
    entries.push(...files);
    entries.push({ name: 'preview.png', data: prevBlob, method: 'store' });
    const zip = await PSZip.write(entries), name = baseName() + '.hps';
    PE.ui.busy(false);
    P_.last = { kind: 'hps', name: name, bytes: zip.size, ms: Math.round(performance.now() - t0), blob: zip };
    download(zip, name);
    PE.ui.toast('Saved project ' + name, 2600);
    return zip;
  });

  // ---------- sanitize what we read ----------
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
  const str = (v, d, n) => (typeof v === 'string' ? v.slice(0, n || 60) : d);
  function cleanLayer(l, f, imgs) {
    if (!l || typeof l !== 'object') return null;
    const type = ['image', 'text', 'shape'].includes(l.type) ? l.type : null;
    if (!type) return null;
    const o = { id: str(l.id, '', 20) || L.newId(), type: type, name: str(l.name, type), visible: l.visible !== false,
      opacity: clamp(num(l.opacity, 1), 0, 1), blend: L.BLENDS.some((b) => b[0] === l.blend) ? l.blend : 'source-over',
      x: num(l.x, 0) * f, y: num(l.y, 0) * f, w: Math.max(0, num(l.w, 1)), h: Math.max(0, num(l.h, 1)),
      scale: Math.max(1e-4, num(l.scale, 1) * f), rot: num(l.rot, 0) };
    if (type === 'image') { if (!imgs.has(l.src)) return null; o.src = l.src; }
    if (type === 'text') {
      Object.assign(o, { text: str(l.text, 'Text', 2000), font: L.FONTS.some((q) => q[0] === l.font) ? l.font : L.FONTS[0][0],
        size: clamp(num(l.size, 48), 4, 2000), color: col(l.color, '#ffffff'), bold: !!l.bold, align: ['left', 'center', 'right'].includes(l.align) ? l.align : 'center' });
      const m = L.measure(o); o.w = m.w; o.h = m.h;
    }
    if (type === 'shape') {
      Object.assign(o, { shape: ['rect', 'ellipse', 'line'].includes(l.shape) ? l.shape : 'rect', fill: col(l.fill, '#3b6fd8'), fillOn: !!l.fillOn,
        stroke: col(l.stroke, '#ffffff'), strokeOn: l.strokeOn !== false, sw: clamp(num(l.sw, 2), 0, 2000) });
    }
    const r = {};    // keep the saved key order, so a reopened project is the same JSON
    for (const k of Object.keys(l)) if (k in o) r[k] = o[k];
    for (const k of Object.keys(o)) if (!(k in r)) r[k] = o[k];
    return r;
  }
  const fail = (m) => { const e = new Error(m); e.friendly = true; return e; };

  P_.open = async (file, name) => {
    if (P_.busy || PE.io.isBusy()) return null;
    P_.busy = true; PE.ui.busy('Opening project…');
    const before = S.photo;
    try {
      let zip;
      try { zip = await PSZip.read(file); } catch (_) { throw fail('This file is not a Photo Studio project (.hps), or it is damaged.'); }
      const pj = zip.get('project.json');
      if (!pj) throw fail('This file has no project.json, so it is not a Photo Studio project.');
      let J;
      try { J = JSON.parse(await pj.text()); } catch (_) { throw fail('The project.json inside this file is damaged.'); }
      if (!J || J.format !== 'hps') throw fail('This is not a Photo Studio project (format is not "hps").');
      if (!(J.version >= 1)) throw fail('This project file has no version number.');
      if (J.version > VERSION) throw fail('This project was saved by a newer Photo Studio (version ' + J.version + '). Please update the Hub.');
      const B = J.background || {}, be = zip.get(B.src);
      if (!be) throw fail('The background photo is missing from this project.');
      const bgBlob = await be.blob(B.type || typeOf(extOf('', B.src)));
      PE.ui.busy(false);
      P_.busy = false;
      L.loadingProject = true;
      pending = null;
      await engineLoad(bgBlob, (J.name || baseName()) + '.' + extOf(bgBlob.type, B.src));
      if (!S.photo || S.photo === before) throw fail('The background photo in this project could not be opened.');
      P_.busy = true; PE.ui.busy('Opening project…');
      const Ph = S.photo, f = J.canvas && J.canvas.w ? Ph.w / J.canvas.w : 1;
      const imgs = new Map();
      for (const [src, d] of Object.entries(J.images || {})) {
        const ent = zip.get(d.path); if (!ent) continue;
        const blob = await ent.blob(d.type || typeOf(extOf('', d.path)));
        try {
          const r = await L.decodeLayerImage(blob, Math.max(1, Math.round(num(d.w, 0))) || null, Math.max(1, Math.round(num(d.h, 0))) || null);
          imgs.set(src, { bitmap: r.bitmap, blob: blob, name: str(d.name, src), type: blob.type, w: r.w, h: r.h });
        } catch (_) { /* skip a broken image */ }
      }
      let layers = (Array.isArray(J.layers) ? J.layers : []).map((l) => cleanLayer(l, f, imgs)).filter(Boolean);
      const max = C.studio.layers.maxLayers - 1;
      let cut = 0;
      if (layers.length > max) { cut = layers.length - max; layers = layers.slice(0, max); }
      const ed = J.edits || {}, de = S.defaultEdits(Ph.w, Ph.h);
      const e = Object.assign(de, {
        m: Array.isArray(ed.m) && ed.m.length === 4 && ed.m.every((v) => [-1, 0, 1].includes(v)) ? ed.m : de.m,
        adj: Object.assign(de.adj, ed.adj || {}), preset: str(ed.preset, 'none', 20),
        k: Array.isArray(ed.k) && ed.k.length === 2 && ed.k.every((v) => num(v, 0) > 0) ? ed.k : de.k
      });
      if (ed.crop) {
        const x = clamp(Math.round(num(ed.crop.x, 0) * f), 0, Ph.w - 1), y = clamp(Math.round(num(ed.crop.y, 0) * f), 0, Ph.h - 1);
        e.crop = { x: x, y: y, w: clamp(Math.round(num(ed.crop.w, Ph.w) * f), 1, Ph.w - x), h: clamp(Math.round(num(ed.crop.h, Ph.h) * f), 1, Ph.h - y) };
      }
      e.layers = layers;
      e.bg = { name: str(B.name, 'Background'), visible: B.visible !== false, opacity: clamp(num(B.opacity, 1), 0, 1) };
      // HPS3: masks (masks/*.png) for layers, the background and the Adjust area; older files have none
      if (PE.masks) await PE.masks.fromHps(J, e, async (name) => { const m = zip.get(name); return m ? m.blob('image/png') : null; });
      closeImages(L.images);
      L.images = imgs; L.bgFile = { blob: bgBlob, name: str(B.fileName, 'background', 200), type: bgBlob.type };
      S.edits = e; S.history = [clone(e)]; S.index = 0;
      L.sel = null; L.seq = 0; L.imgSeq = 0; L.syncSeq();
      PE.emit('history');
      PE.ui.busy(false);
      PE.ui.toast('Opened project ' + (J.name || '') + ' · ' + layers.length + ' layer' + (layers.length === 1 ? '' : 's'), 2600);
      if (cut) notify('This project has more layers than Photo Studio allows (' + C.studio.layers.maxLayers + '), so the top ' + cut + ' were left out.');
      if (f !== 1) PE.ui.toast('Project photo reduced to ' + Ph.w + ' × ' + Ph.h + ' for this device', 3200);
      return J;
    } catch (err) {
      PE.ui.busy(false);
      console.warn('[photo-studio] open project', err);
      notify(err && err.friendly ? err.message : 'Could not open this project.');
      return null;
    } finally { L.loadingProject = false; P_.busy = false; }
  };

  // ---------- .ora export ----------
  P_.exportOra = () => run('Exporting .ora…', async () => {
    const t0 = performance.now(), O = T.outputSize(), ls = L.list(), bg = L.bg();
    const parts = [];
    const stack = [];
    for (let i = ls.length - 1; i >= 0; i--) {          // stack.xml lists the top layer first
      const l = ls[i], src = 'data/layer' + (i + 1) + '.png';
      PE.ui.busy('Exporting .ora… layer ' + (ls.length - i) + ' / ' + (ls.length + 1));
      parts.push({ name: src, data: await renderPart(l.id), method: 'store' });
      stack.push('  <layer name="' + xmlEsc(l.name) + '" src="' + src + '" x="0" y="0" opacity="' + clamp(l.opacity, 0, 1).toFixed(3) +
        '" visibility="' + (l.visible ? 'visible' : 'hidden') + '" composite-op="' + L.oraOp(l.blend) + '"/>');
    }
    parts.push({ name: 'data/background.png', data: await renderPart('bg'), method: 'store' });
    stack.push('  <layer name="' + xmlEsc(bg.name) + '" src="data/background.png" x="0" y="0" opacity="' + clamp(bg.opacity, 0, 1).toFixed(3) +
      '" visibility="' + (bg.visible ? 'visible' : 'hidden') + '" composite-op="svg:src-over"/>');
    PE.ui.busy('Exporting .ora… merged image');
    const merged = await flatPng();
    P_.busy = true; PE.ui.busy('Exporting .ora…');
    const th = await renderSmall(256), thumb = await toBlob(th); free(th);
    const xml = "<?xml version='1.0' encoding='UTF-8'?>\n<image version=\"0.0.3\" w=\"" + O.w + '" h="' + O.h + '" xres="72" yres="72">\n <stack>\n' +
      stack.join('\n') + '\n </stack>\n</image>\n';
    const zip = await PSZip.write([
      { name: 'mimetype', data: 'image/openraster', method: 'store' },
      { name: 'stack.xml', data: xml, method: 'deflate' },
      ...parts,
      { name: 'Thumbnails/thumbnail.png', data: thumb, method: 'store' },
      { name: 'mergedimage.png', data: merged, method: 'store' }
    ]);
    const name = baseName() + '.ora';
    PE.ui.busy(false);
    P_.last = { kind: 'ora', name: name, bytes: zip.size, ms: Math.round(performance.now() - t0), blob: zip };
    download(zip, name);
    PE.ui.toast('Exported ' + name + ' · ' + (ls.length + 1) + ' layers', 2600);
    return zip;
  });

  // ---------- init: menu buttons, project input, .hps drop ----------
  function init() {
    const on = PE.ui.onTap, pop = () => { $('pop-save').hidden = true; PE.ui.sync(); };
    on($('ps-save-hps'), () => { pop(); P_.save(); });
    on($('ps-open-hps'), () => { pop(); $('ps-hps-in').click(); });
    on($('ps-export-ora'), () => { pop(); P_.exportOra(); });
    const ob = $('ps-open-hps-empty'); if (ob) on(ob, () => $('ps-hps-in').click());
    $('ps-hps-in').addEventListener('change', () => { const f = $('ps-hps-in').files && $('ps-hps-in').files[0]; $('ps-hps-in').value = ''; if (f) P_.open(f, f.name); });
    window.addEventListener('drop', (e) => {
      const f = e.dataTransfer && Array.from(e.dataTransfer.files || []).find((x) => P_.isHps(x, x.name));
      if (!f) return;
      e.preventDefault(); e.stopImmediatePropagation(); document.body.classList.remove('dragging');
      P_.open(f, f.name);
    }, true);
    // "Open project" works without a photo; the other two need one
    const syncMenu = () => { $('ps-save-hps').disabled = $('ps-export-ora').disabled = !S.photo; };
    PE.on((k) => { if (k !== 'adjlive') syncMenu(); });
    syncMenu();
  }
  PE.studio.feature({ id: 'project', init: init });
})(window.PE);
