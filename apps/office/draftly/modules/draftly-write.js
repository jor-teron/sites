/* ============================================================
   FILE: modules/draftly-write.js
   PROJECT: Writer (folder draftly)
   ROLE: DF21 writing helpers on the Review tab:
         Spelling   on / off, the browser's own checker on the page
                    editors (setting 'spellcheck' in draftly_settings,
                    default off). Header / footer slots stay off.
         Case       selected text to UPPER, lower or Title Case. Text
                    nodes are changed in place, so bold / italic / colour
                    stay. One undo step.
         Status     character count and reading time next to the word
                    count (draftly-wordcount.js calls Draftly.write.status).
         Focus      hides the top row, ribbon, ruler and status bar; a
                    small bar (Undo, Redo, Save, Exit) stays. Esc, Exit,
                    the Focus button or any ribbon / Hub tab ends it.
                    Session only (not saved).
         Read aloud selection, or the whole document as plain text,
                    into the Read Aloud app (apps/tools/read-aloud/):
                    written to its own localStorage keys, then opened
                    like other apps open apps (Hub __hubOpenApp, else a
                    hub-open-app message, else a new tab).
   Text rules (case, reading time, plain text) live in
   draftly-writetext.js so they can be tested in Node.
   DEPENDS: writeText, config, editor, find, history, settings, ui,
            view, ribbon, how (at call time)
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.write = { focusOn: false };

(function () {
  var D = Draftly, W = D.write, T = D.writeText;
  if (!T) { console.warn('draftly: writetext missing, DF21 helpers skipped'); return; }

  function $(id) { return document.getElementById(id); }
  function toast(m) { if (D.ui && D.ui.showToast) D.ui.showToast(m); }
  function editors() { return Array.prototype.slice.call(document.querySelectorAll('.' + D.config.editorClass)); }
  function press(btn, on) { if (btn) { btn.setAttribute('aria-pressed', String(!!on)); btn.classList.toggle('active', !!on); } }

  /* ---------- spelling ---------- */

  W.spellOn = function () { return T.spellOn(D.settings && D.settings.s); };
  W.applySpell = function applySpell() {
    var on = W.spellOn();
    editors().forEach(function (ed) { ed.spellcheck = on; ed.setAttribute('spellcheck', on ? 'true' : 'false'); });
    press($('spellBtn'), on);
  };
  W.toggleSpell = function toggleSpell() {
    var on = !W.spellOn();
    if (D.settings && D.settings.panel) D.settings.set('spellcheck', on);   /* apply() runs applySpell */
    else W.applySpell();
    toast(on ? 'Spell check on (your browser\u2019s checker)' : 'Spell check off');
  };

  /* ---------- change case ---------- */

  var BLOCK = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th,div';
  function blockOf(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    var b = el && el.closest(BLOCK);
    return b && !b.classList.contains(D.config.editorClass) ? b : (el && el.closest('.' + D.config.editorClass));
  }
  /* Not document text: page breaks, page numbers, marks. */
  function skipText(node) {
    var el = node.parentElement;
    if (!el || !D.editor.isInEditor(node)) return true;
    for (; el && !el.classList.contains(D.config.editorClass); el = el.parentElement) {
      if (D.find && D.find.skip && D.find.skip(el)) return true;
    }
    return false;
  }
  function textBefore(node, offset) {
    var b = blockOf(node);
    if (!b) return '';
    var r = document.createRange();
    r.setStart(b, 0);
    try { r.setEnd(node, offset); } catch (e) { return ''; }
    return r.toString().slice(-2);
  }
  function brBetween(a, b) {
    var r = document.createRange();
    r.setStartAfter(a); r.setEndBefore(b);
    return !!r.cloneContents().querySelector('br');
  }

  W.changeCase = function changeCase(mode) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) { sel = null; }
    if ((!sel || sel.isCollapsed || !D.editor.isInEditor(sel.anchorNode)) && D.editor.savedRange && !D.editor.savedRange.collapsed) {
      D.editor.restoreSelection();
      sel = window.getSelection();
    }
    if (!sel || !sel.rangeCount || sel.isCollapsed || !D.editor.isInEditor(sel.anchorNode) || !D.editor.isInEditor(sel.focusNode)) {
      toast('Select some text first');
      return false;
    }
    var r = sel.getRangeAt(0);
    var root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    var nodes = [];
    if (r.startContainer === r.endContainer && r.startContainer.nodeType === 3) nodes.push(r.startContainer);
    else {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) { return r.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
      });
      var n;
      while ((n = w.nextNode())) nodes.push(n);
    }
    nodes = nodes.filter(function (x) { return !skipText(x); });
    if (!nodes.length) { toast('Select some text first'); return false; }

    if (D.history) D.history.checkpoint();
    var first = null, firstStart = 0, last = null, lastEnd = 0, changed = false;
    var ctx = '', prev = null;
    nodes.forEach(function (node, i) {
      var len = node.nodeValue.length;
      var a = node === r.startContainer ? r.startOffset : 0;
      var b = node === r.endContainer ? r.endOffset : len;
      if (a >= b) return;
      if (i === 0 || !prev) ctx = textBefore(node, a);
      else if (blockOf(prev) !== blockOf(node) || brBetween(prev, node)) ctx = '';
      var v = node.nodeValue, mid = v.slice(a, b);
      var out = T.caseText(mid, mode, ctx);
      ctx = (ctx + mid).slice(-2);
      prev = node;
      if (out !== mid) { node.nodeValue = v.slice(0, a) + out + v.slice(b); changed = true; }
      if (!first) { first = node; firstStart = a; }
      last = node; lastEnd = a + out.length;
    });
    if (!first) { toast('Select some text first'); return false; }
    try {
      var nr = document.createRange();
      nr.setStart(first, firstStart); nr.setEnd(last, lastEnd);
      sel.removeAllRanges(); sel.addRange(nr);
      D.editor.saveSelection();
    } catch (e) { /* keep going */ }
    if (changed) {
      var host = first.parentElement && first.parentElement.closest('.' + D.config.editorClass);
      /* One undo step (history commits on a non-typing input), autosave, reflow, recount. */
      if (host) host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    }
    return changed;
  };

  /* ---------- status bar: characters and reading time ---------- */

  W.status = function status(s) {
    var c = $('statusChars'), rd = $('statusRead');
    if (c) c.textContent = T.charLabel(s.chars);
    if (rd) rd.textContent = T.readLabel(s.words);
  };

  /* ---------- focus mode ---------- */

  function busy() {
    if (D.hf && D.hf.editing) return true;
    if (D.image && D.image.sel && document.contains(D.image.sel)) return true;
    return !!document.querySelector('dialog[open], .pop-menu:not([hidden]), #findBar:not([hidden]), #tablePicker:not([hidden]), #settingsPanel:not([hidden]), .mm-backdrop');
  }
  W.setFocus = function setFocus(on) {
    on = !!on;
    if (on === W.focusOn) return;
    W.focusOn = on;
    if (on && D.view) D.view.closePops();
    if (on && D.ribbon && D.ribbon.isFileOpen()) D.ribbon.setFile(false);
    document.body.classList.toggle(T.FOCUS_CLASS, on);
    var bar = $('focusBar');
    if (bar) bar.hidden = !on;
    press($('focusBtn'), on);
    if (D.view) D.view.fit();
    if (D.ruler && D.ruler.on && D.ruler.sync) D.ruler.sync();
    if (D.editor) D.editor.focusEditor();
    if (window.OfficeQuick) OfficeQuick.refresh();
    if (on) toast('Focus mode. Esc to exit.');
  };

  /* ---------- read aloud ---------- */

  W.readText = function readText() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed && D.editor.isInEditor(sel.anchorNode) && D.editor.isInEditor(sel.focusNode)) {
      var t = T.tidy(sel.toString());
      if (t) return { text: t, part: 'selection' };
    }
    return { text: T.plainFromBlocks(D.find && D.find.blocks ? D.find.blocks() : []), part: 'document' };
  };

  function inFrame() { try { return window.parent && window.parent !== window; } catch (e) { return true; } }
  function openReadAloud() {
    var t = null;
    try { t = window.top; } catch (e) { t = null; }
    try { if (t && t !== window && typeof t.__hubOpenApp === 'function' && t.__hubOpenApp(T.RA_ENTRY) !== false) return 'hub'; } catch (e) { /* file:// or another origin */ }
    var url = new URL(T.RA_PAGE, location.href).href;
    if (inFrame()) {
      try {
        var file = location.protocol === 'file:';
        window.parent.postMessage({ type: 'hub-open-app', url: new URL('../../tools/read-aloud/', location.href).href, name: 'Read Aloud' }, file ? '*' : location.origin);
        return 'message';
      } catch (e) { /* fall through */ }
    }
    var a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    return 'tab';
  }

  W.readAloud = function readAloud() {
    var got = W.readText();
    if (!got.text) { toast('Nothing to read yet'); return Promise.resolve(false); }
    var h = T.raHandoff(got.text);
    try {
      Object.keys(h.set).forEach(function (k) { localStorage.setItem(k, h.set[k]); });
      h.remove.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {
      toast('Could not pass the text to Read Aloud (browser storage is blocked or full).');
      return Promise.resolve(false);
    }
    /* In the Hub (Phone mode) Read Aloud replaces this frame: save the .how first. */
    var save = inFrame() && D.how && D.app && D.app.ready ? D.how.autosave() : null;
    return Promise.resolve(save).catch(function () {}).then(function () {
      var how = openReadAloud();
      toast(got.part === 'selection' ? 'Selection sent to Read Aloud' : 'Document sent to Read Aloud');
      return how;
    });
  };

  /* ---------- wiring ---------- */

  W.init = function init() {
    var on = D.ui && D.ui.onClick ? D.ui.onClick : function () {};
    on('spellBtn', W.toggleSpell);
    on('focusBtn', function () { W.setFocus(!W.focusOn); });
    on('focusExitBtn', function () { W.setFocus(false); });
    on('readAloudBtn', function () { W.readAloud(); });
    ['undo', 'redo', 'save'].forEach(function (id) {
      on('focus' + id.charAt(0).toUpperCase() + id.slice(1) + 'Btn', function () { if (window.OfficeQuick) OfficeQuick.run(id); });
    });
    var cb = document.querySelectorAll('[data-case]');
    for (var i = 0; i < cb.length; i++) {
      (function (b) {
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });   /* keep the selection */
        b.addEventListener('click', function (e) { e.preventDefault(); W.changeCase(b.getAttribute('data-case')); });
      })(cb[i]);
    }
    /* Esc ends focus mode unless something else (find, a menu, a dialog, header/footer) is open. */
    window.addEventListener('keydown', function (e) {
      if (!W.focusOn || e.key !== 'Escape' || e.defaultPrevented || busy()) return;
      e.preventDefault();
      W.setFocus(false);
    }, true);
    /* Any tab switch (ribbon, Hub title bar, hub-action) brings the ribbon back. */
    if (D.ribbon && D.ribbon.selectTab) {
      var sel = D.ribbon.selectTab;
      D.ribbon.selectTab = function () { if (W.focusOn) W.setFocus(false); return sel.apply(this, arguments); };
    }
    W.applySpell();
    if (D.find && D.find.last) W.status(D.find.last);
  };

  W.init();
})();
