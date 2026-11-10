/* Hub Office Slides SL1 — the one save module (SLSave). localStorage, with a memory fallback (like Base BS3a):
     'slides-settings-v1'    = { theme:'system'|'light'|'dark' }   (default dark; 'system' follows the Hub's sites-hub.theme, else the OS)
     'slides-decks-v1'       = { current:'<id>', decks:[{ id, name, updated, count }] }   (the deck list, newest first)
     'slides-deck-v1:<id>'   = { id, name, created, updated, cur, fmt, theme, slides:[{ id, layout, title, body, body2, bg, pics }] }
   body / title are rich documents (SLText, SL5): { paragraphs:[{ runs:[{ text, b, i, u, size, color, hl }], level, align, list }] }.
   A leading TAB in a legacy plain body = indented one level (the .hslides file uses paragraphs, or {text, level} in v1/v2).
   SL3: fmt = 3 (SL1 / SL2 records have none), theme = deck theme id (missing = 'light', the SL1 / SL2 look),
     layout (missing = 'tc', Title + Content), body2 (right column of Two Columns), bg ('#rrggbb' per-slide background
     override, '' = the theme's), pics = [{ id, key, x, y, w, h, iw, ih, fit:'cover'|'contain', inl }] in 960 x 540 design px.
     A picture's data URL lives in IndexedDB (slides_pics.js) under `key`; only pictures that could not be stored there
     (inl: true) carry `src` in this record. Missing fields = the old defaults, so SL1 / SL2 decks open unchanged.
     Legacy (SL1 / SL2): 'slides-deck-v1:<id>' = { id, name, created, updated, cur, slides:[{ id, title, body }] }
   SL5: fmt = 4; title / body / body2 are documents (plain strings on an older record are migrated on load, nothing dropped);
     tboxes = [{ id, x, y, w, h, doc }] free text boxes in 960 x 540 design px. Older fmt 3 / no-fmt records open unchanged.
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
  /* SL3 layouts + deck themes (ids are stored; names are shown) */
  var LAYOUTS = [['title', 'Title'], ['tc', 'Title + Content'], ['two', 'Two Columns'], ['sec', 'Section Header'],
    ['pic', 'Picture + Caption'], ['to', 'Title Only'], ['blank', 'Blank']];
  /* SL3 ships two deck themes. To add one: an entry here + a .slide.th-<id> rule in slides.css (the CSS variables
     --s-bg --s-tc --s-fg --s-acc --s-mut --s-ph --s-em --s-ft --s-fb --s-tw --s-line). Unknown ids load as 'light'. */
  var THEMES = [['light', 'Light'], ['dark', 'Dark']];
  function ids(a) { return a.map(function (x) { return x[0]; }); }
  var LAY_IDS = ids(LAYOUTS), THEME_IDS = ids(THEMES);
  function num(x, lo, hi, d) { x = +x; return isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x * 10) / 10)) : d; }
  function cleanPic(p) {
    p = p && typeof p === 'object' ? p : {};
    var key = typeof p.key === 'string' && /^[a-z0-9-]{1,40}$/.test(p.key) ? p.key : '';
    var src = window.SLPics && SLPics.validSrc(p.src) ? p.src : '';
    if (!key && !src) return null;
    var w = num(p.w, 8, 4000, 320), h = num(p.h, 8, 4000, 180);
    return { id: str(p.id, 20) || uid(), key: key, src: src, x: num(p.x, -4000, 4000, 0), y: num(p.y, -4000, 4000, 0), w: w, h: h,
      iw: num(p.iw, 1, 20000, w) | 0, ih: num(p.ih, 1, 20000, h) | 0, fit: p.fit === 'contain' ? 'contain' : 'cover', z: isFinite(+p.z) ? Math.round(+p.z) : 0, inl: !!(p.inl || (src && !key)) };
  }
  function bodyListFor(lay) { return (lay === 'title' || lay === 'sec' || lay === 'pic') ? 'none' : 'bullet'; }
  function cleanSlide(s) {
    s = s && typeof s === 'object' ? s : {};
    var pics = (Array.isArray(s.pics) ? s.pics : []).slice(0, 50).map(cleanPic).filter(Boolean);
    var layout = LAY_IDS.indexOf(s.layout) >= 0 ? s.layout : 'tc';
    var bl = bodyListFor(layout);
    var tboxes = SLText.cleanBoxes(s.texts || s.tboxes || s.textboxes);
    tboxes.forEach(function (t) { if (!t.id) t.id = uid(); });
    return { id: str(s.id, 20) || uid(), layout: layout,
      title: SLText.fromFileTitle(s.title),
      body: (typeof s.body === 'string' || s.body == null) ? SLText.fromPlain(s.body || '', { max: 5000, list: bl }) : SLText.clean(s.body, { max: 5000, list: bl }),
      body2: (typeof s.body2 === 'string' || s.body2 == null) ? SLText.fromPlain(s.body2 || '', { max: 5000, list: 'bullet' }) : SLText.clean(s.body2, { max: 5000, list: 'bullet' }),
      bg: typeof s.bg === 'string' && /^#[0-9a-f]{6}$/i.test(s.bg) ? s.bg.toLowerCase() : '', pics: pics, texts: tboxes, tboxes: tboxes };
  }
  /* a deep copy of text / boxes; pictures share the (immutable) bitmap data. Used by Duplicate and Undo */
  function cloneSlide(s, newIds) {
    var c = Object.assign({}, s, {
      title: SLText.clone(s.title, { max: 300, list: 'none', single: true }),
      body: SLText.clone(s.body, { max: 5000 }),
      body2: SLText.clone(s.body2, { max: 5000 }),
      pics: (s.pics || []).map(function (p) { var q = Object.assign({}, p); if (newIds) q.id = uid(); return q; }),
      texts: (s.texts || s.tboxes || []).map(function (t) { var q = Object.assign({}, t, { doc: SLText.clone(t.doc, { max: 2000 }) }); if (newIds) q.id = uid(); return q; })
    });
    c.tboxes = c.texts;
    if (newIds) c.id = uid();
    return c;
  }
  /* what goes to localStorage: pictures stored in IndexedDB lose their (long) src */
  function slim(d) {
    var o = Object.assign({}, d, { fmt: 4 });
    o.slides = d.slides.map(function (s) {
      if (!s.pics || !s.pics.length) return s;
      return Object.assign({}, s, { pics: s.pics.map(function (p) {
        var q = { id: p.id, key: p.key, x: p.x, y: p.y, w: p.w, h: p.h, iw: p.iw, ih: p.ih, fit: p.fit }; if (p.z) q.z = p.z;
        if (p.inl || !p.key) { q.src = p.src; q.inl = true; }
        return q;
      }) });
    });
    return o;
  }
  function cleanDeck(d, id) {
    d = d && typeof d === 'object' ? d : {};
    var out = { id: str(d.id, 20) || id || uid(), name: str(d.name, 80).trim() || 'Untitled deck',
      created: +d.created || Date.now(), updated: +d.updated || Date.now(), cur: 0,
      theme: THEME_IDS.indexOf(d.theme) >= 0 ? d.theme : 'light', slides: [] };
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
    var a = wr(DK + d.id, slim(d)); putIndex(d);
    if (SL.onSaved) SL.onSaved(a && !memOnly);
    return a;
  }
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });

  Object.assign(SL, {
    KEYS: { SET: SET, IDX: IDX, DECK: DK },
    uid: uid, cleanDeck: cleanDeck, cleanSlide: cleanSlide, cleanPic: cleanPic, cloneSlide: cloneSlide,
    LAYOUTS: LAYOUTS, THEMES: THEMES,
    /* every picture key used by any saved deck (start-up clean-up of the picture store) */
    picKeys: function () {
      var keep = {};
      index().decks.forEach(function (x) { var d = rd(DK + x.id); ((d && d.slides) || []).forEach(function (s) { ((s && s.pics) || []).forEach(function (p) { if (p && p.key) keep[p.key] = 1; }); }); });
      return keep;
    },
    onWarn: function (fn) { warnFn = fn; if (memOnly) fn(msg(why0)); },
    get: function (k) { return P[k]; },
    set: function (k, v) { P[k] = v; wr(SET, P); if (k === 'theme') theme(); },
    theme: theme,
    list: function () { return index().decks; },
    currentId: function () { return index().current; },
    load: function (id) { var d = rd(DK + id); return d ? cleanDeck(d, id) : null; },
    newDeck: function (name, slides, theme) {
      var d = cleanDeck({ id: uid(), name: name, slides: slides || [{}], theme: theme });
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
