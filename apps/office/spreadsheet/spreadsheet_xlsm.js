/* ============================================================
   FILE: spreadsheet_xlsm.js
   ROLE: SH33 Spreadsheet opens and saves .xlsm (Excel macro-enabled)
         and keeps the macros.
         - extract(XLSX, bytes): reads the opened .xlsm zip (SheetJS's own
           XLSX.CFB zip reader, no new library) and keeps, as raw bytes,
           xl/vbaProject.bin, xl/vbaProjectSignature*.bin,
           xl/_rels/vbaProject.bin.rels, everything under customUI/,
           the relationships that point at them, their content types,
           and the codeName attributes (workbookPr codeName and each
           sheet's sheetPr codeName, keyed by sheet name).
         - inject(XLSX, bytes, kept): takes the plain .xlsx written by the
           existing generator (xlsxWriteBook) and writes the kept parts
           back in: macroEnabled workbook content type, a vbaProject
           Default + Overrides, the vbaProject relationship in
           xl/_rels/workbook.xml.rels, the customUI relationships in
           _rels/.rels, and the codeNames on sheets that still exist
           under the same name (VBA sheet / ThisWorkbook modules are
           tied to codeName, not to the tab name).
         Macros are never run, shown or edited. The kept parts live in
         memory only (SHEET_SAVEFMT.macro), never in localStorage / .hos.
   DEPENDS: XLSX.CFB (vendor/sheetjs/xlsx.full.min.js). Pure: no DOM.
   ============================================================ */
