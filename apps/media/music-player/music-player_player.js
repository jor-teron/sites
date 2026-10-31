/* Music Player MP1 — playback. ONE <audio> element for everything; a song is an object URL of its File,
   created when it is played and revoked when the next one starts (nothing is decoded ahead of time).
   Queue = array of songs (from the app), order = play order (identity, or shuffled with the current song
   first), at = position in order. Repeat 'off' | 'all' | 'one'. Media Session: metadata + play / pause /
   previous / next / seek / stop, position state. Optional level bar (Web Audio analyser) created only when
   turned on, drawn only while visible and playing.
   window.MPPlayer = { audio, init(cb), setQueue(songs, start, o), play, pause, toggle, next, prev, seek, seekBy,
     setVolume, setMuted, setShuffle, setRepeat, current, queue, order, at, src, setVis, playNext(song), clear } */
(function () {
  'use strict';
  var A = new Audio(); A.preload = 'metadata'; A.id = 'mp-audio';
  var Q = [], O = [], at = -1, src = 'all', url = '', shuffle = false, repeat = 'off', cb = {}, errRun = 0;
  var pendingSeek = -1;
  function emit(n, a) { try { cb[n] && cb[n](a); } catch (e) { console.error(e); } }
  function ident(n) { var o = new Array(n); for (var i = 0; i < n; i++) o[i] = i; return o; }
  function shuffled(n, first) {
    var o = ident(n); for (var i = n - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = o[i]; o[i] = o[j]; o[j] = t; }
    if (first >= 0) { var k = o.indexOf(first); o.splice(k, 1); o.unshift(first); }
    return o;
  }
  function cur() { return at >= 0 && at < O.length ? Q[O[at]] : null; }

  function load(autoplay, pos) {
    var s = cur(); if (!s) return;
    if (url) { try { URL.revokeObjectURL(url); } catch (_) { /* */ } url = ''; }
    if (!s.e || !s.e.file) { emit('error', { song: s, missing: true }); return; }
    url = URL.createObjectURL(s.e.file);
    pendingSeek = pos > 0 ? pos : -1;
    A.src = url; A.load();
    meta(s); emit('track', s);
    if (autoplay) play();
  }
  function play() {
    if (!cur()) return Promise.resolve();
    if (!A.src) load(false, 0);
    if (vis.ctx && vis.ctx.state === 'suspended') vis.ctx.resume();
    var p = A.play(); if (p && p.catch) p.catch(function (e) { if (e && e.name !== 'AbortError') emit('blocked', e); });
    return p || Promise.resolve();
  }
  function pause() { A.pause(); }
  function toggle() { if (A.paused) play(); else pause(); }
  function go(i, autoplay) { if (!O.length) return; at = i; load(autoplay !== false, startPos(cur())); }
  function startPos(s) { return cb.startPos ? (cb.startPos(s) || 0) : 0; }
  function next(user) {
    if (!O.length) return;
    if (at + 1 < O.length) return go(at + 1, true);
    if (repeat === 'all' || user) {
      if (shuffle) { O = shuffled(Q.length, -1); }
      return go(0, repeat === 'all' || !A.paused);
    }
    A.pause(); emit('end');
  }
  function prev() {
    if (!O.length) return;
    if (A.currentTime > 3) seek(0);
    else if (at > 0) go(at - 1, true);
    else if (repeat === 'all' && O.length > 1) go(O.length - 1, true);
    else seek(0);
  }
  function seek(t) {
    if (!cur()) return;
    if (!isFinite(A.duration) || A.readyState < 1) { pendingSeek = Math.max(0, t); return; }
    A.currentTime = Math.max(0, Math.min(A.duration - 0.05, t)); posState();
  }
  function seekBy(d) { seek((A.currentTime || 0) + d); }
  function setQueue(songs, start, o) {
    o = o || {}; Q = songs.slice(); src = o.src || 'all';
    if (o.order && o.order.length === Q.length) O = o.order.slice();
    else O = shuffle ? shuffled(Q.length, start) : ident(Q.length);
    at = Math.max(0, O.indexOf(start)); if (at < 0) at = 0;
    if (!Q.length) { at = -1; clear(); return; }
    load(o.play !== false, o.pos != null ? o.pos : startPos(cur()));
  }
  function playNext(song) {
    var c = cur(); if (!c) { setQueue([song], 0, { src: src }); return; }
    var qi = Q.indexOf(song);
    if (qi < 0) { Q.push(song); qi = Q.length - 1; } else { if (song === c) return; O.splice(O.indexOf(qi), 1); }
    at = O.indexOf(Q.indexOf(c)); O.splice(at + 1, 0, qi); emit('queue');
  }
  function clear() { A.pause(); A.removeAttribute('src'); A.load(); if (url) { URL.revokeObjectURL(url); url = ''; } Q = []; O = []; at = -1; emit('track', null); }
  function setShuffle(b) {
    shuffle = !!b; var c = at >= 0 ? O[at] : -1;
    O = shuffle ? shuffled(Q.length, c) : ident(Q.length); at = c >= 0 ? O.indexOf(c) : -1; emit('queue');
  }
  function setRepeat(m) { repeat = ['off', 'all', 'one'].indexOf(m) >= 0 ? m : 'off'; A.loop = false; }

  A.addEventListener('loadedmetadata', function () {
    if (pendingSeek > 0 && isFinite(A.duration)) { A.currentTime = Math.min(pendingSeek, Math.max(0, A.duration - 0.5)); }
    pendingSeek = -1; errRun = 0; emit('meta', cur()); posState();
  });
  A.addEventListener('ended', function () {
    if (repeat === 'one') { A.currentTime = 0; play(); return; }
    next(false);
  });
  A.addEventListener('error', function () {
    var s = cur(); if (!s || !A.getAttribute('src')) return;
    errRun++; emit('error', { song: s });
    if (errRun < Math.min(Q.length, 8) && O.length > 1) setTimeout(function () { next(true); }, 700);
  });
  ['play', 'pause', 'playing', 'waiting'].forEach(function (n) { A.addEventListener(n, function () { msState(); emit('state', n); visLoop(); }); });
  A.addEventListener('timeupdate', function () { emit('time'); });
  A.addEventListener('durationchange', function () { emit('time'); });

  /* ---------- Media Session (lock screen, notification, media keys) ---------- */
  var MS = navigator.mediaSession;
  function meta(s) {
    if (!MS || !window.MediaMetadata) return;
    try {
      MS.metadata = new MediaMetadata({ title: s.t || s.e.name, artist: s.a || '', album: s.al || '',
        artwork: [{ src: new URL('music-player_icon.png', location.href).href, sizes: '192x192', type: 'image/png' }] });
    } catch (_) { /* */ }
  }
  function msState() { if (MS) try { MS.playbackState = !cur() ? 'none' : A.paused ? 'paused' : 'playing'; } catch (_) { /* */ } }
  function posState() {
    if (!MS || !MS.setPositionState || !isFinite(A.duration) || !A.duration) return;
    try { MS.setPositionState({ duration: A.duration, playbackRate: A.playbackRate || 1, position: Math.min(A.currentTime, A.duration) }); } catch (_) { /* */ }
  }
  var handlers = {
    play: function () { play(); }, pause: function () { pause(); }, stop: function () { pause(); seek(0); },
    previoustrack: function () { prev(); }, nexttrack: function () { next(true); },
    seekbackward: function (d) { seekBy(-((d && d.seekOffset) || 10)); }, seekforward: function (d) { seekBy((d && d.seekOffset) || 10); },
    seekto: function (d) { if (d && d.fastSeek && A.fastSeek) { A.fastSeek(d.seekTime); posState(); } else seek(d ? d.seekTime : 0); }
  };
  if (MS) Object.keys(handlers).forEach(function (k) { try { MS.setActionHandler(k, handlers[k]); } catch (_) { /* unsupported action */ } });
  A.addEventListener('seeked', posState); A.addEventListener('ratechange', posState);

  /* ---------- optional level bar ---------- */
  var vis = { on: false, ctx: null, an: null, data: null, cv: null, raf: 0, last: 0, peak: 0 };
  function setVis(on, canvas) {
    vis.on = !!on; if (canvas) vis.cv = canvas;
    if (vis.on && !vis.ctx) {
      try {
        var C = window.AudioContext || window.webkitAudioContext; vis.ctx = new C();
        var srcN = vis.ctx.createMediaElementSource(A); vis.an = vis.ctx.createAnalyser(); vis.an.fftSize = 256; vis.an.smoothingTimeConstant = 0.6;
        srcN.connect(vis.an); vis.an.connect(vis.ctx.destination); vis.data = new Uint8Array(vis.an.fftSize);
      } catch (e) { vis.on = false; vis.ctx = null; emit('visfail', e); }
    }
    if (vis.ctx && vis.ctx.state === 'suspended' && !A.paused) vis.ctx.resume();
    visLoop(); if (!vis.on) drawLevel(0);
    return vis.on;
  }
  function level() {
    if (!vis.an) return 0; vis.an.getByteTimeDomainData(vis.data);
    var s = 0; for (var i = 0; i < vis.data.length; i++) { var v = (vis.data[i] - 128) / 128; s += v * v; }
    return Math.min(1, Math.sqrt(s / vis.data.length) * 2.2);
  }
  function drawLevel(l) {
    var c = vis.cv; if (!c) return; var w = c.clientWidth | 0, h = c.clientHeight | 0; if (!w || !h) return;
    if (c.width !== w) c.width = w; if (c.height !== h) c.height = h;
    var g = c.getContext('2d'); g.clearRect(0, 0, w, h);
    vis.peak = Math.max(l, vis.peak - 0.015);
    var n = 24, gap = 3, bw = (w - gap * (n - 1)) / n, lit = Math.round(l * n), pk = Math.min(n - 1, Math.round(vis.peak * n));
    for (var i = 0; i < n; i++) {
      g.fillStyle = i < lit ? (i > n * 0.8 ? '#ef4444' : i > n * 0.6 ? '#f59e0b' : '#f97316') : (i === pk && vis.peak > 0.02 ? '#9aa3ae' : 'rgba(127,127,127,.22)');
      g.fillRect(Math.round(i * (bw + gap)), 0, Math.max(1, Math.floor(bw)), h);
    }
  }
  function visLoop() {
    if (vis.raf || !vis.on || A.paused || document.hidden) { if (A.paused && vis.on) drawLevel(0); return; }
    vis.raf = requestAnimationFrame(function f(t) {
      vis.raf = 0; if (!vis.on || A.paused || document.hidden) return;
      if (t - vis.last > 33) { vis.last = t; drawLevel(level()); }
      vis.raf = requestAnimationFrame(f);
    });
  }
  document.addEventListener('visibilitychange', visLoop);

  window.MPPlayer = {
    audio: A, init: function (c) { cb = c || {}; },
    setQueue: setQueue, play: play, pause: pause, toggle: toggle, next: next, prev: prev, seek: seek, seekBy: seekBy,
    setVolume: function (v) { A.volume = Math.max(0, Math.min(1, v)); }, setMuted: function (m) { A.muted = !!m; },
    setShuffle: setShuffle, setRepeat: setRepeat, setVis: setVis, playNext: playNext, clear: clear,
    current: cur, queue: function () { return Q; }, order: function () { return O; }, at: function () { return at; },
    src: function () { return src; }, shuffle: function () { return shuffle; }, repeat: function () { return repeat; },
    visOn: function () { return vis.on; }, visCtx: function () { return vis.ctx; }, handlers: handlers
  };
})();
