/*
 * Photo Editor v2 — pe_io.js
 * Open (file picker, drag & drop, paste) and Save (full-size JPEG or PNG).
 * A photo is only downscaled when it is above the configured canvas limit.
 */
(function (PE) {
  'use strict';

  const IO = PE.io = { lastSave: null };
  const S = PE.state, T = PE.transform;
  let input, busy = false;

  const toast = (m, ms) => PE.ui.toast(m, ms);
  const nextFrame = () => new Promise((r) => setTimeout(r, 0));
  const stamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  };

  IO.init = () => {
    input = document.getElementById('file-in');
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (f) IO.load(f, f.name);
    });
    window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
    window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      document.body.classList.remove('dragging');
      const files = e.dataTransfer ? Array.from(e.dataTransfer.files || []) : [];
      const f = files.find((x) => x.type.startsWith('image/'));
      if (f) IO.load(f, f.name); else if (files.length) toast('That is not an image');
    });
    window.addEventListener('paste', (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); IO.load(f, 'pasted-' + stamp()); return; }
        }
      }
    });
  };

  IO.pick = () => { if (input && !busy) input.click(); };
  IO.isBusy = () => busy;

  async function decode(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (_) { /* fall back */ }
    }
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob), im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); res(im); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode failed')); };
      im.src = url;
    });
  }
  const dims = (img) => ({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });

  IO.limit = () => {
    const L = PE.config.limits;
    const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    return { px: touch ? L.maxPixelsTouch : L.maxPixelsDesktop, side: L.maxSide };
  };

  async function fitToLimit(img) {
    const d = dims(img), L = IO.limit();
    const k = Math.min(1, Math.sqrt(L.px / (d.w * d.h)), L.side / Math.max(d.w, d.h));
    if (k >= 1) return { img: img, w: d.w, h: d.h, scaled: false };
    const w = Math.max(1, Math.floor(d.w * k)), h = Math.max(1, Math.floor(d.h * k));
    let out = null;
    if (window.createImageBitmap) {
      try { out = await createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' }); } catch (_) { out = null; }
    }
    if (!out) {
      out = document.createElement('canvas'); out.width = w; out.height = h;
      const x = out.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, w, h);
    }
    if (img.close) img.close();
    return { img: out, w: w, h: h, scaled: true };
  }

  IO.load = async (blob, name) => {
    if (!blob || (blob.type && !blob.type.startsWith('image/'))) { toast('That is not an image'); return; }
    if (busy) return;
    busy = true; PE.ui.busy('Opening…');
    try {
      const img = await decode(blob);
      const o = dims(img);
      if (!o.w || !o.h) throw new Error('empty image');
      const r = await fitToLimit(img);
      if (PE.crop.active) PE.crop.cancel();
      const old = S.photo;
      S.setPhoto({ bitmap: r.img, w: r.w, h: r.h, origW: o.w, origH: o.h, scaled: r.scaled, name: name || 'photo', type: blob.type || '' });
      if (old && old.bitmap && old.bitmap.close && old.bitmap !== r.img) old.bitmap.close();
      PE.ui.busy(false);
      if (r.scaled) toast('Large photo: working at ' + r.w + '×' + r.h, 3200);
    } catch (err) {
      PE.ui.busy(false);
      toast('Could not open that image');
      console.warn('[photo-editor-v2] open failed', err);
    } finally { busy = false; }
  };

  IO.defaultFormat = () => {
    const f = PE.config.save.defaultFormat;
    if (f !== 'auto') return f;
    return S.photo && S.photo.type === 'image/png' ? 'png' : 'jpeg';
  };

  IO.fileName = (fmt) => {
    const raw = (S.photo && S.photo.name) || 'photo';
    const base = raw.replace(/\.[^.\/]+$/, '').replace(/[^\w.\- ]+/g, '_').trim() || 'photo';
    return base + PE.config.save.suffix + '.' + (fmt === 'png' ? 'png' : 'jpg');
  };

  // Render the edits on the full-size photo (strip by strip) and download it.
  IO.save = async (fmt) => {
    if (!S.photo || busy) return;
    fmt = fmt === 'png' ? 'png' : (fmt === 'jpeg' ? 'jpeg' : IO.defaultFormat());
    if (PE.crop.active) PE.crop.apply();
    busy = true; PE.ui.busy('Saving…');
    await nextFrame();
    const t0 = performance.now();
    let c = null;
    try {
      const P = S.photo, e = S.edits, O = T.outputSize(), cs = PE.config.save;
      c = document.createElement('canvas'); c.width = O.w; c.height = O.h;
      const x = c.getContext('2d', { willReadFrequently: true });
      if (fmt === 'jpeg') { x.fillStyle = cs.jpegBackground; x.fillRect(0, 0, O.w, O.h); }
      T.drawOriented(x, P.bitmap, e.crop.x, e.crop.y, e.crop.w, e.crop.h, e.m, O.w, O.h, 1);
      const eff = PE.adjust.effective(e);
      if (!PE.adjust.isIdentity(eff)) {
        const lut = PE.adjust.build(eff);
        let tYield = performance.now();
        for (let y = 0; y < O.h; y += cs.stripRows) {
          const hh = Math.min(cs.stripRows, O.h - y);
          const id = x.getImageData(0, y, O.w, hh);
          PE.adjust.process(id.data, lut);
          x.putImageData(id, 0, y);
          if (performance.now() - tYield > 50) { await nextFrame(); tYield = performance.now(); }
        }
      }
      const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise((res) => c.toBlob(res, mime, fmt === 'png' ? undefined : cs.jpegQuality));
      if (!blob) throw new Error('encode failed');
      const name = IO.fileName(fmt);
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      IO.lastSave = { name: name, w: O.w, h: O.h, bytes: blob.size, mime: mime, ms: Math.round(performance.now() - t0) };
      PE.ui.busy(false);
      toast('Saved ' + name + ' · ' + O.w + '×' + O.h, 2600);
    } catch (err) {
      PE.ui.busy(false);
      toast('Save failed (photo too large for this device?)', 3200);
      console.warn('[photo-editor-v2] save failed', err);
    } finally {
      if (c) { c.width = 0; c.height = 0; }
      busy = false;
    }
  };
})(window.PE);