(function (root) {
  'use strict';

  var M = {};
  M.CT_MACRO_MAIN = 'application/vnd.ms-excel.sheet.macroEnabled.main+xml';
  M.CT_PLAIN_MAIN = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  M.CT_VBA = 'application/vnd.ms-office.vbaProject';
  M.CT_VBA_SIG = 'application/vnd.ms-office.vbaProjectSignature';
  M.REL_VBA = 'http://schemas.microsoft.com/office/2006/relationships/vbaProject';
  M.REL_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
  M.MIME = 'application/vnd.ms-excel.sheet.macroEnabled.12';

  /* ---------- small helpers ---------- */
  function utf8(bytes) {
    if (!bytes) return '';
    var u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u);
    var s = '', i;
    for (i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return decodeURIComponent(escape(s));
  }
  function bytesOf(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str)), u = new Uint8Array(s.length), i;
    for (i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  function copy(bytes) {
    var u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var out = new Uint8Array(u.length);
    out.set(u);
    return out;
  }
  function attr(tag, name) {
    var m = new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')').exec(tag);
    return m ? (m[2] != null ? m[2] : m[3]) : null;
  }
  function unxml(s) {
    return String(s == null ? '' : s).replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, function (all, e) {
      var k = e.toLowerCase();
      if (k === 'lt') return '<';
      if (k === 'gt') return '>';
      if (k === 'quot') return '"';
      if (k === 'apos') return "'";
      if (k === 'amp') return '&';
      if (k.charAt(1) === 'x') return String.fromCharCode(parseInt(k.slice(2), 16));
      return String.fromCharCode(parseInt(k.slice(1), 10));
    });
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function tags(xml, name) {
    var re = new RegExp('<(?:\\w+:)?' + name + '\\b[^>]*>', 'g'), out = [], m;
    while ((m = re.exec(xml))) out.push(m[0]);
    return out;
  }
  /* "/xl/worksheets/sheet1.xml" style part name from a rels file's folder + target. */
  function resolve(base, target) {
    target = String(target || '');
    if (target.charAt(0) === '/') return target.replace(/^\/+/, '');
    var parts = String(base || '').split('/').filter(Boolean);
    target.split('/').forEach(function (p) {
      if (p === '..') parts.pop();
      else if (p && p !== '.') parts.push(p);
    });
    return parts.join('/');
  }
  function dirOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
  function relsOf(p) { var d = dirOf(p); return (d ? d + '/' : '') + '_rels/' + p.slice(d ? d.length + 1 : 0) + '.rels'; }

  /* Every zip entry as { path: 'xl/workbook.xml', bytes } (SheetJS CFB). */
  function zipEntries(CFB, z) {
    var out = [], i, p, e;
    for (i = 0; i < z.FullPaths.length; i++) {
      e = z.FileIndex[i];
      if (!e || e.type !== 2 || !e.content) continue;
      p = String(z.FullPaths[i]).replace(/^[^\/]*\//, '');   /* drop "Root Entry/" */
      if (!p || p.charAt(0) === '\u0001') continue;
      out.push({ path: p, bytes: e.content });
    }
    return out;
  }
  function find(CFB, z, path) {
    var e = CFB.find(z, '/' + path);
    return e && e.content ? e : null;
  }
  function readText(CFB, z, path) {
    var e = find(CFB, z, path);
    return e ? utf8(e.content) : null;
  }
  function writeText(CFB, z, path, text) {
    var e = find(CFB, z, path);
    if (e) { e.content = bytesOf(text); e.size = e.content.length; }
    else CFB.utils.cfb_add(z, '/' + path, bytesOf(text));
  }
  function rels(xml) {
    return tags(xml || '', 'Relationship').map(function (t) {
      return { id: attr(t, 'Id'), type: attr(t, 'Type'), target: attr(t, 'Target'), mode: attr(t, 'TargetMode') };
    });
  }
  function contentTypes(xml) {
    var d = {}, o = {};
    tags(xml || '', 'Default').forEach(function (t) { d[String(attr(t, 'Extension') || '').toLowerCase()] = attr(t, 'ContentType'); });
    tags(xml || '', 'Override').forEach(function (t) { o[String(attr(t, 'PartName') || '').toLowerCase()] = attr(t, 'ContentType'); });
    return { defaults: d, overrides: o };
  }
  function typeOf(ct, path) {
    var o = ct.overrides['/' + path.toLowerCase()];
    if (o) return o;
    var m = /\.([^.\/]+)$/.exec(path);
    return m ? (ct.defaults[m[1].toLowerCase()] || '') : '';
  }
  /* Which raw parts SH33 carries over. */
  M.isKeptPart = function isKeptPart(path) {
    var p = String(path || '');
    return /^xl\/vbaProject[^\/]*\.bin$/i.test(p) ||
      /^xl\/_rels\/vbaProject[^\/]*\.bin\.rels$/i.test(p) ||
      /^customUI\//i.test(p);
  };
  /* The workbook part (xl/workbook.xml) from the root rels. */
  function workbookPath(CFB, z) {
    var r = rels(readText(CFB, z, '_rels/.rels')).filter(function (x) { return x.type === M.REL_DOC; })[0];
    return r ? resolve('', r.target) : 'xl/workbook.xml';
  }
  /* { sheetName: partPath } for a workbook (name entity-decoded). */
  function sheetParts(CFB, z, wbPath, wbXml) {
    var wr = rels(readText(CFB, z, relsOf(wbPath))), byId = {}, out = [];
    wr.forEach(function (x) { byId[x.id] = x; });
    tags(wbXml || '', 'sheet').forEach(function (t) {
      var id = attr(t, 'r:id');
      var r = byId[id];
      if (r) out.push({ name: unxml(attr(t, 'name')), path: resolve(dirOf(wbPath), r.target) });
    });
    return out;
  }

  /* ---------- open: keep the macro parts ---------- */
  M.extract = function extract(XLSX, data) {
    var CFB = XLSX && XLSX.CFB;
    if (!CFB) return null;
    var z = CFB.read(data instanceof Uint8Array ? data : new Uint8Array(data), { type: 'array' });
    var ct = contentTypes(readText(CFB, z, '[Content_Types].xml'));
    var wbPath = workbookPath(CFB, z);
    var wbDir = dirOf(wbPath);
    var wbXml = readText(CFB, z, wbPath) || '';
    var kept = { parts: [], wbRels: [], rootRels: [], defaults: {}, wbCode: null, sheetCodes: {}, hasVba: false };
    zipEntries(CFB, z).forEach(function (e) {
      if (!M.isKeptPart(e.path)) return;
      var t = typeOf(ct, e.path);
      if (/\.bin$/i.test(e.path) && !/\.rels$/i.test(e.path) && (!t || t === 'application/vnd.ms-excel.sheet.binary.macroEnabled.main')) {
        t = /signature/i.test(e.path) ? M.CT_VBA_SIG : M.CT_VBA;
      }
      kept.parts.push({ path: e.path, bytes: copy(e.bytes), type: t });
      var ext = (/\.([^.\/]+)$/.exec(e.path) || [])[1];
      if (ext && ct.defaults[ext.toLowerCase()] && !/\.bin$/i.test(e.path)) kept.defaults[ext.toLowerCase()] = ct.defaults[ext.toLowerCase()];
      if (/^xl\/vbaProject\.bin$/i.test(e.path)) kept.hasVba = true;
    });
    /* Relationships from the workbook to kept parts (the vbaProject rel). */
    rels(readText(CFB, z, relsOf(wbPath))).forEach(function (r) {
      if (r.mode === 'External') return;
      var full = resolve(wbDir, r.target);
      if (M.isKeptPart(full) && !/\.rels$/i.test(full)) kept.wbRels.push({ type: r.type, target: r.target, path: full });
    });
    /* Root relationships to kept parts (customUI). */
    rels(readText(CFB, z, '_rels/.rels')).forEach(function (r) {
      if (r.mode === 'External') return;
      var full = resolve('', r.target);
      if (M.isKeptPart(full)) kept.rootRels.push({ type: r.type, target: r.target, path: full });
    });
    /* A vbaProject.bin with no rel (odd file): still link it. */
    if (kept.hasVba && !kept.wbRels.some(function (r) { return r.type === M.REL_VBA; })) {
      kept.wbRels.push({ type: M.REL_VBA, target: 'vbaProject.bin', path: 'xl/vbaProject.bin' });
    }
    /* codeNames: ThisWorkbook and every sheet's VBA object name. */
    var wp = tags(wbXml, 'workbookPr')[0];
    if (wp && attr(wp, 'codeName') != null) kept.wbCode = unxml(attr(wp, 'codeName'));
    sheetParts(CFB, z, wbPath, wbXml).forEach(function (s) {
      var x = readText(CFB, z, s.path);
      var sp = x ? tags(x, 'sheetPr')[0] : null;
      var code = sp ? attr(sp, 'codeName') : null;
      if (code != null) kept.sheetCodes[s.name] = unxml(code);
    });
    return kept;
  };
  /* An .xlsm with nothing to keep (a plain workbook with an .xlsm name). */
  M.empty = function empty() {
    return { parts: [], wbRels: [], rootRels: [], defaults: {}, wbCode: null, sheetCodes: {}, hasVba: false };
  };

  /* ---------- save: put them back ---------- */
  function nextId(list) {
    var n = 0;
    list.forEach(function (r) { var m = /^rId(\d+)$/.exec(r.id || ''); if (m) n = Math.max(n, Number(m[1])); });
    return function () { n += 1; return 'rId' + n; };
  }
  function addRels(xml, add, path) {
    if (!add.length) return xml;
    if (!xml) xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    var have = rels(xml);
    var id = nextId(have);
    var ins = '';
    add.forEach(function (r) {
      var dup = have.some(function (h) { return h.type === r.type && resolve(path, h.target) === resolve(path, r.target); });
      if (dup) return;
      ins += '<Relationship Id="' + id() + '" Type="' + esc(r.type) + '" Target="' + esc(r.target) + '"/>';
    });
    return xml.replace(/<\/Relationships>\s*$/, ins + '</Relationships>');
  }
  function setAttr(tag, name, value) {
    var re = new RegExp('(\\s' + name + '\\s*=\\s*)("[^"]*"|\'[^\']*\')');
    if (re.test(tag)) return tag.replace(re, '$1"' + esc(value) + '"');
    return tag.replace(/\s*(\/?)>$/, ' ' + name + '="' + esc(value) + '"$1>');
  }
  function sheetNameKey(n) { return String(n == null ? '' : n).toLowerCase(); }

  /* bytes of a plain .xlsx (from xlsxWriteBook) -> bytes of an .xlsm (Uint8Array). */
  M.inject = function inject(XLSX, data, kept) {
    var CFB = XLSX.CFB;
    kept = kept || M.empty();
    var z = CFB.read(data instanceof Uint8Array ? data : new Uint8Array(data), { type: 'array' });
    var wbPath = workbookPath(CFB, z);
    /* 1. Raw parts, byte for byte. */
    kept.parts.forEach(function (p) {
      var e = find(CFB, z, p.path);
      if (e) { e.content = copy(p.bytes); e.size = e.content.length; }
      else CFB.utils.cfb_add(z, '/' + p.path, copy(p.bytes));
    });
    /* 2. Content types: macroEnabled workbook, vbaProject Default, an Override per kept part. */
    var ctx = readText(CFB, z, '[Content_Types].xml') || '';
    var wbPart = '/' + wbPath;
    var hadWb = false;
    ctx = ctx.replace(/<Override\b[^>]*>/g, function (t) {
      if (String(attr(t, 'PartName') || '').toLowerCase() !== wbPart.toLowerCase()) return t;
      hadWb = true;
      return setAttr(t, 'ContentType', M.CT_MACRO_MAIN);
    });
    var add = '';
    if (!hadWb) add += '<Override PartName="' + esc(wbPart) + '" ContentType="' + M.CT_MACRO_MAIN + '"/>';
    var haveDef = contentTypes(ctx).defaults;
    if (kept.parts.some(function (p) { return /\.bin$/i.test(p.path); })) {
      if (haveDef.bin) ctx = ctx.replace(/<Default\b[^>]*Extension="bin"[^>]*>/i, function (t) { return setAttr(t, 'ContentType', M.CT_VBA); });
      else add = '<Default Extension="bin" ContentType="' + M.CT_VBA + '"/>' + add;
    }
    Object.keys(kept.defaults).forEach(function (ext) {
      if (!haveDef[ext]) add = '<Default Extension="' + esc(ext) + '" ContentType="' + esc(kept.defaults[ext]) + '"/>' + add;
    });
    var haveOv = contentTypes(ctx).overrides;
    kept.parts.forEach(function (p) {
      if (/\.rels$/i.test(p.path) || !p.type) return;
      if (haveOv['/' + p.path.toLowerCase()]) return;
      add += '<Override PartName="/' + esc(p.path) + '" ContentType="' + esc(p.type) + '"/>';
    });
    if (add) ctx = ctx.replace(/<\/Types>\s*$/, add + '</Types>');
    writeText(CFB, z, '[Content_Types].xml', ctx);
    /* 3. Relationships. */
    if (kept.wbRels.length) {
      var wrp = relsOf(wbPath);
      writeText(CFB, z, wrp, addRels(readText(CFB, z, wrp), kept.wbRels, dirOf(wbPath)));
    }
    if (kept.rootRels.length) {
      writeText(CFB, z, '_rels/.rels', addRels(readText(CFB, z, '_rels/.rels'), kept.rootRels, ''));
    }
    /* 4. codeNames (ThisWorkbook + sheets still named the same). */
    var wbXml = readText(CFB, z, wbPath) || '';
    if (kept.wbCode != null) {
      if (/<workbookPr\b/.test(wbXml)) wbXml = wbXml.replace(/<workbookPr\b[^>]*>/, function (t) { return setAttr(t, 'codeName', kept.wbCode); });
      else wbXml = wbXml.replace(/(<workbook\b[^>]*>)/, '$1<workbookPr codeName="' + esc(kept.wbCode) + '"/>');
      writeText(CFB, z, wbPath, wbXml);
    }
    var codes = {}, codeCount = 0;
    Object.keys(kept.sheetCodes || {}).forEach(function (n) { codes[sheetNameKey(n)] = kept.sheetCodes[n]; codeCount++; });
    if (codeCount) {
      sheetParts(CFB, z, wbPath, wbXml).forEach(function (s) {
        var code = Object.prototype.hasOwnProperty.call(kept.sheetCodes, s.name) ? kept.sheetCodes[s.name] : codes[sheetNameKey(s.name)];
        if (code == null) return;
        var x = readText(CFB, z, s.path);
        if (!x) return;
        if (/<sheetPr\b/.test(x)) x = x.replace(/<sheetPr\b[^>]*>/, function (t) { return setAttr(t, 'codeName', code); });
        else x = x.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr codeName="' + esc(code) + '"/>');
        writeText(CFB, z, s.path, x);
      });
    }
    var out = CFB.write(z, { fileType: 'zip', type: 'array' });
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  };

  M._resolve = resolve;
  M._relsOf = relsOf;
  if (typeof module === 'object' && module.exports) module.exports = M;
  if (root) root.SHEET_XLSM = M;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
