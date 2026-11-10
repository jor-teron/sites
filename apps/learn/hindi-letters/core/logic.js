(function (root) {
  'use strict';
  const H = root.Hindi || (typeof require !== 'undefined' ? require('./alphabet.js') : {});
  H.traceGrade = (coverage, precision) => {
    const score = Math.max(0, Math.min(1, coverage)) * Math.max(0, Math.min(1, precision));
    return { score, stars: score >= .82 ? 3 : score >= .60 ? 2 : score >= .32 ? 1 : 0 };
  };
  H.read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem('learn.hindi-letters.' + key)); return v === null ? fallback : v; } catch (_) { return fallback; } };
  H.write = (key, value) => { try { localStorage.setItem('learn.hindi-letters.' + key, JSON.stringify(value)); } catch (_) { /* Private mode / full storage: practice still works. */ } };
  if (typeof module !== 'undefined') module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
