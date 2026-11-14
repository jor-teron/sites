/* PDF Viewer — pv_dlg.js: in-app dialogs only (no alert / confirm / prompt). PV2 */
(function (root) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var allowDismiss = true;
  var onClose = null;

  function close() {
    var dlg = $('pv-dialog');
    if (dlg && dlg.open) {
      try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); }
    } else if (dlg) {
      dlg.hidden = true;
    }
    var body = $('pv-dialog-body');
    var acts = $('pv-dialog-actions');
    var title = $('pv-dialog-title');
    if (body) body.innerHTML = '';
    if (acts) acts.innerHTML = '';
    if (title) title.textContent = '';
    allowDismiss = true;
    var fn = onClose;
    onClose = null;
    if (fn) try { fn(); } catch (e) { /* ignore */ }
  }

  function isOpen() {
    var dlg = $('pv-dialog');
    return !!(dlg && (dlg.open || (!dlg.hidden && dlg.hasAttribute('open'))));
  }

  /**
   * @param {object} opts
   * @param {string} [opts.title]
   * @param {string} [opts.html]
   * @param {string} [opts.text]
   * @param {Function} [opts.fill]  receives the body element
   * @param {{label:string, cls?:string, fn?:Function}[]} [opts.actions]
   * @param {boolean} [opts.dismissable=true]
   * @param {Function} [opts.onClose]
   */
  function open(opts) {
    opts = opts || {};
    var dlg = $('pv-dialog');
    var boxTitle = $('pv-dialog-title');
    var body = $('pv-dialog-body');
    var acts = $('pv-dialog-actions');
    if (!dlg || !body || !acts) return function () {};

    close();
    allowDismiss = opts.dismissable !== false;
    onClose = opts.onClose || null;
    if (boxTitle) {
      boxTitle.textContent = opts.title || '';
      boxTitle.hidden = !opts.title;
    }
    body.innerHTML = '';
    if (opts.fill) opts.fill(body);
    else if (opts.html != null) body.innerHTML = opts.html;
    else if (opts.text) {
      var p = document.createElement('p');
      p.textContent = opts.text;
      body.appendChild(p);
    }

    acts.innerHTML = '';
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (a.cls ? ' ' + a.cls : '');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        if (a.fn && a.fn() === false) return;
        close();
      });
      acts.appendChild(b);
    });

    dlg.hidden = false;
    if (typeof dlg.showModal === 'function') {
      try { dlg.showModal(); } catch (e) {
        try { dlg.show(); } catch (e2) { dlg.setAttribute('open', ''); }
      }
    } else {
      dlg.setAttribute('open', '');
    }

    var first = body.querySelector('input, select, textarea, button') ||
      acts.querySelector('.btn-primary') || acts.querySelector('button');
    if (first && first.focus) setTimeout(function () { first.focus(); }, 0);
    return close;
  }

  function message(title, text, label) {
    return open({
      title: title || 'PDF Viewer',
      text: text || '',
      actions: [{ label: label || 'OK', cls: 'btn-primary' }]
    });
  }

  root.PVDlg = { open: open, close: close, isOpen: isOpen, message: message };
})(typeof globalThis !== 'undefined' ? globalThis : this);
