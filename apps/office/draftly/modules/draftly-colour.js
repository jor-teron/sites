/*
  ============================================================
  FILE: modules/draftly-colour.js
  PROJECT: Draftly
  ROLE: FT3 text colour and highlight split buttons + palettes.
        Colours are written as <span style="color / background-color">
        so print, PDF and DOCX keep them.
  ============================================================
*/
window.Draftly = window.Draftly || {};
Draftly.colour = {
  /* null value = Automatic / No colour */
  text: [
    ['Automatic', null], ['Black', '#000000'], ['Dark grey', '#595959'],
    ['Red', '#ff0000'], ['Dark red', '#c00000'], ['Orange', '#ed7d31'],
    ['Gold', '#bf9000'], ['Green', '#00b050'], ['Blue', '#0070c0'],
    ['Dark blue', '#002060'], ['Purple', '#7030a0']
  ],
  hilite: [
    ['No colour', null], ['Yellow', '#ffff00'], ['Bright green', '#00ff00'],
    ['Turquoise', '#00ffff'], ['Pink', '#ff00ff'], ['Blue', '#0000ff'],
    ['Red', '#ff0000'], ['Grey', '#d9d9d9'], ['Light orange', '#ffd966'],
    ['Light green', '#c6efce'], ['Light blue', '#bdd7ee']
  ],
  keys: { text: 'draftly.lastTextColour', hilite: 'draftly.lastHiliteColour' },
  defaults: { text: '#ff0000', hilite: '#ffff00' },
  /* Sentinel colours: execCommand marks the selection, we then rewrite. */
  marker: { text: 'rgb(1, 2, 3)', hilite: 'rgb(3, 2, 1)' },
  openKind: null
};

Draftly.colour.last = function last(kind) {
  var v = null;
  try { v = localStorage.getItem(Draftly.colour.keys[kind]); } catch (e) {}
  return v === 'none' ? null : (v || Draftly.colour.defaults[kind]);
};

Draftly.colour.remember = function remember(kind, value) {
  try { localStorage.setItem(Draftly.colour.keys[kind], value || 'none'); } catch (e) {}
  Draftly.colour.syncBars();
};

Draftly.colour.syncBars = function syncBars() {
  var t = document.getElementById('textColourBar');
  var h = document.getElementById('hiliteColourBar');
  var lt = Draftly.colour.last('text'), lh = Draftly.colour.last('hilite');
  if (t) t.style.background = lt || '#000000';
  if (h) { h.style.background = lh || 'transparent'; h.classList.toggle('none', !lh); }
};

/* Apply a colour (or null to remove) to the current selection. */
Draftly.colour.apply = function apply(kind, value) {
  var C = Draftly.colour;
  var prop = kind === 'text' ? 'color' : 'backgroundColor';
  if (Draftly.history && Draftly.history.commit) Draftly.history.commit();
  Draftly.editor.focusEditor();
  var sel = window.getSelection();
  if (C.range) {
    var host0 = C.range.startContainer.parentElement && C.range.startContainer.parentElement.closest('.' + Draftly.config.editorClass);
    if (host0) host0.focus({ preventScroll: true });
    sel.removeAllRanges(); sel.addRange(C.range); C.range = null;
  }
  if (!sel || !sel.rangeCount || sel.isCollapsed) { Draftly.ui.showToast && Draftly.ui.showToast('Select text first'); return; }
  try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
  var mark = C.marker[kind];
  if (kind === 'text') document.execCommand('foreColor', false, mark);
  else if (!document.execCommand('hiliteColor', false, mark)) document.execCommand('backColor', false, mark);
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  var nodes = document.querySelectorAll('.' + Draftly.config.editorClass + ' [style]');
  var first = null, lastNode = null, i;
  for (i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.style[prop] !== mark) continue;
    /* clear inner colours so the new one wins */
    var inner = n.querySelectorAll('[style]'), j;
    for (j = 0; j < inner.length; j++) inner[j].style[prop] = '';
    n.style[prop] = value || '';
    if (!first) first = n;
    lastNode = n;
  }
  /* Removing: also clear ancestors that colour the whole selection */
  if (!value && first) {
    var a = first.parentElement;
    while (a && !a.classList.contains(Draftly.config.editorClass)) {
      if (a.style && a.style[prop] && a.contains(lastNode)) {
        var t = a.textContent.trim(), s = sel.toString().trim();
        if (t === s) a.style[prop] = '';
      }
      a = a.parentElement;
    }
  }
  if (first && lastNode) {
    try {
      var r = document.createRange();
      r.setStartBefore(first.firstChild || first); r.setEndAfter(lastNode.lastChild || lastNode);
      sel.removeAllRanges(); sel.addRange(r);
    } catch (e) {}
  }
  C.remember(kind, value);
  Draftly.editor.saveSelection();
  var host = first && first.closest('.' + Draftly.config.editorClass);
  if (host) host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatFontColor' }));
  if (Draftly.history && Draftly.history.commit) Draftly.history.commit();
  if (Draftly.ui) Draftly.ui.updateToolbarState();
};

