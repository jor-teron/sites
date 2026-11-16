(function () {
  'use strict';
  const E = window.English;
  let voice;
  E.prefs = Object.assign({ audio: true, muted: false }, E.read('prefs', {})); E.prefs.audio = true; // Sound button on the title bar is the only audio control
  E.stopSpeech = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); };
  function voices() {
    const pick = 'speechSynthesis' in window ? E.pickVoice(speechSynthesis.getVoices()) : null;
    voice = pick ? pick.voice : null;
    E.hasVoice = !!voice; E.voiceLang = voice ? voice.lang : ''; if (E.audioChanged) E.audioChanged();
    const note = document.getElementById('voice-note');
    if (note) note.textContent = pick ? pick.note : 'No English voice on this device — use the written letter names and phonics hints.';
  }
  E.speak = text => {
    E.stopSpeech();
    if (!E.prefs.audio || E.prefs.muted || !voice) return false;
    const u = new SpeechSynthesisUtterance(text); u.lang = voice.lang; u.voice = voice; u.rate = .9;
    speechSynthesis.speak(u); return true;
  };
  E.speakLetter = letter => E.speak('The letter ' + letter.nameSpoken);
  E.speakPhonics = letter => E.speak(letter.phrase);
  E.speakWord = word => E.speak(word);
  voices();
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', voices);
})();
