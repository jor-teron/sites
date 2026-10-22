/*
 * spreadsheet_grid.js
 * Grid render: builds the table, header clicks, selection highlight, cell painting.
 */

/**
 * Build table DOM
 */
function buildTable() {
  var wrap = document.getElementById("sheet-wrap");
  var table = document.createElement("table");
  table.className = CLS.table;
  var colgroup = document.createElement("colgroup");
  var col, r, c, tr, th, td, inp, handle, grip;

  col = document.createElement("col");
  col.className = CLS.rowHeadCol;
  colgroup.appendChild(col);
  for (c = 0; c < COLS; c++) {
    col = document.createElement("col");
    col.className = CLS.dataCol;
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);

  tr = document.createElement("tr");
  th = document.createElement("th");
  th.className = CLS.corner;
  th.title = TXT.selectAll;
  th.addEventListener("click", function () { selectAll(); });
  tr.appendChild(th);
  for (c = 0; c < COLS; c++) {
    th = document.createElement("th");
    th.className = CLS.colHead;
    th.textContent = colLetter(c);
    th.dataset.c = String(c);
    th.addEventListener("click", onColHeadClick);
    grip = document.createElement("span");
    grip.className = CLS.colGrip;
    grip.dataset.c = String(c);
    th.appendChild(grip);
    tr.appendChild(th);
  }
  table.appendChild(tr);

  inpGrid = [];
  for (r = 0; r < ROWS; r++) {
    inpGrid[r] = [];
    tr = document.createElement("tr");
    td = document.createElement("td");
    td.className = CLS.rowNum;
    td.textContent = String(r + 1);
    td.dataset.r = String(r);
    td.addEventListener("click", onRowHeadClick);
    tr.appendChild(td);
    for (c = 0; c < COLS; c++) {
      td = document.createElement("td");
      td.className = CLS.cell;
      td.dataset.r = String(r);
      td.dataset.c = String(c);
      inp = document.createElement("input");
      inp.setAttribute("spellcheck", "false");
      inp.readOnly = true;
      inp.dataset.r = String(r);
      inp.dataset.c = String(c);
      bindCell(inp, r, c);
      inpGrid[r][c] = inp;
      td.appendChild(inp);
      handle = document.createElement("span");
      handle.className = CLS.fillHandle;
      handle.dataset.r = String(r);
      handle.dataset.c = String(c);
      handle.addEventListener("mousedown", onFillStart);
      td.appendChild(handle);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

/**
 * Click column letter: select the whole column (Shift = extend)
 */
function onColHeadClick(ev) {
  if (ev.target.classList.contains(CLS.colGrip)) return;
  var c = parseInt(ev.currentTarget.dataset.c, 10);
  blurEditing();
  if (!ev.shiftKey) selC = c;
  selR = 0; extR = ROWS - 1; extC = c;
  selMode = "col";
  highlightSel();
  setStatus(TXT.columnPrefix + colLetter(c));
}

/**
 * Click row number: select the whole row (Shift = extend)
 */
function onRowHeadClick(ev) {
  var r = parseInt(ev.currentTarget.dataset.r, 10);
  blurEditing();
  if (!ev.shiftKey) selR = r;
  selC = 0; extC = COLS - 1; extR = r;
  selMode = "row";
  highlightSel();
  setStatus(TXT.rowPrefix + (r + 1));
}

/**
 * Highlight selection: active cell outline, block band, header bands
 */
function highlightSel() {
  var all = document.querySelectorAll("." + CLS.selected + ", ." + CLS.band);
  var i, r, c, g = selRange(), multi = g.r1 !== g.r2 || g.c1 !== g.c2;
  for (i = 0; i < all.length; i++) all[i].classList.remove(CLS.selected, CLS.band);
  if (multi) {
    for (r = g.r1; r <= g.r2; r++) {
      for (c = g.c1; c <= g.c2; c++) inpGrid[r][c].parentNode.classList.add(CLS.band);
    }
  }
  for (c = g.c1; c <= g.c2; c++) {
    var th = document.querySelector("th." + CLS.colHead + '[data-c="' + c + '"]');
    if (th) th.classList.add(CLS.band);
  }
  for (r = g.r1; r <= g.r2; r++) {
    var rn = document.querySelector("td." + CLS.rowNum + '[data-r="' + r + '"]');
    if (rn) rn.classList.add(CLS.band);
  }
  if (inpGrid[selR] && inpGrid[selR][selC]) inpGrid[selR][selC].parentNode.classList.add(CLS.selected);
  if (multi) setStatus(rangeLabel());
}

/**
 * Apply style object to a td + input
 */
function applyLook(td, inp, st) {
  inp.style.textAlign = st.align || CFG.defaultStyle.align;
  inp.style.fontWeight = st.bold ? CFG.boldWeight : "";
  inp.style.fontStyle = st.italic ? "italic" : "";
  inp.style.textDecoration = st.underline ? "underline" : "";
  td.style.background = st.bg || "";
  inp.style.color = st.color || "";
}

/**
 * Paint one cell: style, shown value (number format applied), error style
 */
function paintCell(r, c) {
  var inp = inpGrid[r] && inpGrid[r][c];
  if (!inp) return;
  var td = inp.parentNode, st = cellStyle(r, c), v = cells[r][c].value;
  applyLook(td, inp, st);
  if (inp === document.activeElement) return;
  inp.value = formatCellValue(v, st.fmt);
  if (v === ERR || CFG.errorValues.indexOf(v) !== -1) td.classList.add(CLS.error);
  else td.classList.remove(CLS.error);
}

/**
 * Paint values and styles
 */
function paintAll() {
  var r, c;
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) paintCell(r, c);
  }
}
