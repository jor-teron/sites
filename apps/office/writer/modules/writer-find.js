/* ============================================================
   FILE: modules/writer-find.js
   DF25: was modules/draftly-find.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: FT4. Text model and Find & Replace (Ctrl/Cmd+F, Ctrl+H).
         init() also wires word count / status bar
         (writer-wordcount.js, loaded first).
   DEPENDS: config, editor, flow, pages, history, storage, ui
   NOTES: Text is read per block piece, so matches never cross a
          page-break marker or a page edge. Matches are painted with
          the CSS Custom Highlight API; without it only the current
          match is selected. The DOM is never wrapped for highlights.
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.find = Writer.find || {};

Writer.find.BLOCKS = /^(P|H[1-6]|LI|UL|OL|DIV|BLOCKQUOTE|PRE|TABLE|TR|TD|TH)$/;
Writer.find.countMs = 300;

/* ---------- text model ---------- */

/* True for nodes whose text is not document text (marks, page breaks). */
Writer.find.skip = function skip(el) {
  if (!el || el.nodeType !== 1) return false;
  if (Writer.flow.isBreak(el)) return true;
  if (el.getAttribute('contenteditable') === 'false') return true;
  if (el.hasAttribute('data-np')) return true;
  return el.classList.contains(Writer.config.markClass);
};

