/*
 * base-fields.js  (BS5)
 * Add / edit field dialogs (rules, Choice options, retype preview) and the commit path used by
 * the grid and form (undo session, required / unique / format checks, invalid marks).
 * Dialogs use the shared dlg-* look and stay in-app (no alert/confirm).
 * API: BaseFields.add(), .edit(), .apply(t, f, r, value, ev), .touch(), .mark(el, issue),
 *      .issue(t, f, r)
 */
var BaseFields = (function () {
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function toast(m, ms) { try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(m, ms || 2800); } catch (e) {} }
  function types() { return typeof BaseTypes !== "undefined" ? BaseTypes : null; }

  /* ---- validation marks + commit (used by grid / form) ---- */
  function issue(t, f, r) {
    if (!t || !f || !r || !types()) return null;
    var v = r.v ? r.v[f.id] : "";
    var res = BaseTypes.validate(t, f, v, r.id);
    if (!res.error && !res.warn) return null;
    return res;
  }
  function mark(node, res) {
    if (!node) return;
    node.classList.toggle("base-invalid", !!(res && res.error));
    node.classList.toggle("base-warn-cell", !!(res && !res.error && res.warn));
    if (res && (res.error || res.warn)) node.title = res.error || res.warn;
    else if (node.title && /required|unique|does not look/i.test(node.title)) node.title = "";
  }
  var session = null; /* { rowId, fieldId, snap, pushed } */
  function touch(f, r) {
    if (!f || !r || (session && session.rowId === r.id && session.fieldId === f.id)) return;
    session = { rowId: r.id, fieldId: f.id, snap: true, pushed: false };
    try { if (typeof BaseHistory !== "undefined") BaseHistory.begin(); } catch (e) {}
  }
  function commitStep(label) {
    if (!session || session.pushed) return;
    session.pushed = true;
    try { if (typeof BaseHistory !== "undefined") BaseHistory.commit(label || "Edit"); } catch (e) {}
  }
  function endTouch() { session = null; }

  function apply(t, f, r, value, ev) {
    ev = ev || "input";
    if (!t || !f || !r) return false;
    if (f.type === "id") return false;
    touch(f, r);
    var T = types(), prev = r.v[f.id], v = value;
    if (T && (f.type === "currency" || f.type === "number") && ev !== "live") {
      if (typeof value !== "number") {
        var n = BaseTypes.parseCurrency(value);
        if (n === null && ev === "blur") { toast("Enter a number for “" + f.name + "”"); return false; }
        v = n === null ? prev : n;
      }
    }
    if (T) {
      var res = BaseTypes.validate(t, f, v, r.id);
      if (res.block) {
        if (ev !== "live") toast(res.error);
        return false;
      }
      if (ev === "blur" || ev === "change" || ev === "set") {
        if (res.error) toast(res.error);
        else if (res.warn) toast(res.warn, 3200);
      }
    }
    var same = (v === prev) || (v === "" && (prev == null || prev === "")) || (typeof v === "number" && v === +prev);
    if (!same) {
      r.v[f.id] = v;
      commitStep("Edit " + f.name);
      BaseStore.save();
    }
    return true;
  }

  /* ---- field dialogs ---- */
  function fieldCard(f, i) {
    var T = types(), box = el("div", "base-f-card"); box.dataset.fid = f ? f.id : "new";
    function lab(txt, node) { var l = el("label", "base-f-lab"); l.appendChild(el("span", null, txt)); l.appendChild(node); return l; }
    var name = el("input", "dlg-input base-f-name"); name.type = "text"; name.value = f ? f.name : ""; name.placeholder = "Field name";
    name.setAttribute("aria-label", "Field " + (i + 1) + " name");
    box.appendChild(lab("Name", name));
    var typ = el("select", "dlg-input base-f-type");
    (T ? T.opts() : [{ value: "text", label: "Text" }]).forEach(function (o) {
      var op = el("option", null, o.label); op.value = o.value; typ.appendChild(op);
    });
    typ.value = f ? f.type : "text";
    box.appendChild(lab("Type", typ));
    var optBox = el("div", "base-f-opts");
    var optTa = el("textarea", "dlg-input base-f-options"); optTa.rows = 3;
    optTa.placeholder = "One option per line";
    optTa.value = (f && f.options ? f.options : []).join("\n");
    optBox.appendChild(el("span", "base-f-hint", "Choice options"));
    optBox.appendChild(optTa);
    box.appendChild(optBox);
    var def = el("input", "dlg-input base-f-def"); def.type = "text";
    def.value = f && f.def != null ? String(f.def) : "";
    def.placeholder = "Optional";
    var defLab = lab("Default", def); box.appendChild(defLab);
    var next = el("div", "base-f-next"); box.appendChild(next);
    var rules = el("div", "base-f-rules");
    var req = el("input"); req.type = "checkbox"; req.className = "base-f-req"; req.checked = !!(f && f.required);
    var reqL = el("label", "base-f-check"); reqL.appendChild(req); reqL.appendChild(document.createTextNode(" Required"));
    var uniq = el("input"); uniq.type = "checkbox"; uniq.className = "base-f-unique"; uniq.checked = !!(f && f.unique);
    var uniqL = el("label", "base-f-check"); uniqL.appendChild(uniq); uniqL.appendChild(document.createTextNode(" Unique"));
    rules.appendChild(reqL); rules.appendChild(uniqL); box.appendChild(rules);
    var hint = el("div", "base-f-note", f ? "Clear the name to delete this field." : ""); box.appendChild(hint);
    function sync() {
      var ty = typ.value;
      optBox.hidden = ty !== "choice";
      defLab.hidden = ty === "id" || ty === "picture";
      rules.hidden = ty === "id";
      if (ty === "id") {
        next.hidden = false;
        next.textContent = f && f.type === "id" && f.next ? ("Next number: " + f.next + " (never reused)") : "Existing records will be numbered 1, 2, 3… in their current order.";
      } else next.hidden = true;
      if (ty === "bool") { def.type = "text"; def.placeholder = "yes or no"; }
      else if (ty === "date") { def.type = "date"; def.placeholder = ""; }
      else if (ty === "number" || ty === "currency") { def.type = "text"; def.placeholder = ty === "currency" ? "e.g. 1500" : "Optional"; }
      else { def.type = "text"; def.placeholder = "Optional"; }
    }
    typ.addEventListener("change", sync); sync();
    box._read = function () {
      return {
        id: f ? f.id : "",
        name: name.value.trim(),
        type: typ.value,
        options: optTa.value.split(/\r?\n/),
        def: def.value,
        required: req.checked,
        unique: uniq.checked,
        existed: !!f,
        was: f ? f.type : ""
      };
    };
    return box;
  }

  function openDialog(o) {
    return new Promise(function (resolve) {
      var back = el("div", "dlg-backdrop base-f-back");
      var box = el("div", "dlg base-f-dlg"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
      var title = el("div", "dlg-title", o.title); title.id = "baseFieldsTitle"; box.setAttribute("aria-labelledby", "baseFieldsTitle");
      box.appendChild(title);
      if (o.message) box.appendChild(el("div", "dlg-message", o.message));
      var body = el("div", "base-f-body");
      (o.cards || []).forEach(function (c) { body.appendChild(c); });
      box.appendChild(body);
      var err = el("div", "dlg-error", ""); err.hidden = true; err.setAttribute("role", "alert"); box.appendChild(err);
      var row = el("div", "dlg-actions");
      var cancel = el("button", "dlg-btn dlg-cancel", "Cancel"); cancel.type = "button";
      var ok = el("button", "dlg-btn dlg-ok", o.okLabel || "OK"); ok.type = "button";
      row.appendChild(cancel); row.appendChild(ok); box.appendChild(row);
      back.appendChild(box);
      var before = document.activeElement, done = false;
      document.body.appendChild(back);
      function close(val) {
        if (done) return; done = true;
        document.removeEventListener("keydown", onKey, true);
        back.remove();
        try { if (before && before.focus && document.contains(before)) before.focus({ preventScroll: true }); } catch (e) {}
        resolve(val);
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(null); return; }
        if (e.key === "Enter" && !e.isComposing && e.target && e.target.tagName !== "TEXTAREA") {
          if (document.activeElement === cancel) { e.preventDefault(); close(null); }
          else if (document.activeElement === ok || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") { e.preventDefault(); accept(); }
        }
        e.stopPropagation();
      }
      function accept() {
        var vals = o.cards.map(function (c) { return c._read(); });
        var msg = o.validate ? o.validate(vals) : "";
        if (msg) { err.textContent = msg; err.hidden = false; return; }
        close(vals);
      }
      ok.addEventListener("click", accept);
      cancel.addEventListener("click", function () { close(null); });
      back.addEventListener("mousedown", function (e) { if (e.target === back) { e.preventDefault(); close(null); } });
      document.addEventListener("keydown", onKey, true);
      var first = box.querySelector("input, select"); if (first) first.focus();
    });
  }

  function specToField(spec, old) {
    var T = types();
    var f = old || { id: BaseStore.uid(), name: spec.name };
    f.name = spec.name;
    f.type = spec.type;
    if (spec.required && spec.type !== "id") f.required = true; else delete f.required;
    if (spec.unique && spec.type !== "id") f.unique = true; else delete f.unique;
    if (spec.type === "choice") f.options = BaseStore.normOptions(spec.options);
    else delete f.options;
    if (spec.type !== "id" && spec.type !== "picture" && spec.def != null && String(spec.def).trim() !== "") {
      f.def = (spec.type === "bool")
        ? /^(yes|true|y|1)$/i.test(String(spec.def).trim())
        : ((spec.type === "number" || spec.type === "currency") && T ? (BaseTypes.parseCurrency(spec.def) || spec.def) : spec.def);
    } else delete f.def;
    if (spec.type === "id" && typeof f.next !== "number") f.next = 1;
    if (spec.type !== "id") delete f.next;
    return f;
  }

  function retypeConfirm(t, changes) {
    var parts = [], need = false;
    changes.forEach(function (c) {
      if (!c.from || c.from === c.to) return;
      var p = types() ? BaseTypes.previewRetype(t, c.field, c.to) : { lost: 0, fill: c.to === "id" };
      c.preview = p;
      if (p.fill) parts.push("“" + c.field.name + "” will be numbered 1, 2, 3… in the current order.");
      else if (p.lost) { need = true; parts.push("“" + c.field.name + "”: " + p.lost + " of " + p.total + " value" + (p.total === 1 ? "" : "s") + " cannot be converted and will be cleared."); }
    });
    if (!parts.length) return Promise.resolve(true);
    var msg = parts.join(" ") + (need ? " Continue?" : " Continue?");
    return OfficeDialog.confirm({ title: "Change field type?", message: msg, okLabel: "Change type" });
  }

  function applyRetype(t, f, toType) {
    if (f.type === toType) return;
    if (toType === "id") { f.type = "id"; BaseTypes.fillAutoIds(t, f); return; }
    t.rows.forEach(function (r) {
      var c = BaseTypes.convert(r.v[f.id], f.type, toType);
      r.v[f.id] = c.fill ? "" : c.value;
    });
    f.type = toType;
    if (toType !== "id") delete f.next;
    if (toType !== "choice") delete f.options;
  }

  function add() {
    var t = BaseStore.table(); if (!t) return;
    var card = fieldCard(null, t.fields.length);
    openDialog({ title: "Add field", message: "New values use the default (if you set one). Auto-number ID is read-only and counts up, never reusing a deleted number.", cards: [card], okLabel: "Add field",
      validate: function (vals) { return vals[0] && vals[0].name ? "" : "Enter a name"; }
    }).then(function (vals) {
      if (!vals) return;
      var spec = vals[0];
      if (spec.type === "id" && t.fields.some(function (f) { return f.type === "id"; })) return toast("This table already has an Auto-number ID");
      try { if (typeof BaseHistory !== "undefined") BaseHistory.push("Add field"); } catch (e) {}
      var f = specToField(spec, null);
      if (f.type === "id") { t.fields.unshift(f); BaseTypes.fillAutoIds(t, f); }
      else {
        t.fields.push(f);
        t.rows.forEach(function (r) { r.v[f.id] = types() ? BaseTypes.defaultValue(f) : (f.type === "bool" ? false : ""); });
      }
      BaseStore.save(); BaseUI.render();
    });
  }

  function applySpecs(t, vals) {
    var oldBy = {};
    t.fields.forEach(function (f) { oldBy[f.id] = { type: f.type, field: f }; });
    var next = [];
    vals.forEach(function (spec) {
      if (!spec.name) {
        var gone = oldBy[spec.id] && oldBy[spec.id].field;
        if (gone) t.rows.forEach(function (r) { delete r.v[gone.id]; });
        return;
      }
      var prev = oldBy[spec.id] && oldBy[spec.id].field;
      var fromType = prev ? prev.type : spec.type;
      var f = specToField(spec, prev);
      if (prev && fromType !== f.type) {
        /* convert from the original type; specToField already set f.type */
        var to = f.type;
        f.type = fromType;
        applyRetype(t, f, to);
      } else if (!prev) {
        t.rows.forEach(function (r) { r.v[f.id] = types() ? BaseTypes.defaultValue(f) : (f.type === "bool" ? false : ""); });
      }
      next.push(f);
    });
    t.fields = next;
  }

  function edit() {
    var t = BaseStore.table(); if (!t) return;
    var cards = t.fields.map(function (f, i) { return fieldCard(f, i); });
    openDialog({ title: "Fields of " + t.name, message: "Rename, change the type, or set Required / Default / Unique. Clear a name to delete that field.", cards: cards, okLabel: "Apply",
      validate: function (vals) { return vals.some(function (v) { return v.name; }) ? "" : "Keep at least one field"; }
    }).then(function (vals) {
      if (!vals) return;
      var changes = [], idCount = 0;
      vals.forEach(function (spec) {
        if (!spec.name) return;
        if (spec.type === "id") idCount++;
        var old = t.fields.filter(function (f) { return f.id === spec.id; })[0];
        if (old && old.type !== spec.type) changes.push({ field: old, from: old.type, to: spec.type });
      });
      if (idCount > 1) return toast("A table can have only one Auto-number ID");
      retypeConfirm(t, changes).then(function (ok) {
        if (!ok) return;
        try { if (typeof BaseHistory !== "undefined") BaseHistory.push("Edit fields"); } catch (e) {}
        applySpecs(t, vals);
        BASE.sort = null; BaseStore.save(); BaseUI.render();
        try { if (typeof BasePics !== "undefined") BasePics.gc(); } catch (e) {}
      });
    });
  }

  return { add: add, edit: edit, apply: apply, touch: touch, endTouch: endTouch, mark: mark, issue: issue, applySpecs: applySpecs };
})();
