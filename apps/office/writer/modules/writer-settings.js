/* ============================================================
   FILE: modules/writer-settings.js
   DF25: was modules/draftly-settings.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: DF8 Settings panel (gear at the right of the top bar).
         One localStorage key 'writer_settings' holds View,
         Editing, New document and Saving choices.
   SH1: panel, storage and form come from ../shared/office-settings.js;
         this file keeps Writer's sections, migration and hooks.
   LOAD: right after writer-storage.js. At load it migrates the
         old per-feature keys and writes the values back to them,
         so ruler / status bar / marks / theme modules read the
         right state. bind() (from app.init) wires the panel.
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.settings = {
  KEY: 'writer_settings',   /* (before DF25) KEY: 'draftly_settings', */
  defaults: {
    statusBar: true, ruler: false, marks: false, theme: 'light',
    font: 'Times New Roman', fontSize: 12, lineHeight: 1.6,
    paper: 'A4', orientation: 'portrait', margins: 'normal',
    /* (before DF21) autosave: true, backupSec: 0, hoverTabs: true, ribbonCollapsed: false */
    autosave: true, backupSec: 0, hoverTabs: true, ribbonCollapsed: false,
    spellcheck: false   /* DF21: browser spell check on the page, off by default */
  },
  fonts: ['Times New Roman', 'Tinos'],
  sizes: [8, 10, 11, 12, 14, 16, 18],
  spacings: [1, 1.15, 1.5, 1.6, 2],
  backups: [[0, 'Only when leaving'], [30, 'Every 30 s'], [60, 'Every minute'], [300, 'Every 5 minutes']],
  s: null,
  timer: null
};

/* Safe localStorage helpers. */
Writer.settings.get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
Writer.settings.put = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };

/* First run: build settings from the pre-DF8 keys. */
Writer.settings.migrate = function migrate() {
  var S = Writer.settings, cfg = Writer.config, out = {};
  out.statusBar = S.get('writer_status_bar') !== '0';   /* (before DF25) out.statusBar = S.get('draftly_status_bar') !== '0'; */
  out.ruler = S.get('writer_ruler') === '1';   /* (before DF25) out.ruler = S.get('draftly_ruler') === '1'; */
  out.marks = S.get(cfg.storageKeyNonPrint) === cfg.nonPrintOnValue;
  out.theme = S.get(cfg.storageKeyTheme) === cfg.themeDarkValue ? 'dark' : 'light';
  var p = S.get(cfg.storageKeyPaperSize), m = S.get(cfg.storageKeyMarginPreset), o = S.get(cfg.storageKeyOrientation);
  if (cfg.paperSizes[p]) out.paper = p;
  if (cfg.marginPresets[m] || m === 'custom') out.margins = m;
  if (cfg.orientations.indexOf(o) !== -1) out.orientation = o;
  return out;
};

