/* ============================================================
   FILE: modules/writer-editor.js
   DF25: was modules/draftly-editor.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Selection, execCommand, font, paste, legacy mark cleanup.
         DW23: Enter (insertParagraph) carries ruler indents, line
         spacing and alignment onto the new paragraph.
         DW24: setAlign writes text-align on the enclosing block(s)
         so Shift+Enter lines stay in one paragraph.
   DEPENDS: Writer.config, Writer.ui, Writer.indent (optional, DW23)
   ISOLATION: Commands no-op if no editor is focused.
   ============================================================ */

/* Shared namespace. */
/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

/* Editor command helpers. */
Writer.editor = {};

/* Last range inside an editor, used after toolbar clicks. */
Writer.editor.savedRange = null;

/* Last editor that held the caret. */
Writer.editor.activeEditor = null;

/* True when a node is inside a page editor. */
Writer.editor.isInEditor = function isInEditor(node) {
  var cfg = Writer.config;
  if (!node) return false;
  var el = node.nodeType === 1 ? node : node.parentElement;
  return !!(el && el.closest && el.closest('.' + cfg.editorClass));
};

/* Remember the caret if it sits inside an editor. */
Writer.editor.saveSelection = function saveSelection() {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  if (Writer.editor.isInEditor(sel.anchorNode)) {
    Writer.editor.savedRange = sel.getRangeAt(0).cloneRange();
    var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    Writer.editor.activeEditor = el ? el.closest('.' + Writer.config.editorClass) : null;
  }
};

/* Put the caret back. Focus the last editor if needed. */
Writer.editor.restoreSelection = function restoreSelection() {
  var editor = Writer.editor.activeEditor || document.querySelector('.' + Writer.config.editorClass);
  var sr = Writer.editor.savedRange;
  if (sr && sr.startContainer && sr.startContainer.isConnected !== false && Writer.editor.isInEditor(sr.startContainer)) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(sr);
  } else if (editor) {
    editor.focus();
  }
};

/* Focus the editor that owns the caret. */
Writer.editor.focusEditor = function focusEditor() {
  var editor = Writer.editor.activeEditor || document.querySelector('.' + Writer.config.editorClass);
  if (!editor) return;
  if (document.activeElement !== editor) {
    editor.focus();
    Writer.editor.restoreSelection();
  }
};

/* Remove legacy inline mark spans (older versions inserted ¶ / ↵ as DOM
   nodes). Marks are now drawn by writer-marks.js on an overlay only. */
Writer.editor.stripMarks = function stripMarks(root) {
  if (!root) return;
  var marks = root.querySelectorAll('.' + Writer.config.markClass + ', span[data-np]');
  var i;
  for (i = marks.length - 1; i >= 0; i--) marks[i].remove();
  var brs = root.querySelectorAll('br[data-br]');
  for (i = 0; i < brs.length; i++) brs[i].removeAttribute('data-br');
};

/* Kept for callers: marks are display-only now, so just redraw them. */
Writer.editor.syncMarks = function syncMarks() {
  if (Writer.marks) Writer.marks.schedule();
};
Writer.editor.markLineBreaks = function markLineBreaks() {
  if (Writer.marks) Writer.marks.schedule();
};

/* DW25: pending caret-only typing style (ZWSP inside <span data-pending-style="1">). */
Writer.editor.ZWSP = '\u200B';
Writer.editor.PENDING_ATTR = 'data-pending-style';
Writer.editor.FONT_TAG_PT = [0, 7.5, 10, 12, 13.5, 18, 24, 36];
Writer.editor.isComposing = false;
Writer.editor._settingPending = false;

Writer.editor._selRange = function _selRange(sel) {
  if (!sel || !sel.rangeCount) return null;
  return sel.getRangeAt(0);
};

Writer.editor._isCollapsed = function _isCollapsed(sel, r) {
  if (sel && typeof sel.isCollapsed === 'boolean') return sel.isCollapsed;
  if (!r) return false;
  if (typeof r.collapsed === 'boolean') return r.collapsed;
  if (r.endContainer == null) return true;
  return r.startContainer === r.endContainer && r.startOffset === r.endOffset;
};

Writer.editor._makeRange = function _makeRange(node, offset) {
  if (typeof document.createRange === 'function') {
    var r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    return r;
  }
  return {
    startContainer: node, startOffset: offset,
    endContainer: node, endOffset: offset,
    collapsed: true,
    cloneRange: function () { return this; }
  };
};

Writer.editor._insertNodeAtRange = function _insertNodeAtRange(range, node) {
  if (range.insertNode) {
    var sc0 = range.startContainer;
    if (sc0 && sc0.nodeType === 3) {
      var len0 = sc0.nodeValue ? sc0.nodeValue.length : 0;
      if (range.startOffset >= len0) { sc0.parentNode.insertBefore(node, sc0.nextSibling); return; }
      if (range.startOffset <= 0) { sc0.parentNode.insertBefore(node, sc0); return; }
    }
    range.insertNode(node);
    return;
  }
  var sc = range.startContainer;
  var so = range.startOffset || 0;
  if (sc.nodeType === 3) {
    var par = sc.parentNode;
    var len = sc.nodeValue ? sc.nodeValue.length : 0;
    if (so >= len) par.insertBefore(node, sc.nextSibling);
    else if (so <= 0) par.insertBefore(node, sc);
    else {
      var after = sc.splitText ? sc.splitText(so) : null;
      if (after) par.insertBefore(node, after);
      else {
        var rest = document.createTextNode(sc.nodeValue.slice(so));
        sc.nodeValue = sc.nodeValue.slice(0, so);
        par.insertBefore(rest, sc.nextSibling);
        par.insertBefore(node, rest);
      }
    }
  } else if (sc.nodeType === 1) {
    var ref = (sc.childNodes && so < sc.childNodes.length) ? sc.childNodes[so] : null;
    sc.insertBefore(node, ref);
  }
};

