/* Agent — app/gui/confirm.js: AG42 in-app confirm. HR.confirm(msg, opt) returns a Promise of true (OK) or false (Cancel).
   opt: {okText, cancelText, danger}. Builds a native <dialog> and opens it with showModal(), so it sits in the
   top layer above other modal dialogs (Settings and the image viewer both use showModal(); a body overlay would
   stay behind them and inert). Enter = OK. Esc fires the dialog's cancel event and resolves false. danger focuses
   the Cancel button and marks the OK button. The dialog is removed from the DOM after it closes. The message is
   set with textContent only (no innerHTML). Styles: .hr-confirm in ui/components.css, using the theme variables. */
window.HR = window.HR || {};
var HR = window.HR;
HR.confirm = function (msg, opt) {
  opt = opt || {};
  return new Promise(function (resolve) {
    var dlg = document.createElement('dialog'), p = document.createElement('p'), row = document.createElement('div');
    var cancel = document.createElement('button'), ok = document.createElement('button'), settled = false;
    dlg.className = 'hr-confirm';
    p.className = 'hr-confirm-msg';
    p.textContent = msg == null ? '' : String(msg);
    row.className = 'hr-confirm-row';
    cancel.type = 'button'; cancel.className = 'hb wide'; cancel.textContent = opt.cancelText || 'Cancel';
    ok.type = 'button'; ok.className = 'hb wide' + (opt.danger ? ' hr-confirm-danger' : ''); ok.textContent = opt.okText || 'OK';
    function drop() { if (dlg.parentNode) dlg.parentNode.removeChild(dlg); }
    function finish(v) {
      if (settled) return; settled = true;
      dlg.addEventListener('close', drop);
      try { if (dlg.open) dlg.close(); else drop(); } catch (e) { drop(); }
      if (dlg.parentNode) drop();
      resolve(v === true);
    }
    cancel.onclick = function () { finish(false); };
    ok.onclick = function () { finish(true); };
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); finish(false); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    });
    row.appendChild(cancel); row.appendChild(ok); dlg.appendChild(p); dlg.appendChild(row);
    document.body.appendChild(dlg);
    var safe = opt.danger ? cancel : ok;
    safe.setAttribute('autofocus', '');
    dlg.showModal();
    safe.focus();
  });
};
