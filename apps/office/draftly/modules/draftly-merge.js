/* ============================================================
   FILE: modules/draftly-merge.js
   PROJECT: Draftly
   ROLE: Mail merge engine (MM1, CSV only). No ribbon / DOM wiring here
         (that is draftly-merge-ui.js).
         - state: the CSV (header, rows), current row, settings
         - data sources: Hub drive (shared/fs, no picker), picked file handle, file input
         - placeholders {{Column Name}} (trimmed, case-insensitive), {{#}} = row number
         - merged HTML of a row (values are inserted as text, never as HTML)
         - file names: pattern, safe characters, de-duplication
         - settings in localStorage (namespaced key draftly_merge_settings)
   DEPENDS: Draftly.csv, Draftly.flow / pages / editor (for the document HTML)
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.merge = {
  settingsKey: 'draftly_merge_settings',
  pollMs: 3000,
  maxRowsExport: 2000,       /* hard cap for "Export all" */
  confirmRows: 200,          /* ask before exporting more rows than this */
  rowToken: '#',             /* {{#}} = 1-based row number */
  data: null,                /* { name, header, rows, delimiter, warnings, note, hash, stamp } or null */
  source: null,              /* { kind: 'drive' | 'handle' | 'file', name, getFile(), ... } */
  row: 0,                    /* current row index (0-based) */
  settings: { src: null, delim: 'auto', pattern: '', fmt: 'zip', row: 0 },
  changed: false,            /* the file on disk differs from what was loaded */
  error: '',                 /* last problem to show in the status line */
  errorCode: '',             /* 'access' | 'drive' | 'missing' (FsRef) | 'stale' (file from <input>) | '' */
  listeners: []
};

