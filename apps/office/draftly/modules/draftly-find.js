/* ============================================================
   FILE: modules/draftly-find.js
   PROJECT: Draftly
   ROLE: FT4. Word count (status bar + details popup) and
         Find & Replace (Ctrl/Cmd+F, Ctrl+H).
   DEPENDS: config, editor, flow, pages, history, storage, ui
   NOTES: Text is read per block piece, so matches never cross a
          page-break marker or a page edge. Matches are painted with
          the CSS Custom Highlight API; without it only the current
          match is selected. The DOM is never wrapped for highlights.
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.find = {};

Draftly.find.BLOCKS = /^(P|H[1-6]|LI|UL|OL|DIV|BLOCKQUOTE|PRE|TABLE|TR|TD|TH)$/;
Draftly.find.countMs = 300;

/* ---------- text model ---------- */

/* True for nodes whose text is not document text (marks, page breaks). */
Draftly.find.skip = function skip(el) {
  if (!el || el.nodeType !== 1) return false;
  if (Draftly.flow.isBreak(el)) return true;
  if (el.getAttribute('contenteditable') === 'false') return true;
  if (el.hasAttribute('data-np')) return true;
  return el.classList.contains(Draftly.config.markClass);
};

/* Leaf block pieces in document order: { el, text, map:[{node,start}], cont }. */
Draftly.find.blocks = function blocks() {
  var F = Draftly.find;
  var out = [];
  var eds = Draftly.flow.editors();
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
            cur = { el: c, text: '', map: [], cont: isTop && first && c.hasAttribute(Draftly.flow.CONT) };
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

/* Range for block offsets [a, b). */
Draftly.find.range = function range(blk, a, b) {
  var r = document.createRange();
  var set = function (k, end) {
    var i, m, len;
    for (i = 0; i < blk.map.length; i++) {
      m = blk.map[i];
      if (m.br) continue;
      len = m.node.nodeValue.length;
      if (end ? (k > m.start && k <= m.start + len) : (k >= m.start && k < m.start + len)) {
        if (end) r.setEnd(m.node, k - m.start); else r.setStart(m.node, k - m.start);
        return;
      }
    }
  };
  set(a, false);
  set(b, true);
  return r;
};

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

/* ---------- find ---------- */

Draftly.find.matches = [];
Draftly.find.index = -1;
Draftly.find.hasHL = !!(window.CSS && CSS.highlights && window.Highlight);

Draftly.find.el = function el(id) { return document.getElementById(id); };

Draftly.find.search = function search() {
  var F = Draftly.find;
  var term = F.el('findInput').value;
  var cs = F.el('findCaseBtn').getAttribute('aria-pressed') === 'true';
  var out = [];
  if (term) {
    var needle = cs ? term : term.toLowerCase();
    F.blocks().forEach(function (b) {
      var hay = cs ? b.text : b.text.toLowerCase();
      var k = hay.indexOf(needle);
      while (k !== -1) {
        out.push({ blk: b, a: k, b: k + needle.length });
        k = hay.indexOf(needle, k + needle.length);
      }
    });
  }
  F.matches = out;
  return out;
};

Draftly.find.paint = function paint() {
  var F = Draftly.find;
  if (!F.hasHL) return;
  CSS.highlights.delete('dr-find');
  CSS.highlights.delete('dr-find-cur');
  if (!F.open || !F.matches.length) return;
  var all = [];
  F.matches.forEach(function (m, i) { m.r = F.range(m.blk, m.a, m.b); if (i !== F.index) all.push(m.r); });
  CSS.highlights.set('dr-find', new Highlight(...all));
  if (F.index >= 0) CSS.highlights.set('dr-find-cur', new Highlight(F.matches[F.index].r));
};

Draftly.find.label = function label() {
  var F = Draftly.find;
  var n = F.matches.length;
  var lbl = F.el('findCount');
  lbl.textContent = F.el('findInput').value ? (n ? (F.index + 1) + ' of ' + n : 'No results') : '';
  F.el('findBar').classList.toggle('no-results', !!F.el('findInput').value && !n);
};

/* Select and reveal the current match without moving focus away from the bar. */
Draftly.find.reveal = function reveal() {
  var F = Draftly.find;
  var m = F.matches[F.index];
  if (!m) return;
  var r = F.range(m.blk, m.a, m.b);
  var keep = document.activeElement;
  try {
    var sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
  } catch (e) {}
  if (keep && keep !== document.activeElement && keep.focus) keep.focus({ preventScroll: true });
  var host = r.startContainer.parentElement;
  if (host && host.scrollIntoView) host.scrollIntoView({ block: 'center', inline: 'nearest' });
};

/* Recompute matches, keeping the current position near `from` when possible. */
Draftly.find.refresh = function refresh(keepIndex) {
  var F = Draftly.find;
  var prev = F.index;
  F.search();
  var n = F.matches.length;
  F.index = n ? (keepIndex && prev >= 0 ? Math.min(prev, n - 1) : 0) : -1;
  F.paint();
  F.label();
};

Draftly.find.step = function step(dir) {
  var F = Draftly.find;
  if (!F.matches.length) F.refresh();
  var n = F.matches.length;
  if (!n) return;
  F.index = (F.index + dir + n) % n;
  F.paint();
  F.label();
  F.reveal();
};

Draftly.find.show = function show(withReplace) {
  var F = Draftly.find;
  var bar = F.el('findBar');
  bar.hidden = false;
  F.open = true;
  var rib = document.querySelector('.ribbon');
  if (rib) bar.style.top = Math.round(rib.getBoundingClientRect().bottom + 8) + 'px';
  F.setReplace(!!withReplace || F.replaceOpen);
  var sel = window.getSelection();
  var s = sel && !sel.isCollapsed && Draftly.editor.isInEditor(sel.anchorNode) ? sel.toString() : '';
  if (s && s.indexOf('\n') === -1 && s.length < 200) F.el('findInput').value = s;
  F.el('findInput').focus();
  F.el('findInput').select();
  F.refresh();
  if (F.matches.length) F.reveal();
};

Draftly.find.hide = function hide() {
  var F = Draftly.find;
  var m = F.matches[F.index];
  var r = m ? F.range(m.blk, m.a, m.b) : null;
  F.open = false;
  F.el('findBar').hidden = true;
  F.matches = []; F.index = -1;
  if (F.hasHL) { CSS.highlights.delete('dr-find'); CSS.highlights.delete('dr-find-cur'); }
  var ed = (r && r.startContainer.parentElement && r.startContainer.parentElement.closest('.' + Draftly.config.editorClass)) ||
    (Draftly.editor.activeEditor && Draftly.editor.activeEditor.isConnected && Draftly.editor.activeEditor) ||
    Draftly.pages.firstEditor();
  if (ed) { ed.focus({ preventScroll: true }); Draftly.editor.activeEditor = ed; }
  if (r) { try { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (e) {} }
};

Draftly.find.setReplace = function setReplace(on) {
  var F = Draftly.find;
  F.replaceOpen = on;
  F.el('replaceRow').hidden = !on;
  F.el('findExpandBtn').setAttribute('aria-expanded', String(on));
  F.el('findBar').classList.toggle('with-replace', on);
};

/* Replace text of match m in place; formatting of the first piece is kept. */
Draftly.find.replaceOne = function replaceOne(m, text) {
  var nodes = m.blk.map.filter(function (x) { return !x.br; });
  var i, x, len, s, e, firstDone = false;
  for (i = 0; i < nodes.length; i++) {
    x = nodes[i];
    len = x.node.nodeValue.length;
    if (x.start + len <= m.a || x.start >= m.b) continue;
    s = Math.max(m.a, x.start) - x.start;
    e = Math.min(m.b, x.start + len) - x.start;
    var v = x.node.nodeValue;
    x.node.nodeValue = v.slice(0, s) + (firstDone ? '' : text) + v.slice(e);
    firstDone = true;
  }
  /* Drop inline wrappers left empty by a cross-node match. */
  nodes.forEach(function (y) {
    var n = y.node;
    if (n.nodeValue !== '' || !n.parentNode) return;
    var p = n.parentNode;
    n.remove();
    while (p && p !== m.blk.el && !p.firstChild && p.parentNode) { var up = p.parentNode; p.remove(); p = up; }
  });
};

Draftly.find.afterEdit = function afterEdit() {
  Draftly.pages.layoutAll();
  if (Draftly.history) Draftly.history.commit();
  if (Draftly.app && Draftly.app.ready) {
    clearTimeout(Draftly.app.inputTimer);
    Draftly.app.inputTimer = setTimeout(function () { Draftly.storage.save(); }, Draftly.config.inputDebounceMs);
  }
  Draftly.find.updateCount();
};

Draftly.find.replace = function replace() {
  var F = Draftly.find;
  F.refresh(true);
  var m = F.matches[F.index];
  if (!m) return;
  var at = F.index;
  if (Draftly.history) Draftly.history.checkpoint();
  F.replaceOne(m, F.el('replaceInput').value);
  F.afterEdit();
  F.search();
  var n = F.matches.length;
  F.index = n ? at % n : -1;
  F.paint(); F.label();
  if (n) F.reveal();
};

Draftly.find.replaceAll = function replaceAll() {
  var F = Draftly.find;
  F.refresh();
  var list = F.matches.slice();
  if (!list.length) return;
  if (Draftly.history) Draftly.history.checkpoint();
  var text = F.el('replaceInput').value;
  for (var i = list.length - 1; i >= 0; i--) F.replaceOne(list[i], text);
  F.afterEdit();
  F.refresh();
  if (Draftly.ui && Draftly.ui.showToast) Draftly.ui.showToast('Replaced ' + list.length + (list.length === 1 ? ' match' : ' matches'));
};

/* ---------- wiring ---------- */

Draftly.find.init = function init() {
  var F = Draftly.find;
  if (!F.el('findBar') || !F.el('wordCountBtn')) return;
  var noSteal = function (id, fn) {
    var b = F.el(id);
    b.addEventListener('mousedown', function (e) { if (id !== 'findInput') e.preventDefault(); });
    b.addEventListener('click', function (e) { e.preventDefault(); fn(); });
  };
  noSteal('findPrevBtn', function () { F.step(-1); });
  noSteal('findNextBtn', function () { F.step(1); });
  noSteal('findCloseBtn', F.hide);
  noSteal('findExpandBtn', function () { F.setReplace(!F.replaceOpen); (F.replaceOpen ? F.el('replaceInput') : F.el('findInput')).focus(); });
  noSteal('findCaseBtn', function () {
    var b = F.el('findCaseBtn');
    b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    F.refresh();
  });
  noSteal('replaceBtn', F.replace);
  noSteal('replaceAllBtn', F.replaceAll);
  noSteal('findRibbonBtn', function () { F.show(false); });
  noSteal('wordCountBtn', function () { F.togglePop(); });

  F.el('findInput').addEventListener('input', function () { F.refresh(); if (F.matches.length) F.reveal(); });
  F.el('findBar').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); F.hide(); return; }
    if (e.key === 'Enter' && e.target.id === 'findInput') { e.preventDefault(); F.step(e.shiftKey ? -1 : 1); }
    if (e.key === 'Enter' && e.target.id === 'replaceInput') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) F.replaceAll(); else F.replace();
    }
  });

  document.addEventListener('keydown', function (e) {
    var mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    var k = (e.key || '').toLowerCase();
    if (mod && !e.shiftKey && k === 'f') { e.preventDefault(); e.stopPropagation(); F.show(false); }
    else if (mod && !e.shiftKey && k === 'h') { e.preventDefault(); e.stopPropagation(); F.show(true); }
    else if (e.key === 'Escape') {
      if (F.open && Draftly.editor.isInEditor(e.target)) { e.preventDefault(); F.hide(); }
      if (!F.el('wordCountPop').hidden) F.togglePop(false);
    }
  }, true);

  document.addEventListener('mousedown', function (e) {
    var pop = F.el('wordCountPop');
    if (!pop.hidden && !pop.contains(e.target) && e.target !== F.el('wordCountBtn')) F.togglePop(false);
  });

  /* Document edits: recount, and re-run the search if the bar is open. */
  var findTimer = null;
  document.addEventListener('input', function (e) {
    if (!Draftly.editor.isInEditor(e.target)) return;
    F.scheduleCount();
    if (F.open) { clearTimeout(findTimer); findTimer = setTimeout(function () { F.refresh(true); }, F.countMs); }
  });
  document.addEventListener('selectionchange', F.scheduleCount);
  /* Pagination, undo, open and new all go through reflowAll / reflow. */
  ['reflow', 'reflowAll'].forEach(function (name) {
    var orig = Draftly.flow[name];
    Draftly.flow[name] = function () {
      var out = orig.apply(this, arguments);
      F.scheduleCount();
      if (F.open) { clearTimeout(findTimer); findTimer = setTimeout(function () { F.refresh(true); }, F.countMs); }
      return out;
    };
  });
  F.updateCount();
};

Draftly.find.init();