/* Leaf block pieces in document order: { el, text, map:[{node,start}], cont }. */
Writer.find.blocks = function blocks() {
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

/* Range for block offsets [a, b). */
Writer.find.range = function range(blk, a, b) {
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

/* ---------- find ---------- */

Writer.find.matches = [];
Writer.find.index = -1;
Writer.find.hasHL = !!(window.CSS && CSS.highlights && window.Highlight);

Writer.find.el = function el(id) { return document.getElementById(id); };

Writer.find.search = function search() {
  var F = Writer.find;
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

Writer.find.paint = function paint() {
  var F = Writer.find;
  if (!F.hasHL) return;
  CSS.highlights.delete('dr-find');
  CSS.highlights.delete('dr-find-cur');
  if (!F.open || !F.matches.length) return;
  var all = [];
  F.matches.forEach(function (m, i) { m.r = F.range(m.blk, m.a, m.b); if (i !== F.index) all.push(m.r); });
  CSS.highlights.set('dr-find', new Highlight(...all));
  if (F.index >= 0) CSS.highlights.set('dr-find-cur', new Highlight(F.matches[F.index].r));
};

Writer.find.label = function label() {
  var F = Writer.find;
  var n = F.matches.length;
  var lbl = F.el('findCount');
  lbl.textContent = F.el('findInput').value ? (n ? (F.index + 1) + ' of ' + n : 'No results') : '';
  F.el('findBar').classList.toggle('no-results', !!F.el('findInput').value && !n);
};

/* Select and reveal the current match without moving focus away from the bar. */
Writer.find.reveal = function reveal() {
  var F = Writer.find;
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
Writer.find.refresh = function refresh(keepIndex) {
  var F = Writer.find;
  var prev = F.index;
  F.search();
  var n = F.matches.length;
  F.index = n ? (keepIndex && prev >= 0 ? Math.min(prev, n - 1) : 0) : -1;
  F.paint();
  F.label();
};

Writer.find.step = function step(dir) {
  var F = Writer.find;
  if (!F.matches.length) F.refresh();
  var n = F.matches.length;
  if (!n) return;
  F.index = (F.index + dir + n) % n;
  F.paint();
  F.label();
  F.reveal();
};

Writer.find.show = function show(withReplace) {
  var F = Writer.find;
  var bar = F.el('findBar');
  bar.hidden = false;
  F.open = true;
  var rib = document.querySelector('.ribbon');
  if (rib) bar.style.top = Math.round(rib.getBoundingClientRect().bottom + 8) + 'px';
  F.setReplace(!!withReplace || F.replaceOpen);
  var sel = window.getSelection();
  var s = sel && !sel.isCollapsed && Writer.editor.isInEditor(sel.anchorNode) ? sel.toString() : '';
  if (s && s.indexOf('\n') === -1 && s.length < 200) F.el('findInput').value = s;
  F.el('findInput').focus();
  F.el('findInput').select();
  F.refresh();
  if (F.matches.length) F.reveal();
};

Writer.find.hide = function hide() {
  var F = Writer.find;
  var m = F.matches[F.index];
  var r = m ? F.range(m.blk, m.a, m.b) : null;
  F.open = false;
  F.el('findBar').hidden = true;
  F.matches = []; F.index = -1;
  if (F.hasHL) { CSS.highlights.delete('dr-find'); CSS.highlights.delete('dr-find-cur'); }
  var ed = (r && r.startContainer.parentElement && r.startContainer.parentElement.closest('.' + Writer.config.editorClass)) ||
    (Writer.editor.activeEditor && Writer.editor.activeEditor.isConnected && Writer.editor.activeEditor) ||
    Writer.pages.firstEditor();
  if (ed) { ed.focus({ preventScroll: true }); Writer.editor.activeEditor = ed; }
  if (r) { try { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (e) {} }
};

Writer.find.setReplace = function setReplace(on) {
  var F = Writer.find;
  F.replaceOpen = on;
  F.el('replaceRow').hidden = !on;
  F.el('findExpandBtn').setAttribute('aria-expanded', String(on));
  F.el('findBar').classList.toggle('with-replace', on);
};

/* Replace text of match m in place; formatting of the first piece is kept. */
Writer.find.replaceOne = function replaceOne(m, text) {
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

Writer.find.afterEdit = function afterEdit() {
  Writer.pages.layoutAll();
  if (Writer.history) Writer.history.commit();
  if (Writer.app && Writer.app.ready) {
    clearTimeout(Writer.app.inputTimer);
    Writer.app.inputTimer = setTimeout(function () { Writer.storage.save(); }, Writer.config.inputDebounceMs);
  }
  Writer.find.updateCount();
};

Writer.find.replace = function replace() {
  var F = Writer.find;
  F.refresh(true);
  var m = F.matches[F.index];
  if (!m) return;
  var at = F.index;
  if (Writer.history) Writer.history.checkpoint();
  F.replaceOne(m, F.el('replaceInput').value);
  F.afterEdit();
  F.search();
  var n = F.matches.length;
  F.index = n ? at % n : -1;
  F.paint(); F.label();
  if (n) F.reveal();
};

Writer.find.replaceAll = function replaceAll() {
  var F = Writer.find;
  F.refresh();
  var list = F.matches.slice();
  if (!list.length) return;
  if (Writer.history) Writer.history.checkpoint();
  var text = F.el('replaceInput').value;
  for (var i = list.length - 1; i >= 0; i--) F.replaceOne(list[i], text);
  F.afterEdit();
  F.refresh();
  if (Writer.ui && Writer.ui.showToast) Writer.ui.showToast('Replaced ' + list.length + (list.length === 1 ? ' match' : ' matches'));
};

/* ---------- wiring ---------- */

Writer.find.init = function init() {
  var F = Writer.find;
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
      if (F.open && Writer.editor.isInEditor(e.target)) { e.preventDefault(); F.hide(); }
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
    if (!Writer.editor.isInEditor(e.target)) return;
    F.scheduleCount();
    if (F.open) { clearTimeout(findTimer); findTimer = setTimeout(function () { F.refresh(true); }, F.countMs); }
  });
  document.addEventListener('selectionchange', F.scheduleCount);
  /* Pagination, undo, open and new all go through reflowAll / reflow. */
  ['reflow', 'reflowAll'].forEach(function (name) {
    var orig = Writer.flow[name];
    Writer.flow[name] = function () {
      var out = orig.apply(this, arguments);
      F.scheduleCount();
      if (F.open) { clearTimeout(findTimer); findTimer = setTimeout(function () { F.refresh(true); }, F.countMs); }
      return out;
    };
  });
  noSteal('statusBarToggle', function () {
    F.setStatusBar(F.el('statusBarToggle').getAttribute('aria-pressed') !== 'true', true);
  });
  var stored = null;
  try { stored = localStorage.getItem(F.STATUS_KEY); } catch (e) {}
  F.setStatusBar(stored !== '0', false);
};

Writer.find.init();
