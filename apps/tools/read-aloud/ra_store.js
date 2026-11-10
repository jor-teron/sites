/* Read Aloud RA1 — ra_store.js: localStorage wrapper (keys "readaloud.*").
   Keys: theme (auto|light|dark), rate, pitch, voice (voiceURI), onlyNew, source (news|text),
   newsTab, text, pos.<source>[.<tab>] {i, id}. */
var RAStore = (function () {
  var P = 'readaloud.';
  var DEF = { theme: 'auto', rate: 1, pitch: 1, voice: '', onlyNew: false, source: 'news', newsTab: 'india', text: '' };
  function get(k, d) {
    try {
      var v = localStorage.getItem(P + k);
      if (v == null) return d !== undefined ? d : (DEF[k] != null ? DEF[k] : null);
      return JSON.parse(v);
    } catch (e) { return d !== undefined ? d : DEF[k]; }
  }
  function set(k, v) {
    try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function posKey(source, tab) { return 'pos.' + source + (source === 'news' && tab ? '.' + tab : ''); }
  function getPos(source, tab) { return get(posKey(source, tab), null); }
  function setPos(source, tab, v) { return set(posKey(source, tab), v); }
  return { get: get, set: set, DEF: DEF, getPos: getPos, setPos: setPos };
})();
