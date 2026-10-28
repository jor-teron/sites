/*
 * base-delete.js  (BS4 delete safety)
 * Deleting a table and deleting records are both deliberately hard, and look clearly different.
 *   - No visible delete button beside the table, on rows or in the form view. Both deletes live in small
 *     "⋯" menus in the ribbon (Home > Table ⋯ and Home > Records ⋯), shown in danger red.
 *   - Delete table:  🗑 icon, "Delete table…", in-app dialog with the table name, record + field count;
 *                    the user must type the table name exactly (case sensitive) to enable the red button.
 *   - Delete record: ⊖ icon, "Delete record…", in-app dialog with how many records and a preview of the
 *                    first record's values; the user must type DELETE (or the record count) to enable it.
 *   - Wrong or empty text keeps the red button disabled (Enter does nothing). Esc / Cancel / backdrop keep data.
 *   - The Delete and Backspace keys never delete records: outside a text field they do nothing.
 *   - No Undo toast (Undo/Redo is a later release). Deletes save straight away (BaseStore.saveNow).
 * Dialog uses the shared dlg-* look (../../shared/office-dialog.css), never alert/confirm.
 * API: BaseDelete.table(), BaseDelete.records(rows?), BaseDelete.menu(anchor, items), BaseDelete.isOpen()
 * DEPENDS: BASE, BaseStore, BaseUI (render, status), OfficeNotify (optional).
 */