Writer.editor.isPendingSpan = function isPendingSpan(node) {
  return !!(node && node.nodeType === 1 && node.tagName === 'SPAN' &&
    node.hasAttribute && node.hasAttribute(Writer.editor.PENDING_ATTR));
};

Writer.editor.isPendingEmpty = function isPendingEmpty(span) {
  if (!span || span.nodeType !== 1) return false;
  if (span.querySelector && span.querySelector('img, table, hr, svg, canvas, video, br')) return false;
  return !(span.textContent || '').replace(/\u200b/g, '').length;
};

Writer.editor.pendingSpanAt = function pendingSpanAt(node) {
  var cfg = Writer.config;
  var cur = node && (node.nodeType === 1 ? node : (node.parentElement || node.parentNode));
  while (cur && cur.nodeType === 1) {
    if (cur.classList && cur.classList.contains(cfg.editorClass)) break;
    if (Writer.editor.isPendingSpan(cur)) return cur;
    if (/^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TD|TH)$/.test(cur.tagName)) break;
    cur = cur.parentElement || cur.parentNode;
  }
  return null;
};

Writer.editor.inlineStyleAt = function inlineStyleAt(node, offset) {
  if (!node || !Writer.editor.isInEditor(node)) return null;
  var cfg = Writer.config;
  var BLOCK = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TABLE|TR|TD|TH|HR|FIGURE)$/;
  var cur = node.nodeType === 1 ? node : (node.parentElement || node.parentNode);
  if (node.nodeType === 1 && typeof offset === 'number' && offset > 0 && node.childNodes) {
    var after = node.childNodes[offset];
    var prev = node.childNodes[offset - 1];
    if (prev && prev.nodeType === 1 && prev.tagName !== 'BR' && prev.tagName !== 'IMG' &&
        !BLOCK.test(prev.tagName) && !(after && after.nodeType === 3 && after.nodeValue && after.nodeValue.length)) {
      var p = prev;
      while (p && p.lastChild && p.lastChild.nodeType === 1 &&
             p.lastChild.tagName !== 'BR' && p.lastChild.tagName !== 'IMG' &&
             !BLOCK.test(p.lastChild.tagName)) {
        p = p.lastChild;
      }
      cur = p;
    }
  }
  var chain = [];
  while (cur && cur.nodeType === 1) {
    if (cur.classList && cur.classList.contains(cfg.editorClass)) break;
    if (BLOCK.test(cur.tagName)) break;
    chain.unshift(cur);
    cur = cur.parentElement || cur.parentNode;
  }
  if (!chain.length) return null;
  var out = {}, i, el, s, v, dec;
  for (i = 0; i < chain.length; i++) {
    el = chain[i];
    s = el.style || {};
    if (el.tagName === 'B' || el.tagName === 'STRONG') out.bold = true;
    else if (el.tagName === 'I' || el.tagName === 'EM') out.italic = true;
    else if (el.tagName === 'U') out.underline = true;
    else if (el.tagName === 'FONT') {
      var fc = el.getAttribute && el.getAttribute('face');
      var sz = parseInt(el.getAttribute && el.getAttribute('size'), 10);
      var col = el.getAttribute && el.getAttribute('color');
      if (fc) out.fontFamily = fc;
      if (sz >= 1 && sz <= 7) out.fontSize = Writer.editor.FONT_TAG_PT[sz] + 'pt';
      if (col) out.color = col;
    }
    if (s.fontSize) out.fontSize = s.fontSize;
    if (s.fontFamily) out.fontFamily = s.fontFamily;
    if (s.fontWeight) {
      v = String(s.fontWeight).toLowerCase();
      if (v === 'bold' || v === 'bolder' || parseInt(v, 10) >= 600) out.bold = true;
      else if (v === 'normal' || v === 'lighter' || parseInt(v, 10) < 600) out.bold = false;
    }
    if (s.fontStyle) {
      v = String(s.fontStyle).toLowerCase();
      if (v === 'italic' || v === 'oblique') out.italic = true;
      else if (v === 'normal') out.italic = false;
    }
    dec = String(s.textDecorationLine || s.textDecoration || '').toLowerCase();
    if (dec) {
      if (dec.indexOf('none') >= 0) out.underline = false;
      if (dec.indexOf('underline') >= 0) out.underline = true;
    }
    if (s.color) out.color = s.color;
  }
  if (!out.bold) delete out.bold;
  if (!out.italic) delete out.italic;
  if (!out.underline) delete out.underline;
  return Object.keys(out).length ? out : null;
};

