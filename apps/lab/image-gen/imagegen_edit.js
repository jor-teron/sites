/* Image Gen IG3 image tools (all in the browser, nothing uploaded):
   IGEdit.loadPhoto(blob)  -> {blob (JPEG ≤1024 px), b64, w, h, gw, gh}  start photo for image-to-image
   IGEdit.upscale2x(blob, sharpen) -> PNG blob at 2× (canvas high-quality smoothing + optional mild unsharp)
   IGEdit.similarity(a, b) -> -1..1 (grey 32×32 correlation; used to spot Ollama ignoring the start photo)
   IGEdit.size(blob) -> {w, h} */
window.IGEdit = (function () {
  const MAX_SRC = 1024, MAX_UP = 4096;
  async function bitmap(blob) {
    if (window.createImageBitmap) { try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (_) { /* fall back */ } }
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(blob), im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); res(im); };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Could not read that picture.')); };
      im.src = u;
    });
  }
  const dims = (bm) => ({ w: bm.width || bm.naturalWidth, h: bm.height || bm.naturalHeight });
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the picture.'))), type, q));
  function b64(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  }
  async function size(blob) { const bm = await bitmap(blob), d = dims(bm); bm.close && bm.close(); return d; }
  /* shrink to ≤1024 px, JPEG q0.92 on white; gw/gh = generation size (long side 1024, multiples of 16) */
  async function loadPhoto(blob) {
    const bm = await bitmap(blob), d = dims(bm);
    if (!d.w || !d.h) throw new Error('That picture is empty.');
    const k = Math.min(1, MAX_SRC / Math.max(d.w, d.h)), w = Math.max(1, Math.round(d.w * k)), h = Math.max(1, Math.round(d.h * k));
    const c = canvas(w, h), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(bm, 0, 0, w, h);
    bm.close && bm.close();
    const out = await toBlob(c, 'image/jpeg', 0.92), g = 1024 / Math.max(d.w, d.h), r16 = (v) => Math.max(256, Math.min(1024, Math.round(v * g / 16) * 16));
    return { blob: out, b64: await b64(out), w, h, gw: r16(d.w), gh: r16(d.h) };
  }
  /* mild unsharp mask: out = px + a*(4px - neighbours) */
  function sharpen(ctx, w, h, a) {
    const id = ctx.getImageData(0, 0, w, h), s = id.data, o = new Uint8ClampedArray(s), row = w * 4;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * row + x * 4;
        for (let c = 0; c < 3; c++) {
          const p = s[i + c];
          o[i + c] = p + a * (4 * p - s[i + c - 4] - s[i + c + 4] - s[i + c - row] - s[i + c + row]);
        }
      }
    }
    id.data.set(o); ctx.putImageData(id, 0, 0);
  }
  async function upscale2x(blob, doSharpen) {
    const bm = await bitmap(blob), d = dims(bm), w = d.w * 2, h = d.h * 2;
    if (w > MAX_UP || h > MAX_UP) { bm.close && bm.close(); const e = new Error('Too big to upscale again (max ' + MAX_UP + ' px a side).'); e.kind = 'toobig'; throw e; }
    const c = canvas(w, h), x = c.getContext('2d', { willReadFrequently: !!doSharpen });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(bm, 0, 0, w, h);
    bm.close && bm.close();
    if (doSharpen) sharpen(x, w, h, 0.18);
    return { blob: await toBlob(c, 'image/png'), w, h };
  }
  async function grey(blob) {
    const bm = await bitmap(blob), c = canvas(32, 32), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bm, 0, 0, 32, 32); bm.close && bm.close();
    const d = x.getImageData(0, 0, 32, 32).data, g = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return g;
  }
  async function similarity(a, b) {
    const [x, y] = await Promise.all([grey(a), grey(b)]);
    let mx = 0, my = 0; for (let i = 0; i < 1024; i++) { mx += x[i]; my += y[i]; } mx /= 1024; my /= 1024;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < 1024; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  }
  return { loadPhoto, upscale2x, similarity, size, MAX_UP };
})();