var BaseDelete = (function () {
  var current = null;
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function toast(m) { try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(m, 2500); } catch (e) {} }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  /* Small fixed-position popup menu (fixed so the sideways-scrolling ribbon cannot clip it). */
  var openMenu = null;
  function closeMenu() { if (!openMenu) return; var m = openMenu; openMenu = null; m.el.remove(); m.anchor.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", m.out, true); document.removeEventListener("keydown", m.key, true); }
  function menu(anchor, items) {
    var again = openMenu && openMenu.anchor === anchor; closeMenu(); if (again) return;
    var m = el("div", "base-more-menu"); m.setAttribute("role", "menu");
    items.forEach(function (it) {
      var b = el("button", "base-more-item" + (it.danger ? " base-danger" : "")); b.type = "button"; b.setAttribute("role", "menuitem"); b.id = it.id || "";
      var ic = el("span", "base-more-ic", it.icon || ""); ic.setAttribute("aria-hidden", "true");
      b.appendChild(ic); b.appendChild(el("span", null, it.label));
      if (it.hint) b.title = it.hint;
      b.addEventListener("click", function () { closeMenu(); it.run(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(6, Math.min(r.left, innerWidth - w - 6)) + "px";
    m.style.top = (r.bottom + 4 + h > innerHeight ? Math.max(6, r.top - h - 4) : r.bottom + 4) + "px";
    anchor.setAttribute("aria-expanded", "true");
    var o = { el: m, anchor: anchor,
      out: function (e) { if (!m.contains(e.target) && !anchor.contains(e.target)) closeMenu(); },
      key: function (e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); anchor.focus(); } } };
    openMenu = o;
    document.addEventListener("pointerdown", o.out, true); document.addEventListener("keydown", o.key, true);
    var first = m.querySelector("button"); if (first) first.focus();
  }

  /* Typed-confirm dialog. o: {kind:'table'|'record', icon, title, lead, body(node), prompt, ok, check(v)} → Promise<boolean> */
  function typed(o) {
    if (current) current.close(false);
    return new Promise(function (resolve) {
      var back = el("div", "dlg-backdrop base-del-back");
      var box = el("div", "dlg base-del base-del-" + o.kind); box.setAttribute("role", "alertdialog"); box.setAttribute("aria-modal", "true");
      var head = el("div", "dlg-title base-del-head"); head.id = "baseDelTitle"; box.setAttribute("aria-labelledby", "baseDelTitle");
      var ic = el("span", "base-del-ic", o.icon); ic.setAttribute("aria-hidden", "true"); head.appendChild(ic); head.appendChild(el("span", null, o.title));
      box.appendChild(head);
      var lead = el("div", "dlg-message base-del-lead", o.lead); lead.id = "baseDelMsg"; box.setAttribute("aria-describedby", "baseDelMsg"); box.appendChild(lead);
      if (o.body) box.appendChild(o.body);
      var lab = el("label", "dlg-label base-del-label"); lab.appendChild(el("span", null, o.prompt));
      var inp = el("input", "dlg-input base-del-input"); inp.type = "text"; inp.autocomplete = "off"; inp.spellcheck = false;
      inp.setAttribute("autocapitalize", "off"); inp.setAttribute("autocorrect", "off");
      lab.appendChild(inp); box.appendChild(lab);
      var row = el("div", "dlg-actions");
      var cancel = el("button", "dlg-btn dlg-cancel base-del-cancel", "Cancel"); cancel.type = "button";
      var ok = el("button", "dlg-btn dlg-ok dlg-danger base-del-ok", o.ok); ok.type = "button"; ok.disabled = true;
      row.appendChild(cancel); row.appendChild(ok); box.appendChild(row); back.appendChild(box);
      var before = document.activeElement; document.body.appendChild(back);
      var done = false;
      function valid() { return !!o.check(inp.value); }
      function close(res) {
        if (done) return; done = true; current = null;
        document.removeEventListener("keydown", onKey, true); back.remove();
        try { if (before && before.focus && document.contains(before)) before.focus({ preventScroll: true }); } catch (e) {}
        resolve(res);
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(false); return; }
        if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); e.stopPropagation(); if (document.activeElement === cancel) close(false); else if (valid()) close(true); return; }
        if (e.key === "Tab") { var f = [inp, cancel].concat(ok.disabled ? [] : [ok]), i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); return; }
        e.stopPropagation();
      }
      inp.addEventListener("input", function () { ok.disabled = !valid(); box.classList.toggle("ready", !ok.disabled); });
      ok.addEventListener("click", function () { if (valid()) close(true); });
      cancel.addEventListener("click", function () { close(false); });
      back.addEventListener("mousedown", function (e) { if (e.target === back) { e.preventDefault(); close(false); } });
      document.addEventListener("keydown", onKey, true);
      current = { close: close };
      inp.focus();
    });
  }

  function deleteTable() {
    var t = BaseStore.table(); if (!t) return toast("No table to delete");
    var body = el("div", "base-del-facts");
    [["Table", t.name], ["Records", String(t.rows.length)], ["Fields", String(t.fields.length)]].forEach(function (p) {
      var r = el("div", "base-del-fact"); r.appendChild(el("span", null, p[0])); r.appendChild(el("b", null, p[1])); body.appendChild(r);
    });
    return typed({ kind: "table", icon: "🗑", title: "Delete whole table",
      lead: "This permanently removes the table “" + t.name + "” with all " + plural(t.rows.length, "record") + " and " + plural(t.fields.length, "field") + ". This cannot be undone.",
      body: body, prompt: "Type the table name “" + t.name + "” to confirm", ok: "Delete table",
      check: function (v) { return v.trim() === t.name; }
    }).then(function (yes) {
      if (!yes) return false;
      BASE.db.tables = BASE.db.tables.filter(function (x) { return x !== t; });
      BASE.db.current = BASE.db.tables[0] ? BASE.db.tables[0].id : null;
      BASE.selRow = null; BASE.sort = null; BASE.formIndex = 0;
      if (BASE.query && BASE.query.table === t.id) BASE.query = null;
      BaseStore.saveNow(); BaseUI.render(); toast("Table “" + t.name + "” deleted");
      return true;
    });
  }

  function selectedRows() {
    var t = BaseStore.table(); if (!t) return [];
    return t.rows.filter(function (x) { return x.id === BASE.selRow; });
  }
  function deleteRecords(rows) {
    var t = BaseStore.table(); if (!t) return toast("No table");
    rows = rows || selectedRows();
    if (!rows.length) return toast("Pick a record first: tap its row number (or a cell), then Records ⋯ > Delete record…");
    var n = rows.length, first = rows[0], pos = t.rows.indexOf(first) + 1;
    var body = el("div", "base-del-preview");
    body.appendChild(el("div", "base-del-prev-title", (n > 1 ? "First record" : "Record") + " #" + pos + " of “" + t.name + "”"));
    var list = el("dl", "base-del-prev-list");
    t.fields.slice(0, 6).forEach(function (f) {
      var v = first.v[f.id]; v = f.type === "bool" ? (v ? "Yes" : "No") : String(v == null || v === "" ? "—" : v);
      list.appendChild(el("dt", null, f.name)); list.appendChild(el("dd", null, v.length > 60 ? v.slice(0, 57) + "…" : v));
    });
    if (t.fields.length > 6) { list.appendChild(el("dt", null, "…")); list.appendChild(el("dd", null, "+" + (t.fields.length - 6) + " more fields")); }
    body.appendChild(list);
    return typed({ kind: "record", icon: "⊖", title: n > 1 ? "Delete " + n + " records" : "Delete 1 record",
      lead: "This removes " + (n > 1 ? "these " + n + " records" : "this record") + " from the table “" + t.name + "”. The table and its other records stay. This cannot be undone.",
      body: body, prompt: "Type DELETE (or " + n + ") to confirm", ok: n > 1 ? "Delete " + n + " records" : "Delete record",
      check: function (v) { v = v.trim(); return v === "DELETE" || v === String(n); }
    }).then(function (yes) {
      if (!yes) return false;
      var ids = {}; rows.forEach(function (r) { ids[r.id] = 1; });
      t.rows = t.rows.filter(function (r) { return !ids[r.id]; });
      BASE.selRow = null; BaseStore.saveNow(); BaseUI.render(); toast(plural(n, "record") + " deleted");
      return true;
    });
  }

  /* Delete / Backspace never delete records: outside an editable field they do nothing. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    var tg = e.target, tag = tg && tg.tagName;
    var editable = tg && (tg.isContentEditable || tag === "TEXTAREA" || (tag === "INPUT" && !/^(checkbox|radio|button|submit|reset|file|range|color)$/i.test(tg.type)));
    if (!editable) e.preventDefault();
  }, true);

  return { table: deleteTable, records: deleteRecords, menu: menu, closeMenu: closeMenu, isOpen: function () { return !!current; } };
})();
