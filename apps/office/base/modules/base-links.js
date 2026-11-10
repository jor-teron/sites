/*
 * base-links.js  (BS6)
 * Link-to-record (`ref`) and Lookup (`lookup`) helpers for Base. Resolution, display text,
 * inbound (related) records, delete-impact and clearing links are all pure (no DOM) so Node
 * tests can load this file. The record picker, jump, add-related and the related-records
 * panel are also here but only run in the browser.
 *
 *   ref field:    { type:"ref", to: tableId, multi?: true, display?: fieldId }
 *                 value = row id string, or an array of ids when multi
 *   lookup field: { type:"lookup", via: refFieldId, src: fieldId on the target table }
 *                 value is computed from the linked record(s), not stored
 *
 * API: BaseLinks.ids(v), .normalize(v, multi), .isEmpty(v), .tableById(id, db),
 *      .rowById(t, id), .targetTable(field, db), .displayField(table, field),
 *      .recordLabel(table, row, field), .displayText(field, value, db),
 *      .lookupValue(table, field, row, db), .lookupText(table, field, row, db),
 *      .inbound(table, row, db), .inboundFields(table, db),
 *      .queryFields(table, db), .resolve(table, field, row, db),
 *      .deleteImpact(table, rows, db), .clearLinksTo(tableId, rowIds, db),
 *      .pick(opts), .jump(tableId, rowId), .addRelated(table, field, fromRow),
 *      .renderRelated()
 */
