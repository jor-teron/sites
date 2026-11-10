/*
 * spreadsheet_fx.js  (SH9)
 * Formula hint while typing, and a function picker (fx button).
 * Reads FX_CATALOG / fxCaretContext / fxSuggest from spreadsheet_functions.js.
 * In-app only (no window.prompt). Hidden on blur, Esc, or a click outside.
 */
var FX_UI = { hint: null, picker: null, input: null };

function fxHideHint() {
  if (FX_UI.hint) FX_UI.hint.hidden = true;
}

function fxPlaceUnder(el, box) {
  var r = el.getBoundingClientRect();
  var w = Math.max(280, Math.min(520, r.width));
  var left = r.left;
  if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
  box.style.left = Math.round(left) + "px";
  box.style.top = Math.round(r.bottom + 2) + "px";
  box.style.width = w + "px";
}

function fxHighlightSig(sig, arg) {
  var parts = sig.split(/([,()])/), out = "", i, n = -1, bit;
  for (i = 0; i < parts.length; i++) {
    bit = parts[i];
    if (bit === "(") { out += bit; n = 0; continue; }
    if (bit === ")") { out += bit; continue; }
    if (bit === ",") { out += bit; n++; continue; }
    if (n >= 0 && bit.replace(/\s/g, "") && n === arg) out += '<strong>' + bit + "</strong>";
    else out += bit;
  }
  return out;
}

function fxShowHint(input) {
  var box = FX_UI.hint, text, caret, ctx, html, i, it, names;
  if (!box || !input) return;
  text = input.value;
  caret = input.selectionStart != null ? input.selectionStart : text.length;
  if (!text || text.charAt(0) !== "=") { box.hidden = true; return; }
  ctx = fxCaretContext(text, caret);
  if (!ctx) { box.hidden = true; return; }
  html = "";
  if (ctx.item) {
    html += '<div class="fx-sig">' + fxHighlightSig(ctx.item.sig, ctx.arg) + "</div>";
    html += '<div class="fx-help">' + ctx.item.hint + "</div>";
  } else if (ctx.names && ctx.names.length) {
    html += '<div class="fx-help">Functions</div>';
    for (i = 0; i < ctx.names.length; i++) {
      it = ctx.names[i];
      html += '<button type="button" class="fx-item" data-fx="' + it.name + '" data-replace="1">' +
        "<span>" + it.name + "</span><span class=\"fx-item-sig\">" + it.sig + "</span></button>";
    }
  } else if (ctx.name) {
    names = fxSuggest(ctx.name, 8);
    if (!names.length) { box.hidden = true; return; }
    html += '<div class="fx-help">Functions</div>';
    for (i = 0; i < names.length; i++) {
      it = names[i];
      html += '<button type="button" class="fx-item" data-fx="' + it.name + '">' +
        "<span>" + it.name + "</span><span class=\"fx-item-sig\">" + it.sig + "</span></button>";
    }
  } else {
    box.hidden = true;
    return;
  }
  box.innerHTML = html;
  fxPlaceUnder(input, box);
  box.hidden = false;
  FX_UI.input = input;
}

function fxInsertName(name, replacePrefix) {
  var inp = FX_UI.input || document.getElementById("formula-bar");
  var bar = document.getElementById("formula-bar");
  var text, caret, ctx, start, end, out, cellInp;
  if (!inp) return;
  if (inp !== bar && inp.readOnly && typeof startEdit === "function") startEdit(inp, true);
  text = inp.value || "";
  caret = inp.selectionStart != null ? inp.selectionStart : text.length;
  if (replacePrefix) {
    ctx = fxCaretContext(text, caret);
    if (ctx && ctx.prefix != null) {
      start = ctx.start; end = ctx.end;
      out = text.slice(0, start) + name + "(" + text.slice(end);
      caret = start + name.length + 1;
    } else {
      out = (text && text.charAt(0) === "=" ? text : "=") + (text && text.charAt(0) === "=" ? "" : "") ;
      if (text && text.charAt(0) === "=") {
        out = text + name + "(";
        caret = out.length;
      } else {
        out = "=" + name + "(";
        caret = out.length;
      }
    }
  } else if (!text || text.charAt(0) !== "=") {
    out = "=" + name + "(";
    caret = out.length;
  } else {
    out = text.slice(0, caret) + name + "(" + text.slice(caret);
    caret = caret + name.length + 1;
  }
  inp.value = out;
  if (bar && bar !== inp) bar.value = out;
  try { inp.focus(); inp.setSelectionRange(caret, caret); } catch (e) {}
  fxShowHint(inp);
  cellInp = inpGrid && inpGrid[selR] && inpGrid[selR][selC];
  if (cellInp && cellInp !== inp) {
    if (cellInp.readOnly && typeof startEdit === "function") startEdit(cellInp, true);
    cellInp.value = out;
  }
}

