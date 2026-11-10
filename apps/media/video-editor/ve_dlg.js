/* Video Editor — ve_dlg.js: in-app dialogs only (no alert/confirm/prompt). VD1 */
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
   * @param {string} [opts.html]  inner HTML for the body
   * @param {string} [opts.text]  plain-text body (used if html is omitted)
   * @param {{label:string, cls?:string, fn?:Function}[]} [opts.actions]
   * @param {boolean} [opts.dismissable=true] backdrop / Escape close
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
    return close;
  }

  function message(title, text, label) {
    return open({
      title: title || 'Video Editor',
      text: text || '',
      actions: [{ label: label || 'OK', cls: 'primary-btn' }]
    });
  }

  /**
   * Progress dialog with a bar and Cancel. Not dismissed by backdrop.
   * @returns {{update:Function, close:Function, isOpen:Function}}
   */
  function progress(opts) {
    opts = opts || {};
    var html = '<p id="dlgProgNote" class="dlg-note"></p>' +
      '<div class="prog-track" aria-hidden="true"><div class="prog-fill" id="dlgProgFill"></div></div>' +
      '<p id="dlgProgText" class="dlg-prog-text">0%</p>';
    var api = {
      update: function (pct, text, note) {
        var fill = $('dlgProgFill');
        var label = $('dlgProgText');
        var n = $('dlgProgNote');
        if (pct != null && isFinite(Number(pct))) {
          var p = Math.max(0, Math.min(100, Number(pct)));
          if (fill) fill.style.width = p + '%';
          if (text == null && label) label.textContent = Math.round(p) + '%';
        }
        if (text != null && label) label.textContent = text;
        if (note != null && n) n.textContent = note;
      },
      close: close,
      isOpen: function () { return $('dlg') && !$('dlg').hidden; }
    };
    open({
      title: opts.title || 'Exporting',
      html: html,
      dismissable: false,
      actions: [{
        label: opts.cancelLabel || 'Cancel',
        cls: 'secondary-btn',
        fn: function () {
          if (opts.onCancel) opts.onCancel();
          return true;
        }
      }],
      onOpen: function () {
        var n = $('dlgProgNote');
        if (n) n.textContent = opts.note || '';
        api.update(0, '0%', opts.note);
      }
    });
    return api;
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

  root.VEDlg = {
    open: open,
    close: close,
    message: message,
    progress: progress,
    boot: boot
  };
})(typeof window !== 'undefined' ? window : globalThis);
