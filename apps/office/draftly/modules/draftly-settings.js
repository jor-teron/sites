/* ============================================================
   FILE: modules/draftly-settings.js
   PROJECT: Draftly
   ROLE: DF8 Settings panel (gear at the right of the top bar).
         One localStorage key 'draftly_settings' holds View,
         Editing, New document and Saving choices.
   LOAD: right after draftly-storage.js. At load it migrates the
         old per-feature keys and writes the values back to them,
         so ruler / status bar / marks / theme modules read the
         right state. bind() (from app.init) wires the panel.
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.settings = {
  KEY: 'draftly_settings',
  defaults: {
    statusBar: true, ruler: false, marks: false, theme: 'light',
    font: 'Times New Roman', fontSize: 12, lineHeight: 1.6,
    paper: 'A4', orientation: 'portrait', margins: 'normal',
    autosave: true, backupSec: 0
  },
  fonts: ['Times New Roman', 'Tinos'],
  sizes: [8, 10, 11, 12, 14, 16, 18],
  spacings: [1, 1.15, 1.5, 1.6, 2],
  backups: [[0, 'Only when leaving'], [30, 'Every 30 s'], [60, 'Every minute'], [300, 'Every 5 minutes']],
  s: null,
  timer: null
};

/* Safe localStorage helpers. */
Draftly.settings.get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
Draftly.settings.put = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };

/* Read settings; on first run build them from the old keys. */
Draftly.settings.load = function load() {
  var S = Draftly.settings, cfg = Draftly.config, d = S.defaults, out = {}, k;
  for (k in d) out[k] = d[k];
  var raw = null;
  try { raw = JSON.parse(S.get(S.KEY) || 'null'); } catch (e) {}
  if (raw && typeof raw === 'object') {
    for (k in d) if (raw[k] !== undefined && typeof raw[k] === typeof d[k]) out[k] = raw[k];
  } else {
    /* Migration from pre-DF8 keys. */
    out.statusBar = S.get('draftly_status_bar') !== '0';
    out.ruler = S.get('draftly_ruler') === '1';
    out.marks = S.get(cfg.storageKeyNonPrint) === cfg.nonPrintOnValue;
    out.theme = S.get(cfg.storageKeyTheme) === cfg.themeDarkValue ? 'dark' : 'light';
    var p = S.get(cfg.storageKeyPaperSize), m = S.get(cfg.storageKeyMarginPreset), o = S.get(cfg.storageKeyOrientation);
    if (cfg.paperSizes[p]) out.paper = p;
    if (cfg.marginPresets[m] || m === 'custom') out.margins = m;
    if (cfg.orientations.indexOf(o) !== -1) out.orientation = o;
  }
  if (['light', 'dark', 'auto'].indexOf(out.theme) === -1) out.theme = 'light';
  S.s = out;
  S.save();
  return out;
};

Draftly.settings.save = function save() { Draftly.settings.put(Draftly.settings.KEY, JSON.stringify(Draftly.settings.s)); };

/* Change one value, store it, apply it. */
Draftly.settings.set = function set(k, v) {
  var S = Draftly.settings;
  S.s[k] = v; S.save(); S.apply(k); S.syncForm();
};

/* True when the theme should be dark right now. */
Draftly.settings.isDark = function isDark() {
  var t = Draftly.settings.s.theme;
  if (t === 'auto') return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  return t === 'dark';
};

/* Write values to the old keys / config before other modules read them. */
Draftly.settings.early = function early() {
  var S = Draftly.settings, cfg = Draftly.config, s = S.load();
  S.put('draftly_status_bar', s.statusBar ? '1' : '0');
  S.put('draftly_ruler', s.ruler ? '1' : '0');
  S.put(cfg.storageKeyNonPrint, s.marks ? cfg.nonPrintOnValue : cfg.nonPrintOffValue);
  S.put(cfg.storageKeyTheme, S.isDark() ? cfg.themeDarkValue : 'light');
  S.applyType();
};

