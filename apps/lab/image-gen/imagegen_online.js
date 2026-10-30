/* Image Gen IG4: free online generator (Pollinations Classic API, no key, checked 30 Oct 2026).
   GET https://image.pollinations.ai/prompt/{prompt}?width&height&seed  -> JPEG (CORS *).
   Limits: one image at a time per IP, at least 45 s apart; at most 768×768 pixels in area; one model; small logo always.
   Over the limit: HTTP 402 + Retry-After. Errors carry .kind: 'unreachable' | 'limit' (.retry s) | 'refused' | 'noimage' | 'http'. */
window.IGOnline = (function () {
  const EP = 'https://image.pollinations.ai/prompt/', GAP = 45000;
  const SIZES = { square: [768, 768], portrait: [576, 768], landscape: [768, 576] };
  let lastAt = 0;
  const err = (kind, msg, extra) => Object.assign(new Error(msg), { kind }, extra || {});
  const waitLeft = () => Math.max(0, Math.ceil((lastAt + GAP - Date.now()) / 1000));
  /* fit any w×h into 768×768 area, multiples of 16 */
  function fit(w, h) { const k = Math.min(1, Math.sqrt((768 * 768) / (w * h))); return [Math.max(64, Math.floor(w * k / 16) * 16), Math.max(64, Math.floor(h * k / 16) * 16)]; }
  async function toPng(blob) {
    const bmp = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0); bmp.close && bmp.close();
    return { blob: await new Promise((r) => c.toBlob(r, 'image/png')), w: c.width, h: c.height };
  }
  /* o: {prompt, width, height, seed, signal} -> {blob (PNG), w, h, seed} */
  async function generate(o) {
    const seed = o.seed != null && o.seed !== '' ? Math.abs(parseInt(o.seed, 10)) || 0 : Math.floor(Math.random() * 1e9);
    const [w, h] = fit(o.width, o.height);
    const url = EP + encodeURIComponent(o.prompt) + '?width=' + w + '&height=' + h + '&seed=' + seed;
    let r; lastAt = Date.now();
    try { r = await fetch(url, { signal: o.signal }); } catch (e) { if (e && e.name === 'AbortError') throw e; throw err('unreachable', 'Could not reach image.pollinations.ai'); }
    if (r.status === 402 || r.status === 429) { const ra = parseInt(r.headers.get('Retry-After') || '', 10); throw err('limit', 'Free limit reached', { retry: isFinite(ra) ? ra : 45 }); }
    if (r.status === 400 || r.status === 403) { let t = ''; try { t = (await r.text()).slice(0, 200); } catch (_) { /* */ } throw err('refused', t || 'The prompt was refused'); }
    if (!r.ok) throw err('http', 'Pollinations answered HTTP ' + r.status);
    const b = await r.blob();
    if (!/^image\//.test(b.type || '')) throw err('noimage', 'Pollinations did not send an image back');
    const p = await toPng(b);
    return { blob: p.blob, w: p.w, h: p.h, seed };
  }
  return { SIZES, GAP, generate, waitLeft, fit, name: 'Pollinations (free online)' };
})();