function fxOpenPicker() {
  var box = FX_UI.picker, q, list, filter, cats, c, i, it, html, groups;
  if (!box) return;
  fxHideHint();
  function render() {
    q = (box.querySelector("#fx-picker-q") && box.querySelector("#fx-picker-q").value || "").trim().toUpperCase();
    list = document.getElementById("fx-picker-list");
    if (!list) return;
    groups = {};
    for (i = 0; i < FX_CATALOG.length; i++) {
      it = FX_CATALOG[i];
      if (q && it.name.indexOf(q) < 0 && it.sig.toUpperCase().indexOf(q) < 0 && it.hint.toUpperCase().indexOf(q) < 0) continue;
      (groups[it.cat] || (groups[it.cat] = [])).push(it);
    }
    html = "";
    cats = ["Math", "Logic", "Lookup", "Text", "Date"];
    for (c = 0; c < cats.length; c++) {
      if (!groups[cats[c]] || !groups[cats[c]].length) continue;
      html += "<div class=\"fx-cat\">" + cats[c] + "</div>";
      for (i = 0; i < groups[cats[c]].length; i++) {
        it = groups[cats[c]][i];
        html += '<button type="button" class="fx-item" data-fx="' + it.name + '">' +
          "<span>" + it.name + "</span><span class=\"fx-item-sig\">" + it.sig + "</span>" +
          "<span class=\"fx-item-hint\">" + it.hint + "</span></button>";
      }
    }
    if (!html) html = "<div class=\"fx-help\">No matching function.</div>";
    list.innerHTML = html;
  }
  if (box.hidden) {
    box.hidden = false;
    filter = box.querySelector("#fx-picker-q");
    if (filter) { filter.value = ""; filter.focus(); }
  }
  render();
  box._render = render;
}

function fxClosePicker() {
  if (FX_UI.picker) FX_UI.picker.hidden = true;
}

function fxBindInput(el) {
  if (!el || el._fxBound) return;
  el._fxBound = true;
  el.addEventListener("input", function () { fxShowHint(el); });
  el.addEventListener("keyup", function (ev) {
    if (ev.key === "Escape") { fxHideHint(); fxClosePicker(); return; }
    fxShowHint(el);
  });
  el.addEventListener("click", function () { fxShowHint(el); });
  el.addEventListener("blur", function () {
    setTimeout(function () {
      var a = document.activeElement;
      if (FX_UI.hint && FX_UI.hint.contains(a)) return;
      if (FX_UI.picker && !FX_UI.picker.hidden && FX_UI.picker.contains(a)) return;
      fxHideHint();
    }, 150);
  });
}

function initFxUi() {
  var bar = document.getElementById("formula-bar");
  var btn = document.getElementById("btn-fx");
  var hint = document.getElementById("fx-hint");
  var picker = document.getElementById("fx-picker");
  FX_UI.hint = hint;
  FX_UI.picker = picker;
  if (bar) fxBindInput(bar);
  if (typeof inpGrid !== "undefined" && inpGrid) {
    /* Bind as the user starts typing: delegation is lighter than 2,600 listeners. */
    var wrap = document.getElementById("sheet-wrap");
    if (wrap && !wrap._fxBound) {
      wrap._fxBound = true;
      wrap.addEventListener("input", function (ev) {
        var t = ev.target;
        if (t && t.dataset && t.dataset.r != null) { fxBindInput(t); fxShowHint(t); }
      });
      wrap.addEventListener("keyup", function (ev) {
        var t = ev.target;
        if (t && t.dataset && t.dataset.r != null) fxShowHint(t);
      });
    }
  }
  if (btn) {
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      FX_UI.input = document.activeElement && document.activeElement.id === "formula-bar"
        ? document.activeElement
        : (inpGrid[selR] && inpGrid[selR][selC]) || document.getElementById("formula-bar");
      if (picker && !picker.hidden) fxClosePicker();
      else fxOpenPicker();
    });
  }
  if (hint) {
    hint.addEventListener("mousedown", function (ev) {
      var b = ev.target.closest("[data-fx]");
      if (!b) return;
      ev.preventDefault();
      fxInsertName(b.getAttribute("data-fx"), b.getAttribute("data-replace") === "1");
    });
  }
  if (picker) {
    picker.addEventListener("input", function (ev) {
      if (ev.target && ev.target.id === "fx-picker-q" && picker._render) picker._render();
    });
    picker.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-fx]");
      var x = ev.target.closest("[data-fx-close]");
      if (x) { fxClosePicker(); return; }
      if (!b) return;
      ev.preventDefault();
      fxClosePicker();
      fxInsertName(b.getAttribute("data-fx"), false);
    });
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") { fxHideHint(); fxClosePicker(); }
  });
  document.addEventListener("mousedown", function (ev) {
    if (hint && !hint.hidden && !hint.contains(ev.target) && ev.target !== bar && ev.target !== btn) fxHideHint();
    if (picker && !picker.hidden && !picker.contains(ev.target) && ev.target !== btn) fxClosePicker();
  });
}

SHEET_INIT.push(initFxUi);
