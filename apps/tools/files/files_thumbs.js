/*
 * Files thumbnails (apps/tools/files/files_thumbs.js) — small previews instead of the 🖼 / 🎬
 * icons, in the grid (about 160 px) and the list (shown small).
 *   Pictures: decoded with createImageBitmap (imageOrientation 'from-image' = EXIF turned
 *     upright), else an <img>; drawn smaller on a canvas, saved as WebP. Over 60 MB: icon.
 *   Videos: a hidden muted <video> seeks to 1 s (10 % for clips under 10 s), the frame is drawn,
 *     plus a ▶ badge and the length. Unplayable or no frame within 8 s: the icon stays.
 *   Google Drive: Drive's own preview (thumbnailLink from the listing, shared/google/gdrive_fs.js),
 *     no download; no link or it fails = icon. Added folders work like Local.
 * Lazy: only items scrolled near view (IntersectionObserver), 2 at a time (1 video). Leaving the
 * folder cancels the queue (and a video being read) and releases every object URL.
 * Cache: shared/fs/thumbs_store.js (IndexedDB — no folder, so it never shows in a listing),
 * keyed by drive|path|name|size|modified (a changed file makes a new one); "no preview" is
 * remembered too, so a broken file isn't tried on every visit.
 * Setting 'sites-hub.filesThumbs' ('0' = off, default on): Files' ⋯ menu or Settings → Windows;
 * changes apply at once.
 * API FX.thumbs: reset() (before a render), attach(iconSpan, entry), on(), set(on), clearCache(),
 *   stats { made, cached, failed, drive }
 */
