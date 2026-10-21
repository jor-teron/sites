/* ============================================================
   FILE: mybookmark_dialog.js
   PROJECT: MyBookmark
   ROLE: In-app modal dialogs (no window.prompt / confirm / alert).
     MBDialog.form({title, message, fields:[{name, label, type:'text'|'url'|'select'|'radio', value, options:[{value,label}], required, check(v)→error}], okLabel, danger})
       → Promise<{name: value} | null>
     MBDialog.prompt({title, label, value, okLabel}) → Promise<string|null>  (empty refused)
     MBDialog.confirm({title, message, okLabel, danger}) → Promise<boolean>
     MBDialog.notice({title, message}) → Promise<void>
   Enter = OK (except on Cancel), Esc / backdrop = cancel, Tab stays inside.
   A danger dialog has a red OK and starts on Cancel.
   ============================================================ */
const MBDialog = (() => {
  let current = null;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function form(o) {
    if (current) current(null);
    return new Promise((resolve) => {
      const back = el('div', 'dlg-back');
      const box = el('form', 'dlg'); box.noValidate = true;
      box.setAttribute('role', o.danger || !o.fields ? 'alertdialog' : 'dialog'); box.setAttribute('aria-modal', 'true');
      box.appendChild(el('h2', 'dlg-title', o.title || ''));
      if (o.message) box.appendChild(el('p', 'dlg-msg', o.message));
      const inputs = {};
      (o.fields || []).forEach((f) => {
        const wrap = el('label', 'dlg-field');
        wrap.appendChild(el('span', null, f.label || ''));
        let inp;
        if (f.type === 'select') {
          inp = el('select', 'dlg-input');
          f.options.forEach((op) => { const x = el('option', null, op.label); x.value = op.value; inp.appendChild(x); });
          inp.value = f.value != null ? f.value : (f.options[0] || {}).value;
        } else if (f.type === 'radio') {
          inp = el('div', 'dlg-radios');
          f.options.forEach((op, i) => {
            const l = el('label', 'dlg-radio'), r = el('input'); r.type = 'radio'; r.name = 'r_' + f.name; r.value = op.value;
            r.checked = f.value != null ? f.value === op.value : i === 0;
            l.appendChild(r); l.appendChild(document.createTextNode(' ' + op.label)); inp.appendChild(l);
          });
        } else {
          inp = el('input', 'dlg-input'); inp.type = f.type === 'url' ? 'url' : 'text'; inp.spellcheck = false; inp.value = f.value || '';
          if (f.placeholder) inp.placeholder = f.placeholder;
        }
        inp.dataset.name = f.name;
        wrap.appendChild(inp);
        const err = el('span', 'dlg-err'); err.hidden = true; wrap.appendChild(err);
        inputs[f.name] = { f, inp, err };
        box.appendChild(wrap);
      });
      const row = el('div', 'dlg-actions');
      const cancel = el('button', 'btn', o.cancelLabel || 'Cancel'); cancel.type = 'button';
      const ok = el('button', 'btn primary' + (o.danger ? ' danger' : ''), o.okLabel || 'OK'); ok.type = 'submit';
      if (!o.noCancel) row.appendChild(cancel);
      row.appendChild(ok);
      box.appendChild(row); back.appendChild(box);
      const before = document.activeElement;
      document.body.appendChild(back);
      let done = false;
      const value = (x) => (x.f.type === 'radio' ? (x.inp.querySelector('input:checked') || {}).value : x.inp.value);
      function close(r) {
        if (done) return; done = true; current = null;
        document.removeEventListener('keydown', key, true); back.remove();
        try { if (before && document.contains(before)) before.focus({ preventScroll: true }); } catch (_) { /* gone */ }
        resolve(r);
      }
      function accept() {
        const out = {}; let bad = null;
        for (const [n, x] of Object.entries(inputs)) {
          let v = value(x); if (typeof v === 'string' && x.f.type !== 'select' && x.f.type !== 'radio') v = v.trim();
          let e = x.f.required && !v ? (x.f.label || 'This field') + ' cannot be empty.' : null;
          if (!e && x.f.check) e = x.f.check(v);
          x.err.hidden = !e; x.err.textContent = e || '';
          if (e && !bad) bad = x.inp;
          out[n] = v;
        }
        if (bad) { bad.focus(); if (bad.select) bad.select(); return; }
        close(o.fields ? out : true);
      }
      const focusables = () => Array.from(box.querySelectorAll('input, select, button')).filter((x) => !x.disabled && x.offsetParent !== null);
      function key(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(o.fields ? null : false); return; }
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); if (document.activeElement === cancel) close(o.fields ? null : false); else accept(); return; }
        if (e.key === 'Tab') {
          const f = focusables(), i = f.indexOf(document.activeElement); e.preventDefault();
          f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); return;
        }
        e.stopPropagation();
      }
      document.addEventListener('keydown', key, true);
      box.addEventListener('submit', (e) => { e.preventDefault(); accept(); });
      cancel.addEventListener('click', () => close(o.fields ? null : false));
      back.addEventListener('mousedown', (e) => { if (e.target === back) { e.preventDefault(); close(o.fields ? null : false); } });
      Object.values(inputs).forEach((x) => x.inp.addEventListener('input', () => { x.err.hidden = true; }));
      current = (r) => close(r);
      const first = Object.values(inputs)[0];
      if (first && !o.danger) { first.inp.focus(); if (first.inp.select) first.inp.select(); }
      else (o.danger ? cancel : ok).focus();
    });
  }
  const prompt = (o) => form({ title: o.title, okLabel: o.okLabel, fields: [{ name: 'v', label: o.label, value: o.value, required: true }] }).then((r) => (r ? r.v : null));
  const confirm = (o) => form({ title: o.title, message: o.message, okLabel: o.okLabel, danger: o.danger });
  const notice = (o) => form({ title: o.title, message: o.message, okLabel: 'OK', noCancel: true }).then(() => undefined);
  return { form, prompt, confirm, notice, isOpen: () => !!current };
})();
