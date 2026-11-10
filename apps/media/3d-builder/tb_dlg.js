/* 3D Builder — tb_dlg.js: in-app dialogs only (no alert/confirm/prompt). TD1 */

let closeFn = null;
let allowDismiss = true;

function $(id) { return document.getElementById(id); }

export function close() {
  const dlg = $('dlg');
  if (dlg) dlg.hidden = true;
  const body = $('dlgBody');
  const acts = $('dlgActs');
  const title = $('dlgTitle');
  if (body) body.innerHTML = '';
  if (acts) acts.innerHTML = '';
  if (title) title.textContent = '';
  closeFn = null;
  allowDismiss = true;
}

export function isOpen() {
  const dlg = $('dlg');
  return !!(dlg && !dlg.hidden);
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
export function open(opts) {
  opts = opts || {};
  const dlg = $('dlg');
  const boxTitle = $('dlgTitle');
  const body = $('dlgBody');
  const acts = $('dlgActs');
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
      const p = document.createElement('p');
      p.textContent = opts.text;
      body.appendChild(p);
    }
  }
  acts.innerHTML = '';
  (opts.actions || []).forEach(function (a) {
    const b = document.createElement('button');
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

export function message(title, text, label) {
  return open({
    title: title || '3D Builder',
    text: text || '',
    actions: [{ label: label || 'OK', cls: 'primary-btn' }]
  });
}

/** @returns {Promise<boolean>} */
export function confirmDlg(opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    open({
      title: opts.title || '3D Builder',
      text: opts.text || '',
      actions: [
        {
          label: opts.cancelLabel || 'Cancel',
          cls: 'secondary-btn',
          fn: function () { resolve(false); }
        },
        {
          label: opts.okLabel || 'OK',
          cls: opts.okCls || 'primary-btn',
          fn: function () { resolve(true); }
        }
      ]
    });
  });
}

/** @returns {Promise<string|null>} */
export function promptDlg(opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    let settled = false;
    function done(v) {
      if (settled) return;
      settled = true;
      resolve(v);
    }
    open({
      title: opts.title || 'Rename',
      html: '<label class="dlg-field">' +
        '<span>' + (opts.label || 'Name') + '</span>' +
        '<input type="text" id="dlgInput" maxlength="80" autocomplete="off" spellcheck="false">' +
        '</label>',
      actions: [
        { label: opts.cancelLabel || 'Cancel', fn: function () { done(null); } },
        {
          label: opts.okLabel || 'OK',
          cls: 'primary-btn',
          fn: function () {
            const el = $('dlgInput');
            const v = el ? el.value : '';
            if (opts.required !== false && !String(v).trim()) {
              if (el) el.focus();
              return false;
            }
            done(String(v).trim());
          }
        }
      ],
      onOpen: function () {
        const el = $('dlgInput');
        if (!el) return;
        el.value = opts.value || '';
        el.focus();
        el.select();
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            const ok = $('dlgActs') && $('dlgActs').querySelector('.primary-btn');
            if (ok) ok.click();
          }
        });
      }
    });
  });
}

export function boot() {
  const dlg = $('dlg');
  if (dlg) {
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg && allowDismiss) close();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!isOpen()) return;
    if (!allowDismiss) return;
    e.preventDefault();
    close();
  });
}