(function () {
  'use strict';
  const { st, cur, el } = FX;
  const T = window.FileTypes, S = window.ThumbStore;
  const KEY = 'sites-hub.filesThumbs', BOX = 160, MAX_IMG = 60 * 1024 * 1024, VID_WAIT = 8000;
  const list = FX.$('list');
  const stats = { made: 0, cached: 0, failed: 0, drive: 0 };
  let gen = 0, dirSeen = null, io = null, cancelVid = null;
  const urls = new Map();          // key → { url, dur } for this folder
  const queue = [], busy = new Set();
  let runImg = 0, runVid = 0;

  const on = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (_) { return true; } };
  function set(v) { try { if (v) localStorage.removeItem(KEY); else localStorage.setItem(KEY, '0'); } catch (_) { /* blocked */ } FX.view.render(); }
  const pathNow = () => st.stack.slice(1).map((s) => s.name).join('/');
  const keyOf = (e) => [st.driveId, pathNow(), e.name, e.size, e.modified].join('|');
  const clock = (t) => { t = Math.round(t); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };

  function drop() {   // forget this folder's thumbnails (cancel, release)
    gen++; queue.length = 0; busy.clear();
    if (cancelVid) cancelVid();
    urls.forEach((u) => URL.revokeObjectURL(u.url)); urls.clear();
  }
  /** Before every render: a new folder cancels the old one's work. */
  function reset() {
    if (cur() !== dirSeen) { dirSeen = cur(); drop(); }
    if (io) io.disconnect();
    io = 'IntersectionObserver' in window ? new IntersectionObserver(seen, { root: list, rootMargin: '300px 0px' }) : null;
  }
  function attach(ico, e) {
    if (!on() || e.kind !== 'file') return;
    const k = T.kind(e.name, e.type);
    if (k !== 'image' && k !== 'video') return;
    const m = e.handle && e.handle.meta;
    if (st.driveId === 'gdrive' || (m && 'thumb' in m)) { if (m && m.thumb) driveThumb(ico, m, k); return; }
    if (k === 'image' && e.size > MAX_IMG) return;
    const key = keyOf(e);
    ico.dataset.tkey = key;
    if (urls.has(key)) { paint(ico, urls.get(key), k); return; }
    ico._job = { key, kind: k, e };
    if (io) io.observe(ico); else enqueue(ico._job);
  }
  function seen(list) {
    list.forEach((x) => { if (!x.isIntersecting) return; io.unobserve(x.target); if (x.target._job) enqueue(x.target._job); });
  }
  function enqueue(job) {
    if (busy.has(job.key) || queue.some((j) => j.key === job.key)) return;
    queue.push(job); pump();
  }
  function pump() {
    while (queue.length && runImg + runVid < 2) {
      const i = queue.findIndex((j) => j.kind !== 'video' || runVid < 1);
      if (i < 0) return;
      const job = queue.splice(i, 1)[0];
      busy.add(job.key);
      if (job.kind === 'video') runVid++; else runImg++;
      run(job, gen).finally(() => { if (job.kind === 'video') runVid--; else runImg--; busy.delete(job.key); pump(); });
    }
  }
  async function run(job, g) {
    let rec = await S.get(job.key);
    if (g !== gen) return;
    if (rec) stats.cached++;
    else {
      let r;
      try { r = job.kind === 'video' ? await videoThumb(await job.e.handle.getFile()) : await imageThumb(await job.e.handle.getFile()); }
      catch (_) { r = { fail: true }; }
      if (r.cancel || g !== gen) return;
      rec = { key: job.key, blob: r.blob || null, dur: r.dur || 0 };
      if (rec.blob) stats.made++; else stats.failed++;
      S.put(rec);
    }
    if (!rec.blob || g !== gen) return;
    const u = { url: URL.createObjectURL(rec.blob), dur: rec.dur };
    urls.set(job.key, u);
    list.querySelectorAll('.item-ico[data-tkey]').forEach((ico) => { if (ico.dataset.tkey === job.key) paint(ico, u, job.kind); });
  }

  function paint(ico, u, kind) {
    const img = el('img', 'thumb'); img.alt = ''; img.draggable = false; img.decoding = 'async';
    img.src = u.url;
    const parts = [img];
    if (kind === 'video') { parts.push(el('span', 'thumb-play', '\u25B6')); if (u.dur) parts.push(el('span', 'thumb-dur', clock(u.dur))); }
    ico.classList.add('has-thumb');
    ico.replaceChildren(...parts);
  }
  function driveThumb(ico, m, kind) {
    stats.drive++;
    const old = Array.from(ico.childNodes);
    const img = el('img', 'thumb'); img.alt = ''; img.draggable = false; img.referrerPolicy = 'no-referrer';
    img.onerror = () => { ico.classList.remove('has-thumb'); ico.replaceChildren(...old); };
    img.src = String(m.thumb).replace(/=s\d+$/, '=s' + 2 * BOX);
    const parts = [img];
    if (kind === 'video') { parts.push(el('span', 'thumb-play', '\u25B6')); if (m.dur) parts.push(el('span', 'thumb-dur', clock(m.dur))); }
    ico.classList.add('has-thumb');
    ico.replaceChildren(...parts);
  }

  /* ---------- making them ---------- */
  function toBlob(src, w, h) {
    const s = Math.min(1, BOX / Math.max(w, h)), cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, cw, ch);
    return new Promise((res) => c.toBlob((b) => res(b), 'image/webp', 0.8));
  }
  async function imageThumb(f) {
    if (f.size > MAX_IMG) return { fail: true };
    if (window.createImageBitmap && !/svg/.test(f.type) && !/\.svg$/i.test(f.name)) {
      try {
        const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
        try { return { blob: await toBlob(bmp, bmp.width, bmp.height) }; } finally { bmp.close(); }
      } catch (_) { /* try an <img> */ }
    }
    const url = URL.createObjectURL(f);
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url;
      await img.decode();
      if (!img.naturalWidth) return { fail: true };
      return { blob: await toBlob(img, img.naturalWidth, img.naturalHeight) };
    } catch (_) { return { fail: true }; } finally { URL.revokeObjectURL(url); }
  }
  function videoThumb(f) {
    return new Promise((res) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'metadata';
      const url = URL.createObjectURL(f);
      let done = false, dur = 0;
      const fin = (r) => {
        if (done) return; done = true; clearTimeout(to); cancelVid = null;
        v.onerror = v.onloadedmetadata = v.onseeked = null;
        v.removeAttribute('src'); try { v.load(); } catch (_) { /* gone */ }
        URL.revokeObjectURL(url); res(r);
      };
      const to = setTimeout(() => fin({ fail: true }), VID_WAIT);
      cancelVid = () => fin({ cancel: true });
      v.onerror = () => fin({ fail: true });
      v.onloadedmetadata = () => {
        dur = v.duration;
        if (!v.videoWidth || !isFinite(dur) || dur <= 0) { fin({ fail: true }); return; }
        v.currentTime = dur >= 10 ? 1 : dur * 0.1;
      };
      v.onseeked = async () => {
        try { fin({ blob: await toBlob(v, v.videoWidth, v.videoHeight), dur }); } catch (_) { fin({ fail: true }); }
      };
      v.src = url;
    });
  }

  async function clearCache() {
    await S.clear();   // → onClear below
    FX.say('Thumbnail cache cleared');
  }
  S.onClear(() => { dirSeen = null; drop(); FX.view.render(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) FX.view.render(); });
  window.addEventListener('pagehide', drop);
  window.addEventListener('pageshow', (e) => { if (e.persisted) { dirSeen = null; FX.view.render(); } });

  FX.thumbs = { reset, attach, on, set, clearCache, stats };
})();
