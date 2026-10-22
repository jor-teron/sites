/* Sound Recorder — Player screen: whole recording as one waveform, tap / drag to seek, zoom (pinch,
   Ctrl+wheel, -/+), overview bar with the visible window (drag to pan), silence shading,
   Sound ◀ / ▶ jump between sound regions. View state is exposed as SR.player for tests. */
(() => {
  'use strict';
  const { $, toast } = SR, MIN_SPAN = 2;
  let rec = null, url = null, regs = [], dur = 0, v0 = 0, v1 = 1, raf = 0, colors = null;
  const audio = () => $('p-audio');
  const now = () => (rec ? Math.min(dur, audio().currentTime || 0) : 0);
  const span = () => v1 - v0;

  function setView(a, b) {
    let s = Math.min(dur, Math.max(Math.min(MIN_SPAN, dur), b - a));
    a = Math.max(0, Math.min(dur - s, a)); v0 = a; v1 = a + s; draw();
  }
  function zoom(f, at) {
    const t = at != null ? at : (now() >= v0 && now() <= v1 ? now() : (v0 + v1) / 2);
    const k = (t - v0) / (span() || 1), s = Math.min(dur, Math.max(Math.min(MIN_SPAN, dur), span() / f));
    setView(t - k * s, t - k * s + s);
  }
  function seek(t) {
    t = Math.max(0, Math.min(dur, t));
    try { audio().currentTime = t; } catch (_) { /* not ready */ }
    draw();
  }
  function follow() {
    const t = now();
    if (t > v1 || t < v0) setView(t - span() * 0.1, t + span() * 0.9);
  }
  function calcRegions() { regs = rec ? SRAudio.regions(rec.peaks, rec.pps, SR.P.thr) : []; }

  function draw() {
    if (!rec || SR.S.mode !== 'play') return;
    colors = colors || SRWave.colors();
    const t = now();
    SRWave.draw($('p-wave'), rec.peaks, rec.pps, v0, v1, { regions: regs, dur, playhead: t, colors });
    SRWave.draw($('p-over'), rec.peaks, rec.pps, 0, dur, { regions: regs, dur, playhead: t, win: span() < dur - 0.01 ? [v0, v1] : null, colors });
    $('p-time').textContent = SR.fmt(t, true) + ' / ' + SR.fmt(dur);
    const z = dur / (span() || 1);
    $('p-zoom').textContent = z > 1.05 ? '×' + (z < 10 ? z.toFixed(1) : Math.round(z)) + ' · ' + SR.fmt(v0) + '–' + SR.fmt(v1) : 'Whole recording';
    $('p-regs').textContent = regs.length + (regs.length === 1 ? ' sound' : ' sounds');
    $('p-wave').dataset.t0 = v0.toFixed(3); $('p-wave').dataset.t1 = v1.toFixed(3);
    $('p-play').innerHTML = audio().paused ? '&#9654;' : '&#10074;&#10074;';
    $('p-play').setAttribute('aria-label', audio().paused ? 'Play' : 'Pause');
  }
  function loop() { if (!audio().paused) { follow(); draw(); raf = requestAnimationFrame(loop); } }

  async function open(id, keepMode) {
    const r = await SRStore.get(id).catch(() => null);
    if (!r) { close(); return; }
    audio().pause();
    if (url) URL.revokeObjectURL(url);
    rec = r; dur = Math.max(0.1, r.dur || r.peaks.length / r.pps);
    url = URL.createObjectURL(r.blob);
    const a = audio(); a.src = url;
    /* MediaRecorder WebM has no duration in its header; this makes the browser scan it so seeking works */
    a.onloadedmetadata = () => { if (a.duration === Infinity) { a.currentTime = 1e101; a.ontimeupdate = () => { a.ontimeupdate = null; a.currentTime = 0; draw(); }; } };
    SR.S.cur = id; SR.saveS(); SR.emit('cur', id);
    $('p-name').textContent = r.name; $('p-none').hidden = true; $('p-body').hidden = false;
    calcRegions(); v0 = 0; v1 = dur;
    if (!keepMode) SR.setMode('play');
    requestAnimationFrame(draw);
  }
  function close() {
    audio().pause(); rec = null; regs = []; SR.S.cur = null; SR.saveS();
    $('p-none').hidden = false; $('p-body').hidden = true; $('p-name').textContent = 'Player'; $('p-regs').textContent = '';
  }
  function toggle() {
    if (!rec) return;
    const a = audio();
    if (a.paused) { if (now() >= dur - 0.05) seek(0); a.play().catch(() => toast('Cannot play this file')); } else a.pause();
  }
  function jump(dir) {
    if (!rec) return;
    const t = now();
    const r = dir > 0 ? regs.find((x) => x.s > t + 0.05) : [...regs].reverse().find((x) => x.s < t - 0.3);
    if (!r) { toast(dir > 0 ? 'No more sound after this' : 'No sound before this'); return; }
    seek(r.s);
    if (r.s < v0 || r.s > v1) setView(r.s - span() * 0.1, r.s + span() * 0.9);
  }

  function gestures() {
    const cv = $('p-wave'), ov = $('p-over'), pts = new Map();
    let pinch = null;
    const tAt = (el, x) => { const b = el.getBoundingClientRect(); return { b, f: Math.max(0, Math.min(1, (x - b.left) / b.width)) }; };
    cv.addEventListener('pointerdown', (e) => {
      if (!rec) return; try { cv.setPointerCapture(e.pointerId); } catch (_) { /* */ }
      pts.set(e.pointerId, e.clientX);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const m = tAt(cv, (a + b) / 2); pinch = { d: Math.abs(a - b) || 1, s: span(), t: v0 + m.f * span(), f: m.f }; }
      else if (pts.size === 1) seek(v0 + tAt(cv, e.clientX).f * span());
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e.clientX);
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()], s = Math.min(dur, Math.max(Math.min(MIN_SPAN, dur), pinch.s * pinch.d / (Math.abs(a - b) || 1)));
        const f = tAt(cv, (a + b) / 2).f; setView(pinch.t - f * s, pinch.t - f * s + s);
      } else if (!pinch) seek(v0 + tAt(cv, e.clientX).f * span());
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = pts.size ? pinch : null; if (!pts.size) pinch = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      if (!rec) return; e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoom(Math.pow(1.0025, -e.deltaY), v0 + tAt(cv, e.clientX).f * span());
      else { const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; setView(v0 + d / cv.clientWidth * span(), v1 + d / cv.clientWidth * span()); }
    }, { passive: false });
    let pan = null;
    ov.addEventListener('pointerdown', (e) => {
      if (!rec) return; try { ov.setPointerCapture(e.pointerId); } catch (_) { /* */ }
      const t = tAt(ov, e.clientX).f * dur;
      if (t < v0 || t > v1) setView(t - span() / 2, t + span() / 2);
      pan = { id: e.pointerId, off: t - v0 };
    });
    ov.addEventListener('pointermove', (e) => { if (pan && e.pointerId === pan.id) { const a = tAt(ov, e.clientX).f * dur - pan.off; setView(a, a + span()); } });
    const pend = (e) => { if (pan && e.pointerId === pan.id) pan = null; };
    ov.addEventListener('pointerup', pend); ov.addEventListener('pointercancel', pend);
  }

  SR.on('init', () => {
    const a = audio();
    a.addEventListener('play', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); draw(); });
    a.addEventListener('pause', draw); a.addEventListener('ended', draw); a.addEventListener('seeked', draw);
    $('p-play').onclick = toggle;
    $('p-back').onclick = () => seek(now() - 10);
    $('p-fwd').onclick = () => seek(now() + 10);
    $('p-zin').onclick = () => zoom(2);
    $('p-zout').onclick = () => zoom(0.5);
    $('p-next').onclick = () => jump(1);
    $('p-prev').onclick = () => jump(-1);
    gestures();
    if (SR.S.cur) open(SR.S.cur, true);
  });
  SR.on('open', (id) => open(id));
  SR.on('changed', (c) => { if (rec && c.deleted === rec.id) close(); else if (rec && c.renamed === rec.id) open(rec.id, true); });
  SR.on('mode', ({ m }) => { if (m === 'play') requestAnimationFrame(draw); });
  SR.on('settings', (k) => { colors = null; if (k === 'thr' || k === 'all') calcRegions(); draw(); });
  addEventListener('resize', () => requestAnimationFrame(draw));
  SR.on('key', (e) => {
    if (SR.S.mode !== 'play' || !rec) return;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); toggle(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); seek(now() - 10); }
    else if (k === 'ArrowRight') { e.preventDefault(); seek(now() + 10); }
    else if (k === '+' || k === '=') zoom(2);
    else if (k === '-') zoom(0.5);
    else if (k === 'n' || k === 'N') jump(1);
    else if (k === 'p' || k === 'P') jump(-1);
  });
  SR.player = { view: () => [v0, v1], regions: () => regs, time: now, dur: () => dur, seek, zoom };
})();
