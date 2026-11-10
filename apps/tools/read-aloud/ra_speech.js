/* Read Aloud RA1 -- ra_speech.js: speechSynthesis wrapper.
   One utterance at a time (avoids Chrome's long-utterance cutoff). Handles voiceschanged delay.
   Pause uses speechSynthesis.pause when it works, otherwise cancels and restarts the same item on play. */
var RASpeech = (function () {
  var current = null, onEndFn = null, onErrFn = null, voiceWait = [];

  function available() { return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function'; }

  function voices() { return available() ? (speechSynthesis.getVoices() || []) : []; }

  function whenVoices(cb) {
    if (!available()) { cb([]); return; }
    var list = voices();
    if (list.length) { cb(list); return; }
    voiceWait.push(cb);
    function flush() {
      var v = voices();
      if (!v.length && !voiceWait.length) return;
      var fns = voiceWait.slice(); voiceWait = [];
      fns.forEach(function (fn) { try { fn(v); } catch (e) {} });
    }
    if (typeof speechSynthesis.addEventListener === 'function') {
      speechSynthesis.addEventListener('voiceschanged', flush);
    } else {
      speechSynthesis.onvoiceschanged = flush;
    }
    setTimeout(flush, 250);
    setTimeout(flush, 1000);
  }

  function pickVoice(list, savedURI) {
    list = list || [];
    if (savedURI) {
      var hit = list.filter(function (v) { return v.voiceURI === savedURI; })[0];
      if (hit) return hit;
    }
    var enIn = list.filter(function (v) { return /^en-IN/i.test(v.lang) || /India/i.test(v.name); });
    if (enIn.length) return enIn[0];
    var en = list.filter(function (v) { return /^en([-_]|$)/i.test(v.lang); });
    if (en.length) {
      var loc = en.filter(function (v) { return v.localService; });
      return loc[0] || en[0];
    }
    return list[0] || null;
  }

  function speak(text, opts, onEnd, onError) {
    stop();
    if (!available()) { if (onError) onError('missing'); return; }
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) { if (onEnd) onEnd('empty'); return; }
    opts = opts || {};
    var u = new SpeechSynthesisUtterance(text);
    current = u;
    onEndFn = onEnd;
    onErrFn = onError;
    u.rate = Math.max(0.75, Math.min(2, +opts.rate || 1));
    u.pitch = Math.max(0.5, Math.min(1.5, +opts.pitch || 1));
    if (opts.voice) {
      u.voice = opts.voice;
      if (opts.voice.lang) u.lang = opts.voice.lang;
    } else if (opts.lang) {
      u.lang = opts.lang;
    } else {
      u.lang = 'en-IN';
    }
    u.onend = function () {
      if (current !== u) return;
      current = null;
      var fn = onEndFn; onEndFn = onErrFn = null;
      if (fn) fn('end');
    };
    u.onerror = function (ev) {
      if (current !== u) return;
      current = null;
      var typ = ev && ev.error ? ev.error : 'error';
      var err = onErrFn, end = onEndFn; onEndFn = onErrFn = null;
      if (typ === 'canceled' || typ === 'interrupted') { if (end) end(typ); return; }
      if (err) err(typ);
    };
    try { speechSynthesis.speak(u); } catch (e) { current = null; if (onError) onError(String(e && e.message || e)); }
  }

  function pause() {
    if (!available() || !speechSynthesis.speaking) return false;
    try { speechSynthesis.pause(); } catch (e) { return false; }
    return !!speechSynthesis.paused;
  }

  function resume() {
    if (!available()) return false;
    if (speechSynthesis.paused) {
      try { speechSynthesis.resume(); return true; } catch (e) { return false; }
    }
    return false;
  }

  function stop() {
    onEndFn = onErrFn = null;
    current = null;
    if (available()) {
      try { speechSynthesis.cancel(); } catch (e) {}
    }
  }

  function speaking() { return available() && speechSynthesis.speaking && !speechSynthesis.paused; }
  function paused() { return available() && speechSynthesis.paused; }

  return { available: available, voices: voices, whenVoices: whenVoices, pickVoice: pickVoice, speak: speak, pause: pause, resume: resume, stop: stop, speaking: speaking, paused: paused };
})();
