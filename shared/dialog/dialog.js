/*
 * Dialogs (shared/dialog/dialog.js + dialog.css) — small in-page boxes with big buttons,
 * used by the Files app and the Hub (e.g. removing a drive). No browser prompt()/confirm().
 * Enter = the main button, Esc / click outside = Cancel. Jelly pop-in.
 *
 * API window.UiDialog:
 *   ask(title, value, okText)               → Promise<string | null>  (text input; selects the
 *                                              name part before the last dot)
 *   confirm(title, text, okText, danger)    → Promise<boolean>
 *   choose(title, text, buttons, opts)      → Promise<{ value, all } | null>
 *        buttons: [{ value, label, kind: 'primary'|'danger'|'' }]; opts.allLabel adds a
 *        "Do this for all" checkbox (result.all)
 *   info(title, rows)                       → Promise (rows: [[label, value], …], one OK button)
 *
 * H75: inside the Hub (an app frame whose same-origin parent set window.__hubDialogHost, see
 * hub/core/hub_dialog_bridge.js) each call is posted up as {type:'hub-dialog', id, method, args}
 * and the Hub draws it over the whole desktop, answering {type:'hub-dialog-ack', id} then
 * {type:'hub-dialog-result', id, value}. Standalone / file:// / no ack in 400 ms → drawn here.
 */
window.UiDialog = (function () {
  'use strict';
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /** Generic box: body nodes + buttons; resolves with the clicked button's value (null = cancel). */
  function box(title, body, buttons, getValue) {
    return new Promise((done) => {
      const back = el('div', 'uid-back');
      const d = el('div', 'uid');
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-modal', 'true');
      d.setAttribute('aria-label', title);
      d.appendChild(el('h2', 'uid-title', title));
      body.forEach((n) => n && d.appendChild(n));
      const row = el('div', 'uid-btns');
      let main = null;
      const end = (v) => {
        back.remove();
        document.removeEventListener('keydown', key, true);
        done(v === null ? null : (getValue ? getValue(v) : v));
      };
      buttons.forEach((b) => {
        const x = el('button', 'uid-btn' + (b.kind ? ' ' + b.kind : ''), b.label);
        x.type = 'button';
        x.addEventListener('click', () => end(b.value));
        row.appendChild(x);
        if (b.main) main = { btn: x, value: b.value };
      });
      d.appendChild(row);
      back.appendChild(d);
      document.body.appendChild(back);
      const key = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(null); }
        else if (e.key === 'Enter' && main && !(e.target && e.target.tagName === 'BUTTON')) { e.preventDefault(); e.stopPropagation(); end(main.value); }
      };
      document.addEventListener('keydown', key, true);
      back.addEventListener('pointerdown', (e) => { if (e.target === back) end(null); });
      setTimeout(() => {
        const inp = d.querySelector('input[type=text]');
        if (inp) { inp.focus(); const dot = inp.value.lastIndexOf('.'); inp.setSelectionRange(0, dot > 0 ? dot : inp.value.length); }
        else if (main) main.btn.focus();
      }, 0);
    });
  }
  const CANCEL = { value: null, label: 'Cancel' };

  // H75: forward to the Hub when we are one of its app frames
  function inHub() {
    try { return window.parent !== window && window.parent.__hubDialogHost === true; } catch (_) { return false; }
  }
  let seq = 0;
  function viaHub(method, args, local) {
    let data;
    try { data = JSON.parse(JSON.stringify(args)); } catch (_) { return local(); }   // not plain data → local
    return new Promise((done) => {
      const id = 'd' + Date.now().toString(36) + '-' + (++seq);
      let acked = false, over = false;
      const stop = () => { over = true; clearTimeout(t); window.removeEventListener('message', on); };
      const on = (e) => {
        const d = e.data;
        if (over || e.source !== window.parent || e.origin !== location.origin || !d || d.id !== id) return;
        if (d.type === 'hub-dialog-ack') acked = true;
        else if (d.type === 'hub-dialog-result') { stop(); done(d.value); }
      };
      const t = setTimeout(() => { if (!acked) { stop(); local().then(done); } }, 400);
      window.addEventListener('message', on);
      try { window.parent.postMessage({ type: 'hub-dialog', id, method, args: data }, location.origin); }
      catch (_) { stop(); local().then(done); }
    });
  }

  const api = {
    ask(title, value, okText) {
      const i = el('input', 'uid-in');
      i.type = 'text'; i.value = value || ''; i.spellcheck = false;
      return box(title, [i], [CANCEL, { value: true, label: okText || 'OK', kind: 'primary', main: true }],
        () => String(i.value).trim());
    },
    confirm(title, text, okText, danger) {
      return box(title, [text ? el('p', 'uid-text', text) : null],
        [CANCEL, { value: true, label: okText || 'OK', kind: danger === false ? 'primary' : 'danger', main: true }])
        .then((v) => v === true);
    },
    choose(title, text, buttons, opts) {
      opts = opts || {};
      let cb = null;
      const nodes = [text ? el('p', 'uid-text', text) : null];
      if (opts.allLabel) {
        const l = el('label', 'uid-all');
        cb = el('input'); cb.type = 'checkbox';
        l.append(cb, el('span', '', opts.allLabel));
        nodes.push(l);
      }
      const btns = buttons.map((b, i) => Object.assign({ main: i === buttons.length - 1 }, b));
      return box(title, nodes, [CANCEL].concat(btns), (v) => ({ value: v, all: !!(cb && cb.checked) }));
    },
    info(title, rows) {
      const t = el('div', 'uid-rows');
      rows.forEach(([k, v]) => { const r = el('div', 'uid-row'); r.append(el('span', 'uid-k', k), el('b', 'uid-v', v)); t.appendChild(r); });
      return box(title, [t], [{ value: true, label: 'OK', kind: 'primary', main: true }]);
    }
  };
  const out = { local: api };
  Object.keys(api).forEach((m) => {
    out[m] = function () {
      const args = Array.prototype.slice.call(arguments);
      const local = () => api[m].apply(api, args);
      return inHub() ? viaHub(m, args, local) : local();
    };
  });
  return out;
})();
