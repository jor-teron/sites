/* GA2: videos play in <video> with a bottom control bar (seek, ±10 s, speed, mute, loop, CC, PiP, fullscreen),
   same-name .srt/.vtt subtitles, resume position in 'gallery-resume-v1' (name+size). */
/* Gallery viewer: full screen, swipe (75 px) between photos, pinch / double-tap / wheel zoom, pan when zoomed,
   ←/→/Esc, info, Download / Share. GAViewer.open(items, i) */
window.GAViewer = (function () {
  const SWIPE = 75, MAXZ = 8, $ = (id) => document.getElementById(id);
  let items = [], i = 0, url = null, z = 1, tx = 0, ty = 0, pts = new Map(), g = null, lastTap = 0, onClose = null;
  const el = () => $('viewer'), vid = () => $('v-vid'), RKEY = 'gallery-resume-v1';
  let isV = false, subUrl = null, lastSave = 0;
  const img = () => (isV ? vid() : $('v-img'));
  const rk = (it) => it.name + '|' + it.size;
  const rload = () => { try { return JSON.parse(localStorage.getItem(RKEY) || '{}'); } catch (_) { return {}; } };
  function rput(it, t) {
    const m = rload(), d = vid().duration || 0;
    if (!t || t < 5 || (d && t > d - 5)) delete m[rk(it)]; else m[rk(it)] = Math.floor(t);
    const ks = Object.keys(m); if (ks.length > 200) delete m[ks[0]];
    try { localStorage.setItem(RKEY, JSON.stringify(m)); } catch (_) { /* */ }
  }
  /* SRT → VTT text */
  const srt2vtt = (t) => 'WEBVTT\n\n' + t.replace(/\r/g, '').replace(/^\uFEFF/, '').replace(/^\d+\n(?=\d\d:)/gm, '').replace(/(\d\d:\d\d:\d\d),(\d{3})/g, '$1.$2');
  async function setSub(file) {
    const v = vid(); [...v.querySelectorAll('track')].forEach((t) => t.remove()); if (subUrl) URL.revokeObjectURL(subUrl); subUrl = null;
    $('c-sub').classList.remove('on'); if (!file) return false;
    let t = await file.text(); if (/\.srt$/i.test(file.name) || !/^\uFEFF?WEBVTT/.test(t)) t = srt2vtt(t);
    subUrl = URL.createObjectURL(new Blob([t], { type: 'text/vtt' }));
    const tr = document.createElement('track'); tr.kind = 'subtitles'; tr.label = file.name; tr.srclang = 'und'; tr.src = subUrl; tr.default = true; v.appendChild(tr);
    tr.track.mode = 'showing'; $('c-sub').classList.add('on'); return true;
  }
  const fmtT = (s) => GAGrid.fmtDur(isFinite(s) ? s : 0);
  function stopVid() { const v = vid(); if (isV && items[i]) rput(items[i], v.currentTime); v.pause(); v.removeAttribute('src'); [...v.querySelectorAll('track')].forEach((t) => t.remove()); v.load(); }
  function skip(s) { const v = vid(); v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + s)); const k = $('v-skip'); k.textContent = (s > 0 ? '+' : '−') + Math.abs(s) + ' s'; k.style.left = s > 0 ? '' : '20%'; k.style.right = s > 0 ? '20%' : ''; k.hidden = false; clearTimeout(skip.t); skip.t = setTimeout(() => { k.hidden = true; }, 600); }
  function toggle() { const v = vid(); if (v.paused) v.play().catch(() => {}); else v.pause(); }
  let seeking = false;
  function ui() { const v = vid(); $('c-play').textContent = v.paused ? '▶' : '❚❚'; $('c-mute').textContent = v.muted ? '🔇' : '🔊'; $('c-loop').classList.toggle('on', v.loop); $('c-t').textContent = fmtT(v.currentTime); $('c-d').textContent = fmtT(v.duration); if (!seeking && v.duration) $('c-seek').value = Math.round(v.currentTime / v.duration * 1000); }
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
    stopVid(); if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(it.file);
    $('v-img').style.transform = ''; vid().style.transform = '';
    isV = !!it.video; el().classList.toggle('isvid', isV); $('v-img').hidden = isV; vid().hidden = !isV; $('v-ctl').hidden = !isV;
    z = 1; tx = ty = 0; apply(false);
    if (isV) {
      const v = vid(), P = GAStore.P; v.loop = P.loop === '1'; v.playbackRate = +P.speed || 1; $('c-speed').value = String(v.playbackRate);
      const at = rload()[rk(it)] || 0;
      v.onloadedmetadata = () => { if (!it.dur) { it.dur = v.duration; } it.w = v.videoWidth; it.h = v.videoHeight; if (at && at < v.duration - 5) { v.currentTime = at; } info(); ui(); };
      v.src = url; setSub(GAGrid.subFor(it)); v.play().catch(() => {}); info(); ui(); return;
    }
    const im = img(); im.onload = () => info(); im.removeAttribute('src'); im.src = url; info();
  }
  function info() {
    const it = items[i], im = img(), d = new Date(it.date);
    $('v-name').textContent = it.name;
    const dim = isV ? (it.w ? it.w + '×' + it.h : '') : (im.naturalWidth ? im.naturalWidth + '×' + im.naturalHeight : '');
    $('v-meta').textContent = [(i + 1) + ' / ' + items.length, isV && it.dur ? fmtT(it.dur) : '', fmtSize(it.size), dim, d.toLocaleString()].filter(Boolean).join(' · ');
  }
  function open(list, k) { items = list; el().hidden = false; document.body.classList.add('viewing'); show(k); el().focus(); }
  function close() { stopVid(); isV = false; el().classList.remove('isvid'); vid().hidden = true; $('v-ctl').hidden = true; $('v-img').hidden = false; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); el().hidden = true; document.body.classList.remove('viewing'); img().removeAttribute('src'); if (url) URL.revokeObjectURL(url); url = null; onClose && onClose(i); }
  function init(o) {
    onClose = o.onClose;
    const vw = el();
    $('v-close').onclick = close;
    $('v-prev').onclick = () => show(i - 1); $('v-next').onclick = () => show(i + 1);
    $('v-dl').onclick = () => { const it = items[i]; GASave.save(it.file, it.name).then((n) => o.toast && o.toast('Saved ' + n)); };
    const sh = $('v-share');
    sh.hidden = !(navigator.share && navigator.canShare);
    sh.onclick = async () => { const it = items[i]; try { const f = new File([it.file], it.name, { type: it.file.type }); if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: it.name }); else o.toast && o.toast('Sharing files is not supported here'); } catch (e) { if (e && e.name !== 'AbortError') o.toast && o.toast('Share failed'); } };
    /* video controls (outside the stage, so seeking never triggers a swipe) */
    const v = vid();
    ['play', 'pause', 'timeupdate', 'durationchange', 'volumechange', 'ratechange'].forEach((t) => v.addEventListener(t, ui));
    v.addEventListener('timeupdate', () => { const n = Date.now(); if (isV && n - lastSave > 3000) { lastSave = n; rput(items[i], v.currentTime); } });
    v.addEventListener('ended', () => { if (isV) rput(items[i], 0); });
    v.addEventListener('pause', () => { if (isV && items[i]) rput(items[i], v.currentTime); });
    const sk = $('c-seek');
    sk.addEventListener('input', () => { seeking = true; if (v.duration) { v.currentTime = sk.value / 1000 * v.duration; $('c-t').textContent = fmtT(v.currentTime); } });
    sk.addEventListener('change', () => { seeking = false; });
    $('v-ctl').addEventListener('pointerdown', (e) => e.stopPropagation());
    $('c-play').onclick = toggle; $('c-back').onclick = () => skip(-10); $('c-fwd').onclick = () => skip(10);
    $('c-speed').onchange = (e) => { v.playbackRate = +e.target.value; GAStore.P.speed = e.target.value; GAStore.save(); };
    $('c-mute').onclick = () => { v.muted = !v.muted; };
    $('c-loop').onclick = () => { v.loop = !v.loop; GAStore.P.loop = v.loop ? '1' : '0'; GAStore.save(); ui(); };
    $('c-pip').hidden = !document.pictureInPictureEnabled;
    $('c-pip').onclick = () => { (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => o.toast && o.toast('Picture-in-picture not available')); };
    const fs = () => { const t = el(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (t.requestFullscreen) t.requestFullscreen().catch(() => {}); else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); };
    $('c-fs').onclick = fs;
    $('c-sub').onclick = () => $('subfile').click();
    $('subfile').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f && (await setSub(f))) o.toast && o.toast('Subtitles: ' + f.name); };
    const stage = $('v-stage');
    stage.addEventListener('wheel', (e) => { if (isV) return; e.preventDefault(); zoomAt(z * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
    stage.addEventListener('dblclick', (e) => { e.preventDefault(); if (isV) { clearTimeout(up.t); skip(e.clientX < innerWidth / 2 ? -10 : 10); return; } if (z > 1.01) zoomAt(1, e.clientX, e.clientY, true); else zoomAt(2.5, e.clientX, e.clientY, true); });
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && !isV) { const [a, b] = [...pts.values()]; g = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; }
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
      if (isV && !gg.moved && e.type === 'pointerup') {
        const now = Date.now();
        if (e.pointerType !== 'mouse' && now - lastTap < 300) { lastTap = 0; clearTimeout(up.t); skip(e.clientX < innerWidth / 2 ? -10 : 10); }
        else { lastTap = now; clearTimeout(up.t); up.t = setTimeout(toggle, e.pointerType === 'mouse' ? 220 : 300); }
        return;
      }
      if (e.pointerType !== 'mouse' && !gg.moved && e.type === 'pointerup') {
        const now = Date.now(); if (now - lastTap < 300) { lastTap = 0; zoomAt(z > 1.01 ? 1 : 2.5, e.clientX, e.clientY, true); } else lastTap = now;
      }
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.target && e.target.tagName === 'SELECT') return;
      if (e.key === 'Escape') { e.preventDefault(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else close(); }
      else if (e.key === 'PageDown' || (e.shiftKey && e.key === 'ArrowRight')) { e.preventDefault(); show(i + 1); }
      else if (e.key === 'PageUp' || (e.shiftKey && e.key === 'ArrowLeft')) { e.preventDefault(); show(i - 1); }
      else if (isV && e.key === ' ') { e.preventDefault(); toggle(); }
      else if (isV && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); fs(); }
      else if (isV && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); v.muted = !v.muted; }
      else if (isV && !v.paused && e.key === 'ArrowRight') { e.preventDefault(); skip(10); }
      else if (isV && !v.paused && e.key === 'ArrowLeft') { e.preventDefault(); skip(-10); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
      else if (isV) { /* no zoom for video */ } else if (e.key === '+' || e.key === '=') zoomAt(z * 1.5, innerWidth / 2, innerHeight / 2, true); else if (e.key === '-') zoomAt(z / 1.5, innerWidth / 2, innerHeight / 2, true);
      e.stopImmediatePropagation();
    }, true);
  }
  return { init, open, close, isOpen, get index() { return i; }, get zoom() { return z; } };
})();
