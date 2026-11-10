(function () {
  'use strict';
  const H = window.Hindi;
  let voice;
  H.prefs = Object.assign({ audio: true, muted: false }, H.read('prefs', {}));
  H.stopSpeech = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); };
  function voices() {
    voice = 'speechSynthesis' in window ? speechSynthesis.getVoices().find(v => /^hi(?:-|_|$)/i.test(v.lang)) : null;
    H.hasVoice = !!voice;
    document.getElementById('voice-note').textContent = voice ? 'Hindi voice ready' : 'No Hindi voice on this device — use the written sound hints.';
  }
  H.speak = text => {
    H.stopSpeech();
    if (!H.prefs.audio || !voice) return false;
    const u = new SpeechSynthesisUtterance(text); u.lang = 'hi-IN'; u.voice = voice; u.rate = .75;
    speechSynthesis.speak(u); return true;
  };
  voices();
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', voices);
})();