(function (root) {
  function useDb(d) {
    return d || (typeof BASE !== "undefined" && BASE.db) || { tables: [] };
  }
  function tableById(id, db) {
    if (!id) return null;
    return (useDb(db).tables || []).filter(function (t) { return t.id === id; })[0] || null;
  }
  function rowById(t, id) {
    if (!t || !id) return null;
    return (t.rows || []).filter(function (r) { return r.id === id; })[0] || null;
  }
  function fieldById(t, id) {
    if (!t || !id) return null;
    return (t.fields || []).filter(function (f) { return f.id === id; })[0] || null;
  }
  function ids(v) {
    if (v == null || v === "") return [];
    if (Array.isArray(v)) {
      var out = [], seen = {};
      v.forEach(function (x) {
        if (x == null || x === "") return;
        var s = String(x);
        if (seen[s]) return;
        seen[s] = 1; out.push(s);
      });
      return out;
    }
    return [String(v)];
  }
  function normalize(v, multi) {
    var a = ids(v);
    return multi ? a : (a.length ? a[0] : "");
  }
  function isEmpty(v) { return !ids(v).length; }

  function targetTable(field, db) {
    return field && field.type === "ref" ? tableById(field.to, db) : null;
  }

  function displayField(table, fieldOrId) {
    if (!table) return null;
    var want = fieldOrId && typeof fieldOrId === "object" ? fieldOrId.display : fieldOrId;
    if (want) {
      var f = fieldById(table, want);
      if (f && f.type !== "picture" && f.type !== "ref" && f.type !== "lookup") return f;
    }
    var i, fields = table.fields || [];
    var prefer = { text: 1, email: 1, phone: 1, choice: 1, long: 1 };
    for (i = 0; i < fields.length; i++) if (prefer[fields[i].type]) return fields[i];
    for (i = 0; i < fields.length; i++) {
      var t = fields[i].type;
      if (t !== "picture" && t !== "ref" && t !== "lookup") return fields[i];
    }
    return fields[0] || null;
  }

  function recordLabel(table, row, refField) {
    if (!table || !row) return "";
    var f = displayField(table, refField);
    var txt = "";
    if (f && f.type !== "picture") {
      if (typeof BaseTypes !== "undefined") txt = BaseTypes.previewText(f, row.v ? row.v[f.id] : "");
      else txt = row.v && row.v[f.id] != null ? String(row.v[f.id]) : "";
      if (txt === "—") txt = "";
    }
    if (txt) return txt;
    var idf = (table.fields || []).filter(function (x) { return x.type === "id"; })[0];
    if (idf && row.v && row.v[idf.id] != null && row.v[idf.id] !== "") return String(row.v[idf.id]);
    return "Record";
  }

  function displayText(field, value, db) {
    var list = ids(value);
    if (!list.length) return "";
    var tt = targetTable(field, db);
    var parts = [], missing = 0;
    list.forEach(function (id) {
      var row = tt && rowById(tt, id);
      if (!row) { missing++; parts.push("(missing)"); }
      else parts.push(recordLabel(tt, row, field));
    });
    return parts.join(", ");
  }
  function missingCount(field, value, db) {
    var tt = targetTable(field, db), n = 0;
    ids(value).forEach(function (id) { if (!tt || !rowById(tt, id)) n++; });
    return n;
  }

  function linkedRows(table, refField, row, db) {
    var tt = targetTable(refField, db);
    if (!tt || !row) return [];
    return ids(row.v && row.v[refField.id]).map(function (id) { return rowById(tt, id); }).filter(Boolean);
  }

  function lookupValue(table, field, row, db) {
    if (!table || !field || field.type !== "lookup" || !row) return "";
    var via = fieldById(table, field.via);
    if (!via || via.type !== "ref") return "";
    var tt = targetTable(via, db), src = tt && fieldById(tt, field.src);
    if (!src) return "";
    var rows = linkedRows(table, via, row, db);
    if (!rows.length) return "";
    if (!via.multi && rows[0]) return rows[0].v ? rows[0].v[src.id] : "";
    return rows.map(function (r) { return r.v ? r.v[src.id] : ""; });
  }
  function lookupSrc(table, field, db) {
    if (!field || field.type !== "lookup") return null;
    var via = fieldById(table, field.via);
    var tt = via && targetTable(via, db);
    return tt && fieldById(tt, field.src) || null;
  }
  function lookupText(table, field, row, db) {
    var src = lookupSrc(table, field, db);
    var v = lookupValue(table, field, row, db);
    if (!src) return "";
    if (Array.isArray(v)) {
      var parts = v.map(function (x) {
        if (typeof BaseTypes !== "undefined") return BaseTypes.previewText(src, x);
        return x == null ? "" : String(x);
      }).filter(function (s) { return s && s !== "—"; });
      return parts.join(", ");
    }
    if (typeof BaseTypes !== "undefined") {
      var t = BaseTypes.previewText(src, v);
      return t === "—" ? "" : t;
    }
    return v == null ? "" : String(v);
  }

  /* For a query / sort field, which type should operators use? */
  function resolvedType(table, field, db) {
    if (!field) return "text";
    if (field.type === "lookup") {
      var src = lookupSrc(table, field, db);
      return src ? src.type : "text";
    }
    if (field._srcType) return field._srcType;
    return field.type;
  }

  function inboundFields(table, db) {
    if (!table) return [];
    var out = [];
    (useDb(db).tables || []).forEach(function (t) {
      (t.fields || []).forEach(function (f) {
        if (f.type === "ref" && f.to === table.id) out.push({ table: t, field: f });
      });
    });
    return out;
  }
  function inbound(table, row, db) {
    if (!table || !row) return [];
    var hits = [];
    inboundFields(table, db).forEach(function (g) {
      (g.table.rows || []).forEach(function (r) {
        if (ids(r.v && r.v[g.field.id]).indexOf(row.id) >= 0) hits.push({ table: g.table, field: g.field, row: r });
      });
    });
    return hits;
  }

  /* Fields the query builder can use: table fields + "Link ▸ Target field" paths. */
  function queryFields(table, db) {
    var out = (table && table.fields ? table.fields.slice() : []);
    if (!table) return out;
    (table.fields || []).forEach(function (f) {
      if (f.type !== "ref") return;
      var tt = targetTable(f, db);
      if (!tt) return;
      (tt.fields || []).forEach(function (sf) {
        if (sf.type === "picture" || sf.type === "ref" || sf.type === "lookup") return;
        out.push({
          id: f.id + "." + sf.id,
          name: f.name + " ▸ " + sf.name,
          type: sf.type,
          _via: f.id,
          _src: sf.id,
          _srcType: sf.type
        });
      });
    });
    return out;
  }
  /* Values of a (real or path) field on a row, as an array (multi-ref may have several). */
  function resolve(table, field, row, db) {
    if (!table || !field || !row) return [];
    if (field._via) {
      var via = fieldById(table, field._via);
      if (!via) return [];
      var tt = targetTable(via, db), src = tt && fieldById(tt, field._src);
      if (!src) return [];
      return linkedRows(table, via, row, db).map(function (r) { return r.v ? r.v[src.id] : ""; });
    }
    if (field.type === "lookup") {
      var v = lookupValue(table, field, row, db);
      return Array.isArray(v) ? v : (v === "" || v == null ? [] : [v]);
    }
    if (field.type === "ref") return ids(row.v && row.v[field.id]);
    var x = row.v ? row.v[field.id] : "";
    return [x];
  }

  function deleteImpact(table, rows, db) {
    var groups = [], count = 0;
    if (!table) return { count: 0, groups: groups };
    if (rows && rows.length) {
      var idset = {};
      rows.forEach(function (r) { idset[r.id] = 1; });
      inboundFields(table, db).forEach(function (g) {
        var hit = [];
        (g.table.rows || []).forEach(function (r) {
          if (ids(r.v && r.v[g.field.id]).some(function (id) { return idset[id]; })) {
            hit.push(recordLabel(g.table, r, displayField(g.table)));
          }
        });
        if (hit.length) {
          count += hit.length;
          groups.push({ table: g.table, field: g.field, tableName: g.table.name, fieldName: g.field.name, labels: hit, n: hit.length });
        }
      });
    } else {
      inboundFields(table, db).forEach(function (g) {
        var n = 0;
        (g.table.rows || []).forEach(function (r) { if (!isEmpty(r.v && r.v[g.field.id])) n++; });
        count += n;
        groups.push({ table: g.table, field: g.field, tableName: g.table.name, fieldName: g.field.name, labels: [], n: n, all: true });
      });
    }
    return { count: count, groups: groups };
  }

  /* rowIds is an optional map of id -> 1. Without it, every link to the table is cleared. */
  function clearLinksTo(tableId, rowIds, db) {
    var n = 0;
    (useDb(db).tables || []).forEach(function (t) {
      (t.fields || []).forEach(function (f) {
        if (f.type !== "ref" || f.to !== tableId) return;
        (t.rows || []).forEach(function (r) {
          var a = ids(r.v && r.v[f.id]);
          if (!a.length) return;
          var next = rowIds ? a.filter(function (id) { return !rowIds[id]; }) : [];
          if (next.length !== a.length) {
            r.v[f.id] = f.multi ? next : (next[0] || "");
            n++;
          }
        });
      });
    });
    return n;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function toast(m, ms) { try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(m, ms || 2500); } catch (e) {} }

  function jump(tableId, rowId) {
    var t = tableById(tableId);
    if (!t || !rowById(t, rowId)) return toast("That record is no longer there");
    BASE.db.current = tableId;
    BASE.selRow = rowId;
    BASE.formIndex = Math.max(0, t.rows.indexOf(rowById(t, rowId)));
    BASE.sort = null;
    BASE.search = "";
    try { var s = document.getElementById("search"); if (s) s.value = ""; } catch (e) {}
    BASE.view = "form";
    BASE.focusForm = true;
    try { BaseStore.save(); } catch (e) {}
    try { BaseUI.render(); } catch (e) {}
  }

  function addRelated(otherTable, refField, fromRow) {
    if (!otherTable || !refField || !fromRow) return;
    try { if (typeof BaseHistory !== "undefined") BaseHistory.push("Add record"); } catch (e) {}
    var r = BaseStore.newRow(otherTable);
    r.v[refField.id] = refField.multi ? [fromRow.id] : fromRow.id;
    otherTable.rows.push(r);
    BASE.db.current = otherTable.id;
    BASE.selRow = r.id;
    BASE.formIndex = otherTable.rows.length - 1;
    BASE.sort = null;
    BASE.search = "";
    BASE.view = "form";
    BASE.focusForm = true;
    BaseStore.save();
    BaseUI.render();
    toast("Added in “" + otherTable.name + "”");
  }

  /* opts: { tableId, multi, selected, title, field } -> Promise<normalized value|null> (null = cancel) */
  function pick(opts) {
    opts = opts || {};
    var tt = tableById(opts.tableId);
    if (!tt) {
      toast("That linked table is no longer there");
      return Promise.resolve(null);
    }
    var multi = !!opts.multi;
    var chosen = {};
    ids(opts.selected).forEach(function (id) { chosen[id] = 1; });
    return new Promise(function (resolve) {
      var back = el("div", "dlg-backdrop base-pick-back");
      var box = el("div", "dlg base-pick-dlg"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
      var title = el("div", "dlg-title", opts.title || (multi ? "Choose records" : "Choose a record"));
      title.id = "basePickTitle"; box.setAttribute("aria-labelledby", "basePickTitle");
      box.appendChild(title);
      box.appendChild(el("div", "dlg-message", "From “" + tt.name + "”" + (multi ? ". Tick every record that should be linked." : ".")));
      var search = el("input", "dlg-input base-pick-search"); search.type = "search"; search.placeholder = "Search…"; search.setAttribute("aria-label", "Search records");
      box.appendChild(search);
      var list = el("div", "base-pick-list"); list.setAttribute("role", "listbox"); box.appendChild(list);
      var empty = el("div", "base-pick-empty", tt.rows.length ? "No records match." : "This table has no records yet.");
      var row = el("div", "dlg-actions");
      var cancel = el("button", "dlg-btn dlg-cancel", "Cancel"); cancel.type = "button";
      var ok = el("button", "dlg-btn dlg-ok", multi ? "OK" : "Choose"); ok.type = "button";
      row.appendChild(cancel); row.appendChild(ok); box.appendChild(row);
      back.appendChild(box);
      var before = document.activeElement, done = false, focusIdx = -1;
      document.body.appendChild(back);
      function close(val) {
        if (done) return; done = true;
        document.removeEventListener("keydown", onKey, true);
        back.remove();
        try { if (before && before.focus && document.contains(before)) before.focus({ preventScroll: true }); } catch (e) {}
        resolve(val);
      }
      function accept() {
        var a = tt.rows.map(function (r) { return r.id; }).filter(function (id) { return chosen[id]; });
        close(normalize(a, multi));
      }
      function renderList() {
        var q = (search.value || "").trim().toLowerCase();
        list.textContent = "";
        var shown = 0, items = [];
        tt.rows.forEach(function (r) {
          var lab = recordLabel(tt, r, opts.field);
          var hay = lab.toLowerCase();
          if (typeof BaseTypes !== "undefined") {
            (tt.fields || []).forEach(function (f) {
              if (f.type === "picture" || f.type === "ref" || f.type === "lookup") return;
              hay += " " + BaseTypes.formatSearch(f, r.v ? r.v[f.id] : "").toLowerCase();
            });
          }
          if (q && hay.indexOf(q) < 0) return;
          shown++;
          var it = el("button", "base-pick-item" + (chosen[r.id] ? " on" : "")); it.type = "button";
          it.setAttribute("role", "option"); it.setAttribute("aria-selected", chosen[r.id] ? "true" : "false");
          if (multi) {
            var ck = el("input"); ck.type = "checkbox"; ck.checked = !!chosen[r.id]; ck.tabIndex = -1;
            it.appendChild(ck);
          }
          it.appendChild(el("span", "base-pick-lab", lab || "Record"));
          it.addEventListener("click", function () {
            if (multi) {
              if (chosen[r.id]) delete chosen[r.id]; else chosen[r.id] = 1;
              renderList();
            } else { chosen = {}; chosen[r.id] = 1; accept(); }
          });
          list.appendChild(it);
          items.push(it);
        });
        empty.hidden = shown > 0;
        if (!empty.parentNode && !shown) box.insertBefore(empty, list.nextSibling);
        else if (empty.parentNode && shown) empty.remove();
        else if (!shown && !empty.parentNode) box.insertBefore(empty, row);
        return items;
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(null); return; }
        if (e.key === "Enter" && !e.isComposing && document.activeElement !== search) { e.preventDefault(); accept(); return; }
        e.stopPropagation();
      }
      search.addEventListener("input", renderList);
      search.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var first = list.querySelector(".base-pick-item"); if (first && !multi) first.click(); } });
      ok.addEventListener("click", accept);
      cancel.addEventListener("click", function () { close(null); });
      back.addEventListener("mousedown", function (e) { if (e.target === back) { e.preventDefault(); close(null); } });
      document.addEventListener("keydown", onKey, true);
      renderList();
      search.focus();
    });
  }

  function renderRelated() {
    var wrap = typeof document !== "undefined" ? document.getElementById("related-wrap") : null;
    if (!wrap) return;
    wrap.textContent = "";
    var t = typeof BaseStore !== "undefined" ? BaseStore.table() : null;
    var row = t && BASE.selRow ? rowById(t, BASE.selRow) : null;
    var groups = t ? inboundFields(t) : [];
    if (!t || !row || !groups.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    wrap.appendChild(el("div", "base-rel-title", "Related records"));
    groups.forEach(function (g) {
      var box = el("div", "base-rel-group");
      var head = el("div", "base-rel-head");
      var hits = (g.table.rows || []).filter(function (r) { return ids(r.v && r.v[g.field.id]).indexOf(row.id) >= 0; });
      head.appendChild(el("b", null, g.table.name));
      head.appendChild(el("span", "base-rel-via", " via " + g.field.name + " · " + hits.length));
      var add = el("button", "base-rel-add", "+ Add"); add.type = "button";
      add.title = "Add a record in “" + g.table.name + "” linked to this one";
      add.addEventListener("click", function () { addRelated(g.table, g.field, row); });
      head.appendChild(add);
      box.appendChild(head);
      if (!hits.length) box.appendChild(el("div", "base-rel-empty", "None yet."));
      hits.forEach(function (r) {
        var line = el("div", "base-rel-row");
        line.appendChild(el("span", "base-rel-lab", recordLabel(g.table, r)));
        var open = el("button", "base-rel-open", "Open"); open.type = "button";
        open.addEventListener("click", function () { jump(g.table.id, r.id); });
        line.appendChild(open);
        box.appendChild(line);
      });
      wrap.appendChild(box);
    });
  }

  /* Chip list + Pick / Clear, used by the grid and the form. */
  function control(table, field, row, mode) {
    var wrap = el("div", "base-cell base-cell-ref" + (mode === "form" ? " in-form" : ""));
    function paint() {
      wrap.textContent = "";
      var val = row && row.v ? row.v[field.id] : "";
      var list = ids(val), tt = targetTable(field);
      if (!list.length) wrap.appendChild(el("span", "base-ref-ph", "—"));
      list.forEach(function (id) {
        var rec = tt && rowById(tt, id);
        var chip = el("button", "base-ref-chip" + (rec ? "" : " missing"), rec ? recordLabel(tt, rec, field) : "(missing)");
        chip.type = "button";
        chip.title = rec ? "Open this record" : "This record is missing";
        chip.addEventListener("click", function (e) { e.stopPropagation(); if (rec) jump(tt.id, rec.id); });
        wrap.appendChild(chip);
        if (field.multi && rec) {
          var x = el("button", "base-ref-x", "×"); x.type = "button"; x.title = "Remove";
          x.setAttribute("aria-label", "Remove " + (rec ? recordLabel(tt, rec, field) : "link"));
          x.addEventListener("click", function (e) {
            e.stopPropagation();
            var next = ids(row.v[field.id]).filter(function (k) { return k !== id; });
            if (typeof BaseFields !== "undefined") BaseFields.apply(table, field, row, field.multi ? next : (next[0] || ""), "set");
            else { row.v[field.id] = field.multi ? next : (next[0] || ""); BaseStore.save(); }
            paint();
          });
          wrap.appendChild(x);
        }
      });
      var actions = el("div", "base-ref-actions");
      var pickBtn = el("button", "base-ref-btn", list.length && !field.multi ? "Change" : "Pick"); pickBtn.type = "button";
      pickBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        pick({ tableId: field.to, multi: !!field.multi, selected: row.v[field.id], field: field, title: "Link “" + field.name + "”" }).then(function (v) {
          if (v === null) return;
          if (typeof BaseFields !== "undefined") BaseFields.apply(table, field, row, v, "set");
          else { row.v[field.id] = v; BaseStore.save(); }
          try { BaseUI.render(); } catch (e2) { paint(); }
        });
      });
      actions.appendChild(pickBtn);
      if (list.length) {
        var clr = el("button", "base-ref-btn", "Clear"); clr.type = "button";
        clr.addEventListener("click", function (e) {
          e.stopPropagation();
          if (typeof BaseFields !== "undefined") BaseFields.apply(table, field, row, field.multi ? [] : "", "set");
          else { row.v[field.id] = field.multi ? [] : ""; BaseStore.save(); }
          try { BaseUI.render(); } catch (e2) { paint(); }
        });
        actions.appendChild(clr);
      }
      wrap.appendChild(actions);
      if (typeof BaseFields !== "undefined") BaseFields.mark(wrap, BaseFields.issue(table, field, row));
    }
    paint();
    return wrap;
  }

  function lookupCell(table, field, row, mode) {
    var wrap = el("div", "base-cell base-cell-lookup" + (mode === "form" ? " in-form" : ""));
    var txt = lookupText(table, field, row) || "—";
    var ro = el("input"); ro.type = "text"; ro.value = txt; ro.readOnly = true; ro.tabIndex = -1;
    ro.className = "base-lookup"; ro.setAttribute("aria-readonly", "true");
    wrap.appendChild(ro);
    return wrap;
  }

  var api = {
    ids: ids, normalize: normalize, isEmpty: isEmpty,
    tableById: tableById, rowById: rowById, fieldById: fieldById,
    targetTable: targetTable, displayField: displayField, recordLabel: recordLabel,
    displayText: displayText, missingCount: missingCount,
    lookupValue: lookupValue, lookupText: lookupText, lookupSrc: lookupSrc,
    linkedRows: linkedRows, resolvedType: resolvedType,
    inbound: inbound, inboundFields: inboundFields,
    queryFields: queryFields, resolve: resolve,
    deleteImpact: deleteImpact, clearLinksTo: clearLinksTo,
    pick: pick, jump: jump, addRelated: addRelated,
    renderRelated: renderRelated, control: control, lookupCell: lookupCell
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BaseLinks = api;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
