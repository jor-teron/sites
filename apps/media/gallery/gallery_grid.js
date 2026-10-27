/* Gallery grid: items [{ file, name, size, date, video, dur }] → lazy thumbnails (IntersectionObserver + createImageBitmap/canvas;
   videos: hidden <video> frame at ~1 s), sort, month groups, kind filter (all/photo/video). GA2 adds videos + subtitle map. */
window.GAGrid = (function () {
  const IMG = /\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i, TH = 256;
  const VID = /\.(mp4|m4v|webm|mov|mkv|ogv|3gp|avi)$/i, SUB = /\.(srt|vtt)$/i;
  const isImg = (f) => /^image\//.test(f.type) || IMG.test(f.name);
  const isVid = (f) => /^video\//.test(f.type) || VID.test(f.name);
  const base = (n) => n.replace(/\.[^.]+$/, '').toLowerCase();
  let subs = new Map(), view = [];
  const fmtDur = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  /* one frame from ~1 s in; resolves false on failure */
  function vthumb(cv, it) {
    return new Promise((res) => {
      const v = document.createElement('video'), u = URL.createObjectURL(it.file); let done = false;
      const fin = (ok) => { if (done) return; done = true; clearTimeout(t); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(u); res(ok); };
      const t = setTimeout(() => fin(false), 8000);
      v.muted = true; v.preload = 'metadata'; v.playsInline = true;
      v.onloadedmetadata = () => { it.dur = v.duration; it.w = v.videoWidth; it.h = v.videoHeight; v.currentTime = Math.min(1, (v.duration || 2) / 2); };
      v.onseeked = () => {
        try { const w = v.videoWidth, h = v.videoHeight, s = Math.min(1, TH / Math.max(w, h)); cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s)); cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); fin(true); } catch (_) { fin(false); }
      };
      v.onerror = () => fin(false); v.src = u;
    });
  }
  let items = [], io = null, onOpen = null;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  async function thumb(cv, it) {
    const file = it.file, cell = cv.parentNode;
    if (it.video) {
      const ok = await vthumb(cv, it);
      cell.classList.add(ok ? 'ok' : 'vbad');
      if (it.dur) { const b = cell.querySelector('.dur'); if (b) b.textContent = fmtDur(it.dur); }
      return;
    }
    const ctx = cv.getContext('2d');
    let src = null;
    try { src = await createImageBitmap(file, { resizeWidth: TH, resizeQuality: 'medium' }); } catch (_) { src = null; }
    if (!src) src = await new Promise((res) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(u), 0); }; im.onerror = () => { URL.revokeObjectURL(u); res(null); }; im.src = u; });
    if (!src) { cv.parentNode.classList.add('bad'); return; }
    const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight, s = Math.min(1, TH / Math.max(w, h));
    cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
    ctx.drawImage(src, 0, 0, cv.width, cv.height); src.close && src.close();
    cv.parentNode.classList.add('ok');
  }
  function sortItems(sort) {
    const by = { 'date-desc': (a, b) => b.date - a.date || a.name.localeCompare(b.name), 'date-asc': (a, b) => a.date - b.date || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) }[sort] || ((a, b) => b.date - a.date);
    items.sort(by);
  }
  function render(root, o) {
    if (io) io.disconnect();
    io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); const it = view[+e.target.dataset.i]; thumb(e.target.querySelector('canvas'), it); } }), { root: null, rootMargin: '300px' });
    sortItems(o.sort); root.textContent = '';
    view = items.filter((it) => o.kind === 'photo' ? !it.video : o.kind === 'video' ? it.video : true);
    const group = o.group && o.sort !== 'name'; let key = null, grid = null;
    view.forEach((it, i) => {
      const d = new Date(it.date), k = d.getFullYear() + '-' + d.getMonth();
      if (!grid || (group && k !== key)) {
        if (group) { const h = document.createElement('h3'); h.className = 'mon'; h.textContent = MONTHS[d.getMonth()] + ' ' + d.getFullYear(); root.appendChild(h); }
        grid = document.createElement('div'); grid.className = 'grid'; root.appendChild(grid); key = k;
      }
      const c = document.createElement('button'); c.className = 'cell'; c.dataset.i = i; c.title = it.name;
      c.appendChild(document.createElement('canvas'));
      if (it.video) { c.classList.add('vid'); const p = document.createElement('span'); p.className = 'play'; p.textContent = '▶'; const d = document.createElement('span'); d.className = 'dur'; d.textContent = it.dur ? fmtDur(it.dur) : 'video'; c.append(p, d); }
      grid.appendChild(c); io.observe(c);
    });
  }
  return {
    isImg, isVid, fmtDur, MEDIA: /\.(jpe?g|png|webp|gif|bmp|avif|svg|mp4|m4v|webm|mov|mkv|ogv|3gp|avi|srt|vtt)$/i,
    set(list) {
      subs = new Map(); list.forEach((f) => { if (SUB.test(f.name)) subs.set(base(f.name), f.file); });
      items = list.filter((f) => isImg(f.file) || isVid(f.file)).map((f) => Object.assign(f, { video: !isImg(f.file) && isVid(f.file) }));
      return items.length;
    },
    subFor(it) { return subs.get(base(it.name)) || null; },
    get items() { return items; }, get view() { return view; },
    render, onOpen: (f) => { onOpen = f; },
    bind(root) { root.addEventListener('click', (e) => { const c = e.target.closest('.cell'); if (c && onOpen) onOpen(+c.dataset.i); }); },
  };
})();
