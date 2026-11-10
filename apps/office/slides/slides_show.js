/* Hub Office Slides SL2 — Present mode (SLShow), extended in SL7.
   - Full screen with the Fullscreen API (standard or webkit) on #show; when that is missing or refused (iPhone Safari,
     some embedded views) #show is simply a fixed black overlay over the whole page (mode 'overlay').
   - One slide at a time, drawn with SLEdit.paint, 960 x 540 scaled by one CSS transform on #show-zoom to fit,
     letterboxed on black.
   - Next: → ↓ Space PageDown Enter N, a tap / click on the right two-thirds, a swipe left.
     Previous: ← ↑ PageUp Backspace P, a tap on the left third, a swipe right. Home / End. Type a number + Enter to jump.
     Esc (or the ✕ button) exits back to the editor on the slide shown last.
   - After the last slide: a black end screen "End of slideshow, tap or press to exit" (← goes back).
   - The slide counter and the small ‹ › ✕ buttons show on a change or when the mouse / finger moves, and fade after
     2 s idle (audience window only; Presenter view keeps the chrome). Screen Wake Lock when the browser has it.
   SL3: enter(list, start, theme). Each slide is dressed by SLEdit.paint (layout + deck theme, per-slide background,
   pictures), so Present shows exactly what the editor shows.
   SL7: CSS transitions (none / fade / push / wipe on the arriving slide; prefers-reduced-motion forces none),
   speaker notes and a next-slide preview in Presenter view (#show.presenter), a second window synced with
   BroadcastChannel (hub-slides-present) or postMessage, a pen / laser / eraser (ink stays in memory unless Keep ink
   is on), and B / W for a black or white blank. enter(list, start, theme, opts) with opts.presenter, opts.satellite,
   opts.key, opts.popup, opts.onKeep. */
