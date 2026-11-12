/* ============================================================
   FILE: modules/writer-wordcount.js
   DF25: was modules/draftly-wordcount.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: FT4. Word count (status bar + details popup) and the
         status bar on / off pref. Shares Writer.find (text model
         in writer-find.js). Loaded before writer-find.js, whose
         init() wires both.
   DEPENDS: config, flow, pages, storage (at call time)
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.find = Writer.find || {};

/* ---------- word count ---------- */

Writer.find.words = function words(s) {
  var m = String(s || '').match(/[^\s\u00a0\u200b]+/g);
  return m ? m.length : 0;
};

Writer.find.stats = function stats() {
  var bl = Writer.find.blocks();
  var paras = [];
  bl.forEach(function (b) {
    var t = b.text.replace(/\u200b/g, '');
    if (b.cont && paras.length) paras[paras.length - 1] += t;
    else paras.push(t);
  });
  var all = paras.join('\n');
  var plain = all.replace(/\n/g, '');
  return {
    words: Writer.find.words(all),
    chars: plain.length,
    charsNoSpace: plain.replace(/[\s\u00a0]/g, '').length,
    paras: paras.filter(function (p) { return /\S/.test(p); }).length,
    pages: document.querySelectorAll('.paper').length
  };
};

/* Words in the current editor selection, or -1 when none. */
Writer.find.selWords = function selWords() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return -1;
  if (!Writer.editor.isInEditor(sel.anchorNode)) return -1;
  return Writer.find.words(sel.toString());
};

Writer.find.updateCount = function updateCount() {
  var F = Writer.find;
  var btn = document.getElementById('wordCountBtn');
  if (!btn) return;
  var s = F.stats();
  F.last = s;
  var sw = F.selWords();
  var w = function (n) { return n + (n === 1 ? ' word' : ' words'); };
  btn.textContent = sw >= 0 ? (sw + ' of ' + w(s.words)) : w(s.words);
  var pg = document.getElementById('statusPages');
  if (pg) pg.textContent = 'Page ' + F.currentPage() + ' of ' + s.pages;
  /* DF21: characters and reading time next to the word count (writer-write.js). */
  if (Writer.write && Writer.write.status) Writer.write.status(s);
  if (!document.getElementById('wordCountPop').hidden) F.fillPop(s);
};

Writer.find.currentPage = function currentPage() {
  var eds = Writer.flow.editors();
  var sel = window.getSelection();
  var i;
  if (sel && sel.anchorNode) for (i = 0; i < eds.length; i++) if (eds[i].contains(sel.anchorNode)) return i + 1;
  return 1;
};

Writer.find.scheduleCount = function scheduleCount() {
  clearTimeout(Writer.find.countTimer);
  Writer.find.countTimer = setTimeout(Writer.find.updateCount, Writer.find.countMs);
};

Writer.find.fillPop = function fillPop(s) {
  var pop = document.getElementById('wordCountPop');
  var rows = [['Pages', s.pages], ['Words', s.words], ['Characters (no spaces)', s.charsNoSpace],
    ['Characters (with spaces)', s.chars], ['Paragraphs', s.paras]];
  /* DF21 */
  if (Writer.writeText) rows.push(['Reading time (' + Writer.writeText.WPM + ' words/min)', Writer.writeText.readMinutes(s.words) + ' min']);
  var sw = Writer.find.selWords();
  if (sw >= 0) rows.splice(1, 0, ['Selected words', sw]);
  pop.innerHTML = '<div class="wc-title">Word count</div>' + rows.map(function (r) {
    return '<div class="wc-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
  }).join('');
};

Writer.find.togglePop = function togglePop(show) {
  var pop = document.getElementById('wordCountPop');
  var btn = document.getElementById('wordCountBtn');
  if (show == null) show = pop.hidden;
  if (show) {
    Writer.find.fillPop(Writer.find.stats());
    var r = btn.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.round(r.left)) + 'px';
    pop.style.bottom = Math.round(window.innerHeight - r.top + 6) + 'px';
    pop.style.top = 'auto';
  }
  pop.hidden = !show;
  btn.setAttribute('aria-expanded', String(show));
};

/* ---------- status bar on / off ---------- */

Writer.find.STATUS_KEY = 'writer_status_bar';   /* (before DF25) Writer.find.STATUS_KEY = 'draftly_status_bar'; */

Writer.find.setStatusBar = function setStatusBar(on, save) {
  var bar = document.getElementById('statusBar');
  var btn = document.getElementById('statusBarToggle');
  if (bar) bar.hidden = !on;
  if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('active', on); }
  if (save) { try { localStorage.setItem(Writer.find.STATUS_KEY, on ? '1' : '0'); } catch (e) {} }
  if (!on) Writer.find.togglePop(false);
  else Writer.find.updateCount();
};
