/* Find My Device FD1 — the ring on the target: loud repeating WebAudio alarm at full volume, vibrate, full-screen card.
   FDRing.start(fromLabel) / stop() / active(). Auto-stops after 60 s. When autoplay blocks audio the card still shows
   with a 'Tap to sound' hint; a tap on the card resumes audio. */
(function () {
  'use strict';
  var ctx = null, beepT = 0, endT = 0, on = false, LIMIT = 60000;
  function $(id) { return document.getElementById(id); }
  function beep() {
    if (!ctx || ctx.state !== 'running') return;
    var t = ctx.currentTime;
    [0, 0.25].forEach(function (d, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = i ? 1400 : 1000; g.gain.value = 1;
      o.connect(g); g.connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.2);
    });
    try { if (navigator.vibrate) navigator.vibrate([400, 200, 400]); } catch (_) { /* */ }
  }
  function audio() {
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { ctx = null; }
    if (!ctx) { $('rc-hint').hidden = true; return; }
    var p = ctx.state === 'running' ? null : ctx.resume();
    $('rc-hint').hidden = ctx.state === 'running';
    if (p && p.then) p.then(function () { $('rc-hint').hidden = ctx.state === 'running'; }, function () { /* blocked */ });
  }
  function start(from) {
    $('rc-from').textContent = from || 'another device';
    $('ringcard').hidden = false; on = true; audio();
    clearInterval(beepT); beepT = setInterval(beep, 1000); beep();
    clearTimeout(endT); endT = setTimeout(stop, LIMIT);
  }
  function stop() {
    on = false; clearInterval(beepT); clearTimeout(endT); beepT = endT = 0;
    var c = $('ringcard'); if (c) c.hidden = true;
    try { if (navigator.vibrate) navigator.vibrate(0); } catch (_) { /* */ }
  }
  document.addEventListener('DOMContentLoaded', function () {});
  window.addEventListener('load', function () {
    $('rc-stop').onclick = function (e) { e.stopPropagation(); stop(); };
    $('ringcard').onclick = function () { if (on) audio(); };
  });
  window.FDRing = { start: start, stop: stop, active: function () { return on; }, LIMIT: LIMIT };
})();