(function () {
  var M = Draftly.merge;
  var RE = /\{\{\s*([^{}]*?)\s*\}\}/g;

  M.onChange = function (fn) { M.listeners.push(fn); };
  M.emit = function (what) {
    M.listeners.forEach(function (fn) { try { fn(what); } catch (e) { console.warn('draftly merge:', e); } });
  };

  /* ----- settings ----- */
  M.loadSettings = function () {
    try {
      var raw = JSON.parse(localStorage.getItem(M.settingsKey) || 'null');
      if (raw && typeof raw === 'object') {
        var s = M.settings;
        if (raw.src && typeof raw.src === 'object' && typeof raw.src.name === 'string') s.src = raw.src;
        if (['auto', ',', ';', '\t'].indexOf(raw.delim) !== -1) s.delim = raw.delim;
        if (typeof raw.pattern === 'string') s.pattern = raw.pattern.slice(0, 200);
        if (raw.fmt === 'zip' || raw.fmt === 'combined') s.fmt = raw.fmt;
        if (isFinite(raw.row) && raw.row >= 0) s.row = Math.floor(raw.row);
      }
    } catch (e) { /* ignore a bad value */ }
    return M.settings;
  };
  M.saveSettings = function () {
    M.settings.row = M.row;
    try { localStorage.setItem(M.settingsKey, JSON.stringify(M.settings)); } catch (e) { /* storage blocked */ }
  };

  /* ----- data ----- */
  function hash(s) {   /* djb2: enough to see that the content changed */
    var h = 5381, i;
    for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return s.length + ':' + (h >>> 0);
  }
  function stampOf(file) { return file.size + ':' + file.lastModified; }

  /* Read the source file again. Resolves { changed, rows, error }. keepRow: keep M.row where possible. */
  M.readSource = function (opts) {
    opts = opts || {};
    var src = M.source;
    if (!src) return Promise.resolve({ error: 'No CSV chosen' });
    return Promise.resolve().then(function () { return src.getFile(); }).then(function (file) {
      return file.arrayBuffer().then(function (buf) { return { file: file, buf: buf }; });
    }).then(function (r) {
      var dec = Draftly.csv.decode(r.buf);
      var h = hash(dec.text) + ':' + M.settings.delim;
      var same = M.data && M.data.hash === h && M.data.name === src.name;
      if (same && !opts.force) {
        M.data.stamp = stampOf(r.file); M.changed = false; M.error = ''; M.errorCode = '';
        return { changed: false };
      }
      var p = Draftly.csv.parse(dec.text, M.settings.delim);
      if (!p.ok) { M.error = p.error; M.changed = false; M.emit('error'); return { changed: false, error: p.error }; }
      var prev = M.data;
      M.data = { name: src.name, header: p.header, rows: p.rows, delimiter: p.delimiter, warnings: p.warnings,
        note: dec.note, hash: h, stamp: stampOf(r.file) };
      M.error = ''; M.errorCode = '';
      M.changed = false;
      if (!opts.keepRow) M.row = Math.min(Math.max(0, M.settings.row || 0), Math.max(0, p.rows.length - 1));
      else M.row = Math.min(M.row, Math.max(0, p.rows.length - 1));
      M.emit('data');
      return { changed: true, first: !prev, rows: p.rows.length };
    }).catch(function (e) {
      /* A file from <input> cannot be read again after it changed on disk (the browser refuses). */
      var msg = e && e.name === 'NotReadableError' ? 'The file changed on disk: choose it again'
        : (e && e.message) || 'Could not read the CSV';
      M.error = msg; M.errorCode = (e && e.code) || (e && e.name === 'NotReadableError' ? 'stale' : '');
      M.emit('error');
      return { error: msg, code: M.errorCode, stale: !!(e && e.name === 'NotReadableError') };
    });
  };

  /* Cheap check for a change on disk (size + lastModified; a File from <input> can only throw). */
  M.poll = function () {
    var src = M.source;
    if (!src || !M.data) return Promise.resolve(false);
    return Promise.resolve().then(function () { return src.getFile(); }).then(function (file) {
      if (src.kind === 'file') return file.slice(0, 1).arrayBuffer().then(function () { return false; });
      return stampOf(file) !== M.data.stamp;
    }).catch(function (e) {
      return !!(e && e.name === 'NotReadableError');
    }).then(function (ch) {
      if (ch !== M.changed) { M.changed = ch; M.emit('changed'); }
      return ch;
    });
  };

  /* Use a new source. kind 'file': a File object; 'handle': FileSystemFileHandle; 'drive': {drive, path, name}. */
  M.setSource = function (src, persist) {
    M.source = src;
    M.data = null;
    M.row = 0;
    M.changed = false;
    M.error = ''; M.errorCode = '';
    if (persist !== false) {
      M.settings.src = src.kind === 'drive' ? { kind: 'drive', drive: src.drive, path: src.path, name: src.name }
        : { kind: 'local', name: src.name };
      M.settings.row = 0;
      M.saveSettings();
    }
    return M.readSource({ force: true });
  };
  M.sourceFromFile = function (file) {
    return { kind: 'file', name: file.name, getFile: function () { return Promise.resolve(file); } };
  };
  M.sourceFromHandle = function (h) {
    return { kind: 'handle', name: h.name, handle: h, getFile: function () { return h.getFile(); } };
  };
  M.sourceFromDrive = function (ref) {
    return { kind: 'drive', drive: ref.drive, path: ref.path || '', name: ref.name,
      getFile: function () {
        if (!window.FsRef) return Promise.reject(new Error('Hub drives are not available here'));
        return window.FsRef.resolve(ref).then(function (r) { return r.file.getFile(); });
      } };
  };

  M.fieldNames = function () { return M.data ? M.data.header : []; };
  M.count = function () { return M.data ? M.data.rows.length : 0; };
  M.setRow = function (i) {
    var n = M.count();
    if (!n) return;
    M.row = Math.min(Math.max(0, i), n - 1);
    M.saveSettings();
    M.emit('row');
  };

  /* ----- placeholders ----- */
  /* column index by lookup key */
  M.index = function () {
    var map = {};
    M.fieldNames().forEach(function (n, i) { map[Draftly.csv.key(n)] = i; });
    return map;
  };
  /* Value of a field for row i, or null when the field is unknown. */
  M.value = function (name, i, map) {
    var k = Draftly.csv.key(name);
    map = map || M.index();
    if (Object.prototype.hasOwnProperty.call(map, k)) { var row = M.data.rows[i]; return row ? row[map[k]] : ''; }
    if (k === M.rowToken) return String(i + 1);
    return null;
  };
  /* Names used in a text, with their first spelling: [{ name, known }] */
  M.scanText = function (text, map) {
    var out = [], seen = {}, m;
    map = map || M.index();
    RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      var k = Draftly.csv.key(m[1]);
      if (seen[k]) continue;
      seen[k] = true;
      out.push({ name: m[1].trim(), known: Object.prototype.hasOwnProperty.call(map, k) || k === M.rowToken });
    }
    return out;
  };
  /* Merge a plain string (file names, header / footer). row null: placeholders become ''. */
  M.mergeText = function (text, i, map) {
    map = map || M.index();
    return String(text).replace(RE, function (all, name) {
      if (i == null || !M.data) return '';
      var v = M.value(name, i, map);
      return v == null ? all : v;
    });
  };

  /* Merge the HTML of the document for row i. Returns an HTML string.
     Values go in as text nodes (newlines become <br>), never as markup.
     opts.mark: unknown fields are wrapped in <span class="mm-unknown"> (preview only). */
  M.mergeHtml = function (html, i, opts) {
    opts = opts || {};
    var holder = document.createElement('div');
    holder.innerHTML = html;
    var map = M.index();
    var w = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while ((n = w.nextNode())) if (n.nodeValue.indexOf('{{') !== -1) nodes.push(n);
    nodes.forEach(function (node) {
      var text = node.nodeValue, frag = document.createDocumentFragment(), last = 0, m;
      RE.lastIndex = 0;
      while ((m = RE.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var v = M.value(m[1], i, map);
        if (v == null) {
          if (opts.mark) {
            var sp = document.createElement('span');
            sp.className = 'mm-unknown';
            sp.textContent = m[0];
            frag.appendChild(sp);
          } else frag.appendChild(document.createTextNode(m[0]));
        } else {
          v.split(/\r\n|\r|\n/).forEach(function (part, k) {
            if (k) frag.appendChild(document.createElement('br'));
            if (part) frag.appendChild(document.createTextNode(part));
          });
        }
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
    return holder.innerHTML;
  };

  /* The document as stored (continuations joined, no marks). */
  M.docHtml = function () {
    var h = Draftly.pages.combinedHtml();
    var holder = document.createElement('div');
    holder.innerHTML = h;
    if (Draftly.editor) Draftly.editor.stripMarks(holder);
    return holder.innerHTML;
  };
  /* Unknown / known names used in the document and its header / footer. */
  M.scanDocument = function () {
    var holder = document.createElement('div');
    holder.innerHTML = M.docHtml();
    var text = holder.textContent;
    if (Draftly.hf && Draftly.hf.data) text += ' ' + (Draftly.hf.data.head || []).join(' ') + ' ' + (Draftly.hf.data.foot || []).join(' ');
    return M.scanText(text);
  };

  /* ----- file names ----- */
  var RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  M.cleanName = function (s, fallback) {
    s = String(s).replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '_').replace(/\s+/g, ' ').replace(/^[\s._]+|[\s.]+$/g, '');
    if (s.length > 80) s = s.slice(0, 80).replace(/[\s.]+$/, '');
    if (RESERVED.test(s)) s = '_' + s;
    return s || fallback || 'document';
  };
  /* One name per row (no extension), safe and unique (case-insensitive). */
  M.fileNames = function (pattern, docName, indexes) {
    var map = M.index(), used = {}, out = [];
    var pat = String(pattern || '').trim();
    if (!pat) pat = M.cleanName(docName, 'merge') + '-{{#}}';
    (indexes || M.data.rows.map(function (r, i) { return i; })).forEach(function (i) {
      var base = M.cleanName(M.mergeText(pat, i, map), 'row-' + (i + 1));
      var name = base, n = 1;
      while (used[name.toLowerCase()]) { n++; name = base + ' (' + n + ')'; }
      used[name.toLowerCase()] = true;
      out.push(name);
    });
    return out;
  };

  M.loadSettings();
})();
