(function (root) {
  'use strict';
  const E = root.English || (typeof require !== 'undefined' ? require('./words.js') : {});
  E.shuffle = function (items, rng = Math.random) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  E.units = function (word) { return Array.from(word || ''); };
  E.localDay = function (date = new Date()) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  };
  E.activity = function (old = {}, day = E.localDay()) {
    const stamp = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(s + 'T00:00:00Z') : NaN;
    const gap = (stamp(day) - stamp(old.day)) / 86400000;
    const count = Number.isInteger(old.count) && old.count > 0 ? old.count : 0;
    if (gap <= 0 && count) return { day: old.day, count, best: Math.max(old.best || 0, count) };
    const next = gap === 1 ? count + 1 : 1;
    return { day, count: next, best: Math.max(Number(old.best) || 0, next) };
  };
  E.gameStars = correct => correct >= 9 ? 3 : correct >= 7 ? 2 : correct >= 4 ? 1 : 0;
  E.gameModes = ['match', 'listen', 'first', 'spell', 'missing'];
  function letterOptions(target, rng) {
    const others = E.shuffle(E.letters.filter(l => l.id !== target.id), rng).slice(0, 3);
    return E.shuffle([target, ...others], rng);
  }
  E.createGame = function (mode, rng = Math.random) {
    if (!E.gameModes.includes(mode)) throw new Error('Unknown practice game');
    if (mode === 'match' || mode === 'listen') {
      const targets = E.shuffle(E.letters, rng).slice(0, 10);
      const questions = targets.map(target => {
        const showCapital = mode === 'listen' ? true : rng() < .5;
        return { target, options: letterOptions(target, rng), showCapital, answered: false, correct: false };
      });
      return { mode, questions, index: 0, correct: 0, paused: false, finished: false };
    }
    if (mode === 'first') {
      const pool = E.words.filter(w => E.letter(w.word[0]));
      const targets = E.shuffle(pool, rng).slice(0, 10);
      const questions = targets.map(target => {
        const letter = E.letter(target.word[0]);
        return { target, letter, options: letterOptions(letter, rng), answered: false, correct: false };
      });
      return { mode, questions, index: 0, correct: 0, paused: false, finished: false };
    }
    if (mode === 'spell') {
      const pool = E.words.filter(w => { const n = E.units(w.word).length; return n >= 3 && n <= 5; });
      const targets = E.shuffle(pool, rng).slice(0, 10);
      const questions = targets.map(target => {
        const tiles = E.shuffle(E.units(target.word).map((text, id) => ({ text, id })), rng);
        return { target, tiles, used: [], answered: false, correct: false };
      });
      return { mode, questions, index: 0, correct: 0, paused: false, finished: false };
    }
    // missing: blank one letter of a short picture word; the picture/meaning picks out the answer.
    const pool = E.words.filter(w => { const n = E.units(w.word).length; return n >= 3 && n <= 8; });
    const targets = E.shuffle(pool, rng).slice(0, 10);
    const questions = targets.map(target => {
      const chars = E.units(target.word);
      const blank = Math.floor(rng() * chars.length);
      const missing = chars[blank];
      const letter = E.letter(missing);
      const pattern = chars.map((ch, i) => i === blank ? '_' : ch).join('');
      return { target, pattern, blank, missing, letter, options: letterOptions(letter, rng), answered: false, correct: false };
    });
    return { mode, questions, index: 0, correct: 0, paused: false, finished: false };
  };
  E.current = g => g.questions[g.index];
  E.answer = function (g, value) {
    const q = E.current(g); if (g.paused || g.finished || !q || q.answered) return null;
    q.answered = true;
    const expect = g.mode === 'spell' ? q.target.word : g.mode === 'first' || g.mode === 'missing' ? q.letter.id : q.target.id;
    q.correct = value === expect;
    if (q.correct) g.correct++;
    return q.correct;
  };
  E.next = function (g) {
    const q = E.current(g); if (g.paused || g.finished || !q || !q.answered) return false;
    if (g.index + 1 === g.questions.length) g.finished = true; else g.index++;
    return true;
  };
  E.tile = function (g, index) {
    const q = E.current(g);
    if (g.paused || g.finished || g.mode !== 'spell' || q.answered || !Number.isInteger(index) || !q.tiles[index] || q.used.includes(index)) return false;
    q.used.push(index);
    return true;
  };
  E.built = g => E.current(g).used.map(i => E.current(g).tiles[i].text).join('');
  if (typeof module !== 'undefined') module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
