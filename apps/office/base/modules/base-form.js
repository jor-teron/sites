/*
 * base-form.js  (BS1, BS4)
 * Form view: one record at a time with big fields (phone friendly). Prev / Next / New.
 * BS4: no Delete button here any more; delete a record from Home > Records ⋯ (typed confirm).
 * Walks the same filtered + sorted list as the grid. Arrow keys (outside inputs) also move.
 * API: BaseForm.render()
 */
var BaseForm = (function () {
  function btn(txt, cls, fn) { var b = document.createElement("button"); b.type = "button"; b.className = "base-btn " + (cls || ""); b.textContent = txt; b.addEventListener("click", fn); return b; }
  function render() {
    var wrap = document.getElementById("form-wrap"), t = BaseStore.table();
    wrap.textContent = "";
    if (!t) return BaseUI.renderEmpty(wrap);
    var rows = BaseGrid.visibleRows(t), i = Math.max(0, Math.min(rows.length - 1, BASE.formIndex));
    var sel = rows.map(function (r) { return r.id; }).indexOf(BASE.selRow);
    if (sel >= 0) i = sel;
    BASE.formIndex = i;
    var r = rows[i], box = document.createElement("div"); box.className = "base-form";
    if (!r) { box.appendChild(document.createTextNode("No records." )); }
    else {
      BASE.selRow = r.id;
      t.fields.forEach(function (f) {
        var l = document.createElement("label"); l.textContent = f.name;
        var inp = BaseGrid.inputFor(f, r.v[f.id], function (v) { r.v[f.id] = v; BaseStore.save(); });
        box.appendChild(l); box.appendChild(inp);
      });
    }
    var nav = document.createElement("div"); nav.className = "base-form-nav";
    function go(d) { var n = rows[i + d]; if (n) { BASE.selRow = n.id; render(); } }
    nav.appendChild(btn("◀ Prev", "", function () { go(-1); }));
    var pos = document.createElement("span"); pos.className = "pos"; pos.textContent = rows.length ? (i + 1) + " / " + rows.length : "0 / 0";
    nav.appendChild(pos);
    nav.appendChild(btn("Next ▶", "", function () { go(1); }));
    nav.appendChild(btn("+ New", "primary", BaseUI.addRow));
    box.appendChild(nav); wrap.appendChild(box);
    BaseUI.status(t.name + " · record " + pos.textContent);
    var first = box.querySelector("input"); if (first && BASE.focusForm) { first.focus(); BASE.focusForm = false; }
    BaseForm.go = go;
  }
  document.addEventListener("keydown", function (e) {
    if (BASE.view !== "form" || !BaseForm.go || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "ArrowLeft") BaseForm.go(-1); else if (e.key === "ArrowRight") BaseForm.go(1);
  });
  return { render: render };
})();
