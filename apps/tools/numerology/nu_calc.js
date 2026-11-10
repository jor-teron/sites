/* NU1 Numerology — pure calculations, no DOM. Usable from the page or from node.
   Readings that use these numbers are traditional, not facts.
   Y-rule: A, E, I, O, U are always vowels; Y is a vowel unless it sits next to A, E, I, O or U.
   Personal Year uses the calendar year (from 1 January), plus birth month and day.
   Master numbers 11, 22 and 33 are kept unreduced. Accented Latin letters are folded to A–Z. */
(function (root) {
  'use strict';

  var PYTH = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9,
    J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9,
    S: 1, T: 2, U: 3, V: 4, W: 5, X: 6, Y: 7, Z: 8
  };
  var CHAL = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 8, G: 3, H: 5, I: 1,
    J: 1, K: 2, L: 3, M: 4, N: 5, O: 7, P: 8, Q: 1, R: 2,
    S: 3, T: 4, U: 6, V: 6, W: 6, X: 5, Y: 1, Z: 7
  };

  var MEANING = {
    1: 'Independence, new starts and leading the way.',
    2: 'Cooperation, patience and working well with others.',
    3: 'Expression, creativity and a sociable outlook.',
    4: 'Steady work, order and building something solid.',
    5: 'Freedom, change, travel and curiosity.',
    6: 'Care, home, family and responsibility for others.',
    7: 'Thought, study, quiet and looking beneath the surface.',
    8: 'Drive, results and a practical, worldly ambition.',
    9: 'Compassion, endings and a concern for the wider world.',
    11: 'A master number: intuition, inspiration and heightened sensitivity.',
    22: 'A master number: a practical visionary, building something large.',
    33: 'A master number: teaching, healing and care on a wide scale.'
  };

  var YEAR_MEANING = {
    1: 'A year for starting things and standing on your own.',
    2: 'A year for patience, partnership and the details.',
    3: 'A year for expressing yourself and being around people.',
    4: 'A year for steady work, order and foundations.',
    5: 'A year of change, movement and trying new things.',
    6: 'A year for home, family and looking after others.',
    7: 'A year for study, rest and looking inward.',
    8: 'A year for work, results and material goals.',
    9: 'A year of endings, clearing out and giving back.',
    11: 'A master year: strong intuition and bigger inspiration.',
    22: 'A master year: a chance to build something lasting.',
    33: 'A master year: teaching, healing or care at a larger scale.'
  };

  // Fixed Life Path compatibility, symmetric, scores 0–100. Traditional, not a prediction.
  var COMPAT = {
    '1-1': 70, '1-2': 40, '1-3': 75, '1-4': 35, '1-5': 90, '1-6': 50, '1-7': 65, '1-8': 60, '1-9': 55, '1-11': 45, '1-22': 40, '1-33': 50,
    '2-2': 80, '2-3': 50, '2-4': 85, '2-5': 45, '2-6': 80, '2-7': 55, '2-8': 70, '2-9': 60, '2-11': 85, '2-22': 70, '2-33': 80,
    '3-3': 80, '3-4': 40, '3-5': 75, '3-6': 85, '3-7': 45, '3-8': 50, '3-9': 90, '3-11': 55, '3-22': 45, '3-33': 85,
    '4-4': 75, '4-5': 40, '4-6': 65, '4-7': 50, '4-8': 90, '4-9': 45, '4-11': 70, '4-22': 90, '4-33': 65,
    '5-5': 80, '5-6': 50, '5-7': 70, '5-8': 45, '5-9': 65, '5-11': 50, '5-22': 40, '5-33': 55,
    '6-6': 80, '6-7': 40, '6-8': 70, '6-9': 85, '6-11': 75, '6-22': 65, '6-33': 90,
    '7-7': 85, '7-8': 45, '7-9': 50, '7-11': 70, '7-22': 55, '7-33': 45,
    '8-8': 75, '8-9': 50, '8-11': 60, '8-22': 85, '8-33': 70,
    '9-9': 80, '9-11': 60, '9-22': 50, '9-33': 85,
    '11-11': 80, '11-22': 70, '11-33': 75,
    '22-22': 80, '22-33': 70,
    '33-33': 80
  };

  function maps(system) {
    return system === 'chaldean' ? CHAL : PYTH;
  }

  function isMaster(n) {
    return n === 11 || n === 22 || n === 33;
  }

  function digitSum(n) {
    n = Math.abs(Math.floor(Number(n) || 0));
    var s = 0;
    while (n > 0) { s += n % 10; n = Math.floor(n / 10); }
    return s;
  }

  function reduce(n) {
    n = Math.abs(Math.floor(Number(n) || 0));
    while (n > 9 && !isMaster(n)) n = digitSum(n);
    return n;
  }

  function parseISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1) return null;
    var dim = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var leap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
    if (leap) dim[2] = 29;
    if (d > dim[mo]) return null;
    return { y: y, m: mo, d: d };
  }

  function fold(s) {
    s = String(s || '');
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* old engine */ }
    return s;
  }

  function wordsOf(name) {
    return fold(name).toUpperCase().replace(/[^A-Z]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  }

  function isVowelAt(word, i) {
    var ch = word.charAt(i);
    if ('AEIOU'.indexOf(ch) >= 0) return true;
    if (ch !== 'Y') return false;
    var prev = i > 0 ? word.charAt(i - 1) : '';
    var next = i < word.length - 1 ? word.charAt(i + 1) : '';
    // indexOf('') is 0 in JS, so only test letters that are actually present
    if (prev && 'AEIOU'.indexOf(prev) >= 0) return false;
    if (next && 'AEIOU'.indexOf(next) >= 0) return false;
    return true;
  }

  function nameParts(name, system, which) {
    var map = maps(system);
    var words = wordsOf(name);
    var total = 0, used = '';
    for (var w = 0; w < words.length; w++) {
      var word = words[w];
      for (var i = 0; i < word.length; i++) {
        var ch = word.charAt(i);
        var v = map[ch];
        if (v == null) continue;
        var vow = isVowelAt(word, i);
        if (which === 'vowels' && !vow) continue;
        if (which === 'consonants' && vow) continue;
        total += v;
        used += ch;
      }
    }
    return { total: total, reduced: total ? reduce(total) : 0, letters: used };
  }

  function lifePath(iso) {
    var p = parseISO(iso);
    if (!p) return null;
    var month = reduce(p.m), day = reduce(p.d), year = reduce(p.y);
    var total = month + day + year;
    return { month: month, day: day, year: year, total: total, reduced: reduce(total) };
  }

  function birthday(iso) {
    var p = parseISO(iso);
    if (!p) return null;
    return reduce(p.d);
  }

  function personalYear(iso, asOf) {
    var b = parseISO(iso), t = parseISO(asOf);
    if (!b || !t) return null;
    return reduce(reduce(b.m) + reduce(b.d) + reduce(t.y));
  }

  function personalMonth(iso, asOf) {
    var py = personalYear(iso, asOf), t = parseISO(asOf);
    if (py == null || !t) return null;
    return reduce(py + reduce(t.m));
  }

  function personalDay(iso, asOf) {
    var pm = personalMonth(iso, asOf), t = parseISO(asOf);
    if (pm == null || !t) return null;
    return reduce(pm + reduce(t.d));
  }

  function compatKey(a, b) {
    a = +a; b = +b;
    return a <= b ? a + '-' + b : b + '-' + a;
  }

  function compatLabel(score) {
    if (score >= 80) return 'Easy';
    if (score >= 65) return 'Good';
    if (score >= 50) return 'Fair';
    if (score >= 40) return 'Mixed';
    return 'Needs work';
  }

  function compatNote(a, b, score) {
    if (a === b) return 'Same Life Path: traditionally a strong recognition of each other, for better and for worse.';
    if (isMaster(a) || isMaster(b)) {
      return score >= 65
        ? 'One or both have a master number, traditionally seen as more intense, and this pairing is usually described as supportive.'
        : 'One or both have a master number, traditionally seen as more intense, so this pairing may take extra understanding.';
    }
    if (score >= 80) return 'Traditionally described as an easy, supportive pairing.';
    if (score >= 65) return 'Traditionally described as a good pairing, with a little give and take.';
    if (score >= 50) return 'Traditionally described as a fair pairing that works with a bit of effort.';
    if (score >= 40) return 'Traditionally described as a mixed pairing, with different paces and needs.';
    return 'Traditionally described as a more difficult pairing, needing patience.';
  }

  function compat(a, b) {
    a = reduce(+a); b = reduce(+b);
    var score = COMPAT[compatKey(a, b)];
    if (score == null) score = 50;
    return { a: a, b: b, score: score, label: compatLabel(score), note: compatNote(a, b, score) };
  }

  function profile(name, dob, system, asOf) {
    var lp = lifePath(dob);
    if (!lp) return null;
    system = system === 'chaldean' ? 'chaldean' : 'pythagorean';
    var expr = nameParts(name, system, 'all');
    var soul = nameParts(name, system, 'vowels');
    var pers = nameParts(name, system, 'consonants');
    var out = {
      system: system,
      lifePath: lp.reduced,
      lifePathParts: lp,
      expression: expr.reduced,
      soulUrge: soul.reduced,
      personality: pers.reduced,
      birthday: birthday(dob),
      hasName: !!expr.letters
    };
    if (asOf) {
      out.personalYear = personalYear(dob, asOf);
      out.personalMonth = personalMonth(dob, asOf);
      out.personalDay = personalDay(dob, asOf);
    }
    return out;
  }

  var api = {
    PYTH: PYTH,
    CHAL: CHAL,
    MEANING: MEANING,
    YEAR_MEANING: YEAR_MEANING,
    COMPAT: COMPAT,
    reduce: reduce,
    digitSum: digitSum,
    isMaster: isMaster,
    parseISO: parseISO,
    fold: fold,
    wordsOf: wordsOf,
    isVowelAt: isVowelAt,
    nameParts: nameParts,
    lifePath: lifePath,
    birthday: birthday,
    personalYear: personalYear,
    personalMonth: personalMonth,
    personalDay: personalDay,
    compat: compat,
    meaning: function (n) { return MEANING[n] || ''; },
    yearMeaning: function (n) { return YEAR_MEANING[n] || MEANING[n] || ''; },
    profile: profile
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NuCalc = api;
})(this);
