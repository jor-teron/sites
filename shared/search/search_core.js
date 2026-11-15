/*
 * Hub search core (shared/search/search_core.js), H151 — the pure matching behind Hub Search,
 * moved unchanged out of apps/system/search/search.js (H48) so Settings (H152) and the App Hub (H153)
 * search the same way. No DOM except marked(), which builds text nodes only.
 *
 * window.HubSearchCore (and module.exports for the node tests, hub/tests/hub_shared_search.test.cjs):
 *   norm(s)                     lower case, accents dropped ('Café' → 'cafe')
 *   words(s)                    norm(s) split on anything not a-z / 0-9
 *   score(qw, name, more)       0 = no match. Every query word must match: name exact 100, name starts 80,
 *                               a name word starts 60, inside the name 40, else the best of more:
 *                               [[text, weight]] (a word starts = weight, inside = weight / 2).
 *   filter(list, qw, weights)   rows (with .name) scored into r.score, matches only, best first then A–Z.
 *                               The whole query at the start of the name ('show desk' → Show desktop) +50.
 *   hits(text, qw)              [[from, to]] ranges of the query words in text, sorted (null when norm()
 *                               changes the length, e.g. some accents: then nothing is marked).
 *   marked(text, qw, doc?)      <span> with the hits in <mark> (text nodes only, never innerHTML).
 */
(function (root) {
  'use strict';
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

  /** Score one item for the query words: 0 = no match. fields: { name, more: [[text, weight]] } */
  function score(qw, name, more) {
    const n = norm(name), nw = words(name);
    let total = 0;
    for (const w of qw) {
      let s = 0;
      if (n === w) s = 100;
      else if (n.startsWith(w)) s = 80;
      else if (nw.some((x) => x.startsWith(w))) s = 60;
      else if (n.replace(/[^a-z0-9]/g, '').includes(w)) s = 40;
      else {
        for (const [text, wt] of (more || [])) {
          const t = norm(text);
          if (!t) continue;
          if (words(text).some((x) => x.startsWith(w))) s = Math.max(s, wt);
          else if (t.includes(w)) s = Math.max(s, wt / 2);
        }
      }
      if (!s) return 0;
      total += s;
    }
    return total;
  }

  /** Matching rows, best first; each row keeps its score in r.score. Whole query at the start of the
   *  name ('show desk' → Show desktop) gets a bonus so it beats rows that only match word by word. */
  function filter(list, qw, weights) {
    const whole = qw.join(' ');
    return list.map((r) => {
      let s = score(qw, r.name, weights ? weights(r) : []);
      if (s && qw.length > 1 && words(r.name).join(' ').startsWith(whole)) s += 50;
      r.score = s;
      return r;
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  /** Where the query words are in text: sorted [from, to] ranges, or null when nothing can be marked. */
  function hits(text, qw) {
    const t = String(text || ''), low = norm(t);
    if (!qw || !qw.length || low.length !== t.length) return null;
    const out = [];
    qw.forEach((w) => { let i = low.indexOf(w); while (i >= 0) { out.push([i, i + w.length]); i = low.indexOf(w, i + w.length); } });
    return out.sort((a, b) => a[0] - b[0]);
  }

  /** Text with the query words marked (<mark>, built with text nodes only). */
  function marked(text, qw, doc) {
    const d = doc || root.document;
    const span = d.createElement('span');
    const t = String(text || ''), hs = hits(t, qw);
    if (!hs) { span.textContent = t; return span; }
    let at = 0;
    hs.forEach(([a, b]) => {
      if (a < at) a = at;
      if (b <= a) return;
      if (a > at) span.appendChild(d.createTextNode(t.slice(at, a)));
      const m = d.createElement('mark'); m.textContent = t.slice(a, b); span.appendChild(m);
      at = b;
    });
    if (at < t.length) span.appendChild(d.createTextNode(t.slice(at)));
    return span;
  }

  const api = { norm, words, score, filter, hits, marked };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.HubSearchCore = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
