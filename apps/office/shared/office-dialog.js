/*
 * apps/office/shared/office-dialog.js
 * Small modal dialogs shared by the Office apps (Draftly, Spreadsheet). No window.prompt / confirm.
 *   OfficeDialog.prompt({title, label, value, okLabel, emptyError}) → Promise<string|null>
 *   OfficeDialog.confirm({title, message, okLabel, danger})         → Promise<boolean>
 *   OfficeDialog.form({title, message, fields:[{key,label,type,value,min,max,step}], okLabel,
 *                      validate(values) → error text | ""})        → Promise<object|null>
 * Keys: Enter = OK (except when Cancel has focus), Esc or a backdrop click = cancel,
 * Tab stays inside the dialog. A prompt selects its text and refuses an empty value.
 * A danger confirm has a red OK and starts with Cancel focused.
 * One dialog at a time; opening another cancels the first.
 * Styles: office-dialog.css (colours come from the app's CSS variables, with fallbacks).
 * Generalised from Draftly's draftly-dialog.js (Draftly.dialog is now an alias of this).
 */
var OfficeDialog = window.OfficeDialog || {};
window.OfficeDialog = OfficeDialog;

(function () {
  var D = OfficeDialog;
  var current = null;   /* {close(result)} */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function cancelValue(kind) { return kind === 'confirm' ? false : null; }

  /* Build and show one dialog. kind: 'prompt' | 'confirm' | 'form'. Resolves with the result. */
  function open(kind, o) {
    if (current) current.close(cancelValue(current.kind));
    o = o || {};
    return new Promise(function (resolve) {
      var back = el('div', 'dlg-backdrop');
      var box = el('div', 'dlg');
      box.setAttribute('role', kind === 'confirm' ? 'alertdialog' : 'dialog');
      box.setAttribute('aria-modal', 'true');
      var title = el('div', 'dlg-title', o.title || (kind === 'confirm' ? 'Are you sure?' : 'Enter a value'));
      title.id = 'dlgTitle'; box.setAttribute('aria-labelledby', 'dlgTitle');
      box.appendChild(title);
      var input = null, err = null, inputs = [];
      if (o.message && kind !== 'prompt') {
        var msg = el('div', 'dlg-message', o.message);
        msg.id = 'dlgMsg'; box.setAttribute('aria-describedby', 'dlgMsg');
        box.appendChild(msg);
      }
      if (kind === 'prompt') {
        var lab = el('label', 'dlg-label');
        lab.appendChild(el('span', null, o.label || ''));
        input = el('input', 'dlg-input');
        input.type = 'text'; input.spellcheck = false; input.value = o.value != null ? String(o.value) : '';
        lab.appendChild(input);
        box.appendChild(lab);
        inputs = [input];
      } else if (kind === 'form') {
        var grid = el('div', 'dlg-grid');
        (o.fields || []).forEach(function (f) {
          var l = el('label', 'dlg-label');
          l.appendChild(el('span', null, f.label || f.key));
          var i = el('input', 'dlg-input');
          i.type = f.type || 'text'; i.spellcheck = false; i.dataset.key = f.key;
          if (f.min != null) i.min = f.min;
          if (f.max != null) i.max = f.max;
          if (f.step != null) i.step = f.step;
          i.value = f.value != null ? String(f.value) : '';
          l.appendChild(i);
          grid.appendChild(l);
          inputs.push(i);
        });
        box.appendChild(grid);
        input = inputs[0] || null;
      }
      if (kind !== 'confirm') {
        err = el('div', 'dlg-error', '');
        err.hidden = true; err.setAttribute('role', 'alert');
        box.appendChild(err);
      }
      var row = el('div', 'dlg-actions');
      var cancel = el('button', 'dlg-btn dlg-cancel', 'Cancel'); cancel.type = 'button';
      var ok = el('button', 'dlg-btn dlg-ok' + (o.danger ? ' dlg-danger' : ''), o.okLabel || 'OK'); ok.type = 'button';
      row.appendChild(cancel); row.appendChild(ok);
      box.appendChild(row);
      back.appendChild(box);
      var before = document.activeElement;
      document.body.appendChild(back);

      var done = false;
      function close(result) {
        if (done) return;
        done = true; current = null;
        document.removeEventListener('keydown', onKey, true);
        back.remove();
        try { if (before && before.focus && document.contains(before)) before.focus({ preventScroll: true }); } catch (e) {}
        resolve(result);
      }
      function showErr(text, focusEl) {
        err.textContent = text; err.hidden = false;
        if (focusEl) { focusEl.focus(); if (focusEl.select) focusEl.select(); }
      }
      function accept() {
        if (kind === 'confirm') { close(true); return; }
        if (kind === 'prompt') {
          var v = input.value.trim();
          if (!v) { showErr(o.emptyError || 'Please enter a name.', input); return; }
          close(v);
          return;
        }
        var vals = {};
        inputs.forEach(function (i) { vals[i.dataset.key] = i.value; });
        var e = o.validate ? o.validate(vals) : '';
        if (e) { showErr(e, input); return; }
        close(vals);
      }
      function cancelIt() { close(cancelValue(kind)); }
      function focusables() { return inputs.concat([cancel, ok]).filter(Boolean); }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelIt(); return; }
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault(); e.stopPropagation();
          if (document.activeElement === cancel) cancelIt(); else accept();
          return;
        }
        if (e.key === 'Tab') {
          var f = focusables(), i = f.indexOf(document.activeElement);
          e.preventDefault();
          f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
          return;
        }
        e.stopPropagation();   /* keep app shortcuts (Ctrl+S …) out while open */
      }
      document.addEventListener('keydown', onKey, true);
      ok.addEventListener('click', accept);
      cancel.addEventListener('click', cancelIt);
      back.addEventListener('mousedown', function (e) { if (e.target === back) { e.preventDefault(); cancelIt(); } });
      box.addEventListener('focusout', function () {
        setTimeout(function () { if (!done && !box.contains(document.activeElement)) (input || (o.danger ? cancel : ok)).focus(); }, 0);
      });
      inputs.forEach(function (i) { i.addEventListener('input', function () { if (err) err.hidden = true; }); });
      current = { kind: kind, close: function (r) { close(r); } };
      if (input) { input.focus(); input.select(); }
      else (o.danger ? cancel : ok).focus();
    });
  }

  D.prompt = function (o) { return open('prompt', o); };
  D.confirm = function (o) { return open('confirm', o); };
  D.form = function (o) { return open('form', o); };
  D.isOpen = function () { return !!current; };
})();
