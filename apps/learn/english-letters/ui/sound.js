(function () {
  'use strict';
  const E = window.English; let audio, tones = [];
  function unlock() {
    if (E.prefs.muted) return;
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch (_) { /* No Web Audio: silent practice. */ }
  }
  E.quiet = function () { E.stopSpeech(); tones.forEach(o => { try { o.stop(); } catch (_) {} }); tones = []; };
  E.tone = function (correct) {
    unlock(); if (!audio || E.prefs.muted) return;
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(correct ? 660 : 250, t); o.frequency.exponentialRampToValueAtTime(correct ? 880 : 210, t + .12);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.045, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .18);
    o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + .2); tones.push(o);
    o.onended = () => { tones = tones.filter(x => x !== o); o.disconnect(); g.disconnect(); };
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
})();