/* Editing defaults -> config (CSS vars follow via applyToDocument). */
Draftly.settings.applyType = function applyType() {
  var cfg = Draftly.config, s = Draftly.settings.s;
  cfg.fontCommandName = s.font;
  cfg.fontFamily = "'" + s.font + "', Tinos, 'Liberation Serif', serif";
  cfg.fontSizePt = s.fontSize;
  cfg.lineHeight = s.lineHeight;
};

/* Apply one changed key (or all when k is empty) to the live app. */
Draftly.settings.apply = function apply(k) {
  var S = Draftly.settings, s = S.s, ui = Draftly.ui;
  if (!k || k === 'statusBar') { if (Draftly.find && Draftly.find.setStatusBar) Draftly.find.setStatusBar(s.statusBar, true); }
  if (!k || k === 'ruler') { if (Draftly.ruler) Draftly.ruler.set(s.ruler, true); }
  if (!k || k === 'marks') { if (ui && ui.isNonPrinting() !== s.marks) ui.setNonPrinting(s.marks); }
  if (!k || k === 'theme') { if (ui) S.applyTheme(); }
  if (k === 'font' || k === 'fontSize' || k === 'lineHeight') {
    S.applyType(); Draftly.config.applyToDocument();
    if (Draftly.pages && Draftly.app.ready) Draftly.pages.layoutAll();
  }
  if (!k || k === 'backupSec') S.startBackup();
};

Draftly.settings.applyTheme = function applyTheme() {
  Draftly.settings.inTheme = true;
  Draftly.ui.setTheme(Draftly.settings.isDark());
  Draftly.settings.inTheme = false;
};

/* Periodic sync backup (uses storage.writeBackup). 0 = only on leave. */
Draftly.settings.startBackup = function startBackup() {
  var S = Draftly.settings;
  clearInterval(S.timer); S.timer = null;
  if (S.s.backupSec > 0) S.timer = setInterval(function () {
    if (Draftly.app.ready) Draftly.storage.writeBackup();
  }, S.s.backupSec * 1000);
};

/* True when typing should autosave (docs.bind checks this). */
Draftly.settings.autosave = function autosave() { return Draftly.settings.s.autosave !== false; };

/* ----- panel ----- */
Draftly.settings.el = function (id) { return document.getElementById(id); };

Draftly.settings.fill = function fill() {
  var S = Draftly.settings, cfg = Draftly.config;
  function opts(id, list) {
    var sel = S.el(id); if (!sel) return;
    sel.innerHTML = '';
    list.forEach(function (o) {
      var op = document.createElement('option');
      op.value = String(o[0]); op.textContent = o[1]; sel.appendChild(op);
    });
  }
  opts('setFont', S.fonts.map(function (f) { return [f, f]; }));
  opts('setFontSize', S.sizes.map(function (n) { return [n, n + ' pt']; }));
  opts('setLine', S.spacings.map(function (n) { return [n, n.toFixed(n === 1.15 ? 2 : 1)]; }));
  opts('setPaper', Object.keys(cfg.paperSizes).map(function (k) { return [k, cfg.paperSizes[k].label]; }));
  opts('setMargins', Object.keys(cfg.marginPresets).map(function (k) { return [k, cfg.marginPresets[k].label]; }).concat([['custom', 'Custom']]));
  opts('setBackup', S.backups);
  var v = S.el('setVersion'); if (v) v.textContent = 'Draftly ' + cfg.version;
};

/* Push current values into the form controls. */
Draftly.settings.syncForm = function syncForm() {
  var S = Draftly.settings, s = S.s;
  function sw(id, on) { var b = S.el(id); if (b) { b.setAttribute('aria-pressed', String(!!on)); b.classList.toggle('active', !!on); } }
  function val(id, v) { var e = S.el(id); if (e) e.value = String(v); }
  sw('setMarks', s.marks); sw('setAutosave', s.autosave);
  val('setTheme', s.theme); val('setFont', s.font); val('setFontSize', s.fontSize); val('setLine', s.lineHeight);
  val('setPaper', s.paper); val('setOrient', s.orientation); val('setMargins', s.margins); val('setBackup', s.backupSec);
};

