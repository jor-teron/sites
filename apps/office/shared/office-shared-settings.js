/*
 * apps/office/shared/office-shared-settings.js  (HO9)
 * Shared Hub Office defaults for new documents. Stored in one localStorage
 * key: 'hubOffice.settings'. These are starting values only:
 *   - each app's own settings still win, and must not be copied into
 *     per-app keys (writer_settings, spreadsheet_settings, and so on);
 *   - a document that is already open is not restyled when these change.
 * Suites do not read this key yet; later releases (DW10, SH28, PN3,
 * BS13, TB7) will wire each app.
 *
 *   OfficeSharedSettings.DEFAULTS
 *   OfficeSharedSettings.normalize(obj)  invalid fields -> defaults; unknown dropped
 *   OfficeSharedSettings.load(storage)
 *   OfficeSharedSettings.save(storage, obj)  writes the normalized object and returns it
 *   OfficeSharedSettings.subscribe(fn)   fn(settings); also fired on window 'storage'
 *   OfficeSharedSettings.KEY / FONTS / ...
 */
(function (root) {
  var KEY = 'hubOffice.settings';
  var FONTS = ['Times New Roman', 'Tinos'];
  var PAPERS = ['A4', 'Letter'];
  var UNITS = ['cm', 'in'];
  var DATE_FORMATS = ['dmy', 'ymd', 'mdy'];
  var NUMBER_LOCALES = ['en-IN', 'en-US', 'en-GB'];
  var SAVE_LOCATIONS = ['documents', 'ask'];
  var FONT_SIZE_MIN = 6;
  var FONT_SIZE_MAX = 72;
  var AUTHOR_MAX = 60;

  var DEFAULTS = {
    v: 1,
    font: 'Times New Roman',
    fontSize: 12,
    paper: 'A4',
    units: 'cm',
    dateFormat: 'dmy',
    numberLocale: 'en-IN',
    autosave: true,
    saveLocation: 'documents',
    author: ''
  };

  var listeners = [];

  function inList(list, v) {
    return list.indexOf(v) !== -1;
  }

  function toInt(v) {
    if (typeof v === 'string' && v.trim() !== '') v = Number(v);
    if (typeof v === 'number' && isFinite(v) && Math.floor(v) === v) return v;
    return null;
  }

  function parseRaw(raw) {
    if (raw == null || raw === '') return null;
    try {
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : null;
    } catch (e) {
      return null;
    }
  }

  function normalize(obj) {
    var src = (obj && typeof obj === 'object') ? obj : {};
    var size = toInt(src.fontSize);
    var author = DEFAULTS.author;
    if (typeof src.author === 'string') author = src.author.trim().slice(0, AUTHOR_MAX);
    return {
      v: 1,
      font: inList(FONTS, src.font) ? src.font : DEFAULTS.font,
      fontSize: (size !== null && size >= FONT_SIZE_MIN && size <= FONT_SIZE_MAX) ? size : DEFAULTS.fontSize,
      paper: inList(PAPERS, src.paper) ? src.paper : DEFAULTS.paper,
      units: inList(UNITS, src.units) ? src.units : DEFAULTS.units,
      dateFormat: inList(DATE_FORMATS, src.dateFormat) ? src.dateFormat : DEFAULTS.dateFormat,
      numberLocale: inList(NUMBER_LOCALES, src.numberLocale) ? src.numberLocale : DEFAULTS.numberLocale,
      autosave: typeof src.autosave === 'boolean' ? src.autosave : DEFAULTS.autosave,
      saveLocation: inList(SAVE_LOCATIONS, src.saveLocation) ? src.saveLocation : DEFAULTS.saveLocation,
      author: author
    };
  }

  function readItem(storage) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try { return storage.getItem(KEY); } catch (e) { return null; }
  }

  function load(storage) {
    return normalize(parseRaw(readItem(storage)));
  }

  function notify(settings) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](settings); } catch (e) { /* listener error */ }
    }
  }

  function save(storage, obj) {
    var next = normalize(obj);
    if (storage && typeof storage.setItem === 'function') {
      try { storage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* quota / blocked */ }
    }
    notify(next);
    return next;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function unsubscribe() {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function onStorage(e) {
    if (!e || e.key !== KEY) return;
    notify(normalize(parseRaw(e.newValue)));
  }

  function attach(win) {
    if (!win || typeof win.addEventListener !== 'function') return;
    if (win.__hoSharedSettingsListening) return;
    win.__hoSharedSettingsListening = true;
    win.addEventListener('storage', onStorage);
  }

  var api = {
    KEY: KEY,
    DEFAULTS: DEFAULTS,
    FONTS: FONTS,
    PAPERS: PAPERS,
    UNITS: UNITS,
    DATE_FORMATS: DATE_FORMATS,
    NUMBER_LOCALES: NUMBER_LOCALES,
    SAVE_LOCATIONS: SAVE_LOCATIONS,
    FONT_SIZE_MIN: FONT_SIZE_MIN,
    FONT_SIZE_MAX: FONT_SIZE_MAX,
    AUTHOR_MAX: AUTHOR_MAX,
    normalize: normalize,
    load: load,
    save: save,
    subscribe: subscribe,
    attach: attach,
    onStorage: onStorage
  };

  if (typeof window !== 'undefined') attach(window);
  if (root) root.OfficeSharedSettings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
