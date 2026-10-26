/* ============================================================
   FILE: modules/draftly-settings.js
   PROJECT: Draftly
   ROLE: DF8 Settings panel (gear at the right of the top bar).
         One localStorage key 'draftly_settings' holds View,
         Editing, New document and Saving choices.
   SH1: panel, storage and form come from ../shared/office-settings.js;
         this file keeps Draftly's sections, migration and hooks.
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

/* First run: build settings from the pre-DF8 keys. */
Draftly.settings.migrate = function migrate() {
  var S = Draftly.settings, cfg = Draftly.config, out = {};
  out.statusBar = S.get('draftly_status_bar') !== '0';
  out.ruler = S.get('draftly_ruler') === '1';
  out.marks = S.get(cfg.storageKeyNonPrint) === cfg.nonPrintOnValue;
  out.theme = S.get(cfg.storageKeyTheme) === cfg.themeDarkValue ? 'dark' : 'light';
  var p = S.get(cfg.storageKeyPaperSize), m = S.get(cfg.storageKeyMarginPreset), o = S.get(cfg.storageKeyOrientation);
  if (cfg.paperSizes[p]) out.paper = p;
  if (cfg.marginPresets[m] || m === 'custom') out.margins = m;
  if (cfg.orientations.indexOf(o) !== -1) out.orientation = o;
  return out;
};

/* Panel sections (rendered by OfficeSettings). */
Draftly.settings.sections = function sections(s) {
  var S = Draftly.settings, cfg = Draftly.config;
  return [
    { title: 'View', rows: [
      { type: 'external', id: 'statusBarToggle', label: 'Status bar', pressed: s.statusBar },
      { type: 'external', id: 'rulerToggle', label: 'Ruler', pressed: s.ruler },
      { key: 'marks', type: 'switch', id: 'setMarks', label: 'Format marks (\u00b6)' },
      { key: 'theme', type: 'select', id: 'setTheme', label: 'Theme', options: OfficeTheme.modes }
    ] },
    { title: 'Editing', rows: [
      { key: 'font', type: 'select', id: 'setFont', label: 'Default font', options: S.fonts.map(function (f) { return [f, f]; }) },
      { key: 'fontSize', type: 'select', id: 'setFontSize', label: 'Default size', cast: Number, options: S.sizes.map(function (n) { return [n, n + ' pt']; }) },
      { key: 'lineHeight', type: 'select', id: 'setLine', label: 'Line spacing', cast: Number, options: S.spacings.map(function (n) { return [n, n.toFixed(n === 1.15 ? 2 : 1)]; }) }
    ] },
    { title: 'New document', rows: [
      { key: 'paper', type: 'select', id: 'setPaper', label: 'Paper size', options: Object.keys(cfg.paperSizes).map(function (k) { return [k, cfg.paperSizes[k].label]; }) },
      { key: 'orientation', type: 'select', id: 'setOrient', label: 'Orientation', options: [['portrait', 'Portrait'], ['landscape', 'Landscape']] },
      { key: 'margins', type: 'select', id: 'setMargins', label: 'Margins', options: Object.keys(cfg.marginPresets).map(function (k) { return [k, cfg.marginPresets[k].label]; }).concat([['custom', 'Custom']]) }
    ] },
    { title: 'Saving', rows: [
      { key: 'autosave', type: 'switch', id: 'setAutosave', label: 'Autosave while typing' },
      { key: 'backupSec', type: 'select', id: 'setBackup', label: 'Backup copy', cast: Number, options: S.backups }
    ] },
    { title: 'About', rows: [{ type: 'about', id: 'setVersion', text: 'Draftly ' + cfg.version }] }
  ];
};

/* Read settings (migrating on first run) and build the panel. */
Draftly.settings.load = function load() {
  var S = Draftly.settings;
  S.panel = OfficeSettings.create({
    key: S.KEY, defaults: S.defaults, migrate: S.migrate, sections: S.sections,
    gearBtn: document.getElementById('settingsBtn'),
    validate: function (out) { if (['light', 'dark', 'auto'].indexOf(out.theme) === -1) out.theme = 'light'; },
    onChange: function (k) { S.apply(k); },
    onReset: function () { S.s = S.panel.s; S.apply(); S.apply('font'); },
    resetMessage: 'Reset all settings to their defaults? Your documents are not touched.',
    confirm: function (msg) {
      return Draftly.dialog && Draftly.dialog.confirm
        ? Draftly.dialog.confirm({ title: 'Reset settings?', message: msg, okLabel: 'Reset', danger: true })
        : window.confirm(msg);
    },
    toast: function (m) { if (Draftly.ui.showToast) Draftly.ui.showToast(m); }
  });
  /* DF11: File > Settings opens the panel (the gear is hidden inside the Hub window). */
  var mi = document.getElementById('settingsMenuBtn');
  if (mi) mi.addEventListener('click', function () {
    if (Draftly.ribbon && Draftly.ribbon.setFile) Draftly.ribbon.setFile(false);
    S.panel.open();
  });
  S.s = S.panel.s;
  return S.s;
};

Draftly.settings.save = function save() { var S = Draftly.settings; if (S.panel) { S.panel.s = S.s; S.panel.save(); } };

/* Change one value, store it, apply it. */
Draftly.settings.set = function set(k, v) { Draftly.settings.panel.set(k, v); };

/* True when the theme should be dark right now. */
Draftly.settings.isDark = function isDark() { return OfficeTheme.isDark(Draftly.settings.s.theme); };

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

/* ----- panel (OfficeSettings) ----- */
Draftly.settings.syncForm = function syncForm() { Draftly.settings.panel.syncForm(); };
Draftly.settings.open = function open() { Draftly.settings.panel.open(); };
Draftly.settings.close = function close() { Draftly.settings.panel.close(); };

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
  OfficeTheme.watch(function () { if (S.s.theme === 'auto') S.applyTheme(); });
};

Draftly.settings.bind = function bind() {
  var S = Draftly.settings;
  if (!S.panel || !S.panel.panel) return;
  S.hook();
  S.startBackup();
  S.syncForm();
};

Draftly.settings.early();
