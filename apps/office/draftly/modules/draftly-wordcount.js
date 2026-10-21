/* ============================================================
   FILE: modules/draftly-wordcount.js
   PROJECT: Draftly
   ROLE: FT4. Word count (status bar + details popup) and the
         status bar on / off pref. Shares Draftly.find (text model
         in draftly-find.js). Loaded before draftly-find.js, whose
         init() wires both.
   DEPENDS: config, flow, pages, storage (at call time)
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.find = Draftly.find || {};

/* ---------- word count ---------- */

Draftly.find.words = function words(s) {
  var m = String(s || '').match(/[^\s\u00a0\u200b]+/g);
  return m ? m.length : 0;
};

Draftly.find.stats = function stats() {
  var bl = Draftly.find.blocks();
  var paras = [];
  bl.forEach(function (b) {
    var t = b.text.replace(/\u200b/g, '');
    if (b.cont && paras.length) paras[paras.length - 1] += t;
    else paras.push(t);
  });
  var all = paras.join('\n');
  var plain = all.replace(/\n/g, '');
  return {
    words: Draftly.find.words(all),
    chars: plain.length,
    charsNoSpace: plain.replace(/[\s\u00a0]/g, '').length,
    paras: paras.filter(function (p) { return /\S/.test(p); }).length,
    pages: document.querySelectorAll('.paper').length
  };
};

/* Words in the current editor selection, or -1 when none. */
Draftly.find.selWords = function selWords() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return -1;
  if (!Draftly.editor.isInEditor(sel.anchorNode)) return -1;
  return Draftly.find.words(sel.toString());
};

Draftly.find.updateCount = function updateCount() {
  var F = Draftly.find;
  var btn = document.getElementById('wordCountBtn');
  if (!btn) return;
  var s = F.stats();
  F.last = s;
  var sw = F.selWords();
  var w = function (n) { return n + (n === 1 ? ' word' : ' words'); };
  btn.textContent = sw >= 0 ? (sw + ' of ' + w(s.words)) : w(s.words);
  var pg = document.getElementById('statusPages');
  if (pg) pg.textContent = 'Page ' + F.currentPage() + ' of ' + s.pages;
  if (!document.getElementById('wordCountPop').hidden) F.fillPop(s);
};

Draftly.find.currentPage = function currentPage() {
  var eds = Draftly.flow.editors();
  var sel = window.getSelection();
  var i;
  if (sel && sel.anchorNode) for (i = 0; i < eds.length; i++) if (eds[i].contains(sel.anchorNode)) return i + 1;
  return 1;
};

Draftly.find.scheduleCount = function scheduleCount() {
  clearTimeout(Draftly.find.countTimer);
  Draftly.find.countTimer = setTimeout(Draftly.find.updateCount, Draftly.find.countMs);
};

Draftly.find.fillPop = function fillPop(s) {
  var pop = document.getElementById('wordCountPop');
  var rows = [['Pages', s.pages], ['Words', s.words], ['Characters (no spaces)', s.charsNoSpace],
    ['Characters (with spaces)', s.chars], ['Paragraphs', s.paras]];
  var sw = Draftly.find.selWords();
  if (sw >= 0) rows.splice(1, 0, ['Selected words', sw]);
  pop.innerHTML = '<div class="wc-title">Word count</div>' + rows.map(function (r) {
    return '<div class="wc-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
  }).join('');
};

Draftly.find.togglePop = function togglePop(show) {
  var pop = document.getElementById('wordCountPop');
  var btn = document.getElementById('wordCountBtn');
  if (show == null) show = pop.hidden;
  if (show) {
    Draftly.find.fillPop(Draftly.find.stats());
    var r = btn.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.round(r.left)) + 'px';
    pop.style.bottom = Math.round(window.innerHeight - r.top + 6) + 'px';
    pop.style.top = 'auto';
  }
  pop.hidden = !show;
  btn.setAttribute('aria-expanded', String(show));
};

/* ---------- status bar on / off ---------- */

Draftly.find.STATUS_KEY = 'draftly_status_bar';

Draftly.find.setStatusBar = function setStatusBar(on, save) {
  var bar = document.getElementById('statusBar');
  var btn = document.getElementById('statusBarToggle');
  if (bar) bar.hidden = !on;
  if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('active', on); }
  if (save) { try { localStorage.setItem(Draftly.find.STATUS_KEY, on ? '1' : '0'); } catch (e) {} }
  if (!on) Draftly.find.togglePop(false);
  else Draftly.find.updateCount();
};
