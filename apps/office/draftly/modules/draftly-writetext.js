/* ============================================================
   FILE: modules/draftly-writetext.js
   PROJECT: Writer (folder draftly)
   ROLE: DF21 writing helpers, text only (no DOM, works in Node):
         change case (UPPER / lower / Title Case), reading time,
         character count label, plain text for Read Aloud and the
         Read Aloud hand-off keys. The screen side is
         modules/draftly-write.js.
   RULES:
     Title Case  every word starts with a capital, the rest of the
                 word is lower case. A word is a run of letters,
                 marks and digits; an apostrophe inside a word
                 (don't, O’Neil) does not start a new word; a hyphen
                 does (well-known -> Well-Known). Small words (a, of,
                 the) are capitalised too, so the result is the same
                 every time.
     Reading     about 200 words a minute (silent reading), rounded
                 up to whole minutes: 1-200 words = 1 min, 201-400 =
                 2 min. 0 words = 0 min.
   ============================================================ */
(function (root) {
  'use strict';

  var T = {};
  T.RELEASE = 'DF21';
  T.WPM = 200;
  /* Read Aloud keeps at most this many characters of pasted text (its own cap). */
  T.RA_MAX = 200000;
  /* Hub entry and same-origin page of the Read Aloud app (apps/tools/read-aloud/). */
  T.RA_ENTRY = 'apps/tools/read-aloud/';
  T.RA_PAGE = '../../tools/read-aloud/read-aloud.html';
  /* Spell check default: off, as before DF21. */
  T.SPELL_DEFAULT = false;

  var WORD = /[\p{L}\p{M}\p{N}]/u;
  var MARK = /\p{M}/u;
  function isWord(ch) { return !!ch && WORD.test(ch); }
  function isApos(ch) { return ch === "'" || ch === '\u2019'; }

  /* Change the case of s. mode: 'upper' | 'lower' | 'title'.
     before: the text just before s in the same paragraph (only its last
     two characters are used), so Title Case knows whether s starts mid-word. */
  T.caseText = function caseText(s, mode, before) {
    s = String(s == null ? '' : s);
    if (mode === 'upper') return s.toUpperCase();
    if (mode === 'lower') return s.toLowerCase();
    if (mode !== 'title') return s;
    var prev = Array.from(String(before || '')).slice(-2);
    var p1 = prev.length ? prev[prev.length - 1] : '';
    var p2 = prev.length > 1 ? prev[prev.length - 2] : '';
    var out = '';
    Array.from(s).forEach(function (ch) {
      var inWord = isWord(p1) || (isApos(p1) && isWord(p2));
      if (isWord(ch)) out += (!inWord && !MARK.test(ch)) ? ch.toUpperCase() : ch.toLowerCase();
      else out += ch;
      p2 = p1; p1 = ch;
    });
    return out;
  };

  /* Whole minutes to read `words` at T.WPM, rounded up. */
  T.readMinutes = function readMinutes(words, wpm) {
    var w = Math.max(0, Math.floor(+words || 0));
    var r = +wpm > 0 ? +wpm : T.WPM;
    return w ? Math.ceil(w / r) : 0;
  };
  T.readLabel = function readLabel(words, wpm) {
    return T.readMinutes(words, wpm) + ' min read';
  };
  T.charLabel = function charLabel(n) {
    n = Math.max(0, Math.floor(+n || 0));
    return n.toLocaleString('en-IN') + (n === 1 ? ' character' : ' characters');
  };

  /* Clean one piece of editor text: zero-width spaces out, non-breaking spaces to spaces. */
  T.clean = function clean(s) {
    return String(s || '').replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
  };

  /* Paragraph pieces ({text, cont}) as Draftly.find.blocks gives them -> plain text.
     A piece with cont = true continues the previous paragraph (split across pages).
     Empty paragraphs are dropped; paragraphs are separated by a blank line. */
  T.plainFromBlocks = function plainFromBlocks(blocks) {
    var paras = [];
    (blocks || []).forEach(function (b) {
      var t = T.clean(b && b.text);
      if (b && b.cont && paras.length) paras[paras.length - 1] += t;
      else paras.push(t);
    });
    return T.tidy(paras.join('\n\n'));
  };

  /* Selection or document text -> what Read Aloud gets: trimmed lines,
     at most one blank line in a row, capped at T.RA_MAX characters. */
  T.tidy = function tidy(s) {
    s = T.clean(s).replace(/\r\n?/g, '\n');
    s = s.split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); }).join('\n');
    s = s.replace(/\n{3,}/g, '\n\n').trim();
    if (s.length > T.RA_MAX) s = s.slice(0, T.RA_MAX);
    return s;
  };

  /* localStorage writes that make Read Aloud open on its Text source with this text,
     from the start. Read Aloud stores JSON values under 'readaloud.*' (ra_store.js). */
  T.raHandoff = function raHandoff(text) {
    return {
      set: { 'readaloud.source': JSON.stringify('text'), 'readaloud.text': JSON.stringify(T.tidy(text)) },
      remove: ['readaloud.pos.text']
    };
  };

  /* Settings value -> spell check on? Anything but true is off. */
  T.spellOn = function spellOn(settings) {
    return !!(settings && settings.spellcheck === true);
  };

  /* Focus mode: class on <body> (ui/write.css hides the chrome). */
  T.FOCUS_CLASS = 'df-focus';

  if (root && root.Draftly) root.Draftly.writeText = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? (window.Draftly = window.Draftly || {}, window) : null);