Draftly.settings.open = function open() {
  var S = Draftly.settings;
  S.syncForm();
  S.el('settingsScrim').hidden = false; S.el('settingsPanel').hidden = false;
  S.el('settingsBtn').setAttribute('aria-expanded', 'true');
  S.el('settingsClose').focus();
};
Draftly.settings.close = function close() {
  var S = Draftly.settings, p = S.el('settingsPanel');
  if (!p || p.hidden) return;
  p.hidden = true; S.el('settingsScrim').hidden = true;
  S.el('settingsBtn').setAttribute('aria-expanded', 'false');
};

/* Wrap feature setters so ribbon / menu changes land in draftly_settings too. */
Draftly.settings.hook = function hook() {
  var S = Draftly.settings, ui = Draftly.ui;
  var tog = ui.toggleNonPrinting;
  ui.toggleNonPrinting = function () { var r = tog.apply(this, arguments); S.s.marks = ui.isNonPrinting(); S.save(); S.syncForm(); return r; };
  var th = ui.setTheme;
  ui.setTheme = function (dark) { var r = th.apply(this, arguments); if (!S.inTheme) { S.s.theme = dark ? 'dark' : 'light'; S.save(); S.syncForm(); } return r; };
  ui.loadTheme = function () { S.applyTheme(); };
  if (Draftly.ruler) {
    var rs = Draftly.ruler.set;
    Draftly.ruler.set = function (on) { var r = rs.apply(this, arguments); S.s.ruler = !!on; S.save(); return r; };
  }
  if (Draftly.find && Draftly.find.setStatusBar) {
    var sb = Draftly.find.setStatusBar;
    Draftly.find.setStatusBar = function (on) { var r = sb.apply(this, arguments); S.s.statusBar = !!on; S.save(); return r; };
  }
  /* New document: apply the default paper, orientation and margins. */
  if (Draftly.docs && Draftly.docs.newDoc) {
    var nd = Draftly.docs.newDoc;
    Draftly.docs.newDoc = function () {
      return nd.apply(this, arguments).then(function (r) {
        var s = S.s, cfg = Draftly.config;
        ui.setPage(s.paper, s.margins, s.margins === 'custom' ? cfg.marginCustom : undefined);
        ui.setOrientation(s.orientation);
        return r;
      });
    };
  }
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var f = function () { if (S.s.theme === 'auto') S.applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f);
  }
};

Draftly.settings.bind = function bind() {
  var S = Draftly.settings;
  if (!S.el('settingsPanel')) return;
  S.fill();
  S.hook();
  S.el('settingsBtn').addEventListener('click', function () { S.el('settingsPanel').hidden ? S.open() : S.close(); });
  S.el('settingsClose').addEventListener('click', S.close);
  S.el('settingsScrim').addEventListener('click', S.close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') S.close(); });
  [['setMarks', 'marks'], ['setAutosave', 'autosave']].forEach(function (p) {
    S.el(p[0]).addEventListener('click', function () { S.set(p[1], !S.s[p[1]]); });
  });
  [['setTheme', 'theme', String], ['setFont', 'font', String], ['setFontSize', 'fontSize', Number],
   ['setLine', 'lineHeight', Number], ['setPaper', 'paper', String], ['setOrient', 'orientation', String],
   ['setMargins', 'margins', String], ['setBackup', 'backupSec', Number]].forEach(function (p) {
    S.el(p[0]).addEventListener('change', function (e) { S.set(p[1], p[2](e.target.value)); });
  });
  S.el('settingsReset').addEventListener('click', function () {
    var msg = 'Reset all settings to their defaults? Your documents are not touched.';
    var ask = Draftly.dialog && Draftly.dialog.confirm
      ? Draftly.dialog.confirm({ title: 'Reset settings?', message: msg, okLabel: 'Reset', danger: true })
      : window.confirm(msg);
    Promise.resolve(ask).then(function (yes) {
      if (!yes) return;
      var d = S.defaults, k; S.s = {};
      for (k in d) S.s[k] = d[k];
      S.save(); S.apply(); S.apply('font'); S.syncForm();
      if (Draftly.ui.showToast) Draftly.ui.showToast('Settings reset');
    });
  });
  S.startBackup();
  S.syncForm();
};

Draftly.settings.early();