Writer.editor._inlineStylesMatch = function _inlineStylesMatch(a, b) {
  if (!b) return true;
  if (!a) return false;
  var norm = function (v) { return String(v || '').trim().toLowerCase().replace(/['"]/g, ''); };
  if (b.fontSize && norm(a.fontSize) !== norm(b.fontSize)) return false;
  if (b.fontFamily && norm(a.fontFamily) !== norm(b.fontFamily)) return false;
  if (!!b.bold !== !!a.bold) return false;
  if (!!b.italic !== !!a.italic) return false;
  if (!!b.underline !== !!a.underline) return false;
  if (b.color && norm(a.color) !== norm(b.color)) return false;
  return true;
};

Writer.editor._applyStylesToSpan = function _applyStylesToSpan(span, styles) {
  if (!span || !styles) return;
  if (styles.fontSize != null) span.style.fontSize = styles.fontSize || '';
  if (styles.fontFamily != null) span.style.fontFamily = styles.fontFamily || '';
  if (styles.bold === true) span.style.fontWeight = 'bold';
  else if (styles.bold === false) span.style.fontWeight = 'normal';
  else if (styles.bold === '') span.style.fontWeight = '';
  if (styles.italic === true) span.style.fontStyle = 'italic';
  else if (styles.italic === false) span.style.fontStyle = 'normal';
  else if (styles.italic === '') span.style.fontStyle = '';
  if (styles.underline === true) span.style.textDecoration = 'underline';
  else if (styles.underline === false) span.style.textDecoration = 'none';
  else if (styles.underline === '') span.style.textDecoration = '';
  if (styles.color != null) span.style.color = styles.color || '';
};

Writer.editor._isBlockWithoutText = function _isBlockWithoutText(block) {
  if (!block) return true;
  if (block.querySelector && block.querySelector('img, table, hr, svg, canvas, video')) return false;
  return !(block.textContent || '').replace(/\u200b/g, '').length;
};

Writer.editor.applyPendingStyle = function applyPendingStyle(styles) {
  if (!styles) return null;
  var sel = window.getSelection();
  var range = Writer.editor._selRange(sel);
  if (!range || !Writer.editor._isCollapsed(sel, range)) return null;
  if (!Writer.editor.isInEditor(range.startContainer)) return null;

  Writer.editor._settingPending = true;
  try {
    var existing = Writer.editor.pendingSpanAt(range.startContainer);
    if (existing && !Writer.editor.isPendingEmpty(existing)) {
      existing.removeAttribute(Writer.editor.PENDING_ATTR);
      existing = null;
    }
    var tn, r;
    if (existing) {
      Writer.editor._applyStylesToSpan(existing, styles);
      tn = existing.firstChild;
      if (!tn || tn.nodeType !== 3) {
        tn = document.createTextNode(Writer.editor.ZWSP);
        existing.appendChild(tn);
      } else if (!tn.nodeValue || tn.nodeValue.indexOf(Writer.editor.ZWSP) === -1) {
        tn.nodeValue = Writer.editor.ZWSP;
      }
      r = Writer.editor._makeRange(tn, tn.nodeValue.length);
      if (sel.removeAllRanges) sel.removeAllRanges();
      if (sel.addRange) sel.addRange(r);
      return existing;
    }

    var span = document.createElement('span');
    span.setAttribute(Writer.editor.PENDING_ATTR, '1');
    Writer.editor._applyStylesToSpan(span, styles);
    tn = document.createTextNode(Writer.editor.ZWSP);
    span.appendChild(tn);
    Writer.editor._insertNodeAtRange(range, span);
    r = Writer.editor._makeRange(tn, tn.nodeValue.length);
    if (sel.removeAllRanges) sel.removeAllRanges();
    if (sel.addRange) sel.addRange(r);
    return span;
  } finally {
    Writer.editor._settingPending = false;
  }
};

Writer.editor.detachPendingAtCaret = function detachPendingAtCaret() {
  var sel = window.getSelection();
  var range = Writer.editor._selRange(sel);
  if (!range || !Writer.editor._isCollapsed(sel, range)) return null;
  var pend = Writer.editor.pendingSpanAt(range.startContainer);
  if (!pend || !Writer.editor.isPendingEmpty(pend)) return null;
  var snap = Writer.editor.inlineStyleAt(range.startContainer, range.startOffset);
  var par = pend.parentNode;
  if (!par) return snap;
  var idx = Array.prototype.indexOf.call(par.childNodes, pend);
  var prev = pend.previousSibling;
  par.removeChild(pend);
  var node = par, off = idx;
  if (prev && prev.nodeType === 3) {
    node = prev;
    off = prev.nodeValue.length;
  } else if (!par.firstChild && /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TD|TH)$/.test(par.tagName)) {
    par.appendChild(document.createElement('br'));
    node = par;
    off = 0;
  }
  var r = Writer.editor._makeRange(node, off);
  if (sel.removeAllRanges) sel.removeAllRanges();
  if (sel.addRange) sel.addRange(r);
  if (Writer.history && !Writer.history.applying && Writer.pages && Writer.pages.combinedHtml) {
    var h = Writer.history;
    if (h.undoStack && h.undoStack.length &&
        Writer.pages.combinedHtml() === h.undoStack[h.undoStack.length - 1].html) {
      h.undoStack.pop();
      h.current = h.snapshot();
      if (h.sync) h.sync();
    }
  }
  return snap;
};

Writer.editor.resolvePendingSpans = function resolvePendingSpans(root) {
  var scope = root || document;
  var attr = Writer.editor.PENDING_ATTR;
  var spans = scope.querySelectorAll ? scope.querySelectorAll('span[' + attr + ']') : [];
  if (!spans.length) return false;
  var sel = window.getSelection();
  var range = Writer.editor._selRange(sel);
  var anchorNode = range ? range.startContainer : (sel && sel.anchorNode);
  var anchorOffset = range ? range.startOffset : ((sel && sel.anchorOffset) || 0);
  var endNode = range ? range.endContainer : anchorNode;
  var endOffset = range ? range.endOffset : anchorOffset;
  var collapsed = Writer.editor._isCollapsed(sel, range);
  var changed = false, i;
  for (i = 0; i < spans.length; i++) {
    var sp = spans[i];
    if (Writer.editor.isPendingEmpty(sp)) continue;
    var stack = [sp], n, j;
    while (stack.length) {
      n = stack.pop();
      if (n.nodeType === 3) {
        if (n.nodeValue && n.nodeValue.indexOf(Writer.editor.ZWSP) !== -1) {
          if (anchorNode === n) {
            var beforeStart = n.nodeValue.slice(0, anchorOffset).match(/\u200b/g);
            if (beforeStart) anchorOffset = Math.max(0, anchorOffset - beforeStart.length);
          }
          if (endNode === n) {
            var beforeEnd = n.nodeValue.slice(0, endOffset).match(/\u200b/g);
            if (beforeEnd) endOffset = Math.max(0, endOffset - beforeEnd.length);
          }
          n.nodeValue = n.nodeValue.replace(/\u200b/g, '');
          changed = true;
        }
      } else if (n.nodeType === 1 && n.childNodes) {
        for (j = n.childNodes.length - 1; j >= 0; j--) stack.push(n.childNodes[j]);
      }
    }
    sp.removeAttribute(attr);
    changed = true;
  }
  if (changed && sel && anchorNode && Writer.editor.isInEditor(anchorNode)) {
    try {
      var r = Writer.editor._makeRange(anchorNode, Math.min(anchorOffset, anchorNode.nodeType === 3 ? anchorNode.nodeValue.length : anchorNode.childNodes.length));
      if (!collapsed && endNode && r.setEnd) {
        var emax = endNode.nodeType === 3 ? endNode.nodeValue.length : endNode.childNodes.length;
        r.setEnd(endNode, Math.min(endOffset, emax));
      }
      if (sel.removeAllRanges) sel.removeAllRanges();
      if (sel.addRange) sel.addRange(r);
      Writer.editor.saveSelection();
    } catch (e) {}
  }
  return changed;
};

Writer.editor.cleanupPendingSpans = function cleanupPendingSpans(keepSpan) {
  if (Writer.editor._settingPending || Writer.editor.isComposing) return false;
  if (Writer.flow && Writer.flow.busy) return false;
  if (Writer.history && Writer.history.applying) return false;
  var cfg = Writer.config;
  var spans = document.querySelectorAll('.' + cfg.editorClass + ' span[' + Writer.editor.PENDING_ATTR + ']');
  if (!spans.length) return false;
  var removed = false, i;
  for (i = spans.length - 1; i >= 0; i--) {
    var sp = spans[i];
    if (sp === keepSpan) continue;
    if (!Writer.editor.isPendingEmpty(sp)) continue;
    var cur = sp.parentNode;
    sp.remove();
    removed = true;
    while (cur && cur.nodeType === 1 && !cur.firstChild && !(cur.classList && cur.classList.contains(cfg.editorClass))) {
      if (/^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TD|TH)$/.test(cur.tagName)) {
        cur.appendChild(document.createElement('br'));
        break;
      }
      if (/^(B|STRONG|I|EM|U|S|STRIKE|DEL|SUP|SUB|SPAN|FONT)$/.test(cur.tagName)) {
        var up = cur.parentNode;
        cur.remove();
        cur = up;
      } else {
        break;
      }
    }
  }
  if (removed && Writer.history && !Writer.history.applying && Writer.pages && Writer.pages.combinedHtml) {
    var h = Writer.history;
    if (h.undoStack && h.undoStack.length &&
        Writer.pages.combinedHtml() === h.undoStack[h.undoStack.length - 1].html) {
      h.undoStack.pop();
      h.current = h.snapshot();
      if (h.sync) h.sync();
    }
  }
  return removed;
};

/* Strip ZWSP and empty pending spans on save / export / PDF. */
Writer.editor.stripPending = function stripPending(root) {
  if (!root) return;
  var attr = Writer.editor.PENDING_ATTR;
  var BLOCK = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TD|TH)$/;
  var INLINE = /^(B|STRONG|I|EM|U|S|STRIKE|DEL|SUP|SUB|SPAN|FONT)$/;
  var spans = root.querySelectorAll ? root.querySelectorAll('span[' + attr + ']') : [];
  var i;
  for (i = spans.length - 1; i >= 0; i--) {
    var sp = spans[i];
    if (Writer.editor.isPendingEmpty(sp)) {
      var cur = sp.parentNode;
      sp.remove();
      while (cur && cur !== root && cur.nodeType === 1 && !cur.firstChild) {
        if (BLOCK.test(cur.tagName)) {
          cur.appendChild(document.createElement('br'));
          break;
        }
        if (INLINE.test(cur.tagName)) {
          var up = cur.parentNode;
          cur.remove();
          cur = up;
        } else {
          break;
        }
      }
    } else {
      sp.removeAttribute(attr);
    }
  }
  var cleanText = function (tn) {
    if (!tn.nodeValue || tn.nodeValue.indexOf(Writer.editor.ZWSP) === -1) return;
    tn.nodeValue = tn.nodeValue.replace(/\u200b/g, '');
    if (!tn.nodeValue.length && tn.parentNode) {
      var par = tn.parentNode;
      tn.remove();
      if (par !== root && par.nodeType === 1 && BLOCK.test(par.tagName) && !par.firstChild) {
        par.appendChild(document.createElement('br'));
      }
    }
  };
  if (typeof document.createTreeWalker === 'function' && typeof NodeFilter !== 'undefined') {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = w.nextNode())) {
      if (n.nodeValue && n.nodeValue.indexOf(Writer.editor.ZWSP) !== -1) nodes.push(n);
    }
    for (i = 0; i < nodes.length; i++) cleanText(nodes[i]);
  } else {
    var walk = function (node) {
      var c = node.firstChild, nxt;
      while (c) {
        nxt = c.nextSibling;
        if (c.nodeType === 3) cleanText(c);
        else if (c.nodeType === 1) walk(c);
        c = nxt;
      }
    };
    walk(root);
  }
};

