/* ============================================================
   FILE: slides_hop.js
   ROLE: SL11 native .hop Save / Save As of the current deck, through
         ../shared/office-native.js (the same Documents / picker /
         download path Spreadsheet and Tables use). The JSON format is
         unchanged: "hub-slides" version 6. PN4: .hslides no longer opens
         (rename an old .hslides file to .hop to open it).
         (before PN4) Old .hslides files still open from a File or a Hub hash (#drive=…&file=…).
         Export .hop (SLFile.download) and the in-browser deck list
         (SLSave / localStorage) stay as they are. "Deck" wording is
         unchanged. Autosave of the .hop never downloads on each edit.
         (before SL11) Save and Ctrl+S only flushed the localStorage
         working copy; a .hop file was Export only.
   ============================================================ */
(function (root) {
  'use strict';

  var Hop = {};
  Hop.EXT = 'hop';
  /* (before PN4) Hop.LEGACY = 'hslides'; */
  Hop.FORMAT = 'hub-slides';
  Hop.VERSION = 6;
  Hop.MAX = 40 * 1024 * 1024;
  Hop.FALLBACK = 'presentation';

  function fail(msg) {
    var e = new Error(msg);
    e.userMessage = msg;
    throw e;
  }
  function iso(ms) {
    try { return new Date(ms).toISOString(); } catch (_) { return ''; }
  }
  function when(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && isFinite(v)) return v;
    var n = Date.parse(v);
    return isFinite(n) ? n : 0;
  }
  function nameOf(v) {
    var n = typeof v === 'string' ? v : (v && v.name) || '';
    return String(n || '');
  }

  Hop.stem = function stem(name) {
    /* (before PN4) var s = nameOf(name).replace(/\.(hop|hslides)$/i, ''); */
    var s = nameOf(name).replace(/\.hop$/i, '');
    if (root && root.OfficeNative && root.OfficeNative.stem) return root.OfficeNative.stem(s, Hop.EXT, Hop.FALLBACK);
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) s = Hop.FALLBACK;
    if (s.length > 180) s = s.slice(0, 180).trim();
    return s;
  };
  Hop.fileName = function fileName(name) { return Hop.stem(name) + '.' + Hop.EXT; };
  Hop.acceptsName = function acceptsName(name) {
    /* (before PN4) return /\.(hop|hslides)$/i.test(nameOf(name)); */
    return /\.hop$/i.test(nameOf(name));
  };
  Hop.isHop = function isHop(f) { return Hop.acceptsName(f); };

  /* Hub Files hash: #drive=local&path=Documents&file=Talk.hop (FsRef.parse shape). */
  Hop.parseHash = function parseHash(hash) {
    var raw = String(hash || '').replace(/^#/, '');
    if (!raw) return null;
    var q, drive, name, path;
    if (typeof URLSearchParams === 'function') {
      q = new URLSearchParams(raw);
      drive = q.get('drive') || '';
      name = q.get('file') || '';
      path = q.get('path') || '';
    } else {
      var got = {};
      raw.split('&').forEach(function (part) {
        var i = part.indexOf('='), k, v;
        if (i < 0) return;
        k = decodeURIComponent(part.slice(0, i).replace(/\+/g, ' '));
        v = decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '));
        got[k] = v;
      });
      drive = got.drive || '';
      name = got.file || '';
      path = got.path || '';
    }
    if (!drive || !name || !Hop.acceptsName(name)) return null;
    return { drive: drive, path: path, name: name };
  };

  /* On-disk object. When SLFile is loaded, the slide payload is the real v6 export. */
  Hop.pack = function pack(doc) {
    doc = doc || {};
    var name = Hop.stem(doc.name || Hop.FALLBACK);
    if (root && root.SLFile && typeof root.SLFile.toJSON === 'function' && root.SLText) {
      var out = root.SLFile.toJSON({
        name: name,
        created: doc.created,
        updated: doc.updated,
        theme: doc.theme,
        master: doc.master,
        sections: doc.sections,
        slides: Array.isArray(doc.slides) ? doc.slides : []
      });
      out.name = name;
      if (doc.created) out.created = iso(doc.created);
      if (doc.updated) out.updated = iso(doc.updated);
      return out;
    }
    var now = Date.now();
    var packed = {
      format: Hop.FORMAT,
      version: Hop.VERSION,
      name: name,
      created: iso(doc.created || now),
      updated: iso(doc.updated || now),
      theme: typeof doc.theme === 'string' ? doc.theme : 'light',
      slides: Array.isArray(doc.slides) ? doc.slides : []
    };
    if (doc.master) packed.master = doc.master;
    if (doc.sections) packed.sections = doc.sections;
    return packed;
  };
  Hop.stringify = function stringify(doc) {
    return JSON.stringify(Hop.pack(doc), null, 2);
  };

  /* Logical deck for OfficeNative (name, created, slides, …). Throws with userMessage. */
  Hop.parse = function parse(text) {
    if (root && root.SLFile && typeof root.SLFile.parse === 'function' && root.SLText) {
      var r = root.SLFile.parse(text);
      if (r.error) fail(r.error);
      var d = r.deck || {};
      d.cut = r.cut;
      return d;
    }
    if (typeof text !== 'string') fail('This is not a .hop file.');
    if (text.length > Hop.MAX) fail('This .hop file is too large.');
    var data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (e) { fail('This is not a Presentation file (not valid JSON).'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('This is not a Presentation file.');
    if (data.format !== Hop.FORMAT) fail('This is not a Presentation file (format is not "hub-slides").');
    if ((+data.version || 0) > Hop.VERSION) fail('This file was made by a newer Presentation (version ' + data.version + '). Update the Hub and try again.');
    if (!Array.isArray(data.slides)) fail('The file has no slides list.');
    return {
      name: Hop.stem(data.name || Hop.FALLBACK),
      created: when(data.created) || Date.now(),
      updated: when(data.updated) || Date.now(),
      theme: typeof data.theme === 'string' ? data.theme : 'light',
      master: data.master,
      sections: data.sections,
      slides: data.slides,
      cut: data.slides.length > 500
    };
  };

  /* (before PN4) hopDest() remapped a .hslides dest to .hop; acceptLegacy() widened
     isFile / openFromHash so a legacy .hslides hash or File was accepted. */

  Hop.install = function install(hooks) {
    hooks = hooks || {};
    if (!root || !root.OfficeNative) return null;
    var stemName = Hop.FALLBACK;
    var session = root.OfficeNative.create({
      ext: Hop.EXT,
      label: 'Hub Office Presentation',
      fallback: Hop.FALLBACK,
      max: Hop.MAX,
      capture: function (s) {
        var doc = hooks.capture ? hooks.capture(s) : { slides: [] };
        if (!doc || typeof doc !== 'object') doc = { slides: [] };
        if (!doc.name) doc.name = stemName;
        if (!doc.created && s && s.created) doc.created = s.created;
        return doc;
      },
      pack: Hop.pack,
      parse: Hop.parse,
      apply: function (doc) { if (hooks.apply) hooks.apply(doc); },
      toast: function (msg) { if (hooks.toast) hooks.toast(msg); },
      currentName: function () {
        if (hooks.currentName) return hooks.currentName() || stemName;
        return stemName;
      },
      setName: function (name) {
        stemName = Hop.stem(name);
        if (hooks.setName) hooks.setName(stemName);
      },
      noteSaved: function (res) { if (hooks.noteSaved) hooks.noteSaved(res); },
      noteFailed: function (err) { if (hooks.noteFailed) hooks.noteFailed(err); },
      clash: function (name, free) { return root.OfficeNative.clashDialog(name, free); },
      promptName: function (cur) {
        if (hooks.promptName) return hooks.promptName(cur);
        return Promise.resolve(cur);
      }
    });
    /* (before PN4) acceptLegacy(session); */
    session.stemName = function () { return stemName; };
    session.noteStem = function (name) { stemName = Hop.stem(name); };
    session.hopFileName = Hop.fileName;
    session.acceptsName = Hop.acceptsName;
    session.parseHash = Hop.parseHash;
    root.SLHop = session;
    return session;
  };

  if (typeof module === 'object' && module.exports) module.exports = Hop;
  if (root) root.SlidesHop = Hop;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
