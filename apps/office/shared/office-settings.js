/*
 * apps/office/shared/office-settings.js
 * SH1 shared Settings panel: gear button + centred pop-up dialog (SH5), sections defined by the app,
 * all values in ONE localStorage key per app (JSON).
 *
 *   var S = OfficeSettings.create({
 *     key: 'app_settings', defaults: {...}, migrate: fn() -> obj|null (first run only),
 *     gearBtn: el, title: 'Settings',
 *     sections: [...] or fn(values) -> [...]:  [{ title: 'View', rows: [
 *       { key: 'theme', label: 'Theme', type: 'select', options: [[v, label]] | fn, cast: Number, id },
 *       { key: 'grid', label: 'Gridlines', type: 'switch', id },
 *       { type: 'external', id, label, pressed }   // switch wired by another module
 *       { type: 'about', id, text }                // version text + Reset button
 *     ]}],
 *     onChange: fn(key, value), onReset: fn(), confirm: fn(msg) -> Promise|bool, toast: fn(msg)
 *   });
 *   S.s (values), S.set(k, v), S.save(), S.open(), S.close(), S.syncForm(), S.reset()
 * Panel DOM is built on create (ids: settingsScrim, settingsPanel, settingsClose, settingsReset).
 * Style: office-settings.css (colours from --of-* variables).
 */
var OfficeSettings = (function () {
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function h(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function create(o) {
    var S = { o: o, s: null, rows: [] };
    var d = o.defaults;

    S.load = function () {
      var out = {}, k, raw = null;
      for (k in d) out[k] = d[k];
      try { raw = JSON.parse(get(o.key) || 'null'); } catch (e) {}
      if (raw && typeof raw === 'object') {
        for (k in d) if (raw[k] !== undefined && typeof raw[k] === typeof d[k]) out[k] = raw[k];
      } else if (o.migrate) {
        var m = o.migrate() || {};
        for (k in d) if (m[k] !== undefined && typeof m[k] === typeof d[k]) out[k] = m[k];
      }
      if (o.validate) o.validate(out);
      S.s = out; S.save();
      return out;
    };
    S.save = function () { put(o.key, JSON.stringify(S.s)); };
    S.set = function (k, v) { S.s[k] = v; S.save(); if (o.onChange) o.onChange(k, v); S.syncForm(); };

    S.build = function () {
      if (S.panel || !document.body) return;
      var scrim = h('div', 'of-set-scrim'); scrim.id = 'settingsScrim'; scrim.hidden = true;
      var p = h('div', 'of-set-panel'); p.id = 'settingsPanel'; p.hidden = true;
      p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-labelledby', 'settingsTitle');
      var head = h('div', 'of-set-head'), t = h('h2', null, o.title || 'Settings'); t.id = 'settingsTitle';
      var x = h('button', 'of-set-close'); x.type = 'button'; x.id = 'settingsClose';
      x.setAttribute('aria-label', 'Close settings'); x.title = 'Close (Esc)';
      x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      head.appendChild(t); head.appendChild(x); p.appendChild(head);
      var body = h('div', 'of-set-body'); p.appendChild(body);
      (typeof o.sections === 'function' ? o.sections(S.s) : o.sections).forEach(function (sec) {
        var se = h('section', 'of-set-sec'); se.appendChild(h('h3', null, sec.title));
        sec.rows.forEach(function (r) { se.appendChild(S.row(r)); });
        body.appendChild(se);
      });
      document.body.appendChild(scrim); document.body.appendChild(p);
      S.panel = p; S.scrim = scrim; S.closeBtn = x;
      x.addEventListener('click', S.close);
      scrim.addEventListener('click', S.close);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') S.close(); });
      if (o.gearBtn) {
        o.gearBtn.setAttribute('aria-haspopup', 'dialog'); o.gearBtn.setAttribute('aria-expanded', 'false');
        o.gearBtn.setAttribute('aria-controls', 'settingsPanel');
        o.gearBtn.addEventListener('click', function () { p.hidden ? S.open() : S.close(); });
      }
    };

    S.row = function (r) {
      var row, ctl;
      if (r.type === 'about') {
        row = h('div', 'of-set-row'); var v = h('span', null, r.text || ''); if (r.id) v.id = r.id;
        ctl = h('button', 'of-set-btn'); ctl.type = 'button'; ctl.id = 'settingsReset'; ctl.textContent = 'Reset settings';
        ctl.addEventListener('click', S.askReset);
        row.appendChild(v); row.appendChild(ctl); return row;
      }
      if (r.type === 'select') {
        row = h('label', 'of-set-row'); ctl = h('select');
        var list = typeof r.options === 'function' ? r.options() : r.options;
        list.forEach(function (op) { var e = h('option', null, op[1]); e.value = String(op[0]); ctl.appendChild(e); });
        ctl.addEventListener('change', function (e) { S.set(r.key, (r.cast || String)(e.target.value)); });
      } else {
        row = h('div', 'of-set-row'); ctl = h('button', 'of-switch'); ctl.type = 'button';
        ctl.setAttribute('aria-pressed', String(!!(r.type === 'external' ? r.pressed : S.s[r.key])));
        ctl.setAttribute('aria-label', r.label);
        if (r.type !== 'external') ctl.addEventListener('click', function () { S.set(r.key, !S.s[r.key]); });
      }
      if (r.id) ctl.id = r.id;
      row.appendChild(h('span', null, r.label)); row.appendChild(ctl);
      if (r.key) S.rows.push({ r: r, el: ctl });
      return row;
    };

    S.syncForm = function () {
      S.rows.forEach(function (x) {
        var v = S.s[x.r.key];
        if (x.r.type === 'select') x.el.value = String(v);
        else { x.el.setAttribute('aria-pressed', String(!!v)); x.el.classList.toggle('active', !!v); }
      });
    };
    S.open = function () {
      S.syncForm(); S.panel.hidden = false; S.scrim.hidden = false;
      if (o.gearBtn) o.gearBtn.setAttribute('aria-expanded', 'true');
      S.closeBtn.focus();
    };
    S.close = function () {
      if (!S.panel || S.panel.hidden) return;
      S.panel.hidden = true; S.scrim.hidden = true;
      if (o.gearBtn) o.gearBtn.setAttribute('aria-expanded', 'false');
    };
    S.reset = function () {
      var k; S.s = {}; for (k in d) S.s[k] = d[k];
      S.save(); if (o.onReset) o.onReset(); S.syncForm();
    };
    S.askReset = function () {
      var msg = o.resetMessage || 'Reset all settings to their defaults? Your files are not touched.';
      var ask = o.confirm ? o.confirm(msg) : window.confirm(msg);
      Promise.resolve(ask).then(function (yes) {
        if (!yes) return;
        S.reset();
        if (o.toast) o.toast('Settings reset'); else if (window.OfficeToast) OfficeToast.show('Settings reset');
      });
    };

    S.load();
    S.build();
    S.syncForm();
    return S;
  }
  return { create: create };
})();