/* Shift+Enter: insert a real <br> (Chrome's insertLineBreak types "\n" under
   pre-wrap). A trailing placeholder <br> keeps an empty last line visible.
   DW25: carries inline formatting onto the new line via pending span. */
Writer.editor.insertLineBreak = function insertLineBreak() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  var range = sel.getRangeAt(0);
  var inlineSnap = Writer.editor.inlineStyleAt(range.startContainer, range.startOffset);
  if (Writer.editor._isCollapsed(sel, range)) {
    Writer.editor.detachPendingAtCaret();
    sel = window.getSelection();
    if (sel && sel.rangeCount) range = sel.getRangeAt(0);
  }
  if (range.deleteContents) range.deleteContents();
  var br = document.createElement('br');
  Writer.editor._insertNodeAtRange(range, br);
  var n = br;
  var needsPlaceholder = true;
  while (n && !(n.classList && n.classList.contains(Writer.config.editorClass))) {
    var sib = n.nextSibling;
    while (sib && sib.nodeType === 3 && !sib.nodeValue.length) sib = sib.nextSibling;
    if (sib) { needsPlaceholder = false; break; }
    n = n.parentNode;
    if (n && n.nodeType === 1 && /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TD|TH)$/.test(n.tagName)) break;
  }
  if (needsPlaceholder) br.parentNode.insertBefore(document.createElement('br'), br.nextSibling);
  var idx = Array.prototype.indexOf.call(br.parentNode.childNodes, br) + 1;
  var r = Writer.editor._makeRange(br.parentNode, idx);
  if (sel.removeAllRanges) sel.removeAllRanges();
  if (sel.addRange) sel.addRange(r);
  if (inlineSnap && (needsPlaceholder || !Writer.editor._inlineStylesMatch(Writer.editor.inlineStyleAt(br.parentNode, idx), inlineSnap))) {
    Writer.editor.applyPendingStyle(inlineSnap);
  }
  if (Writer.ui) Writer.ui.updateToolbarState();
  Writer.editor.saveSelection();
  var elHost = br.parentElement || br.parentNode;
  var host = elHost && elHost.closest && elHost.closest('.' + Writer.config.editorClass);
  if (host && host.dispatchEvent && typeof InputEvent !== 'undefined') {
    host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertLineBreak' }));
  }
};


