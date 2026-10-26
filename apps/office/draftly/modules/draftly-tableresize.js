/* ============================================================
   FILE: modules/draftly-tableresize.js
   PROJECT: Draftly
   ROLE: DF10 resize tables by mouse / touch (pointer events).
         - Column border: drag moves only the two neighbouring
           columns (table width fixed). Widths are stored as %
           on every colspan-1 cell (first row drives the fixed
           layout; docxgen reads first-row widths).
         - Row bottom border: drag sets tr height (px); content
           still grows the row, so it never clips text.
         - Table right edge: drag sets table width % (min 2cm,
           max text width).
         - Double-click a border resets it to auto.
         Grab zone: 6px mouse, 22px each side for touch (44px).
         One undo step per drag (checkpoint + input event).
   DEPENDS: Draftly.editor, Draftly.history, Draftly.view
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.tableResize = (function () {
  var MIN_COL_CM = 0.8, MIN_TBL_CM = 2, drag = null, label = null;

  function cmPx() { return (Draftly.view && Draftly.view.CM_PX || 37.8) * (Draftly.view && Draftly.view.zoom || 1); }
  function tableOf(el) {
    var t = el && el.closest && el.closest('table');
    return t && Draftly.editor.isInEditor(t) ? t : null;
  }
  /* Column edges (client x) from the first row; null if it has colspans. */
  function colEdges(t) {
    var row = t.rows[0]; if (!row) return null;
    var xs = [], cells = row.cells;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].colSpan > 1) return null;
      var r = cells[i].getBoundingClientRect();
      if (!i) xs.push(r.left);
      xs.push(r.right);
    }
    return xs;
  }
  /* What border is under (x, y)? */
  function hit(t, x, y, tol) {
    var tr = t.getBoundingClientRect();
    if (y < tr.top - tol || y > tr.bottom + tol) return null;
    if (Math.abs(x - tr.right) <= tol) return { kind: 'table' };
    var xs = colEdges(t);
    if (xs) for (var i = 1; i < xs.length - 1; i++) if (Math.abs(x - xs[i]) <= tol) return { kind: 'col', i: i - 1 };
    if (x < tr.left || x > tr.right) return null;
    for (var r = 0; r < t.rows.length; r++) {
      var b = t.rows[r].getBoundingClientRect().bottom;
      if (Math.abs(y - b) <= tol) return { kind: 'row', row: t.rows[r] };
    }
    return null;
  }
  function setColWidths(t, pcts) {
    for (var r = 0; r < t.rows.length; r++) {
      var c = 0, cells = t.rows[r].cells;
      for (var k = 0; k < cells.length; k++) {
        if (cells[k].colSpan === 1 && pcts && pcts[c] != null) cells[k].style.width = pcts[c].toFixed(2) + '%';
        else if (!pcts) cells[k].style.removeProperty('width');
        c += cells[k].colSpan;
      }
    }
  }
  function textWidth(t) { var ed = t.closest('.editor'); return ed ? ed.clientWidth : t.parentNode.clientWidth; }
  function show(txt, x, y) {
    if (!label) { label = document.createElement('div'); label.className = 'dr-tresize-label'; document.body.appendChild(label); }
    label.textContent = txt; label.style.left = (x + 12) + 'px'; label.style.top = (y + 14) + 'px'; label.hidden = false;
  }
  function done(t) {
    if (label) label.hidden = true;
    t.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatTableResize' }));
  }
  function tolFor(ev) { return ev.pointerType === 'mouse' ? 6 : 22; }

  function onMove(ev) {
    if (drag) return dragMove(ev);
    if (ev.pointerType !== 'mouse') return;
    var t = tableOf(ev.target) || tableNear(ev);
    document.querySelectorAll('table.dr-tr-col,table.dr-tr-row').forEach(function (x) { if (x !== t) x.classList.remove('dr-tr-col', 'dr-tr-row'); });
    if (!t) return;
    var h = hit(t, ev.clientX, ev.clientY, 6);
    t.classList.toggle('dr-tr-col', !!h && h.kind !== 'row');
    t.classList.toggle('dr-tr-row', !!h && h.kind === 'row');
  }
  function onDown(ev) {
    if (ev.button > 0) return;
    var t = tableOf(ev.target) || tableNear(ev);
    if (!t) return;
    var h = hit(t, ev.clientX, ev.clientY, tolFor(ev));
    if (!h) return;
    ev.preventDefault();
    if (Draftly.history) Draftly.history.checkpoint();
    drag = { t: t, h: h, x0: ev.clientX, y0: ev.clientY, id: ev.pointerId };
    if (h.kind === 'col') drag.ws = colEdges(t).reduce(function (a, x, i, xs) { if (i) a.push(x - xs[i - 1]); return a; }, []);
    if (h.kind === 'row') drag.h0 = h.row.getBoundingClientRect().height;
    if (h.kind === 'table') drag.w0 = t.getBoundingClientRect().width;
    try { ev.target.setPointerCapture(ev.pointerId); } catch (e) {}
  }
  /* A press just right of the edge may land just outside the table. */
  function tableNear(ev) {
    var el = document.elementFromPoint(ev.clientX - tolFor(ev), ev.clientY);
    return tableOf(el);
  }
  function dragMove(ev) {
    if (ev.pointerId !== drag.id) return;
    ev.preventDefault();
    var t = drag.t, d = ev.clientX - drag.x0, cm = cmPx(), z = (Draftly.view && Draftly.view.zoom) || 1;
    if (drag.h.kind === 'col') {
      var i = drag.h.i, ws = drag.ws.slice(), tot = ws[i] + ws[i + 1], min = MIN_COL_CM * cm;
      ws[i] = Math.max(min, Math.min(tot - min, ws[i] + d)); ws[i + 1] = tot - ws[i];
      var sum = ws.reduce(function (a, w) { return a + w; }, 0);
      setColWidths(t, ws.map(function (w) { return w / sum * 100; }));
      show((ws[i] / cm).toFixed(1) + ' | ' + (ws[i + 1] / cm).toFixed(1) + ' cm', ev.clientX, ev.clientY);
    } else if (drag.h.kind === 'row') {
      var hpx = Math.max(10, (drag.h0 + ev.clientY - drag.y0) / z);
      drag.h.row.style.height = Math.round(hpx) + 'px';
      show((drag.h.row.getBoundingClientRect().height / cm).toFixed(1) + ' cm', ev.clientX, ev.clientY);
    } else {
      var max = textWidth(t), w = Math.max(MIN_TBL_CM * cm / z, Math.min(max, (drag.w0 + d) / z));
      t.style.width = (w / max * 100).toFixed(2) + '%';
      show((w * z / cm).toFixed(1) + ' cm', ev.clientX, ev.clientY);
    }
  }
  function onUp(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var t = drag.t; drag = null; done(t);
  }
  function onDbl(ev) {
    var t = tableOf(ev.target); if (!t) return;
    var h = hit(t, ev.clientX, ev.clientY, 6); if (!h) return;
    ev.preventDefault();
    if (Draftly.history) Draftly.history.checkpoint();
    if (h.kind === 'col') setColWidths(t, null);
    else if (h.kind === 'row') h.row.style.removeProperty('height');
    else t.style.width = '100%';
    done(t);
  }
  function bind() {
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    document.addEventListener('dblclick', onDbl, true);
  }
  bind();
  return { hit: hit, setColWidths: setColWidths, isDragging: function () { return !!drag; } };
})();
