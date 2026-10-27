/* Gallery grid: items [{ file, name, size, date }] → lazy thumbnails (IntersectionObserver + createImageBitmap/canvas), sort, month groups. */
window.GAGrid = (function () {
  const IMG = /\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i, TH = 256;
  const isImg = (f) => /^image\//.test(f.type) || IMG.test(f.name);
  let items = [], io = null, onOpen = null;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  async function thumb(cv, file) {
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
    io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); const it = items[+e.target.dataset.i]; thumb(e.target.querySelector('canvas'), it.file); } }), { root: null, rootMargin: '300px' });
    sortItems(o.sort); root.textContent = '';
    const group = o.group && o.sort !== 'name'; let key = null, grid = null;
    items.forEach((it, i) => {
      const d = new Date(it.date), k = d.getFullYear() + '-' + d.getMonth();
      if (!grid || (group && k !== key)) {
        if (group) { const h = document.createElement('h3'); h.className = 'mon'; h.textContent = MONTHS[d.getMonth()] + ' ' + d.getFullYear(); root.appendChild(h); }
        grid = document.createElement('div'); grid.className = 'grid'; root.appendChild(grid); key = k;
      }
      const c = document.createElement('button'); c.className = 'cell'; c.dataset.i = i; c.title = it.name;
      c.appendChild(document.createElement('canvas')); grid.appendChild(c); io.observe(c);
    });
  }
  return {
    isImg,
    set(list) { items = list.filter((f) => isImg(f.file)); return items.length; },
    get items() { return items; },
    render, onOpen: (f) => { onOpen = f; },
    bind(root) { root.addEventListener('click', (e) => { const c = e.target.closest('.cell'); if (c && onOpen) onOpen(+c.dataset.i); }); },
  };
})();