/* DW24: alignment is a paragraph style, not an execCommand. Chrome's
   justify* treats a <br> as a paragraph break and would split a
   Shift+Enter line out into its own block. */
Writer.editor.ALIGN_BLOCKS = 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote,td,th';
Writer.editor.alignNames = { left: 'left', center: 'center', right: 'right', justify: 'justify',
  justifyLeft: 'left', justifyCenter: 'center', justifyRight: 'right', justifyFull: 'justify' };

Writer.editor.alignValue = function alignValue(el) {
  if (!el) return '';
  var a = (el.style && el.style.textAlign) || (el.getAttribute && el.getAttribute('align')) || '';
  a = String(a).toLowerCase().replace(/\s+/g, '');
  if (a === 'middle') a = 'center';
  if (a === 'justify' || a === 'center' || a === 'right' || a === 'left') return a;
  return '';
};

Writer.editor.alignBlockOf = function alignBlockOf(node) {
  var el = node && (node.nodeType === 1 ? node : node.parentElement);
  if (!el || !Writer.editor.isInEditor(el)) return null;
  var b = el.closest(Writer.editor.ALIGN_BLOCKS);
  if (!b || b.classList.contains(Writer.config.editorClass) || b.classList.contains('dr-pagebreak')) return null;
  if (!b.closest('.' + Writer.config.editorClass)) return null;
  return b;
};

