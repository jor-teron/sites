/* Dictionary DC-1 — pure logic (no DOM, no fetch): word normalising, which data shard holds a word, prefix search,
   simple word-ending guesses (dogs -> dog), closest-word suggestions (edit distance), word of the day, recent list
   and grouping senses by part of speech. Classic script: window.DictCore in the page, module.exports for node --test.
   Shard rules match tools/build_data.py (shard_key): first letter a-z else '0', plus one more char per split prefix. */
(function (root) {
  'use strict';
  var POS = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };

  function norm(s) {
    return String(s == null ? '' : s).replace(/[\u2018\u2019]/g, "'").replace(/_/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function letter(k) { var c = k.charAt(0); return c >= 'a' && c <= 'z' ? c : '0'; }
  function shardKey(word, split) {
    var k = norm(word), p = letter(k), set = {};
    (split || []).forEach(function (s) { set[s] = 1; });
    while (set[p]) { var c = k.charAt(p.length); p += c >= 'a' && c <= 'z' ? c : '_'; }
    return p;
  }

  // binary search in a sorted word list: first index whose word is >= q
  function lowerBound(list, q) {
    var lo = 0, hi = list.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (list[mid] < q) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function prefix(list, q, max) {
    q = norm(q); max = max || 8;
    if (!q || !list) return [];
    var out = [];
    for (var i = lowerBound(list, q); i < list.length && out.length < max && list[i].indexOf(q) === 0; i++) out.push(list[i]);
    return out;
  }

  // possible base words for an inflected form (tried only when the word itself is not found)
  function stems(word) {
    var w = norm(word), out = [];
    function add(s) { if (s.length > 1 && s !== w && out.indexOf(s) < 0) out.push(s); }
    var rules = [['ies', 'y'], ['ied', 'y'], ['ves', 'f'], ['ves', 'fe'], ['es', ''], ['s', ''], ['ed', ''], ['ed', 'e'],
      ['ing', ''], ['ing', 'e'], ['ier', 'y'], ['iest', 'y'], ['er', ''], ['est', ''], ['er', 'e'], ['est', 'e'], ['ly', '']];
    rules.forEach(function (r) {
      if (w.length > r[0].length + 1 && w.slice(-r[0].length) === r[0]) {
        var b = w.slice(0, -r[0].length);
        add(b + r[1]);
        if (!r[1] && /(ed|ing|er|est)$/.test(r[0]) && b.length > 2 && b.slice(-1) === b.slice(-2, -1)) add(b.slice(0, -1));   // running -> run
      }
    });
    return out;
  }

  // Levenshtein distance, stops early once it is past max
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var best = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function suggest(word, list, n) {
    var q = norm(word), max = q.length < 5 ? 1 : 2, hits = [];
    n = n || 6;
    (list || []).forEach(function (w) {
      var d = dist(q, w, max);
      if (d > max) return;
      var cp = 0;
      while (cp < q.length && q.charAt(cp) === w.charAt(cp)) cp++;
      hits.push([d, -cp, Math.abs(w.length - q.length), w]);   // closer, then same start, then same length
    });
    hits.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || (x[3] < y[3] ? -1 : 1); });
    return hits.slice(0, n).map(function (h) { return h[3]; });
  }

  // word of the day: same pick for everyone on a given local date
  function dayNumber(d) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  function wordOfDay(list, d) {
    if (!list || !list.length) return null;
    var n = dayNumber(d || new Date()), h = (n * 2654435761) % 4294967296;   // spread neighbouring days apart
    return list[h % list.length];
  }

  function addRecent(list, word, max) {
    var w = norm(word);
    max = max || 20;
    var out = (Array.isArray(list) ? list : []).filter(function (x) { return x !== w; });
    if (w) out.unshift(w);
    return out.slice(0, max);
  }

  // [[pos, def, ex, syn, ant], ...] -> [{pos, name, senses:[{def, ex, syn, ant}]}] in first-seen order
  function group(senses) {
    var out = [], at = {};
    (senses || []).forEach(function (s) {
      var p = s[0];
      if (!(p in at)) { at[p] = out.length; out.push({ pos: p, name: POS[p] || 'other', senses: [] }); }
      out[at[p]].senses.push({ def: s[1] || '', ex: s[2] || [], syn: s[3] || [], ant: s[4] || [] });
    });
    return out;
  }

  var api = { POS: POS, norm: norm, letter: letter, shardKey: shardKey, prefix: prefix, stems: stems, dist: dist,
    suggest: suggest, dayNumber: dayNumber, wordOfDay: wordOfDay, addRecent: addRecent, group: group };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DictCore = api;
})(this);