Draftly.colour.build = function build(kind) {
  var menu = document.getElementById(kind === 'text' ? 'textColourMenu' : 'hiliteColourMenu');
  Draftly.colour[kind].forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (c[1] ? '' : ' swatch-none');
    b.setAttribute('role', 'menuitem');
    b.title = c[0];
    b.setAttribute('aria-label', c[0]);
    if (c[1]) b.style.background = c[1];
    else b.innerHTML = '<span>' + c[0] + '</span>';
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () { Draftly.colour.close(false, true); Draftly.colour.apply(kind, c[1]); });
    menu.appendChild(b);
  });
  menu.addEventListener('keydown', function (e) {
    var items = Array.prototype.slice.call(menu.querySelectorAll('.swatch'));
    var i = items.indexOf(document.activeElement);
    var step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 5, ArrowUp: -5 }[e.key];
    if (step) {
      e.preventDefault();
      if (i < 0) i = 0; else if (i === 0 && step > 1) i = 1; else i = Math.max(0, Math.min(items.length - 1, i + step));
      items[i].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); Draftly.colour.close(true);
    } else if (e.key === 'Tab') { Draftly.colour.close(); }
  });
};

Draftly.colour.open = function open(kind) {
  var C = Draftly.colour;
  if (C.openKind === kind) { C.close(); return; }
  C.close();
  var cur = window.getSelection();
  C.range = (cur && cur.rangeCount && !cur.isCollapsed && Draftly.editor.isInEditor(cur.anchorNode.nodeType === 1 ? cur.anchorNode : cur.anchorNode.parentElement)) ? cur.getRangeAt(0).cloneRange() : null;
  var arrow = document.getElementById(kind === 'text' ? 'textColourArrow' : 'hiliteColourArrow');
  var menu = document.getElementById(kind === 'text' ? 'textColourMenu' : 'hiliteColourMenu');
  var r = arrow.parentElement.getBoundingClientRect();
  menu.hidden = false;
  menu.style.top = Math.round(r.bottom + 4) + 'px';
  menu.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))) + 'px';
  arrow.setAttribute('aria-expanded', 'true');
  C.openKind = kind;
  var f = menu.querySelector('.swatch');
  if (f) f.focus({ preventScroll: true });
};

Draftly.colour.close = function close(refocus, keepRange) {
  var C = Draftly.colour;
  if (!C.openKind) return;
  if (!keepRange) C.range = null;
  var kind = C.openKind;
  var arrow = document.getElementById(kind === 'text' ? 'textColourArrow' : 'hiliteColourArrow');
  document.getElementById(kind === 'text' ? 'textColourMenu' : 'hiliteColourMenu').hidden = true;
  arrow.setAttribute('aria-expanded', 'false');
  C.openKind = null;
  if (refocus) arrow.focus();
};

Draftly.colour.init = function init() {
  var C = Draftly.colour;
  if (!document.getElementById('textColourBtn')) return;
  C.build('text'); C.build('hilite');
  C.syncBars();
  [['text', 'textColour'], ['hilite', 'hiliteColour']].forEach(function (p) {
    var main = document.getElementById(p[1] + 'Btn');
    var arrow = document.getElementById(p[1] + 'Arrow');
    [main, arrow].forEach(function (b) { b.addEventListener('mousedown', function (e) { e.preventDefault(); }); });
    main.addEventListener('click', function () { C.close(); C.apply(p[0], C.last(p[0])); });
    arrow.addEventListener('click', function () { C.open(p[0]); });
    arrow.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); C.open(p[0]); }
    });
  });
  document.addEventListener('mousedown', function (e) {
    if (!C.openKind) return;
    if (e.target.closest('.colour-menu') || e.target.closest('.split-btn')) return;
    C.close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && C.openKind) C.close(true);
  });
  window.addEventListener('resize', function () { C.close(); });
};