/* Innermost blocks touched by the selection (same idea as Writer.spacing.blocks). */
Writer.editor.alignBlocks = function alignBlocks() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return [];
  var r = sel.getRangeAt(0);
  var first = Writer.editor.alignBlockOf(r.startContainer);
  if (sel.isCollapsed) return first ? [first] : [];
  var host = (first || r.commonAncestorContainer);
  host = host.nodeType === 1 ? host : host.parentElement;
  var ed = host && host.closest('.' + Writer.config.editorClass);
  if (!ed) return first ? [first] : [];
  var all = ed.querySelectorAll(Writer.editor.ALIGN_BLOCKS), out = [], i;
  for (i = 0; i < all.length; i++) {
    var b = all[i];
    if (b.classList.contains('dr-pagebreak') || (r.intersectsNode && !r.intersectsNode(b))) continue;
    if (b.querySelector(Writer.editor.ALIGN_BLOCKS)) continue;
    out.push(b);
  }
  if (!out.length && first) out.push(first);
  return out;
};

Writer.editor.alignAtCaret = function alignAtCaret() {
  var bl = Writer.editor.alignBlocks(), i, v;
  if (!bl.length) return '';
  v = Writer.editor.alignValue(bl[0]);
  for (i = 1; i < bl.length; i++) if (Writer.editor.alignValue(bl[i]) !== v) return '';
  return v;
};

/* kind is left|center|right|justify (or a justify* execCommand name).
   Already-aligned blocks stay as they are (no toggle off). */
Writer.editor.setAlign = function setAlign(kind) {
  var v = Writer.editor.alignNames[kind] || kind;
  if (!/^(left|center|right|justify)$/.test(v)) return;
  Writer.editor.focusEditor();
  if (Writer.editor.restoreSelection) Writer.editor.restoreSelection();
  var bl = Writer.editor.alignBlocks();
  if (!bl.length) return;
  bl.forEach(function (b) {
    if (b.removeAttribute && b.getAttribute && b.getAttribute('align')) b.removeAttribute('align');
    b.style.textAlign = v;
  });
  /* Style-only change: the incremental reflow only notices moved nodes, so lay out fully. */
  if (Writer.pages && Writer.pages.layoutAll) Writer.pages.layoutAll();
  if (Writer.app && Writer.app.ready) {
    clearTimeout(Writer.app.inputTimer);
    Writer.app.inputTimer = setTimeout(function () { Writer.storage.save(); }, Writer.config.inputDebounceMs);
  }
  if (Writer.ui) Writer.ui.updateToolbarState();
  Writer.editor.saveSelection();
};

/* Run a contenteditable command, then refresh toolbar and pages. */
Writer.editor.execCmd = function execCmd(command, value) {
  Writer.editor.focusEditor();
  if (/^(bold|italic|underline)$/.test(command)) {
    var sel = window.getSelection();
    var r = Writer.editor._selRange(sel);
    if (r && Writer.editor._isCollapsed(sel, r)) {
      var pend = Writer.editor.pendingSpanAt(r.startContainer);
      if (pend && Writer.editor.isPendingEmpty(pend)) {
        var cur = Writer.editor.inlineStyleAt(r.startContainer, r.startOffset) || {};
        var idx = pend.parentNode ? Array.prototype.indexOf.call(pend.parentNode.childNodes, pend) : 0;
        var parentCur = pend.parentNode ? Writer.editor.inlineStyleAt(pend.parentNode, idx) : null;
        var patch = {};
        if (command === 'bold') patch.bold = cur.bold ? ((parentCur && parentCur.bold) ? false : '') : true;
        if (command === 'italic') patch.italic = cur.italic ? ((parentCur && parentCur.italic) ? false : '') : true;
        if (command === 'underline') patch.underline = cur.underline ? ((parentCur && parentCur.underline) ? false : '') : true;
        Writer.editor.applyPendingStyle(patch);
        if (Writer.ui) Writer.ui.updateToolbarState();
        Writer.editor.saveSelection();
        return;
      }
    }
  }
  document.execCommand(command, false, value == null ? null : value);
  if (Writer.ui) Writer.ui.updateToolbarState();
  Writer.editor.saveSelection();
  if (command === 'insertLineBreak' || command === 'insertParagraph') {
    setTimeout(function () {
      if (Writer.pages) Writer.pages.checkPagination();
    }, Writer.config.paginationAfterInsertMs);
  }
};

/* Superscript / subscript: one at a time. Turning one on clears the other. */
Writer.editor.setScript = function setScript(kind) {
  var other = kind === 'superscript' ? 'subscript' : 'superscript';
  Writer.editor.focusEditor();
  var st = function (c) { try { return document.queryCommandState(c); } catch (e) { return false; } };
  if (!st(kind) && st(other)) document.execCommand(other, false, null);
  Writer.editor.execCmd(kind);
};

/* Apply a font family name to the current selection (DW25: pending span at caret). */
Writer.editor.setFontFamily = function setFontFamily(name) {
  var family = name || Writer.config.fontCommandName;
  Writer.editor.focusEditor();
  var sel = window.getSelection();
  var range = Writer.editor._selRange(sel);
  if (range && Writer.editor._isCollapsed(sel, range) && Writer.editor.isInEditor(range.startContainer)) {
    Writer.editor.applyPendingStyle({ fontFamily: family });
  } else {
    document.execCommand('fontName', false, family);
  }
  if (Writer.ui) Writer.ui.updateToolbarState();
  Writer.editor.saveSelection();
};

