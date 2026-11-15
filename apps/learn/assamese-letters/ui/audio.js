(function () {
  'use strict';
  const A = window.Assamese;
  let voice;
  A.prefs = Object.assign({ audio: true, muted: false }, A.read('prefs', {})); A.prefs.audio = true; // Sound button on the title bar is the only audio control
  A.stopSpeech = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); };
  // Prefer an Assamese voice (as-IN); fall back to Bengali (bn-IN, same script, close sounds), then Hindi (hi-IN).
  const ORDER = [['as', /^as(?:-|_|$)/i, 'Assamese voice ready'],
    ['bn', /^bn(?:-|_|$)/i, 'Bengali voice (no Assamese voice on this device): some sounds such as শ ষ স (x) and ৰ ৱ differ'],
    ['hi', /^hi(?:-|_|$)/i, 'Hindi voice (no Assamese or Bengali voice): it may not read Assamese script well']];
  A.pickVoice = list => { for (const [, re, note] of ORDER) { const v = (list || []).find(x => re.test(x.lang)); if (v) return { voice: v, note }; } return null; };
  function voices() {
    const pick = 'speechSynthesis' in window ? A.pickVoice(speechSynthesis.getVoices()) : null;
    voice = pick ? pick.voice : null;
    A.hasVoice = !!voice; A.voiceLang = voice ? voice.lang : ''; if(A.audioChanged) A.audioChanged();
    document.getElementById('voice-note').textContent = pick ? pick.note : 'No Assamese, Bengali or Hindi voice on this device — use the written sound hints.';
  }
  A.speak = text => {
    A.stopSpeech();
    if (!A.prefs.audio || A.prefs.muted || !voice) return false;
    const u = new SpeechSynthesisUtterance(text); u.lang = voice.lang; u.voice = voice; u.rate = .75;
    speechSynthesis.speak(u); return true;
  };
  voices();
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', voices);
})();
