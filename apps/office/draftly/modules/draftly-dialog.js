/* ============================================================
   FILE: modules/draftly-dialog.js
   PROJECT: Draftly
   ROLE: Small modal dialogs (no window.prompt / confirm / alert).
     Draftly.dialog.prompt({title, label, value, okLabel})  → Promise<string|null>
     Draftly.dialog.confirm({title, message, okLabel, danger}) → Promise<boolean>
   Keys: Enter = OK (except when Cancel has focus), Esc or a backdrop click = cancel,
   Tab stays inside the dialog. A prompt selects its text and refuses an empty value.
   A danger confirm has a red OK and starts with Cancel focused.
   One dialog at a time; opening another cancels the first.
   DEPENDS: nothing (styles in ui/dialog.css)
   ============================================================ */

Draftly.dialog = {};

(function () {
  var D = Draftly.dialog;
  var current = null;   /* {close(result)} */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Build and show one dialog. kind: 'prompt' | 'confirm'. Resolves with the result. */
  function open(kind, o) {
    if (current) current.close(kind === 'prompt' ? null : false);
    o = o || {};
    return new Promise(function (resolve) {
      var back = el('div', 'dlg-backdrop');
      var box = el('div', 'dlg');
      box.setAttribute('role', kind === 'confirm' ? 'alertdialog' : 'dialog');
      box.setAttribute('aria-modal', 'true');
      var title = el('div', 'dlg-title', o.title || (kind === 'prompt' ? 'Enter a value' : 'Are you sure?'));
      title.id = 'dlgTitle'; box.setAttribute('aria-labelledby', 'dlgTitle');
      box.appendChild(title);
      var input = null, err = null;
      if (kind === 'prompt') {
        var lab = el('label', 'dlg-label');
        lab.appendChild(el('span', null, o.label || ''));
        input = el('input', 'dlg-input');
        input.type = 'text'; input.spellcheck = false; input.value = o.value != null ? String(o.value) : '';
        lab.appendChild(input);
        box.appendChild(lab);
        err = el('div', 'dlg-error', '');
        err.hidden = true; err.setAttribute('role', 'alert');
        box.appendChild(err);
      } else if (o.message) {
        var msg = el('div', 'dlg-message', o.message);
        msg.id = 'dlgMsg'; box.setAttribute('aria-describedby', 'dlgMsg');
        box.appendChild(msg);
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
      function accept() {
        if (kind !== 'prompt') { close(true); return; }
        var v = input.value.trim();
        if (!v) { err.textContent = 'Please enter a name.'; err.hidden = false; input.focus(); input.select(); return; }
        close(v);
      }
      function cancelIt() { close(kind === 'prompt' ? null : false); }
      function focusables() { return [input, cancel, ok].filter(Boolean); }
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
        e.stopPropagation();   /* keep Draftly shortcuts (Ctrl+S …) out while open */
      }
      document.addEventListener('keydown', onKey, true);
      ok.addEventListener('click', accept);
      cancel.addEventListener('click', cancelIt);
      back.addEventListener('mousedown', function (e) { if (e.target === back) { e.preventDefault(); cancelIt(); } });
      box.addEventListener('focusout', function () {
        setTimeout(function () { if (!done && !box.contains(document.activeElement)) (input || (o.danger ? cancel : ok)).focus(); }, 0);
      });
      if (input) input.addEventListener('input', function () { err.hidden = true; });
      current = { close: function (r) { close(r); } };
      if (input) { input.focus(); input.select(); }
      else (o.danger ? cancel : ok).focus();
    });
  }

  D.prompt = function (o) { return open('prompt', o); };
  D.confirm = function (o) { return open('confirm', o); };
  D.isOpen = function () { return !!current; };
})();