(function () {
  'use strict';
  var IDLE = 2000, W = 960, H = 540;
  var $ = function (id) { return document.getElementById(id); };
  var el, fitEl, zoomEl, slideEl, oldEl, endEl, countEl, inkEl, laserEl, blankEl, nextFit, nextEl, notesEl, timeEl;
  var ctx = null, cb = {}, on = false, mode = '', i = 0, n = 0, slides = [], atEnd = false, theme = 'light';
  var idleT = 0, numBuf = '', numT = 0, lock = null, p0 = null;
  var presenter = false, satellite = false, reduce = false, anim = false, animT = 0, scale = 1, dir = 1, master = {};
  var tool = '', color = '#ef4444', blank = 'none', inkMap = {}, stroke = null, drawing = false;
  var keepOn = false, bus = null, sessionKey = '', popupWin = null;
  var t0 = 0, elapsed = 0, running = true, tickT = 0, waitOwner = 0;

  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function reqFs(x) {
    try {
      if (x.requestFullscreen) return Promise.resolve(x.requestFullscreen({ navigationUI: 'hide' }));
      if (x.webkitRequestFullscreen) { x.webkitRequestFullscreen(); return Promise.resolve(); }
    } catch (e) { return Promise.reject(e); }
    return Promise.reject(new Error('no fullscreen'));
  }
  function exitFs() {
    try {
      if (document.exitFullscreen) { var r = document.exitFullscreen(); if (r && r.catch) r.catch(function () {}); }
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (_) { /* */ }
  }
  function prefersReduce() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
  }
  function sid(k) { return (slides[k] && slides[k].id) || ('#' + k); }
  function inkOf(k) { var id = sid(k); return inkMap[id] || (inkMap[id] = SLPresent.cloneInk(slides[k] && slides[k].ink)); }
  function visAll() {
    var a = [];
    for (var k = 0; k < n; k++) if (!(slides[k] && slides[k].hide)) a.push(k);
    return a.length ? a : (function () { var b = []; for (var x = 0; x < n; x++) b.push(x); return b; })();
  }
  function skipped(k) { return !!(slides[k] && slides[k].hide) && visAll().some(function (x) { return !(slides[x] && slides[x].hide); }); }
  /* if every slide is hidden, visAll falls back to all, so skipped() is false */
  function visPos(k) {
    var v = visAll(), p = v.indexOf(k);
    return p < 0 ? 0 : p + 1;
  }
  function nearestVis(k, dir) {
    var v = visAll();
    if (v.indexOf(k) >= 0) return k;
    if (dir >= 0) { for (var x = 0; x < v.length; x++) if (v[x] >= k) return v[x]; return v[v.length - 1]; }
    for (var y = v.length - 1; y >= 0; y--) if (v[y] <= k) return v[y];
    return v[0];
  }
  function nextVis(k) {
    var v = visAll(), p = v.indexOf(k);
    if (p < 0) { var n2 = nearestVis(k, 1); return n2 === k ? -1 : n2; }
    return p + 1 < v.length ? v[p + 1] : -1;
  }
  function prevVis(k) {
    var v = visAll(), p = v.indexOf(k);
    if (p < 0) { var n2 = nearestVis(k, -1); return n2 === k ? -1 : n2; }
    return p > 0 ? v[p - 1] : -1;
  }
  function deckCtx() { return { slides: slides, master: master }; }

  /* ---------- wake lock ---------- */
  function wake() {
    if (!on || lock || !('wakeLock' in navigator) || !navigator.wakeLock || !navigator.wakeLock.request) return;
    try {
      navigator.wakeLock.request('screen').then(function (l) {
        if (!on) { try { l.release(); } catch (_) { /* */ } return; }
        lock = l; if (l.addEventListener) l.addEventListener('release', function () { if (lock === l) lock = null; });
      }, function () { lock = null; });
    } catch (_) { lock = null; }
  }
  function unwake() { var l = lock; lock = null; if (l) { try { var r = l.release(); if (r && r.catch) r.catch(function () {}); } catch (_) { /* */ } } }

  /* ---------- bus (BroadcastChannel, else postMessage to opener / popup) ---------- */
  function originOk(o) {
    var here = location.origin;
    if (!here || here === 'null') return true;
    return o === here || o === 'null' || (typeof o === 'string' && o.indexOf('file:') === 0);
  }
  function openBus(key) {
    var bc = null, closed = false;
    try { if (typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel(SLPresent.CHAN); } catch (_) { bc = null; }
    function send(msg) {
      if (closed || !key) return;
      var m = SLPresent.pack(msg, key);
      if (bc) { try { bc.postMessage(m); return; } catch (_) { /* fall through */ } }
      var tgt = originOk(location.origin) && location.origin !== 'null' ? location.origin : '*';
      try { if (window.opener && !window.opener.closed) window.opener.postMessage(m, tgt); } catch (_) { /* */ }
      try { if (popupWin && !popupWin.closed) popupWin.postMessage(m, tgt); } catch (_) { /* */ }
    }
    function onMsg(raw) {
      var m = SLPresent.accept(raw, key);
      if (m) handleBus(m);
    }
    function onWin(e) { if (!originOk(e.origin)) return; onMsg(e.data); }
    addEventListener('message', onWin);
    if (bc) bc.onmessage = function (e) { onMsg(e.data); };
    return { send: send, close: function () { closed = true; if (bc) try { bc.close(); } catch (_) {} removeEventListener('message', onWin); } };
  }
  function snap() {
    return {
      type: 'state', i: i, atEnd: atEnd, n: n, blank: blank, tool: tool, color: color,
      elapsed: nowElapsed(), running: running, keep: keepOn,
      notes: atEnd ? '' : SLPresent.cleanNotes(slides[i] && slides[i].notes),
      ink: atEnd ? [] : SLPresent.inkOut(inkOf(i))
    };
  }
  function emit() { if (bus && !satellite) bus.send(snap()); }
  function handleBus(m) {
    if (!on) return;
    if (satellite) {
      if (m.type === 'state' || m.type === 'hello') { if (waitOwner) { clearTimeout(waitOwner); waitOwner = 0; } applyState(m); }
      else if (m.type === 'exit') exit();
      return;
    }
    /* owner: apply commands from the presenter window */
    if (m.type === 'next') next();
    else if (m.type === 'prev') prev();
    else if (m.type === 'go') go(m.i | 0);
    else if (m.type === 'blank') setBlank(m.blank);
    else if (m.type === 'tool') setTool(m.tool, m.color);
    else if (m.type === 'clear') clearInk();
    else if (m.type === 'keep') setKeep(!!m.on);
    else if (m.type === 'timer') { if (m.cmd === 'pause') toggleTimer(); else if (m.cmd === 'reset') resetTimer(); }
    else if (m.type === 'exit') exit();
    else if (m.type === 'hello') emit();
  }
  function cmd(msg) {
    if (satellite && bus) bus.send(msg);
    else {
      if (msg.type === 'next') next();
      else if (msg.type === 'prev') prev();
      else if (msg.type === 'go') go(msg.i | 0);
      else if (msg.type === 'blank') setBlank(msg.blank);
      else if (msg.type === 'tool') setTool(msg.tool, msg.color);
      else if (msg.type === 'clear') clearInk();
      else if (msg.type === 'keep') setKeep(!!msg.on);
      else if (msg.type === 'timer') { if (msg.cmd === 'pause') toggleTimer(); else if (msg.cmd === 'reset') resetTimer(); }
      else if (msg.type === 'exit') exit();
    }
  }

  /* ---------- layout + drawing ---------- */
  function fit() {
    if (!on) return;
    var box = (presenter && el) ? (el.querySelector('#show-main') || el) : el;
    var w = (box && box.clientWidth) || innerWidth, h = (box && box.clientHeight) || innerHeight;
    scale = Math.min(w / W, h / H);
    var fw = Math.floor(W * scale), fh = Math.floor(H * scale);
    fitEl.style.width = fw + 'px'; fitEl.style.height = fh + 'px';
    slideEl.style.transform = 'scale(' + scale + ')';
    if (oldEl) oldEl.style.transform = 'scale(' + scale + ')';
    if (presenter && nextFit && nextEl && !nextFit.hidden) {
      var nw = nextFit.clientWidth || 1; nextEl.style.transform = 'scale(' + (nw / W) + ')';
    }
  }
  function transOf(k) { return SLPresent.effectiveTrans(slides[k], { reduce: reduce }); }
  function paintSlide(node, k, live) {
    if (!node || k < 0 || k >= n) { if (node) node.innerHTML = ''; return; }
    SLEdit.paint(node, slides[k], k, { show: true, deck: deckCtx() }, theme, 'slide sv pv show-layer' + (live ? '' : ''));
  }
  function paintNext() {
    if (!presenter || !nextEl) return;
    var nx = nextVis(i);
    if (atEnd || nx < 0) { nextEl.innerHTML = ''; nextEl.setAttribute('aria-label', 'End'); return; }
    paintSlide(nextEl, nx, false);
    nextEl.className = 'slide sv pv';
    fit();
  }
  function paintNotes() {
    if (!notesEl) return;
    notesEl.textContent = atEnd ? '' : SLPresent.cleanNotes(slides[i] && slides[i].notes);
  }
  function paintInk() {
    if (!ctx || !inkEl) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (atEnd) return;
    (inkOf(i) || []).forEach(function (st) { strokePath(st); });
    if (stroke && stroke.pts && stroke.pts.length) strokePath(stroke);
  }
  function strokePath(st) {
    var pts = st.pts || []; if (!pts.length) return;
    ctx.save();
    if (st.tool === 'erase') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.lineWidth = (st.width || 4) * 3; }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = st.color || '#ef4444'; ctx.lineWidth = st.width || 4; }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (var p = 1; p < pts.length; p++) ctx.lineTo(pts[p].x, pts[p].y);
    if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y);
    ctx.stroke(); ctx.restore();
  }
  function syncTools() {
    [].forEach.call(el.querySelectorAll('#show-tools [data-tool]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-tool') === tool ? 'true' : 'false');
    });
    [].forEach.call(el.querySelectorAll('.pen-cols button'), function (b) {
      b.classList.toggle('on', (b.getAttribute('data-c') || '').toLowerCase() === color);
    });
    var k = $('show-tools') && el.querySelector('#show-tools [data-a=keep]');
    if (k) k.setAttribute('aria-pressed', keepOn ? 'true' : 'false');
    el.classList.toggle('tool-laser', tool === 'laser' && !presenter);
    if (laserEl && tool !== 'laser') laserEl.hidden = true;
    if (blankEl) { blankEl.hidden = blank === 'none'; blankEl.className = blank === 'none' ? '' : blank; blankEl.id = 'show-blank'; }
  }
  function draw() {
    finishAnim(true);
    endEl.hidden = !atEnd; fitEl.hidden = atEnd;
    if (oldEl) { oldEl.hidden = true; oldEl.innerHTML = ''; }
    if (!atEnd) { paintSlide(slideEl, i, true); slideEl.setAttribute('aria-label', 'Slide ' + (i + 1) + ' of ' + n); }
    else slideEl.innerHTML = '';
    slideEl.style.opacity = ''; slideEl.style.clipPath = ''; slideEl.className = 'slide sv pv show-layer';
    countEl.textContent = atEnd ? 'End' : (visPos(i) + ' / ' + visAll().length);
    $('show-prev').disabled = !atEnd && i === 0; $('show-next').disabled = false;
    paintNext(); paintNotes(); paintInk(); syncTools(); poke(); emit();
  }
  function finishAnim(silent) {
    if (!anim) return;
    anim = false; clearTimeout(animT);
    if (oldEl) { oldEl.hidden = true; oldEl.innerHTML = ''; oldEl.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0'; oldEl.style.transform = 'scale(' + scale + ')'; }
    slideEl.style.opacity = ''; slideEl.style.clipPath = ''; slideEl.style.transform = 'scale(' + scale + ')';
    slideEl.className = 'slide sv pv show-layer';
    if (!silent) { paintInk(); paintNext(); paintNotes(); emit(); }
  }
  function goAnim(nk, endNow, d) {
    nk = Math.max(0, Math.min(n - 1, nk | 0));
    var kind = (!endNow && !atEnd && !reduce) ? transOf(nk) : 'none';
    finishAnim(true);
    dir = d || (nk >= i ? 1 : -1);
    if (kind === 'none' || endNow || atEnd || nk === i && !endNow) {
      atEnd = !!endNow; if (!endNow) i = nk; draw(); if (cb.onSlide) cb.onSlide(i); return;
    }
    /* paint the current slide into the old layer, the arriving slide into the current layer, then animate */
    paintSlide(oldEl, i, false);
    oldEl.hidden = false; oldEl.style.transform = 'scale(' + scale + ')'; oldEl.style.opacity = '1'; oldEl.style.clipPath = '';
    i = nk; atEnd = false;
    paintSlide(slideEl, i, true);
    slideEl.setAttribute('aria-label', 'Slide ' + (i + 1) + ' of ' + n);
    countEl.textContent = visPos(i) + ' / ' + visAll().length;
    $('show-prev').disabled = i === 0;
    paintNext(); paintNotes(); paintInk();
    var from = dir > 0 ? 1 : -1;
    if (kind === 'fade') {
      oldEl.className = 'slide sv pv show-layer tr-fade'; slideEl.className = 'slide sv pv show-layer tr-fade';
      slideEl.style.opacity = '0';
      requestAnimationFrame(function () { requestAnimationFrame(function () { oldEl.style.opacity = '0'; slideEl.style.opacity = '1'; }); });
    } else if (kind === 'push') {
      oldEl.className = 'slide sv pv show-layer tr-push'; slideEl.className = 'slide sv pv show-layer tr-push';
      slideEl.style.transform = 'scale(' + scale + ') translateX(' + (from * 100) + '%)';
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        oldEl.style.transform = 'scale(' + scale + ') translateX(' + (-from * 100) + '%)';
        slideEl.style.transform = 'scale(' + scale + ')';
      }); });
    } else if (kind === 'wipe') {
      oldEl.className = 'slide sv pv show-layer'; slideEl.className = 'slide sv pv show-layer tr-wipe';
      slideEl.style.zIndex = '2';
      slideEl.style.clipPath = from > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)';
      requestAnimationFrame(function () { requestAnimationFrame(function () { slideEl.style.clipPath = 'inset(0)'; }); });
    }
    anim = true; poke(); emit();
    if (cb.onSlide) cb.onSlide(i);
    animT = setTimeout(function () { finishAnim(false); }, 420);
  }
  function go(k) {
    k = Math.max(0, Math.min(n - 1, k | 0));
    if (blank !== 'none') { setBlank('none'); return; }
    k = nearestVis(k, k >= i ? 1 : -1);
    goAnim(k, false, k >= i ? 1 : -1);
  }
  function next() {
    if (blank !== 'none') { setBlank('none'); return; }
    if (atEnd) { cmdExit(); return; }
    var nx = nextVis(i);
    if (nx >= 0) goAnim(nx, false, 1); else goAnim(i, true, 1);
  }
  function prev() {
    if (blank !== 'none') { setBlank('none'); return; }
    if (atEnd) { atEnd = false; i = nearestVis(i, -1); draw(); return; }
    var pv = prevVis(i);
    if (pv >= 0) goAnim(pv, false, -1); else poke();
  }
  function cmdExit() { if (satellite && bus) bus.send({ type: 'exit' }); exit(); }

  function applyState(m) {
    if (!on) return;
    var st = SLPresent.cleanState(m);
    if (typeof st.n === 'number' && st.n) n = st.n;
    atEnd = !!st.atEnd;
    i = Math.max(0, Math.min(n - 1, st.i));
    blank = st.blank;
    if (st.tool) tool = st.tool;
    if (st.color) color = st.color;
    if (typeof m.keep === 'boolean') keepOn = m.keep;
    if (Array.isArray(m.ink) && !atEnd && slides[i]) inkMap[sid(i)] = SLPresent.inkIn(m.ink);
    if (typeof st.elapsed === 'number') { elapsed = st.elapsed; t0 = Date.now() - elapsed * 1000; }
    running = !!st.running;
    draw();
    showTime();
  }

  /* ---------- idle ---------- */
  function poke() {
    if (!on) return;
    el.classList.remove('idle'); clearTimeout(idleT);
    if (!presenter) idleT = setTimeout(function () { if (on && !numBuf && !drawing) el.classList.add('idle'); }, IDLE);
  }

  /* ---------- timer ---------- */
  function nowElapsed() { return running ? Math.max(0, Math.floor((Date.now() - t0) / 1000)) : elapsed; }
  function showTime() {
    if (timeEl) timeEl.textContent = SLPresent.formatTimer(nowElapsed());
    var p = $('show-pause'); if (p) p.textContent = running ? 'Pause' : 'Resume';
  }
  function tick() { if (!on) return; showTime(); if (!satellite && running && (nowElapsed() % 5 === 0)) emit(); }
  function toggleTimer() {
    if (satellite) { cmd({ type: 'timer', cmd: 'pause' }); return; }
    if (running) { elapsed = nowElapsed(); running = false; }
    else { t0 = Date.now() - elapsed * 1000; running = true; }
    showTime(); emit();
  }
  function resetTimer() {
    if (satellite) { cmd({ type: 'timer', cmd: 'reset' }); return; }
    elapsed = 0; t0 = Date.now(); running = true; showTime(); emit();
  }

  /* ---------- tools / blank / ink ---------- */
  function setTool(t, c) {
    if (satellite && arguments.length) { /* applied via state */ }
    tool = (t === 'pen' || t === 'laser' || t === 'erase') ? t : (t === tool ? '' : t);
    if (tool !== 'pen' && tool !== 'laser' && tool !== 'erase') tool = '';
    if (c) color = SLPresent.cleanStroke({ tool: 'pen', color: c, pts: [{ x: 0, y: 0 }] }).color;
    if (tool !== 'laser' && laserEl) laserEl.hidden = true;
    syncTools(); poke(); if (!satellite) emit();
  }
  function setBlank(v) {
    var nx = SLPresent.cleanBlank(v);
    if (v === 'toggle-black') nx = blank === 'black' ? 'none' : 'black';
    if (v === 'toggle-white') nx = blank === 'white' ? 'none' : 'white';
    blank = nx; syncTools(); poke(); if (!satellite) emit();
  }
  function setKeep(onKeep) {
    keepOn = !!onKeep; syncTools();
    if (keepOn && !satellite && !atEnd) persistInk(true);
    if (!satellite) emit();
  }
  function persistInk(record) {
    if (satellite || atEnd || !slides[i] || !cb.onKeep) return;
    cb.onKeep(slides[i], SLPresent.cloneInk(inkOf(i)), !!record);
  }
  function clearInk() {
    if (satellite) { cmd({ type: 'clear' }); return; }
    if (atEnd) return;
    inkMap[sid(i)] = []; stroke = null; paintInk();
    if (keepOn) persistInk(true);
    emit();
  }
  function ptFromEvent(e) {
    var r = fitEl.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: Math.max(0, Math.min(W, (e.clientX - r.left) / scale)), y: Math.max(0, Math.min(H, (e.clientY - r.top) / scale)) };
  }
  function startInk(e) {
    if (atEnd || satellite) return;
    var p = ptFromEvent(e); if (!p) return;
    drawing = true; stroke = { tool: tool === 'erase' ? 'erase' : 'pen', color: color, width: tool === 'erase' ? 8 : 4, pts: [{ x: p.x, y: p.y }] };
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ }
    paintInk(); poke();
  }
  function moveInk(e) {
    if (!drawing || !stroke) return;
    var p = ptFromEvent(e); if (!p) return;
    SLPresent.addPoint(stroke, p.x, p.y, 1.6);
    paintInk();
  }
  function endInk() {
    if (!drawing) return;
    drawing = false;
    if (stroke && stroke.pts && stroke.pts.length) {
      var list = inkOf(i);
      if (list.length < SLPresent.MAX_STROKES) list.push(SLPresent.cleanStroke(stroke) || stroke);
      if (keepOn) persistInk(false);
      emit();
    }
    stroke = null; paintInk(); poke();
  }
  function moveLaser(e) {
    if (tool !== 'laser' || !laserEl || atEnd) return;
    var r = fitEl.getBoundingClientRect();
    laserEl.hidden = false;
    laserEl.style.left = (e.clientX - r.left) + 'px';
    laserEl.style.top = (e.clientY - r.top) + 'px';
    poke();
  }

  /* ---------- keys ---------- */
  function onKey(e) {
    if (!on) return;
    var k = e.key;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (k === 'Enter') e.preventDefault();
      e.stopPropagation(); return;
    }
    e.stopPropagation();
    if (/^[0-9]$/.test(k)) {
      e.preventDefault(); numBuf = (numBuf + k).slice(-4); countEl.textContent = 'Go to ' + numBuf;
      el.classList.remove('idle'); clearTimeout(numT); numT = setTimeout(function () { numBuf = ''; if (on) countEl.textContent = atEnd ? 'End' : (visPos(i) + ' / ' + visAll().length); }, 3000); return;
    }
    if (k === 'Enter' && numBuf) {
      e.preventDefault(); var t = parseInt(numBuf, 10); numBuf = ''; clearTimeout(numT);
      if (t >= 1) {
        var v = visAll(); var tgt = v[Math.max(0, Math.min(v.length, t) - 1)];
        cmd({ type: 'go', i: tgt });
      } else draw();
      return;
    }
    if (numBuf && k !== 'Shift') { numBuf = ''; clearTimeout(numT); }
    if (k === 'Escape') { e.preventDefault(); cmdExit(); return; }
    if (k === 'b' || k === 'B') { e.preventDefault(); cmd({ type: 'blank', blank: 'toggle-black' }); return; }
    if (k === 'w' || k === 'W') { e.preventDefault(); cmd({ type: 'blank', blank: 'toggle-white' }); return; }
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'Spacebar' || k === 'PageDown' || k === 'Enter' || k === 'n' || k === 'N') { e.preventDefault(); cmd({ type: 'next' }); return; }
    if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace' || k === 'p' || k === 'P') { e.preventDefault(); cmd({ type: 'prev' }); return; }
    if (k === 'Home') { e.preventDefault(); cmd({ type: 'go', i: visAll()[0] }); return; }
    if (k === 'End') { e.preventDefault(); var vv = visAll(); cmd({ type: 'go', i: vv[vv.length - 1] }); return; }
    if (k === 'F5' || k === 'Tab' || k === 'F6') { e.preventDefault(); return; }
    if (atEnd && k.length === 1) { e.preventDefault(); cmdExit(); return; }
  }

  /* ---------- tap zones + swipes ---------- */
  function onDown(e) {
    if (!on || e.target.closest('.show-ctl') || e.target.closest('#show-tools') || e.target.closest('#show-aside')) return;
    if (e.button > 0) return;
    if (blank !== 'none') { cmd({ type: 'blank', blank: 'none' }); return; }
    if (tool === 'pen' || tool === 'erase') { if (!satellite) startInk(e); return; }
    if (tool === 'laser') { moveLaser(e); return; }
    p0 = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onMove(e) {
    if (e.pointerType === 'mouse' || p0 || drawing) poke();
    if (drawing) { moveInk(e); return; }
    if (tool === 'laser' && (e.buttons || e.pointerType === 'mouse')) moveLaser(e);
  }
  function onUp(e) {
    poke();
    if (drawing) { endInk(); return; }
    if (!p0 || e.pointerId !== p0.id) return;
    var dx = e.clientX - p0.x, dy = e.clientY - p0.y, dt = Date.now() - p0.t; p0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) { if (dx < 0) cmd({ type: 'next' }); else cmd({ type: 'prev' }); return; }
    if (Math.abs(dx) + Math.abs(dy) > 16 || dt > 800) return;
    if (atEnd) { cmdExit(); return; }
    var r = el.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 3) cmd({ type: 'prev' }); else cmd({ type: 'next' });
  }

  function fillColours() {
    var box = el.querySelector('.pen-cols'); if (!box || box.childNodes.length) return;
    SLPresent.COLORS.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-c', c);
      b.title = c; b.style.background = c; if (c === '#ffffff') b.style.borderColor = '#9aa3ae';
      b.setAttribute('aria-label', 'Pen colour ' + c);
      box.appendChild(b);
    });
  }

  function enter(list, start, th, opts) {
    if (on || !list || !list.length) return false;
    opts = opts || {};
    theme = th || 'light';
    master = opts.master || (opts.deck && opts.deck.master) || {};
    slides = list; n = list.length;
    i = nearestVis(Math.max(0, Math.min(n - 1, start | 0)), 1);
    atEnd = false; numBuf = '';
    presenter = !!opts.presenter; satellite = !!opts.satellite; sessionKey = opts.key || '';
    popupWin = opts.popup || null; keepOn = false; tool = ''; blank = 'none'; color = '#ef4444';
    inkMap = {}; stroke = null; drawing = false; anim = false; reduce = prefersReduce();
    elapsed = 0; t0 = Date.now(); running = true;
    on = true; mode = 'overlay';
    el.hidden = false; el.classList.toggle('presenter', presenter);
    var aside = $('show-aside'); if (aside) aside.hidden = !presenter;
    document.documentElement.classList.add('presenting');
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) { /* */ }
    el.focus({ preventScroll: true });
    if (bus) { bus.close(); bus = null; }
    if (sessionKey) {
      bus = openBus(sessionKey);
      if (satellite) bus.send({ type: 'hello' });
    }
    fit(); draw(); wake(); showTime();
    clearInterval(tickT); tickT = setInterval(tick, 1000);
    if (!satellite) {
      reqFs(el).then(function () { if (on && fsEl()) { mode = 'fullscreen'; el.classList.add('fs'); } fit(); }, function () { mode = 'overlay'; fit(); });
    }
    if (satellite) {
      /* only promote to owner if this window was opened alone (no opener); otherwise wait for the audience */
      if (!(window.opener && !window.opener.closed)) {
        waitOwner = setTimeout(function () {
          waitOwner = 0;
          if (on && satellite) { satellite = false; emit(); }
        }, 2500);
      }
    }
    if (cb.onEnter) cb.onEnter(i);
    if (!satellite) emit();
    return true;
  }
  function exit() {
    if (!on) return;
    on = false; var last = i, m = mode; mode = '';
    clearTimeout(idleT); clearTimeout(numT); clearTimeout(animT); clearTimeout(waitOwner); clearInterval(tickT);
    numBuf = ''; atEnd = false; p0 = null; drawing = false; stroke = null; anim = false; waitOwner = 0;
    if (bus) { try { if (!satellite) bus.send({ type: 'exit' }); } catch (_) { /* */ } bus.close(); bus = null; }
    try { if (popupWin && !popupWin.closed) popupWin.close(); } catch (_) { /* */ }
    popupWin = null; sessionKey = ''; presenter = false; satellite = false; master = {};
    el.hidden = true; el.classList.remove('idle', 'fs', 'presenter', 'tool-laser');
    var aside = $('show-aside'); if (aside) aside.hidden = true;
    document.documentElement.classList.remove('presenting');
    slideEl.innerHTML = ''; if (oldEl) oldEl.innerHTML = ''; if (nextEl) nextEl.innerHTML = '';
    if (ctx) ctx.clearRect(0, 0, W, H);
    unwake();
    if (m === 'fullscreen' || fsEl()) exitFs();
    if (cb.onExit) cb.onExit(last);
  }

  function init(o) {
    cb = o || {};
    el = $('show'); fitEl = $('show-fit'); zoomEl = $('show-zoom'); slideEl = $('show-slide');
    oldEl = $('show-slide-old'); endEl = $('show-end'); countEl = $('show-count');
    inkEl = $('show-ink'); laserEl = $('show-laser'); blankEl = $('show-blank');
    nextFit = $('show-next-fit'); nextEl = $('show-next-slide'); notesEl = $('show-notes'); timeEl = $('show-time');
    if (inkEl && inkEl.getContext) ctx = inkEl.getContext('2d');
    fillColours();
    addEventListener('keydown', onKey, true);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', function () { p0 = null; endInk(); });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', function () { if (laserEl) laserEl.hidden = true; });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    $('show-prev').onclick = function () { cmd({ type: 'prev' }); };
    $('show-next').onclick = function () { cmd({ type: 'next' }); };
    $('show-x').onclick = function () { cmdExit(); };
    if ($('show-pause')) $('show-pause').onclick = function () { cmd({ type: 'timer', cmd: 'pause' }); };
    if ($('show-reset')) $('show-reset').onclick = function () { cmd({ type: 'timer', cmd: 'reset' }); };
    var tools = $('show-tools');
    if (tools) tools.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.getAttribute('data-c')) { if (satellite) cmd({ type: 'tool', tool: 'pen', color: b.getAttribute('data-c') }); else { setTool('pen', b.getAttribute('data-c')); } return; }
      var t = b.getAttribute('data-tool');
      if (t) { if (satellite) cmd({ type: 'tool', tool: tool === t ? '' : t, color: color }); else setTool(tool === t ? '' : t, color); return; }
      var a = b.getAttribute('data-a');
      if (a === 'clear') cmd({ type: 'clear' });
      if (a === 'keep') { if (satellite) cmd({ type: 'keep', on: !keepOn }); else setKeep(!keepOn); }
    });
    addEventListener('resize', fit);
    function fsChange() {
      if (!on) { if (fsEl() === el) exitFs(); return; }
      if (fsEl()) { mode = 'fullscreen'; el.classList.add('fs'); }
      else if (mode === 'fullscreen' && !satellite) { mode = ''; exit(); return; }
      fit();
    }
    document.addEventListener('fullscreenchange', fsChange);
    document.addEventListener('webkitfullscreenchange', fsChange);
    document.addEventListener('visibilitychange', function () { if (on && document.visibilityState === 'visible') wake(); });
    try {
      if (window.matchMedia) {
        var mq = matchMedia('(prefers-reduced-motion: reduce)');
        var onMq = function () { reduce = prefersReduce(); };
        if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
      }
    } catch (_) { /* */ }
  }
  window.SLShow = { init: init, enter: enter, exit: exit, next: next, prev: prev, go: go,
    on: function () { return on; }, mode: function () { return mode; }, index: function () { return i; }, atEnd: function () { return atEnd; },
    locked: function () { return !!lock; }, presenter: function () { return presenter; },
    setPopup: function (w) { popupWin = w; } };
})();
