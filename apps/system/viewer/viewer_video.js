/*
 * Viewer videos (apps/system/viewer/viewer_video.js) — VW.video: the browser's own <video>
 * player (controls) plus play speed (remembered: 'sites-viewer.speed'), −10 / +10 s, and
 * resume: the place in each video is kept in localStorage 'sites-viewer.resume'
 * ({ key: { t, at } }, newest 60 only; key = drive|path|name|size) and taken up again on open
 * (not in the first / last 3 s; finished = forgotten). A format the browser can't play
 * (.mkv, .avi, … in most) shows "This browser can't play .mkv".
 *
 * API VW.video: show(url, entry, key), stop() (saves the place, pauses, lets go of the file),
 *               skip(seconds), active()
 */
(function () {
  'use strict';
  const { $ } = VW;
  const vid = $('vid');
  const RKEY = 'sites-viewer.resume', SKEY = 'sites-viewer.speed', CAP = 60;
  let key = '', on = false, lastSave = 0;

  const load = () => { try { return JSON.parse(localStorage.getItem(RKEY) || '{}') || {}; } catch (_) { return {}; } };
  function store(t) {
    if (!key) return;
    const m = load();
    if (t == null) delete m[key];
    else m[key] = { t: Math.round(t * 10) / 10, at: Date.now() };
    const ks = Object.keys(m).sort((a, b) => m[b].at - m[a].at);
    ks.slice(CAP).forEach((k) => delete m[k]);
    try { localStorage.setItem(RKEY, JSON.stringify(m)); } catch (_) { /* full / blocked */ }
  }
  function save() {
    if (!on || !key || !isFinite(vid.duration)) return;
    const t = vid.currentTime, d = vid.duration;
    if (vid.ended || t > d - 3) store(null);
    else if (t > 3) store(t);
  }
  function speed() { const v = parseFloat(localStorage.getItem(SKEY) || '1'); return v > 0 && v <= 4 ? v : 1; }

  function show(url, entry, k) {
    on = true; key = k;
    const ext = window.FileTypes.ext(entry.name);
    vid.onerror = () => { if (!on) return; vid.hidden = true; VW.say('This browser can\u2019t play .' + (ext || '?') + (ext ? ' videos' : '')); };
    vid.onloadedmetadata = () => {
      const r = load()[key];
      if (r && r.t > 3 && r.t < vid.duration - 3) { vid.currentTime = r.t; VW.toast('Resumed at ' + clock(r.t)); }
      vid.playbackRate = speed();
    };
    vid.ontimeupdate = () => { const n = Date.now(); if (n - lastSave > 2000) { lastSave = n; save(); } };
    vid.onpause = save;
    vid.onended = () => store(null);
    vid.onratechange = () => { $('speed').value = String(vid.playbackRate); };
    $('speed').value = String(speed());
    vid.hidden = false;
    vid.src = url;
  }
  function stop() {
    if (!on) return;
    save(); on = false; key = '';
    vid.onerror = vid.onloadedmetadata = vid.ontimeupdate = vid.onpause = vid.onended = null;
    try { vid.pause(); } catch (_) { /* gone */ }
    vid.removeAttribute('src'); vid.load();
    vid.hidden = true;
  }
  function skip(s) {
    if (!on || !isFinite(vid.duration)) return;
    vid.currentTime = Math.max(0, Math.min(vid.duration, vid.currentTime + s));
    VW.toast((s > 0 ? '+' : '\u2212') + Math.abs(s) + ' s');
  }
  const clock = (t) => { t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };

  $('back10').addEventListener('click', () => skip(-10));
  $('fwd10').addEventListener('click', () => skip(10));
  $('speed').addEventListener('change', () => {
    const v = parseFloat($('speed').value) || 1;
    try { localStorage.setItem(SKEY, String(v)); } catch (_) { /* blocked */ }
    if (on) vid.playbackRate = v;
  });

  VW.video = { show, stop, skip, active: () => on, el: vid };
})();
