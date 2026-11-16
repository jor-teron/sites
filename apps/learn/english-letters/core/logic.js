(function (root) {
  'use strict';
  const E = root.English || (typeof require !== 'undefined' ? require('./alphabet.js') : {});
  E.traceGrade = (coverage, precision) => {
    const score = Math.max(0, Math.min(1, coverage)) * Math.max(0, Math.min(1, precision));
    return { score, stars: score >= .82 ? 3 : score >= .60 ? 2 : score >= .32 ? 1 : 0 };
  };
  E.read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem('learn.english-letters.' + key)); return v === null ? fallback : v; } catch (_) { return fallback; } };
  E.write = (key, value) => { try { localStorage.setItem('learn.english-letters.' + key, JSON.stringify(value)); } catch (_) { /* Private mode / full storage: practice still works. */ } };
  // Voice order: Indian English, then British, American, any other English voice.
  E.voiceOrder = [
    [/^en-IN/i, 'Indian English voice ready'],
    [/^en-GB/i, 'British English voice ready'],
    [/^en-US/i, 'American English voice ready'],
    [/^en(?:-|_|$)/i, 'English voice ready']
  ];
  E.pickVoice = function (list) {
    for (const [re, note] of E.voiceOrder) {
      const v = (list || []).find(x => re.test(x.lang));
      if (v) return { voice: v, note };
    }
    return null;
  };
  if (typeof module !== 'undefined') module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
