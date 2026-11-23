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

/* DW26: text model moved from writer-find.js so word count & status bar
   work at boot while Find & Replace (writer-find.js) loads on demand. */
Writer.find.BLOCKS = Writer.find.BLOCKS || /^(P|H[1-6]|LI|UL|OL|DIV|BLOCKQUOTE|PRE|TABLE|TR|TD|TH)$/;
Writer.find.countMs = Writer.find.countMs || 300;

Writer.find.skip = Writer.find.skip || function skip(el) {
  if (!el || el.nodeType !== 1) return false;
  if (Writer.flow.isBreak(el)) return true;
  if (el.getAttribute('contenteditable') === 'false') return true;
  if (el.hasAttribute('data-np')) return true;
  return el.classList.contains(Writer.config.markClass);
};

Writer.find.blocks = Writer.find.blocks || function blocks() {
  var F = Writer.find;
  var out = [];
  var eds = Writer.flow.editors();
  eds.forEach(function (ed) {
    var cur = null;
    var first = true;
    var visit = function (node, isTop) {
      var c;
      for (c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          if (!cur) { cur = { el: node, text: '', map: [], cont: false }; out.push(cur); }
          cur.map.push({ node: c, start: cur.text.length });
          cur.text += c.nodeValue;
        } else if (c.nodeType === 1) {
          if (F.skip(c)) { cur = null; continue; }
          if (c.tagName === 'BR') { if (cur) { cur.map.push({ node: c, start: cur.text.length, br: true }); cur.text += '\n'; } continue; }
          if (F.BLOCKS.test(c.tagName)) {
            cur = { el: c, text: '', map: [], cont: isTop && first && c.hasAttribute(Writer.flow.CONT) };
            out.push(cur);
            if (isTop) first = false;
            visit(c, false);
            cur = null;
          } else {
            visit(c, false);
          }
        }
      }
    };
    visit(ed, true);
  });
  return out;
};

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
  else {
    /* DW26: keep status bar counts accurate before writer-write.js loads. */
    var ch = document.getElementById('statusChars');
    if (ch) ch.textContent = s.chars + (s.chars === 1 ? ' character' : ' characters');
    var rd = document.getElementById('statusRead');
    if (rd) rd.textContent = (s.words ? Math.ceil(s.words / 200) : 0) + ' min read';
  }
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
  /* DF21 / DW26 */
  if (Writer.writeText) rows.push(['Reading time (' + Writer.writeText.WPM + ' words/min)', Writer.writeText.readMinutes(s.words) + ' min']);
  else rows.push(['Reading time (200 words/min)', (s.words ? Math.ceil(s.words / 200) : 0) + ' min']);
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

Writer.find.bindStatusToggle = function bindStatusToggle() {
  var F = Writer.find;
  var btn = document.getElementById('statusBarToggle');
  if (!btn || btn._statusBound) return;
  btn._statusBound = true;
  btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    F.setStatusBar(btn.getAttribute('aria-pressed') !== 'true', true);
  });
  var bar = document.getElementById('statusBar');
  if (bar) {
    btn.setAttribute('aria-pressed', String(!bar.hidden));
    btn.classList.toggle('active', !bar.hidden);
  }
};

Writer.find.initWordCount = function initWordCount() {
  var F = Writer.find;
  var btn = document.getElementById('wordCountBtn');
  if (F._wcBound || !btn || !Writer.flow) return;
  F._wcBound = true;
  btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  btn.addEventListener('click', function (e) { e.preventDefault(); F.togglePop(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var pop = document.getElementById('wordCountPop');
      if (pop && !pop.hidden) F.togglePop(false);
    }
  }, true);
  document.addEventListener('mousedown', function (e) {
    var pop = document.getElementById('wordCountPop');
    if (pop && !pop.hidden && !pop.contains(e.target) && e.target !== btn) F.togglePop(false);
  });
  document.addEventListener('input', function (e) {
    if (Writer.editor && !Writer.editor.isInEditor(e.target)) return;
    F.scheduleCount();
    if (F.open && F.scheduleRefresh) F.scheduleRefresh();
  });
  document.addEventListener('selectionchange', F.scheduleCount);
  ['reflow', 'reflowAll'].forEach(function (name) {
    var orig = Writer.flow[name];
    if (typeof orig !== 'function') return;
    Writer.flow[name] = function () {
      var out = orig.apply(this, arguments);
      F.scheduleCount();
      if (F.open && F.scheduleRefresh) F.scheduleRefresh();
      return out;
    };
  });
  F.bindStatusToggle();
  var stored = null;
  try { stored = localStorage.getItem(F.STATUS_KEY); } catch (e) {}
  F.setStatusBar(stored !== '0', false);
};

if (typeof document !== 'undefined') Writer.find.initWordCount();
