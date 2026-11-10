// AF-4c quiet WebAudio blips. Honours GameSettings sfx + masterVolume; mute is silent.
var AF_SOUND = (function () {
  var ctx, last = 0;
  function ac() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    return ctx;
  }
  function vol() {
    var S = window.AF_SETTINGS; if (S && S.get('sfx') === false) return 0;
    var m = S && S.get('masterVolume'); return (m == null ? 0.8 : m) * 0.35;
  }
  function beep(freq, dur, type, gain, slide) {
    var a = ac(), v = vol(); if (!a || v <= 0) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) { /* autoplay */ } }
    var now = a.currentTime; if (now - last < 0.03) return; last = now;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), now + dur);
    g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(Math.max(0.001, v * (gain || 1)), now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(a.destination); o.start(now); o.stop(now + dur + 0.02);
  }
  return {
    food: function () { beep(520, 0.09, 'triangle', 0.5, 1.4); },
    water: function () { beep(240, 0.14, 'sine', 0.55, 0.5); },
    dig: function () { beep(140, 0.07, 'square', 0.28, 0.7); },
    inspect: function () { beep(680, 0.05, 'sine', 0.25); },
    hatch: function () { beep(440, 0.1, 'triangle', 0.3, 1.6); },
    goal: function () { beep(620, 0.16, 'sine', 0.4, 1.5); },
    warn: function () { beep(180, 0.18, 'sawtooth', 0.25, 0.6); },
    unlock: function () { var a = ac(); if (a && a.state === 'suspended') try { a.resume(); } catch (e) {} }
  };
})();
