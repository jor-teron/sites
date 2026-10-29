/* Hub Office Slides SL1 — the one save module (SLSave). localStorage, with a memory fallback (like Base BS3a):
     'slides-settings-v1'    = { theme:'system'|'light'|'dark' }   (default dark; 'system' follows the Hub's sites-hub.theme, else the OS)
     'slides-decks-v1'       = { current:'<id>', decks:[{ id, name, updated, count }] }   (the deck list, newest first)
     'slides-deck-v1:<id>'   = { id, name, created, updated, cur, slides:[{ id, title, body }] }
   body = bullet text, one bullet per line; a leading TAB = indented one level (the .hslides file uses {text, level}).
   If storage is missing, full or throws, Slides keeps working in memory (SLSave.memOnly) and shows a banner
   (once, dismissable): changes then last only until the page closes (use Export). Saves never throw.
   Auto-save: SLSave.saveDeck(deck) is debounced 400 ms; flush() writes now (also on pagehide / hidden). */
(function () {
  'use strict';
  var SET = 'slides-settings-v1', IDX = 'slides-decks-v1', DK = 'slides-deck-v1:';
  var mem = {}, memOnly = false, warnFn = null, pending = null, t = 0;
  function probe() {
    try { var k = 'slides-probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (_) { return false; }
  }
  var why0 = '';
  function fail(why) {
    if (memOnly) return; memOnly = true; SL.memOnly = true; why0 = why;
    if (warnFn) warnFn(msg(why));
  }
  function msg(why) {
    return ('Storage ' + why + ': Slides is working in memory only. Changes will be lost when you close it (use Export to keep a copy).');
  }
  function wr(k, v) {
    var s; try { s = JSON.stringify(v); } catch (_) { return false; }
    mem[k] = s;   /* memory copy always kept, so a failed write never loses the session */
    if (memOnly) return false;
    try { localStorage.setItem(k, s); return true; } catch (e) { fail(e && e.name === 'QuotaExceededError' ? 'is full' : 'could not save'); return false; }
  }
  function rm(k) { delete mem[k]; if (memOnly) return; try { localStorage.removeItem(k); } catch (_) { /* */ } }
  var SL = { memOnly: false };
  var ok = probe();
  if (!ok) fail('is not available');
  /* reads go to memory first once something was written there (memory is always the newest copy) */
  function rd(k) {
    if (k in mem) { try { return JSON.parse(mem[k]); } catch (_) { return null; } }
    if (!ok) return null;
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; }
  }

  function uid() { return Math.random().toString(36).slice(2, 10); }
  function str(x, max) { return (typeof x === 'string' ? x : (typeof x === 'number' ? String(x) : '')).slice(0, max || 2000); }
  function cleanSlide(s) {
    s = s && typeof s === 'object' ? s : {};
    return { id: str(s.id, 20) || uid(), title: str(s.title, 300), body: str(s.body, 5000) };
  }
  function cleanDeck(d, id) {
    d = d && typeof d === 'object' ? d : {};
    var out = { id: str(d.id, 20) || id || uid(), name: str(d.name, 80).trim() || 'Untitled deck',
      created: +d.created || Date.now(), updated: +d.updated || Date.now(), cur: 0, slides: [] };
    var seen = {};
    (Array.isArray(d.slides) ? d.slides : []).slice(0, 500).forEach(function (s) {
      var c = cleanSlide(s); if (seen[c.id]) c.id = uid(); seen[c.id] = 1; out.slides.push(c);
    });
    if (!out.slides.length) out.slides.push(cleanSlide({}));
    out.cur = Math.max(0, Math.min(out.slides.length - 1, d.cur | 0));
    return out;
  }
  function index() {
    var x = rd(IDX); if (!x || typeof x !== 'object') x = {};
    var decks = (Array.isArray(x.decks) ? x.decks : []).filter(function (d) { return d && typeof d.id === 'string'; })
      .map(function (d) { return { id: d.id, name: str(d.name, 80) || 'Untitled deck', updated: +d.updated || 0, count: d.count | 0 }; });
    return { current: typeof x.current === 'string' ? x.current : '', decks: decks };
  }
  function putIndex(deck) {
    var x = index();
    x.decks = x.decks.filter(function (d) { return d.id !== deck.id; });
    x.decks.unshift({ id: deck.id, name: deck.name, updated: deck.updated, count: deck.slides.length });
    x.current = deck.id; wr(IDX, x);
  }

  /* ---------- settings + theme ---------- */
  var P = { theme: 'dark' }; Object.assign(P, rd(SET) || {});
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function hubTheme() { try { return localStorage.getItem('sites-hub.theme') || ''; } catch (_) { return ''; } }
  function theme() {
    var m = P.theme, hub = hubTheme();
    if (m === 'system' && (hub === 'light' || hub === 'dark')) m = hub;
    var dark = m === 'dark' || (m === 'system' && !!(mq && mq.matches));
    document.documentElement.classList.toggle('dark', dark);
    return dark;
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') theme(); });

  function flush() {
    clearTimeout(t); if (!pending) return true;
    var d = pending; pending = null; d.updated = Date.now();
    var a = wr(DK + d.id, d); putIndex(d);
    if (SL.onSaved) SL.onSaved(a && !memOnly);
    return a;
  }
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });

  Object.assign(SL, {
    KEYS: { SET: SET, IDX: IDX, DECK: DK },
    uid: uid, cleanDeck: cleanDeck, cleanSlide: cleanSlide,
    onWarn: function (fn) { warnFn = fn; if (memOnly) fn(msg(why0)); },
    get: function (k) { return P[k]; },
    set: function (k, v) { P[k] = v; wr(SET, P); if (k === 'theme') theme(); },
    theme: theme,
    list: function () { return index().decks; },
    currentId: function () { return index().current; },
    load: function (id) { var d = rd(DK + id); return d ? cleanDeck(d, id) : null; },
    newDeck: function (name, slides) {
      var d = cleanDeck({ id: uid(), name: name, slides: slides || [{}] });
      pending = d; flush(); return d;
    },
    saveDeck: function (d) { pending = d; clearTimeout(t); t = setTimeout(flush, 400); },
    flush: flush,
    deleteDeck: function (id) {
      if (pending && pending.id === id) { pending = null; clearTimeout(t); }
      rm(DK + id);
      var x = index(); x.decks = x.decks.filter(function (d) { return d.id !== id; });
      if (x.current === id) x.current = x.decks[0] ? x.decks[0].id : '';
      wr(IDX, x);
    },
    setCurrent: function (id) { var x = index(); x.current = id; wr(IDX, x); }
  });
  window.SLSave = SL;
  theme();
})();