/* Force Times New Roman on the current selection. */
Writer.editor.setTimesNewRoman = function setTimesNewRoman() {
  Writer.editor.setFontFamily(Writer.config.fontCommandName);
};

/* Apply a real point size (8–36) to the selection.
   With a collapsed caret (DW25), insert a ZWSP pending span so new text inherits the size.
   With selected text, mark with size 7 and swap in a pt span. */
Writer.editor.applyFontSize = function applyFontSize(pt) {
  var size = parseInt(pt, 10);
  if (!size) return;
  Writer.editor.focusEditor();
  var sel0 = window.getSelection();
  var r0 = Writer.editor._selRange(sel0);
  if (r0 && Writer.editor._isCollapsed(sel0, r0) && Writer.editor.isInEditor(r0.startContainer)) {
    Writer.editor.applyPendingStyle({ fontSize: size + 'pt' });
    if (Writer.ui) Writer.ui.updateToolbarState();
    Writer.editor.saveSelection();
    var host0 = Writer.editor.activeEditor;
    if (host0 && host0.dispatchEvent && typeof InputEvent !== 'undefined') {
      host0.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatFontSize' }));
    }
    return;
  }
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  document.execCommand('fontSize', false, '7');
  var marks = document.querySelectorAll('.' + Writer.config.editorClass + ' font[size="7"]');
  var i;
  for (i = 0; i < marks.length; i++) {
    var span = document.createElement('span');
    span.style.fontSize = size + 'pt';
    if (marks[i].face) span.style.fontFamily = marks[i].face;
    while (marks[i].firstChild) span.appendChild(marks[i].firstChild);
    var inner = span.querySelectorAll('[style*="font-size"]');
    var j;
    for (j = 0; j < inner.length; j++) inner[j].style.fontSize = '';
    var sel = window.getSelection();
    var range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    var wasStart = range && marks[i].contains(range.startContainer);
    var wasEnd = range && marks[i].contains(range.endContainer);
    marks[i].parentNode.replaceChild(span, marks[i]);
    if (wasStart || wasEnd) {
      var r = document.createRange();
      r.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
  if (Writer.ui) Writer.ui.updateToolbarState();
  Writer.editor.saveSelection();
  var host = Writer.editor.activeEditor;
  if (host) host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatFontSize' }));
};

/* DF16: legacy plain-text paste kept as comment; now Writer.editor.pastePlain.
/* Paste plain text only, then restyle and reflow. * /
Writer.editor.onPaste = function onPaste(e) {
  e.preventDefault();
  var text = (e.clipboardData || window.clipboardData).getData('text/plain');
  var fontSelect = document.getElementById('fontFamilySelect');
  var font = fontSelect ? fontSelect.value : Writer.config.fontCommandName;
  /* Set the typing font first so the inserted text takes it. * /
  Writer.editor.setFontFamily(font);
  document.execCommand('insertText', false, text);
  Writer.editor.saveSelection();
  if (Writer.pages) Writer.pages.checkPagination();
};

*/

/* Normalise clipboard plain text: CRLF / CR become LF, one trailing
   newline is a terminator not a blank line (same idea as DW9 .txt open
   and header/footer paste). Internal blank lines are kept. */
Writer.editor.plainText = function plainText(text) {
  text = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  if (text.charAt(text.length - 1) === '\n') text = text.slice(0, -1);
  return text;
};

/* Plain text paste (R7: takes the toolbar font), then reflow. */
Writer.editor.pastePlain = function pastePlain(text) {
  var fontSelect = document.getElementById('fontFamilySelect');
  var font = fontSelect ? fontSelect.value : Writer.config.fontCommandName;
  Writer.editor.setFontFamily(font);
  /* (before DW22) document.execCommand('insertText', false, text); */
  document.execCommand('insertText', false, Writer.editor.plainText(text));
  Writer.editor.saveSelection();
  if (Writer.pages) Writer.pages.checkPagination();
};

/* DF16: formatted paste lives in writer-paste.js; plain text otherwise. */
Writer.editor.onPaste = function onPaste(e) {
  if (Writer.paste && Writer.paste.handle) return Writer.paste.handle(e);
  e.preventDefault();
  var cd = e.clipboardData || window.clipboardData;
  Writer.editor.pastePlain(cd.getData('text/plain'));
};


/* DW23: Enter starts a new paragraph and copies the previous block's
   indent, line spacing and alignment onto it (lists are left alone).
   DW25: Enter also carries the caret's inline character formatting onto the new block. */
Writer.editor.insertParagraph = function insertParagraph() {
  Writer.editor.focusEditor();
  var I = Writer.indent, snap = null, inlineSnap = null;
  var sel = window.getSelection();
  var r0 = Writer.editor._selRange(sel);
  if (r0) {
    if (I && I.paraStyle && I.blockOf) {
      snap = I.paraStyle(I.blockOf(r0.startContainer, I.hostOf(r0.startContainer)));
    }
    inlineSnap = Writer.editor.inlineStyleAt(r0.startContainer, r0.startOffset);
    if (Writer.editor._isCollapsed(sel, r0)) Writer.editor.detachPendingAtCaret();
  }
  document.execCommand('insertParagraph', false, null);
  var next = (I && I.blockForEnter) ? I.blockForEnter() : null;
  if (snap && I && I.applyParaStyle && next) I.applyParaStyle(next, snap);
  if (inlineSnap) {
    var sel1 = window.getSelection();
    var r1 = Writer.editor._selRange(sel1);
    if (r1 && Writer.editor.isInEditor(r1.startContainer)) {
      var curBlock = next || Writer.editor.alignBlockOf(r1.startContainer);
      var emptyBlock = Writer.editor._isBlockWithoutText(curBlock);
      var curStyle = Writer.editor.inlineStyleAt(r1.startContainer, r1.startOffset);
      if (emptyBlock || !Writer.editor._inlineStylesMatch(curStyle, inlineSnap)) {
        if (emptyBlock && r1.startContainer.nodeType === 1 && r1.startOffset > 0 && r1.startContainer.childNodes) {
          var prevBr = r1.startContainer.childNodes[r1.startOffset - 1];
          var nextChild = r1.startContainer.childNodes[r1.startOffset];
          if (prevBr && prevBr.tagName === 'BR' && !nextChild) {
            var fixR = Writer.editor._makeRange(r1.startContainer, r1.startOffset - 1);
            if (sel1.removeAllRanges) sel1.removeAllRanges();
            if (sel1.addRange) sel1.addRange(fixR);
          }
        }
        Writer.editor.applyPendingStyle(inlineSnap);
      }
    }
  }
  if (Writer.ui) Writer.ui.updateToolbarState();
  Writer.editor.saveSelection();
  setTimeout(function () {
    if (Writer.pages) Writer.pages.checkPagination();
  }, Writer.config.paginationAfterInsertMs);
};

/* Enter / Shift+Enter, paste, pending-style cleanup and focus from every page editor. */
Writer.editor.bind = function bind() {
  var cfg = Writer.config;
  /* Enter = new <p>, Shift+Enter = <br> line break. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
      if (Writer.editor.isInEditor(e.target)) {
        var selL = window.getSelection();
        var rL = Writer.editor._selRange(selL);
        if (rL && Writer.editor._isCollapsed(selL, rL)) {
          var pendL = Writer.editor.pendingSpanAt(rL.startContainer);
          if (pendL && Writer.editor.isPendingEmpty(pendL)) Writer.editor.detachPendingAtCaret();
        }
      }
      return;
    }
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (!Writer.editor.isInEditor(e.target)) return;
    e.preventDefault();
    if (e.shiftKey) Writer.editor.insertLineBreak();
    /* (before DW23) else Writer.editor.execCmd('insertParagraph'); */
    else Writer.editor.insertParagraph();
  });
  document.addEventListener('beforeinput', function (e) {
    if (e.isComposing || Writer.editor.isComposing) return;
    if (e.inputType !== 'deleteContentBackward') return;
    if (!Writer.editor.isInEditor(e.target)) return;
    var selB = window.getSelection();
    var rB = Writer.editor._selRange(selB);
    if (rB && Writer.editor._isCollapsed(selB, rB)) {
      var pendB = Writer.editor.pendingSpanAt(rB.startContainer);
      if (pendB && Writer.editor.isPendingEmpty(pendB)) Writer.editor.detachPendingAtCaret();
    }
  }, true);
  document.addEventListener('compositionstart', function (e) {
    if (Writer.editor.isInEditor(e.target)) Writer.editor.isComposing = true;
  }, true);
  document.addEventListener('compositionend', function (e) {
    if (!Writer.editor.isInEditor(e.target)) return;
    Writer.editor.isComposing = false;
    var el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    var ed = el && el.closest && el.closest('.' + cfg.editorClass);
    Writer.editor.resolvePendingSpans(ed || document);
  }, true);
  document.addEventListener('input', function (e) {
    if (e.isComposing || Writer.editor.isComposing || e.inputType === 'insertCompositionText') return;
    if (!Writer.editor.isInEditor(e.target)) return;
    var el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    var ed = el && el.closest && el.closest('.' + cfg.editorClass);
    Writer.editor.resolvePendingSpans(ed || document);
  }, true);
  document.addEventListener('selectionchange', function () {
    var active = document.activeElement;
    if (!active || !active.classList || !active.classList.contains(cfg.editorClass)) return;
    var selS = window.getSelection();
    var rS = Writer.editor._selRange(selS);
    if (!rS || !Writer.editor.isInEditor(rS.startContainer)) return;
    var keep = null;
    if (Writer.editor._isCollapsed(selS, rS)) {
      keep = Writer.editor.pendingSpanAt(rS.startContainer);
    } else {
      var aP = Writer.editor.pendingSpanAt(rS.startContainer);
      var bP = Writer.editor.pendingSpanAt(rS.endContainer);
      if (aP && aP === bP) keep = aP;
    }
    Writer.editor.cleanupPendingSpans(keep);
  });
  /* Toolbar buttons never steal the caret. */
  document.querySelectorAll('.tool-btn').forEach(function (btn) {
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  });
  var workspace = document.getElementById('workspace');
  if (workspace) {
    workspace.addEventListener('paste', function (e) {
      if (!Writer.editor.isInEditor(e.target)) return;
      Writer.editor.onPaste(e);
    });
    workspace.addEventListener('focusin', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains(cfg.editorClass)) {
        Writer.editor.activeEditor = e.target;
      }
    });
  }
};
