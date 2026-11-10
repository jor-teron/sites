/*
 * apps/office/shared/office-dialog.js
 * Small modal dialogs shared by the Office apps (Draftly, Spreadsheet). No window.prompt / confirm.
 *   OfficeDialog.prompt({title, label, value, okLabel, emptyError}) → Promise<string|null>
 *   OfficeDialog.confirm({title, message, okLabel, danger})         → Promise<boolean>
 *   OfficeDialog.alert({title, message, okLabel})                   → Promise<boolean>   (HO2)
 *   OfficeDialog.form({title, message, fields:[{key,label,type,value,min,max,step,options}], okLabel,
 *     (type:'select' + options:[{value,label}] or ['a','b'] gives a dropdown; added for Base BS2)
 *                      validate(values) → error text | ""})        → Promise<object|null>
 * Keys: Enter = OK (except when Cancel has focus), Esc or a backdrop click = cancel,
 * Tab stays inside the dialog. A prompt selects its text and refuses an empty value.
 * A danger confirm has a red OK and starts with Cancel focused.
 * One Office dialog at a time; opening another cancels the first.
 * HO2: the box is a <dialog> opened with showModal(), so it sits above any other open <dialog>.
 * Text is set with textContent only.
 * (before HO2) the box was a div.dlg-backdrop appended to document.body (not the top layer).
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

  function cancelValue(kind) { return (kind === 'confirm' || kind === 'alert') ? false : null; }

  /* Build and show one dialog. kind: 'prompt' | 'confirm' | 'alert' | 'form'. Resolves with the result. */
  function open(kind, o) {
    if (current) current.close(cancelValue(current.kind));
    o = o || {};
    return new Promise(function (resolve) {
      /* (before HO2) var back = el('div', 'dlg-backdrop'); document.body.appendChild(back); */
      var host = el('dialog', 'dlg-modal');
      var box = el('div', 'dlg');
      box.setAttribute('role', (kind === 'confirm' || kind === 'alert') ? 'alertdialog' : 'dialog');
      box.setAttribute('aria-modal', 'true');
      var title = el('div', 'dlg-title', o.title || (kind === 'confirm' ? 'Are you sure?' : (kind === 'alert' ? 'Notice' : 'Enter a value')));
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
          var i;
          if (f.type === 'select') {
            i = el('select', 'dlg-input'); i.dataset.key = f.key;
            (f.options || []).forEach(function (op) {
              var oo = el('option', null, op.label != null ? op.label : (op.value != null ? op.value : op));
              oo.value = op.value != null ? op.value : op; i.appendChild(oo);
            });
          } else {
            i = el('input', 'dlg-input');
            i.type = f.type || 'text'; i.spellcheck = false; i.dataset.key = f.key;
          }
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
      var cancel = null;
      if (kind !== 'alert') {
        cancel = el('button', 'dlg-btn dlg-cancel', 'Cancel'); cancel.type = 'button';
        row.appendChild(cancel);
      }
      var ok = el('button', 'dlg-btn dlg-ok' + (o.danger ? ' dlg-danger' : ''), o.okLabel || 'OK'); ok.type = 'button';
      row.appendChild(ok);
      box.appendChild(row);
      host.appendChild(box);
      var before = document.activeElement;
      document.body.appendChild(host);
      if (typeof host.showModal === 'function') {
        try { host.showModal(); } catch (e) { host.setAttribute('open', ''); }
      } else {
        host.setAttribute('open', '');
      }

      var done = false;
      function close(result) {
        if (done) return;
        done = true; current = null;
        document.removeEventListener('keydown', onKey, true);
        try { if (host.close) host.close(); } catch (e) {}
        host.remove();
        try { if (before && before.focus && document.contains(before)) before.focus({ preventScroll: true }); } catch (e) {}
        resolve(result);
      }
      function showErr(text, focusEl) {
        err.textContent = text; err.hidden = false;
        if (focusEl) { focusEl.focus(); if (focusEl.select) focusEl.select(); }
      }
      function accept() {
        if (kind === 'confirm' || kind === 'alert') { close(true); return; }
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
      if (cancel) cancel.addEventListener('click', cancelIt);
      host.addEventListener('cancel', function (e) { e.preventDefault(); cancelIt(); });
      host.addEventListener('mousedown', function (e) { if (e.target === host) { e.preventDefault(); cancelIt(); } });
      box.addEventListener('focusout', function () {
        setTimeout(function () { if (!done && !box.contains(document.activeElement)) (input || (o.danger && cancel ? cancel : ok)).focus(); }, 0);
      });
      inputs.forEach(function (i) { i.addEventListener('input', function () { if (err) err.hidden = true; }); });
      current = { kind: kind, close: function (r) { close(r); } };
      if (input) { input.focus(); if (input.select) input.select(); }
      else (o.danger && cancel ? cancel : ok).focus();
    });
  }

  D.prompt = function (o) { return open('prompt', o); };
  D.confirm = function (o) { return open('confirm', o); };
  D.alert = function (o) { return open('alert', o); };
  D.form = function (o) { return open('form', o); };
  D.isOpen = function () { return !!current; };
})();
