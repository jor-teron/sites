/* Gallery viewer: full screen, swipe (75 px) between photos, pinch / double-tap / wheel zoom, pan when zoomed,
   ←/→/Esc, info, Download / Share. GAViewer.open(items, i) */
window.GAViewer = (function () {
  const SWIPE = 75, MAXZ = 8, $ = (id) => document.getElementById(id);
  let items = [], i = 0, url = null, z = 1, tx = 0, ty = 0, pts = new Map(), g = null, lastTap = 0, onClose = null;
  const el = () => $('viewer'), img = () => $('v-img');
  const isOpen = () => !el().hidden;
  function fmtSize(b) { return b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
  function apply(anim) { const im = img(); im.style.transition = anim ? 'transform .2s' : 'none'; im.style.transform = `translate(${tx}px,${ty}px) scale(${z})`; el().classList.toggle('zoomed', z > 1.01); }
  function clampPan() {
    const im = img(), r = el().getBoundingClientRect(), w = im.offsetWidth * z, h = im.offsetHeight * z;
    const mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (h - r.height) / 2);
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
  }
  /* zoom to s keeping client point (cx, cy) fixed */
  function zoomAt(s, cx, cy, anim) {
    s = Math.max(1, Math.min(MAXZ, s));
    const r = el().getBoundingClientRect(), ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2;
    tx = ox - (ox - tx) * s / z; ty = oy - (oy - ty) * s / z; z = s;
    if (z === 1) { tx = ty = 0; } clampPan(); apply(anim);
  }
  function show(k) {
    if (!items.length) return;
    i = (k + items.length) % items.length; const it = items[i];
    if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(it.file);
    z = 1; tx = ty = 0; apply(false);
    const im = img(); im.onload = () => info(); im.src = url; info();
  }
  function info() {
    const it = items[i], im = img(), d = new Date(it.date);
    $('v-name').textContent = it.name;
    $('v-meta').textContent = [(i + 1) + ' / ' + items.length, fmtSize(it.size), im.naturalWidth ? im.naturalWidth + '×' + im.naturalHeight : '', d.toLocaleString()].filter(Boolean).join(' · ');
  }
  function open(list, k) { items = list; el().hidden = false; document.body.classList.add('viewing'); show(k); el().focus(); }
  function close() { el().hidden = true; document.body.classList.remove('viewing'); img().removeAttribute('src'); if (url) URL.revokeObjectURL(url); url = null; onClose && onClose(i); }
  function init(o) {
    onClose = o.onClose;
    const v = el();
    $('v-close').onclick = close;
    $('v-prev').onclick = () => show(i - 1); $('v-next').onclick = () => show(i + 1);
    $('v-dl').onclick = () => { const it = items[i]; GASave.save(it.file, it.name).then((n) => o.toast && o.toast('Saved ' + n)); };
    const sh = $('v-share');
    sh.hidden = !(navigator.share && navigator.canShare);
    sh.onclick = async () => { const it = items[i]; try { const f = new File([it.file], it.name, { type: it.file.type }); if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: it.name }); else o.toast && o.toast('Sharing files is not supported here'); } catch (e) { if (e && e.name !== 'AbortError') o.toast && o.toast('Share failed'); } };
    const stage = $('v-stage');
    stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(z * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
    stage.addEventListener('dblclick', (e) => { e.preventDefault(); if (z > 1.01) zoomAt(1, e.clientX, e.clientY, true); else zoomAt(2.5, e.clientX, e.clientY, true); });
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; g = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; }
      else if (pts.size === 1) g = { x: e.clientX, y: e.clientY, tx, ty, t: Date.now(), moved: false };
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt(g.z * d / g.d, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
      if (g.pinch) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y; if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.moved = true;
      if (z > 1.01) { tx = g.tx + dx; ty = g.ty + dy; clampPan(); apply(false); }
      else { tx = dx; apply(false); } /* drag preview for swipe */
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (!g) return;
      if (g.pinch) { if (pts.size === 0) g = null; else { const p = [...pts.values()][0]; g = { x: p.x, y: p.y, tx, ty, t: Date.now(), moved: true }; } return; }
      const dx = e.clientX - g.x, gg = g; g = null;
      if (z <= 1.01) {
        if (e.type === 'pointerup' && Math.abs(dx) >= SWIPE) { show(i + (dx < 0 ? 1 : -1)); return; }
        tx = 0; apply(true);
      }
      /* double-tap for touch (dblclick covers mouse) */
      if (e.pointerType !== 'mouse' && !gg.moved && e.type === 'pointerup') {
        const now = Date.now(); if (now - lastTap < 300) { lastTap = 0; zoomAt(z > 1.01 ? 1 : 2.5, e.clientX, e.clientY, true); } else lastTap = now;
      }
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
      else if (e.key === '+' || e.key === '=') zoomAt(z * 1.5, innerWidth / 2, innerHeight / 2, true); else if (e.key === '-') zoomAt(z / 1.5, innerWidth / 2, innerHeight / 2, true);
      e.stopImmediatePropagation();
    }, true);
  }
  return { init, open, close, isOpen, get index() { return i; }, get zoom() { return z; } };
})();
