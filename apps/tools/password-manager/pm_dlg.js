/* Password Manager PW1 — in-app dialogs only (no alert / confirm / prompt). */
(function (root) {
  'use strict';

  var closeFn = null;
  var allowDismiss = true;

  function $(id) { return document.getElementById(id); }

  function close() {
    var dlg = $('dlg');
    if (dlg) dlg.hidden = true;
    var body = $('dlgBody');
    var acts = $('dlgActs');
    var title = $('dlgTitle');
    if (body) body.innerHTML = '';
    if (acts) acts.innerHTML = '';
    if (title) title.textContent = '';
    closeFn = null;
    allowDismiss = true;
  }

  /**
   * @param {object} opts
   * @param {string} [opts.title]
   * @param {string} [opts.html]
   * @param {string} [opts.text]
   * @param {{label:string, cls?:string, fn?:Function}[]} [opts.actions]
   * @param {boolean} [opts.dismissable=true]
   * @param {Function} [opts.onOpen]
   * @returns {Function} close
   */
  function open(opts) {
    opts = opts || {};
    var dlg = $('dlg');
    var boxTitle = $('dlgTitle');
    var body = $('dlgBody');
    var acts = $('dlgActs');
    if (!dlg || !body || !acts) return function () {};

    allowDismiss = opts.dismissable !== false;
    var box = dlg.querySelector('.box');
    if (box) box.classList.toggle('wide', !!opts.wide);
    if (boxTitle) {
      boxTitle.textContent = opts.title || '';
      boxTitle.hidden = !opts.title;
    }
    if (opts.html != null) body.innerHTML = opts.html;
    else {
      body.textContent = '';
      if (opts.text) {
        var p = document.createElement('p');
        p.textContent = opts.text;
        body.appendChild(p);
      }
    }
    acts.innerHTML = '';
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.cls || 'secondary-btn');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        if (a.fn && a.fn() === false) return;
        close();
      });
      acts.appendChild(b);
    });
    dlg.hidden = false;
    closeFn = close;
    if (opts.onOpen) opts.onOpen();
    var first = acts.querySelector('.primary-btn') || acts.querySelector('button') || body.querySelector('input, textarea, button, select');
    if (first && first.focus) setTimeout(function () { first.focus(); }, 0);
    return close;
  }

  function message(title, text, label) {
    return open({
      title: title || 'Password Manager',
      text: text || '',
      actions: [{ label: label || 'OK', cls: 'primary-btn' }]
    });
  }

  function confirm(title, text, okLabel, okCls) {
    return new Promise(function (resolve) {
      open({
        title: title || 'Please confirm',
        text: text || '',
        actions: [
          { label: 'Cancel', cls: 'secondary-btn', fn: function () { resolve(false); } },
          { label: okLabel || 'OK', cls: okCls || 'primary-btn', fn: function () { resolve(true); } }
        ]
      });
    });
  }

  function boot() {
    var dlg = $('dlg');
    if (dlg) {
      dlg.addEventListener('click', function (e) {
        if (e.target === dlg && allowDismiss) close();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('dlg') || $('dlg').hidden) return;
      if (!allowDismiss) return;
      e.preventDefault();
      close();
    });
  }

  root.PMDlg = {
    open: open,
    close: close,
    message: message,
    confirm: confirm,
    boot: boot
  };
})(typeof window !== 'undefined' ? window : globalThis);
