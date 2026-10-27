/* GIF Maker photos (GM2): frame list, thumbnail strip (drag / long-press drag, ◀ ▶, delete), per-frame delay, fit rendering.
   GMPhotos.init({ onChange, defDelay() }) · add(files) · list · sel · render(i, w, h, fit) → ImageData · dims(width) */
window.GMPhotos = (function () {
  const $ = (id) => document.getElementById(id);
  const L = []; let sel = -1, cb = {};
  function loadImg(f) {
    return new Promise((res) => {
      const url = URL.createObjectURL(f), im = new Image();
      im.onload = () => res({ url, img: im, name: f.name, w: im.naturalWidth, h: im.naturalHeight, delay: cb.defDelay() });
      im.onerror = () => { URL.revokeObjectURL(url); res(null); };
      im.src = url;
    });
  }
  async function add(files) {
    const imgs = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name));
    const got = (await Promise.all(imgs.map(loadImg))).filter(Boolean);
    got.forEach((p) => L.push(p));
    if (got.length && sel < 0) sel = 0;
    draw();
    return { added: got.length, skipped: files.length - got.length };
  }
  function move(from, to) {
    if (from === to || from < 0 || to < 0 || from >= L.length || to >= L.length) return;
    const [p] = L.splice(from, 1); L.splice(to, 0, p);
    if (sel === from) sel = to; else if (from < sel && to >= sel) sel--; else if (from > sel && to <= sel) sel++;
    draw();
  }
  function del(i) { const [p] = L.splice(i, 1); URL.revokeObjectURL(p.url); if (sel >= L.length) sel = L.length - 1; draw(); }
  function select(i) { sel = i; draw(); }
  function draw() {
    const st = $('strip'); st.textContent = '';
    L.forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'th' + (i === sel ? ' sel' : ''); d.dataset.i = i; d.dataset.name = p.name;
      d.innerHTML = '<img alt=""><span class="ms"></span><button class="x" title="Delete">×</button>';
      d.querySelector('img').src = p.url; d.querySelector('.ms').textContent = p.delay;
      st.appendChild(d);
    });
    $('ph-empty').hidden = L.length > 0; $('ph-bar').hidden = !L.length; $('ph-big').hidden = sel < 0;
    if (sel >= 0) { $('ph-big').src = L[sel].url; $('d-sel').value = L[sel].delay; }
    $('ph-info').textContent = L.length ? (sel + 1) + ' / ' + L.length : '';
    $('ph-left').disabled = sel <= 0; $('ph-right').disabled = sel < 0 || sel >= L.length - 1;
    const c = st.children[sel]; /* scroll the strip only (scrollIntoView would also shift the swipe track) */
    if (c) { if (c.offsetLeft < st.scrollLeft) st.scrollLeft = c.offsetLeft - 4; else if (c.offsetLeft + c.offsetWidth > st.scrollLeft + st.clientWidth) st.scrollLeft = c.offsetLeft + c.offsetWidth - st.clientWidth + 4; }
    cb.onChange && cb.onChange();
  }
  function dims(width) {
    if (!L.length) return { w: width, h: width };
    const h = Math.max(2, Math.round(width * L[0].h / L[0].w / 2) * 2); return { w: width, h };
  }
  function render(i, w, h, fit) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }), p = L[i];
    x.fillStyle = fit === 'white' ? '#fff' : '#000'; x.fillRect(0, 0, w, h);
    const s = (fit === 'cover' ? Math.max : Math.min)(w / p.w, h / p.h), dw = p.w * s, dh = p.h * s;
    x.imageSmoothingQuality = 'high'; x.drawImage(p.img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return x.getImageData(0, 0, w, h);
  }
  /* reorder: mouse drags at once; touch needs a 400 ms long-press first */
  function initDrag() {
    const st = $('strip'); let g = null;
    const idxAt = (x, y) => { const el = document.elementFromPoint(x, y); const t = el && el.closest && el.closest('.th'); return t ? +t.dataset.i : -1; };
    st.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('.th'); if (!t || e.target.closest('.x')) return;
      g = { i: +t.dataset.i, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse', on: false, el: t };
      if (g.touch) g.timer = setTimeout(() => { if (g) { g.on = true; t.classList.add('lift'); navigator.vibrate && navigator.vibrate(15); } }, 400);
    });
    st.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const moved = Math.hypot(e.clientX - g.x, e.clientY - g.y) > 6;
      if (!g.on) { if (g.touch) { if (moved) { clearTimeout(g.timer); g = null; } return; } if (!moved) return; g.on = true; }
      g.el.classList.add('drag');
      const j = idxAt(e.clientX, e.clientY); if (j >= 0 && j !== g.i) { move(g.i, j); g.i = j; g.el = $('strip').children[j]; g.el.classList.add('drag'); }
    });
    const end = (e) => {
      if (!g || e.pointerId !== g.id) return;
      clearTimeout(g.timer); const was = g.on, i = g.i; g = null;
      [...st.children].forEach((c) => c.classList.remove('drag', 'lift'));
      if (!was && e.type === 'pointerup') select(i);
    };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    st.addEventListener('touchmove', (e) => { if (g && g.on) e.preventDefault(); }, { passive: false });
    st.addEventListener('contextmenu', (e) => e.preventDefault());
    st.addEventListener('click', (e) => { const x = e.target.closest('.x'); if (x) del(+x.parentNode.dataset.i); });
  }
  function init(o) {
    cb = o; initDrag();
    $('ph-left').onclick = () => move(sel, sel - 1);
    $('ph-right').onclick = () => move(sel, sel + 1);
    $('d-sel').addEventListener('change', () => { if (sel < 0) return; L[sel].delay = clampDelay($('d-sel').value); draw(); });
  }
  const clampDelay = (v) => Math.max(20, Math.min(10000, Math.round(+v || 500)));
  function setAll(ms) { L.forEach((p) => { p.delay = ms; }); draw(); }
  return { init, add, move, del, select, render, dims, setAll, clampDelay, get list() { return L; }, get sel() { return sel; } };
})();