/* Panel sections (rendered by OfficeSettings). */
Writer.settings.sections = function sections(s) {
  var S = Writer.settings, cfg = Writer.config;
  return [
    { title: 'View', rows: [
      { type: 'external', id: 'statusBarToggle', label: 'Status bar', pressed: s.statusBar },
      { type: 'external', id: 'rulerToggle', label: 'Ruler', pressed: s.ruler },
      { key: 'marks', type: 'switch', id: 'setMarks', label: 'Format marks (\u00b6)' },
      { key: 'theme', type: 'select', id: 'setTheme', label: 'Theme', options: OfficeTheme.modes },
      { key: 'hoverTabs', type: 'switch', id: 'setHoverTabs', label: 'Open tabs on hover' },
      { key: 'ribbonCollapsed', type: 'switch', id: 'setRibbonCollapsed', label: 'Collapse ribbon' }
    ] },
    { title: 'Editing', rows: [
      { key: 'font', type: 'select', id: 'setFont', label: 'Default font', options: S.fonts.map(function (f) { return [f, f]; }) },
      { key: 'fontSize', type: 'select', id: 'setFontSize', label: 'Default size', cast: Number, options: S.sizes.map(function (n) { return [n, n + ' pt']; }) },
      { key: 'lineHeight', type: 'select', id: 'setLine', label: 'Line spacing', cast: Number, options: S.spacings.map(function (n) { return [n, n.toFixed(n === 1.15 ? 2 : 1)]; }) },
      { key: 'spellcheck', type: 'switch', id: 'setSpell', label: 'Spell check' }   /* DF21 */
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
    /* (before DF24) { title: 'About', rows: [{ type: 'about', id: 'setVersion', text: 'Draftly ' + cfg.version }] } */
    { title: 'About', rows: [{ type: 'about', id: 'setVersion', text: 'Writer ' + cfg.version }] }
  ];
};

/* Read settings (migrating on first run) and build the panel. */
Writer.settings.load = function load() {
  var S = Writer.settings;
  S.panel = OfficeSettings.create({
    key: S.KEY, defaults: S.defaults, migrate: S.migrate, sections: S.sections,
    gearBtn: document.getElementById('settingsBtn'),
    validate: function (out) { if (['light', 'dark', 'auto'].indexOf(out.theme) === -1) out.theme = 'light'; },
    onChange: function (k) { S.apply(k); },
    onReset: function () { S.s = S.panel.s; S.apply(); S.apply('font'); },
    resetMessage: 'Reset all settings to their defaults? Your documents are not touched.',
    confirm: function (msg) {
      /* (before HO2) : window.confirm(msg) */
      return Writer.dialog && Writer.dialog.confirm
        ? Writer.dialog.confirm({ title: 'Reset settings?', message: msg, okLabel: 'Reset', danger: true })
        : Promise.resolve(false);
    },
    toast: function (m) { if (Writer.ui.showToast) Writer.ui.showToast(m); }
  });
  /* DF11: File > Settings opens the panel (the gear is hidden inside the Hub window). */
  var mi = document.getElementById('settingsMenuBtn');
  if (mi) mi.addEventListener('click', function () {
    if (Writer.ribbon && Writer.ribbon.setFile) Writer.ribbon.setFile(false);
    S.panel.open();
  });
  S.s = S.panel.s;
  return S.s;
};

Writer.settings.save = function save() { var S = Writer.settings; if (S.panel) { S.panel.s = S.s; S.panel.save(); } };

/* Change one value, store it, apply it. */
Writer.settings.set = function set(k, v) { Writer.settings.panel.set(k, v); };

/* True when the theme should be dark right now. */
Writer.settings.isDark = function isDark() { return OfficeTheme.isDark(Writer.settings.s.theme); };

/* Write values to the old keys / config before other modules read them. */
Writer.settings.early = function early() {
  var S = Writer.settings, cfg = Writer.config, s = S.load();
  S.put('writer_status_bar', s.statusBar ? '1' : '0');   /* (before DF25) S.put('draftly_status_bar', s.statusBar ? '1' : '0'); */
  S.put('writer_ruler', s.ruler ? '1' : '0');   /* (before DF25) S.put('draftly_ruler', s.ruler ? '1' : '0'); */
  S.put(cfg.storageKeyNonPrint, s.marks ? cfg.nonPrintOnValue : cfg.nonPrintOffValue);
  S.put(cfg.storageKeyTheme, S.isDark() ? cfg.themeDarkValue : 'light');
  S.applyType();
};

/* Editing defaults -> config (CSS vars follow via applyToDocument). */
Writer.settings.applyType = function applyType() {
  var cfg = Writer.config, s = Writer.settings.s;
  cfg.fontCommandName = s.font;
  cfg.fontFamily = "'" + s.font + "', Tinos, 'Liberation Serif', serif";
  cfg.fontSizePt = s.fontSize;
  cfg.lineHeight = s.lineHeight;
};

/* Apply one changed key (or all when k is empty) to the live app. */
Writer.settings.apply = function apply(k) {
  var S = Writer.settings, s = S.s, ui = Writer.ui;
  if (!k || k === 'statusBar') { if (Writer.find && Writer.find.setStatusBar) Writer.find.setStatusBar(s.statusBar, true); }
  if (!k || k === 'ruler') { if (Writer.ruler) Writer.ruler.set(s.ruler, true); }
  if (!k || k === 'marks') { if (ui && ui.isNonPrinting() !== s.marks) ui.setNonPrinting(s.marks); }
  if (!k || k === 'theme') { if (ui) S.applyTheme(); }
  if (k === 'font' || k === 'fontSize' || k === 'lineHeight') {
    S.applyType(); Writer.config.applyToDocument();
    if (Writer.pages && Writer.app.ready) Writer.pages.layoutAll();
  }
  if (!k || k === 'backupSec') S.startBackup();
  if (!k || k === 'ribbonCollapsed') { if (Writer.ribbon && Writer.ribbon.collapse) Writer.ribbon.collapse.apply(s.ribbonCollapsed); }  /* DF13c */
  if (!k || k === 'spellcheck') { if (Writer.write && Writer.write.applySpell) Writer.write.applySpell(); }  /* DF21 */
};

Writer.settings.applyTheme = function applyTheme() {
  Writer.settings.inTheme = true;
  Writer.ui.setTheme(Writer.settings.isDark());
  Writer.settings.inTheme = false;
};

/* Periodic sync backup (uses storage.writeBackup). 0 = only on leave. */
Writer.settings.startBackup = function startBackup() {
  var S = Writer.settings;
  clearInterval(S.timer); S.timer = null;
  if (S.s.backupSec > 0) S.timer = setInterval(function () {
    /* (before HOW1) if (Draftly.app.ready) Draftly.storage.writeBackup(); */
    if (Writer.app.ready && Writer.how) Writer.how.autosave();
  }, S.s.backupSec * 1000);
};

/* True when typing should autosave (docs.bind checks this). */
Writer.settings.autosave = function autosave() { return Writer.settings.s.autosave !== false; };

/* ----- panel (OfficeSettings) ----- */
Writer.settings.syncForm = function syncForm() { Writer.settings.panel.syncForm(); };
Writer.settings.open = function open() { Writer.settings.panel.open(); };
Writer.settings.close = function close() { Writer.settings.panel.close(); };

/* Wrap feature setters so ribbon / menu changes land in writer_settings too. */
Writer.settings.hook = function hook() {
  var S = Writer.settings, ui = Writer.ui;
  var tog = ui.toggleNonPrinting;
  ui.toggleNonPrinting = function () { var r = tog.apply(this, arguments); S.s.marks = ui.isNonPrinting(); S.save(); S.syncForm(); return r; };
  var th = ui.setTheme;
  ui.setTheme = function (dark) { var r = th.apply(this, arguments); if (!S.inTheme) { S.s.theme = dark ? 'dark' : 'light'; S.save(); S.syncForm(); } return r; };
  ui.loadTheme = function () { S.applyTheme(); };
  if (Writer.ruler) {
    var rs = Writer.ruler.set;
    Writer.ruler.set = function (on) { var r = rs.apply(this, arguments); S.s.ruler = !!on; S.save(); return r; };
  }
  if (Writer.find && Writer.find.setStatusBar) {
    var sb = Writer.find.setStatusBar;
    Writer.find.setStatusBar = function (on) { var r = sb.apply(this, arguments); S.s.statusBar = !!on; S.save(); return r; };
  }
  /* New document: apply the default paper, orientation and margins. */
  if (Writer.docs && Writer.docs.newDoc) {
    var nd = Writer.docs.newDoc;
    Writer.docs.newDoc = function () {
      return nd.apply(this, arguments).then(function (r) {
        var s = S.s, cfg = Writer.config;
        ui.setPage(s.paper, s.margins, s.margins === 'custom' ? cfg.marginCustom : undefined);
        ui.setOrientation(s.orientation);
        return r;
      });
    };
  }
  /* (before HO2) OfficeTheme.watch(function () { if (S.s.theme === 'auto') S.applyTheme(); }); */
  var watchAuto = OfficeTheme.watchHub || OfficeTheme.watch;
  watchAuto.call(OfficeTheme, function () { if (S.s.theme === 'auto') S.applyTheme(); });
};

Writer.settings.bind = function bind() {
  var S = Writer.settings;
  if (!S.panel || !S.panel.panel) return;
  S.hook();
  S.startBackup();
  S.syncForm();
};

Writer.settings.early();
