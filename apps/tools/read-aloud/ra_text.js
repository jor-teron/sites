/* Read Aloud RA2 -- ra_text.js: strip basic markdown symbols, split text into sentences,
   word count and estimated reading time. No DOM. Usable from Node (module.exports). */
var RAText = (function () {
  var ABBR = /^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|U\.S|U\.K|No|Vol|pp|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)$/i;
  var WPM = 160;

  function stripMd(s) {
    s = String(s || '').replace(/\r\n/g, '\n');
    s = s.replace(/```[a-zA-Z0-9+-]*\n?([\s\S]*?)```/g, '$1');
    s = s.replace(/`([^`]+)`/g, '$1');
    s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
    s = s.replace(/^#{1,6}\s+/gm, '');
    s = s.replace(/^\s{0,3}>\s?/gm, '');
    s = s.replace(/^\s*[-*+]\s+/gm, '');
    s = s.replace(/^\s*\d+\.\s+/gm, '');
    s = s.replace(/^\s*[-*_=]{3,}\s*$/gm, '');
    s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
    s = s.replace(/(\*|_)(.*?)\1/g, '$2');
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function lastWord(s) {
    var t = s.replace(/["')\]]+$/g, '').trim();
    var parts = t.split(/\s+/);
    return parts[parts.length - 1] || '';
  }

  function isAbbrev(token) {
    var w = token.replace(/\.+$/, '');
    if (ABBR.test(w)) return true;
    if (/^[A-Za-z](?:\.[A-Za-z])+$/.test(w)) return true;
    if (/^[A-Z]$/.test(w)) return true;
    return false;
  }

  function sentences(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!s) return [];
    var out = [], buf = '', last = 0, re = /([.!?\u2026\u0964]+)(\s+|$)/g, m;
    while ((m = re.exec(s))) {
      buf += s.slice(last, m.index) + m[1];
      last = m.index + m[0].length;
      if (isAbbrev(lastWord(buf)) && last < s.length) { if (m[2]) buf += ' '; continue; }
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    }
    if (last < s.length) buf += s.slice(last);
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function wordCount(s) {
    s = String(s || '').trim();
    if (!s) return 0;
    return s.split(/\s+/).filter(Boolean).length;
  }

  function etaMinutes(words, rate) {
    words = +words || 0;
    rate = +rate || 1;
    if (rate < 0.1) rate = 0.1;
    if (words <= 0) return 0;
    return words / (WPM * rate);
  }

  function etaLabel(words, rate) {
    var m = etaMinutes(words, rate);
    if (!words) return '';
    if (m < 0.75) return 'less than a minute';
    var n = Math.max(1, Math.round(m));
    return 'about ' + n + ' min';
  }

  function metaLine(text, rate, extra) {
    var w = wordCount(text);
    var n = sentences(String(text || '').replace(/\s+/g, ' ').trim()).length;
    var parts = [];
    if (extra) parts.push(extra);
    if (w) parts.push(w + (w === 1 ? ' word' : ' words') + ' · ' + etaLabel(w, rate));
    if (n) parts.push(n + (n === 1 ? ' sentence' : ' sentences'));
    return parts.join(' · ');
  }

  return { stripMd: stripMd, sentences: sentences, wordCount: wordCount, etaMinutes: etaMinutes, etaLabel: etaLabel, metaLine: metaLine, WPM: WPM };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RAText;
