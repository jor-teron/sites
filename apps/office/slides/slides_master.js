/* Hub Office Slides SL8 — master, hide, sections and date helpers (SLMaster). No DOM, safe to load in Node for tests.
   Deck master: footer text, slide numbers, date, skip-on-title-slide. Per-slide override: foot = ''|hide|show,
   optional footer text. Hidden slides are skipped in Present and (by default) Print. Sections are named groups
   of consecutive slides (slide.sec = section id; deck.sections = [{ id, name, fold }]). */
(function (root) {
  'use strict';
  var MAX_FOOTER = 200, MAX_SEC = 40, MAX_SECTIONS = 50;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function str(x, max) { return (typeof x === 'string' ? x : (typeof x === 'number' ? String(x) : '')).slice(0, max || 2000); }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function cleanFooterText(s) { return str(s, MAX_FOOTER).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+/g, ' ').trim(); }
  function cleanFoot(s) { s = String(s || '').toLowerCase(); return s === 'hide' || s === 'show' ? s : ''; }
  function cleanSecName(s) { return str(s, MAX_SEC).replace(/\s+/g, ' ').trim(); }
  function cleanWhen(s) { s = String(s || ''); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
  function cleanMaster(m) {
    m = m && typeof m === 'object' && !Array.isArray(m) ? m : {};
    return {
      footer: cleanFooterText(m.footer),
      number: !!m.number,
      date: !!m.date,
      when: cleanWhen(m.when),
      skipTitle: m.skipTitle !== false && m.skipTitle !== 0 && m.skipTitle !== '0'
    };
  }
  function cloneMaster(m) { return cleanMaster(m); }
  function cleanSection(s) {
    s = s && typeof s === 'object' ? s : {};
    var id = str(s.id, 20);
    if (!id) return null;
    return { id: id, name: cleanSecName(s.name) || 'Section', fold: !!s.fold };
  }
  function cleanSections(arr) {
    var out = [], seen = {};
    (Array.isArray(arr) ? arr : []).forEach(function (s) {
      var c = cleanSection(s);
      if (!c || seen[c.id]) return;
      seen[c.id] = 1;
      if (out.length < MAX_SECTIONS) out.push(c);
    });
    return out;
  }
  function hidden(s) { return !!(s && s.hide); }
  function visIndices(slides) {
    var a = [];
    (slides || []).forEach(function (s, i) { if (!hidden(s)) a.push(i); });
    return a;
  }
  function visCount(slides) { return visIndices(slides).length; }
  function visIndex(slides, i) {
    var v = visIndices(slides), p = v.indexOf(i | 0);
    return p < 0 ? 0 : p + 1;
  }
  function isTitle(s) { return !!(s && s.layout === 'title'); }

  function formatDate(when, today) {
    var src = cleanWhen(when) || cleanWhen(today) || '';
    var d;
    if (src) {
      var p = src.split('-');
      d = new Date(+p[0], +p[1] - 1, +p[2]);
    } else d = new Date();
    if (!isFinite(d.getTime())) d = new Date();
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function footerFor(deck, i, o) {
    o = o || {};
    var slides = (deck && deck.slides) || [];
    var s = slides[i];
    if (!s) return null;
    var m = cleanMaster(deck && deck.master);
    var force = cleanFoot(s.foot);
    var text = cleanFooterText(s.footer != null && String(s.footer) !== '' ? s.footer : m.footer);
    var has = !!(text || m.number || m.date);
    if (!has) return null;
    if (force === 'hide') return null;
    if (force !== 'show' && m.skipTitle && isTitle(s)) return null;
    var num = '';
    if (m.number) {
      var v = visIndex(slides, i), n = visCount(slides);
      if (v && n) num = v + ' / ' + n;
    }
    var date = m.date ? formatDate(m.when, o.today) : '';
    if (!text && !date && !num) return null;
    return { text: text, date: date, num: num };
  }
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function footHTML(info) {
    if (!info) return '';
    var h = '<div class="s-foot">';
    h += '<span class="s-foot-text">' + esc(info.text) + '</span>';
    if (info.date) h += '<span class="s-foot-date">' + esc(info.date) + '</span>';
    if (info.num) h += '<span class="s-foot-num">' + esc(info.num) + '</span>';
    return h + '</div>';
  }

  /* consecutive runs; unsectioned (sec === '') is one run per gap */
  function runs(slides, sections) {
    slides = slides || [];
    var map = {};
    cleanSections(sections).forEach(function (s) { map[s.id] = s; });
    var out = [], i = 0;
    while (i < slides.length) {
      var id = str(slides[i].sec, 20);
      if (!id || !map[id]) id = '';
      var j = i;
      while (j + 1 < slides.length) {
        var nid = str(slides[j + 1].sec, 20);
        if (!nid || !map[nid]) nid = '';
        if (nid !== id) break;
        j++;
      }
      var meta = id && map[id] ? map[id] : { id: '', name: '', fold: false };
      out.push({ id: id, name: meta.name || '', fold: !!meta.fold, start: i, end: j, count: j - i + 1 });
      i = j + 1;
    }
    return out;
  }
  function findRun(r, id) {
    for (var i = 0; i < r.length; i++) if (r[i].id && r[i].id === id) return i;
    return -1;
  }
  function normalize(deck) {
    var slides = (deck && deck.slides) || [];
    var secs = cleanSections(deck && deck.sections);
    var map = {};
    secs.forEach(function (s) { map[s.id] = s; });
    var used = {}, extra = [];
    var i = 0;
    while (i < slides.length) {
      var id = str(slides[i].sec, 20);
      if (!id || !map[id]) {
        slides[i].sec = '';
        i++;
        continue;
      }
      var runId = id;
      if (used[id]) {
        runId = uid();
        extra.push({ id: runId, name: map[id].name, fold: false });
        map[runId] = extra[extra.length - 1];
      }
      used[id] = 1;
      var j = i;
      while (j < slides.length && str(slides[j].sec, 20) === id) { slides[j].sec = runId; j++; }
      i = j;
    }
    secs = secs.concat(extra).filter(function (s) { return used[s.id] || extra.indexOf(s) >= 0; });
    /* drop records that no slide uses */
    var live = {};
    slides.forEach(function (s) { if (s.sec) live[s.sec] = 1; });
    secs = secs.filter(function (s) { return live[s.id]; });
    if (deck) { deck.sections = secs; deck.master = cleanMaster(deck.master); }
    return secs;
  }
  function addSection(slides, sections, at, name) {
    slides = slides || [];
    at = Math.max(0, Math.min(Math.max(0, slides.length - 1), at | 0));
    if (!slides.length) return { id: '', sections: cleanSections(sections) };
    var secs = cleanSections(sections);
    if (secs.length >= MAX_SECTIONS) return { id: '', sections: secs, error: 'max' };
    var id = uid();
    var old = str(slides[at].sec, 20);
    var end = at;
    while (end + 1 < slides.length && str(slides[end + 1].sec, 20) === old) end++;
    secs.push({ id: id, name: cleanSecName(name) || 'Section', fold: false });
    for (var i = at; i <= end; i++) slides[i].sec = id;
    return { id: id, sections: secs };
  }
  function removeSection(slides, sections, id) {
    slides = slides || [];
    id = str(id, 20);
    var r = runs(slides, sections);
    var ix = findRun(r, id);
    var prev = ix > 0 ? r[ix - 1].id : '';
    if (ix >= 0) {
      for (var i = r[ix].start; i <= r[ix].end; i++) slides[i].sec = prev;
    }
    return { sections: cleanSections(sections).filter(function (s) { return s.id !== id; }) };
  }
  function moveSection(slides, sections, id, dir) {
    var r = runs(slides, sections);
    var ix = findRun(r, id);
    if (ix < 0) return false;
    var t = ix + (dir < 0 ? -1 : 1);
    if (t < 0 || t >= r.length) return false;
    var a = r[Math.min(ix, t)], b = r[Math.max(ix, t)];
    var block = slides.splice(a.start, a.count + b.count);
    /* a is the earlier run, b the later: always swap this adjacent pair */
    var ins = block.slice(a.count).concat(block.slice(0, a.count));
    for (var k = 0; k < ins.length; k++) slides.splice(a.start + k, 0, ins[k]);
    return true;
  }
  /* place the run so it starts at to (0..length), like splicing a block */
  function moveSectionTo(slides, sections, id, to) {
    var r = runs(slides, sections);
    var ix = findRun(r, id);
    if (ix < 0) return false;
    var run = r[ix];
    to = Math.max(0, Math.min(slides.length, to | 0));
    if (to > run.start && to <= run.end + 1) return false; /* inside itself */
    var block = slides.splice(run.start, run.count);
    if (to > run.start) to -= run.count;
    for (var k = 0; k < block.length; k++) slides.splice(to + k, 0, block[k]);
    return true;
  }
  function renameSection(sections, id, name) {
    var secs = cleanSections(sections);
    var n = cleanSecName(name);
    secs.forEach(function (s) { if (s.id === id) s.name = n || s.name; });
    return secs;
  }
  function setFold(sections, id, fold) {
    var secs = cleanSections(sections);
    secs.forEach(function (s) { if (s.id === id) s.fold = !!fold; });
    return secs;
  }

  var API = {
    MAX_FOOTER: MAX_FOOTER, MAX_SEC: MAX_SEC, MAX_SECTIONS: MAX_SECTIONS,
    cleanFooterText: cleanFooterText, cleanFoot: cleanFoot, cleanSecName: cleanSecName, cleanWhen: cleanWhen,
    cleanMaster: cleanMaster, cloneMaster: cloneMaster, cleanSection: cleanSection, cleanSections: cleanSections,
    hidden: hidden, visIndices: visIndices, visCount: visCount, visIndex: visIndex, isTitle: isTitle,
    formatDate: formatDate, footerFor: footerFor, footHTML: footHTML, esc: esc,
    runs: runs, normalize: normalize, addSection: addSection, removeSection: removeSection,
    moveSection: moveSection, moveSectionTo: moveSectionTo, renameSection: renameSection, setFold: setFold
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SLMaster = API;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
