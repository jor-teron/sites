/*
 * spreadsheet_resize.js
 * Column widths: drag the right edge of a column letter to resize (double-click the edge to
 * reset). Widths are saved with the sheet (colWidths). Unset columns share the free width,
 * never narrower than CFG.colWidth.auto.
 */
function autoColWidth() {
  var wrap = document.getElementById("sheet-wrap");
  var free = (wrap ? wrap.clientWidth : 1200) - CFG.colWidth.rowHead;
  var fixed = 0, nAuto = 0, c;
  for (c = 0; c < COLS; c++) { if (colWidths[c]) fixed += colWidths[c]; else nAuto++; }
  return nAuto ? Math.max(CFG.colWidth.auto, Math.floor((free - fixed) / nAuto)) : CFG.colWidth.auto;
}

function applyWidths() {
  var table = document.querySelector("table." + CLS.table);
  if (!table) return;
  var cols = table.querySelectorAll("col." + CLS.dataCol), auto = autoColWidth(), total = CFG.colWidth.rowHead, c, w;
  table.querySelector("col." + CLS.rowHeadCol).style.width = CFG.colWidth.rowHead + "px";
  for (c = 0; c < COLS; c++) {
    w = colWidths[c] || auto;
    cols[c].style.width = w + "px";
    total += w;
  }
  table.style.width = total + "px";
}

SHEET_INIT.push(function () {
  var drag = null;
  applyWidths();
  window.addEventListener("resize", applyWidths);
  document.getElementById("sheet-wrap").addEventListener("mousedown", function (ev) {
    if (!ev.target.classList.contains(CLS.colGrip)) return;
    ev.preventDefault();
    ev.stopPropagation();
    var c = parseInt(ev.target.dataset.c, 10);
    var col = document.querySelectorAll("table." + CLS.table + " col." + CLS.dataCol)[c];
    drag = { c: c, x: ev.clientX, w: col.getBoundingClientRect().width || parseFloat(col.style.width) };
    document.body.classList.add("col-resizing");
  });
  document.addEventListener("mousemove", function (ev) {
    if (!drag) return;
    colWidths[drag.c] = Math.max(CFG.colWidth.min, Math.round(drag.w + ev.clientX - drag.x));
    applyWidths();
  });
  document.addEventListener("mouseup", function () {
    if (!drag) return;
    drag = null;
    document.body.classList.remove("col-resizing");
    saveStore();
  });
  document.getElementById("sheet-wrap").addEventListener("dblclick", function (ev) {
    if (!ev.target.classList.contains(CLS.colGrip)) return;
    colWidths[parseInt(ev.target.dataset.c, 10)] = null;
    applyWidths();
    saveStore();
  });
});
