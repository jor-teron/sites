/* Password Manager PW2 — Chrome, Firefox and Bitwarden CSV import (pure helpers).
   The CSV is plaintext: the UI warns the user to delete the file after import. */
(function (root) {
  'use strict';

  function splitCsvLine(line) {
    var out = [];
    var cur = '';
    var i = 0;
    var inQ = false;
    while (i < line.length) {
      var ch = line.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') { cur += '"'; i += 2; continue; }
          inQ = false;
          i += 1;
          continue;
        }
        cur += ch;
        i += 1;
        continue;
      }
      if (ch === '"') { inQ = true; i += 1; continue; }
      if (ch === ',') { out.push(cur); cur = ''; i += 1; continue; }
      cur += ch;
      i += 1;
    }
    out.push(cur);
    return out;
  }

  function parseCsv(text) {
    text = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!text) return [];
    var lines = text.split('\n');
    var rows = [];
    var buf = '';
    for (var i = 0; i < lines.length; i++) {
      buf = buf ? (buf + '\n' + lines[i]) : lines[i];
      var quotes = (buf.match(/"/g) || []).length;
      if (quotes % 2 === 1) continue;
      if (buf.length === 0 && rows.length === 0) { buf = ''; continue; }
      rows.push(splitCsvLine(buf));
      buf = '';
    }
    if (buf) rows.push(splitCsvLine(buf));
    return rows;
  }

  function normHeader(h) {
    return String(h || '').trim().toLowerCase().replace(/^\uFEFF/, '').replace(/[\s-]+/g, '_');
  }

  function rowObject(headers, cells) {
    var o = {};
    for (var i = 0; i < headers.length; i++) {
      o[headers[i]] = cells[i] == null ? '' : String(cells[i]);
    }
    return o;
  }

  // Chrome: name, url, username, password [, note]
  // Firefox: url, username, password, httpRealm, formActionOrigin, guid, timeCreated, ...
  // Bitwarden: folder, favorite, type, name, notes, fields, reprompt, login_uri, login_username, ...
  function detectFormat(headers) {
    var h = (headers || []).map(normHeader);
    var has = function (name) { return h.indexOf(name) !== -1; };
    if (has('login_uri') || has('login_username') || has('login_password') || has('login_totp')) {
      return 'bitwarden';
    }
    if (has('httprealm') || has('formactionorigin') || has('timepasswordchanged') || has('guid')) {
      return 'firefox';
    }
    if (has('url') && has('username') && has('password') && (has('name') || has('title'))) {
      return 'chrome';
    }
    if (has('url') && has('username') && has('password')) return 'firefox';
    if (has('name') && has('password')) return 'chrome';
    return 'unknown';
  }

  function isoFromMs(ms) {
    var n = Number(ms);
    if (!n || !isFinite(n)) return '';
    if (n < 1e12) n = n * 1000;
    var d = new Date(n);
    if (isNaN(d.getTime())) return '';
    return d.toISOString();
  }

  function uidOf(rootUid, fallback) {
    if (root && root.PMUtil && typeof root.PMUtil.uid === 'function') return root.PMUtil.uid();
    return fallback || ('imp-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  }

  function nowIso() {
    if (root && root.PMUtil && typeof root.PMUtil.nowIso === 'function') return root.PMUtil.nowIso();
    return new Date().toISOString();
  }

  function baseEntry(type, title, extra) {
    var e = {
      id: uidOf(),
      type: type || 'login',
      title: title || '',
      favourite: false,
      notes: '',
      tags: [],
      fields: [],
      created: nowIso(),
      updated: nowIso(),
      passwordChanged: nowIso()
    };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  function parseBitwardenFields(raw) {
    raw = String(raw || '').trim();
    if (!raw) return [];
    var fields = [];
    if (raw.charAt(0) === '[' || raw.charAt(0) === '{') {
      try {
        var json = JSON.parse(raw);
        var list = Array.isArray(json) ? json : (json.fields || []);
        list.forEach(function (f) {
          if (!f) return;
          var name = String(f.name || f.label || '').trim();
          if (!name) return;
          var hidden = f.type === 1 || f.type === 'hidden' || f.hidden === true;
          fields.push({ id: uidOf(), name: name, value: String(f.value || ''), hidden: hidden });
        });
        return fields;
      } catch (_) { /* fall through */ }
    }
    raw.split(/\r?\n/).forEach(function (line) {
      var m = line.match(/^([^:]+):\s*(.*)$/);
      if (!m) return;
      var name = m[1].trim();
      if (!name) return;
      fields.push({ id: uidOf(), name: name, value: m[2], hidden: false });
    });
    return fields;
  }

  function parseBitwardenCard(row) {
    var e = baseEntry('card', row.name || 'Card');
    e.notes = row.notes || '';
    e.favourite = row.favorite === '1' || row.favorite === 'true';
    e.cardholder = row.card_cardholdername || row.cardholder || '';
    e.number = row.card_number || row.number || '';
    var exp = '';
    if (row.card_expmonth || row.card_expyear) {
      var mo = String(row.card_expmonth || '').padStart(2, '0');
      var yr = String(row.card_expyear || '');
      if (yr.length === 4) yr = yr.slice(2);
      exp = mo && yr ? (mo + '/' + yr) : (mo || yr);
    }
    e.expiry = exp || row.expiry || '';
    e.cvv = row.card_code || row.cvv || '';
    e.fields = parseBitwardenFields(row.fields);
    if (row.folder) e.tags = [row.folder];
    return e;
  }

  function parseBitwardenNote(row) {
    var e = baseEntry('note', row.name || 'Note');
    e.text = row.notes || '';
    e.favourite = row.favorite === '1' || row.favorite === 'true';
    e.fields = parseBitwardenFields(row.fields);
    if (row.folder) e.tags = [row.folder];
    return e;
  }

  function parseLoginLike(format, row) {
    var title, url, username, password, notes, totp, created, changed, fav, tags, fields, type;
    fields = [];
    tags = [];
    fav = false;
    type = 'login';
    if (format === 'bitwarden') {
      var bwType = String(row.type || 'login').toLowerCase();
      if (bwType === 'note' || bwType === 'securenote') return parseBitwardenNote(row);
      if (bwType === 'card') return parseBitwardenCard(row);
      title = row.name || '';
      url = row.login_uri || row.uri || row.url || '';
      username = row.login_username || row.username || '';
      password = row.login_password || row.password || '';
      notes = row.notes || '';
      totp = row.login_totp || row.totp || '';
      fav = row.favorite === '1' || row.favorite === 'true';
      fields = parseBitwardenFields(row.fields);
      if (row.folder) tags = [row.folder];
    } else if (format === 'firefox') {
      url = row.url || row.hostname || '';
      username = row.username || '';
      password = row.password || '';
      title = row.title || row.name || hostnameOf(url) || username || 'Login';
      notes = row.notes || row.httpRealm || '';
      created = isoFromMs(row.timeCreated || row.timecreated);
      changed = isoFromMs(row.timePasswordChanged || row.timepasswordchanged);
    } else {
      title = row.name || row.title || hostnameOf(row.url) || row.username || 'Login';
      url = row.url || row.origin || '';
      username = row.username || row.user || '';
      password = row.password || '';
      notes = row.note || row.notes || '';
      totp = row.totp || row.otpauth || '';
    }
    var e = baseEntry('login', title);
    e.url = url;
    e.username = username;
    e.password = password;
    e.notes = notes || '';
    if (totp) e.totp = String(totp);
    e.favourite = fav;
    e.fields = fields;
    e.tags = tags;
    if (created) { e.created = created; e.updated = created; }
    if (changed) { e.passwordChanged = changed; e.updated = changed; }
    else e.passwordChanged = e.created;
    return e;
  }

  function hostnameOf(url) {
    url = String(url || '').trim();
    if (!url) return '';
    try {
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) url = 'https://' + url;
      return new URL(url).hostname || '';
    } catch (_) {
      return '';
    }
  }

  /**
   * @returns {{format:string, entries:object[], skipped:number, warnings:string[], rows:number}}
   */
  function importCsv(text) {
    var rows = parseCsv(text);
    var warnings = [];
    if (!rows.length) {
      return { format: 'unknown', entries: [], skipped: 0, warnings: ['The file is empty.'], rows: 0 };
    }
    var headers = rows[0].map(normHeader);
    if (!headers.join('')) {
      return { format: 'unknown', entries: [], skipped: 0, warnings: ['The file has no header row.'], rows: 0 };
    }
    var format = detectFormat(headers);
    if (format === 'unknown') {
      warnings.push('Could not tell whether this is a Chrome, Firefox or Bitwarden export. Tried as a generic login CSV.');
      format = 'chrome';
    }
    var entries = [];
    var skipped = 0;
    for (var i = 1; i < rows.length; i++) {
      var cells = rows[i];
      if (!cells || !cells.some(function (c) { return String(c || '').trim(); })) { skipped += 1; continue; }
      var row = rowObject(headers, cells);
      try {
        var e = parseLoginLike(format, row);
        if (!e.title && !e.username && !e.password && !e.url && !e.text && !e.number) { skipped += 1; continue; }
        if (!e.title) e.title = e.username || e.ssid || hostnameOf(e.url) || 'Imported entry';
        entries.push(e);
      } catch (err) {
        skipped += 1;
      }
    }
    if (!entries.length) warnings.push('No login rows were found in this file.');
    return { format: format, entries: entries, skipped: skipped, warnings: warnings, rows: Math.max(0, rows.length - 1) };
  }

  var api = {
    parseCsv: parseCsv,
    splitCsvLine: splitCsvLine,
    detectFormat: detectFormat,
    importCsv: importCsv,
    hostnameOf: hostnameOf
  };

  root.PMCsv = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
