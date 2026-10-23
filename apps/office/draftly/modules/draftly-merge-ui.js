/* ============================================================
   FILE: modules/draftly-merge-ui.js
   PROJECT: Draftly
   ROLE: Mail merge, screen part (MM1, MM3): the "Merge" ribbon tab, the CSV / Excel chooser
         (Hub drives first, no OS picker), field list, placeholder highlight and
         warnings, preview, live refresh, "Export all".
   TAB:  panelMerge (draftly.html) is a normal ribbon panel: draftly-ribbon.js shows it.
   FILES: Hub drive (shared/fs: FsDrives / FsOps / FsRef) → showOpenFilePicker → <input type=file>.
   PREVIEW: a read-only overlay with a merged COPY of the document; the stored document and the
         editors are not touched (the workspace is inert while it is open).
   POLL:  every Draftly.merge.pollMs the file's size + lastModified are compared; when the preview
         is open a change is re-read at once, otherwise the "File changed" badge shows.
   DEPENDS: Draftly.merge, Draftly.csv, Draftly.zip, Draftly.export, Draftly.view, Draftly.editor
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.mergeUi = { previewOn: false };

(function () {
  var M = Draftly.merge, U = Draftly.mergeUi;
  var TAB = 'merge';
  var pvBase = '';          /* document HTML while the preview is open */
  var pollTimer = null, polling = false, scanTimer = null, noticeTimer = null;
  var DELIMS = { ',': 'comma', ';': 'semicolon', '\t': 'tab' };

  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function toast(msg) { if (Draftly.ui && Draftly.ui.showToast) Draftly.ui.showToast(msg); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
  function docName() { return (Draftly.storage && Draftly.storage.currentName && Draftly.storage.currentName()) || 'Document'; }
  function isCsvName(n) { return /\.(csv|tsv|txt)$/i.test(n); }
  function isXlsxName(n) { return /\.(xlsx|xlsm)$/i.test(n); }
  function isDataName(n) { return isCsvName(n) || isXlsxName(n); }

  /* ---------------------------------------------------------- modal (same look as OfficeDialog) */
  function modal(title, wide) {
    var back = h('div', 'dlg-backdrop mm-backdrop');
    var box = h('div', 'dlg' + (wide ? ' mm-wide' : ''));
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    var t = h('div', 'dlg-title', title);
    box.setAttribute('aria-label', title);
    box.appendChild(t);
    back.appendChild(box);
    var before = document.activeElement;
    var api = { back: back, box: box, onClose: null };
    api.close = function () {
      if (!back.parentNode) return;
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      try { if (before && before.focus && document.contains(before)) before.focus({ preventScroll: true }); } catch (e) { /* gone */ }
      if (api.onClose) api.onClose();
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); }
    }
    back.addEventListener('mousedown', function (e) { if (e.target === back && !api.sticky) api.close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    return api;
  }
  function buttons(box, defs) {
    var row = h('div', 'dlg-actions'), out = {};
    defs.forEach(function (d) {
      var b = h('button', 'dlg-btn' + (d.ok ? ' dlg-ok' : ''), d.label);
      b.type = 'button';
      if (d.id) b.id = d.id;
      b.addEventListener('click', d.fn);
      row.appendChild(b); out[d.key || d.label] = b;
    });
    box.appendChild(row);
    return out;
  }

  /* ---------------------------------------------------------- status / panel */
  function setNotice(msg) {
    var n = $('mmPvNote');
    clearTimeout(noticeTimer);
    if (n) { n.textContent = msg || ''; n.hidden = !msg; }
    if (msg) { toast(msg); noticeTimer = setTimeout(function () { if (n) { n.textContent = ''; n.hidden = true; } }, 6000); }
  }

  function renderStatus() {
    var st = $('mmStatus'), d = M.data, s = M.settings.src;
    var txt, err = false;
    if (M.error) { txt = M.error; err = true; }
    else if (d && d.kind === 'xlsx') txt = d.name + ' \u00b7 ' + (M.sheets.length > 1 ? '' : 'sheet ' + d.sheet + ' \u00b7 ') + plural(d.rows.length, 'row');
    else if (d) txt = d.name + ' \u00b7 ' + plural(d.rows.length, 'row') + ' \u00b7 ' + (DELIMS[d.delimiter] || 'delimiter');
    else if (s) txt = 'Last file: ' + s.name + ' \u2014 press Refresh' + (s.kind === 'drive' ? '' : ' or choose it again');
    else txt = 'No file chosen';
    st.textContent = txt;
    st.title = txt;
    st.classList.toggle('mm-err', err);
    $('mmChanged').hidden = !M.changed;
    $('mmRefreshBtn').disabled = !(M.source || s);
    var n = M.count(), has = !!(d && n);
    $('mmFieldsBtn').disabled = !d;
    $('mmPreviewBtn').disabled = !has;
    $('mmExportBtn').disabled = !has;
    $('mmPrevBtn').disabled = !has || !U.previewOn || M.row <= 0;
    $('mmNextBtn').disabled = !has || !U.previewOn || M.row >= n - 1;
    $('mmCounter').textContent = has ? 'Row ' + (M.row + 1) + ' of ' + n : 'Row \u2013';
    var dl = $('mmDelim'), xl = !!(d && d.kind === 'xlsx') || (!d && M.sheets.length > 0);
    if (dl.value !== M.settings.delim) dl.value = M.settings.delim;
    dl.hidden = xl;   /* the delimiter only means something for CSV */
    renderSheetPick();
  }

  /* Sheet picker: only for workbooks with more than one sheet */
  function renderSheetPick() {
    var sel = $('mmSheetPick'), names = M.sheets, cur = (M.data && M.data.sheet) || M.settings.sheet || names[0] || '';
    var sig = names.join('\u0001');
    sel.hidden = names.length < 2;
    if (sel.getAttribute('data-sig') !== sig) {
      sel.textContent = '';
      names.forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
      sel.setAttribute('data-sig', sig);
    }
    if (names.indexOf(cur) >= 0 && sel.value !== cur) sel.value = cur;
  }

  /* ---------------------------------------------------------- fields list */
  function renderFields() {
    var menu = $('mmFieldsMenu');
    menu.textContent = '';
    if (!M.data) { menu.appendChild(h('div', 'mm-empty', 'Choose a CSV or Excel file first.')); return; }
    M.fieldNames().forEach(function (name) {
      var b = h('button', 'recent-item mm-field', name);
      b.type = 'button'; b.setAttribute('role', 'menuitem');
      b.addEventListener('click', function () { insertField(name); });
      menu.appendChild(b);
    });
    var sep = h('div', 'file-sep');
    menu.appendChild(sep);
    var rn = h('button', 'recent-item mm-field', '# \u2014 row number');
    rn.type = 'button'; rn.setAttribute('role', 'menuitem');
    rn.addEventListener('click', function () { insertField(M.rowToken); });
    menu.appendChild(rn);
  }

  function insertField(name) {
    var ed = Draftly.editor && (Draftly.editor.activeEditor || document.querySelector('.' + Draftly.config.editorClass));
    if (Draftly.view) Draftly.view.closePops();
    if (U.previewOn) setPreview(false);
    if (!ed) return;
    try { ed.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    Draftly.editor.restoreSelection();
    document.execCommand('insertText', false, '{{' + name + '}}');
    if (Draftly.pages && Draftly.pages.checkPagination) Draftly.pages.checkPagination();
    scheduleScan();
  }

  /* ---------------------------------------------------------- placeholders: highlight + warnings */
  var haveHighlights = !!(window.CSS && CSS.highlights && window.Highlight);
  function scheduleScan() { clearTimeout(scanTimer); scanTimer = setTimeout(scan, 300); }

  function scan() {
    var found = [], map = M.index();
    if (haveHighlights) {
      var known = [], unknown = [];
      if (M.data) {
        var eds = document.querySelectorAll('.' + Draftly.config.editorClass);
        var re = /\{\{\s*([^{}]*?)\s*\}\}/g;
        Array.prototype.forEach.call(eds, function (ed) {
          var w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, null), n, m;
          while ((n = w.nextNode())) {
            if (n.nodeValue.indexOf('{{') === -1) continue;
            re.lastIndex = 0;
            while ((m = re.exec(n.nodeValue))) {
              var k = Draftly.csv.key(m[1]);
              var ok = Object.prototype.hasOwnProperty.call(map, k) || k === M.rowToken;
              var r = document.createRange();
              r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
              (ok ? known : unknown).push(r);
            }
          }
        });
      }
      CSS.highlights.delete('mm-known'); CSS.highlights.delete('mm-unknown');
      if (known.length) CSS.highlights.set('mm-known', new Highlight(...known));
      if (unknown.length) CSS.highlights.set('mm-unknown', new Highlight(...unknown));
    }
    if (M.data) found = M.scanDocument().filter(function (f) { return !f.known; });
    U.unknown = found.map(function (f) { return f.name || '(empty)'; });
    renderWarn();
  }

  function warnings() {
    var out = [];
    (U.unknown || []).forEach(function (n) {
      out.push({ unknown: true, text: '{{' + n + '}} is not a column of ' + (M.data ? M.data.name : 'the data file') });
    });
    if (M.data) {
      M.data.warnings.forEach(function (w) { out.push({ text: w }); });
      if (M.data.note) out.push({ text: M.data.note });
    }
    return out;
  }
  function renderWarn() {
    var w = warnings(), btn = $('mmWarnBtn'), menu = $('mmWarnMenu');
    btn.hidden = !w.length;
    btn.classList.toggle('mm-warn-unknown', !!(U.unknown && U.unknown.length));
    $('mmWarnLabel').textContent = plural(w.length, 'warning');
    menu.textContent = '';
    w.forEach(function (x) { menu.appendChild(h('div', 'mm-warn-item' + (x.unknown ? ' mm-warn-unknown-item' : ''), x.text)); });
    if (U.unknown && U.unknown.length) menu.appendChild(h('div', 'mm-warn-hint', 'Unknown fields stay as typed in the merged documents. Check the spelling against the Fields list.'));
    if (!w.length && Draftly.view && !menu.hidden) Draftly.view.closePops();
  }

  /* ---------------------------------------------------------- data events */
  M.onChange(function (what) {
    if (what === 'data') {
      renderFields(); scan();
      if (U.previewOn) renderPreview();
    }
    if (what === 'row' && U.previewOn) renderPreview();
    renderStatus();
  });

  /* ---------------------------------------------------------- choose file */
  function useSource(src) {
    return M.setSource(src).then(function (r) {
      if (r && r.error) toast(r.error);
      return r;
    });
  }

  function pickFromComputer() {
    if (typeof window.showOpenFilePicker === 'function') {
      return window.showOpenFilePicker({ multiple: false,
        types: [{ description: 'CSV or Excel', accept: { 'text/csv': ['.csv', '.tsv', '.txt'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm'] } }] })
        .then(function (hs) { return hs[0] ? useSource(M.sourceFromHandle(hs[0])) : null; })
        .catch(function (e) {
          if (e && e.name === 'AbortError') return null;
          return viaInput();
        });
    }
    return viaInput();
  }
  function viaInput() {
    var inp = $('mmFile');
    inp.value = '';
    inp.click();
    return Promise.resolve();
  }

  function openChooser() {
    var m = modal('Choose a CSV or Excel file', true);
    var crumb = h('div', 'mm-crumb');
    var list = h('div', 'mm-files');
    var msg = h('div', 'dlg-message mm-pick-msg');
    m.box.appendChild(msg); m.box.appendChild(crumb); m.box.appendChild(list);
    var state = { drive: null, driveName: '', path: [] };

    function note(t) { msg.textContent = t || ''; msg.hidden = !t; }
    function row(label, kind, fn, sub) {
      var b = h('button', 'mm-file-row mm-' + kind);
      b.type = 'button';
      b.appendChild(h('span', 'mm-file-ico', kind === 'dir' ? '\ud83d\udcc1' : kind === 'drive' ? '\ud83d\udcbe' : '\ud83d\udcc4'));
      b.appendChild(h('span', 'mm-file-name', label));
      if (sub) b.appendChild(h('span', 'mm-file-sub', sub));
      b.addEventListener('click', fn);
      list.appendChild(b);
      return b;
    }
    function renderCrumb() {
      crumb.textContent = '';
      if (!state.drive) return;
      var home = h('button', 'mm-crumb-btn', 'Drives'); home.type = 'button';
      home.addEventListener('click', function () { state.drive = null; state.path = []; showDrives(); });
      crumb.appendChild(home);
      var parts = [state.driveName].concat(state.path);
      parts.forEach(function (p, i) {
        crumb.appendChild(h('span', 'mm-crumb-sep', '\u203a'));
        var b = h('button', 'mm-crumb-btn', p); b.type = 'button';
        b.addEventListener('click', function () { state.path = state.path.slice(0, i); showDir(); });
        crumb.appendChild(b);
      });
    }

    function showDrives() {
      list.textContent = ''; renderCrumb(); note('');
      if (!window.FsDrives) { note('Hub drives are not available in this window. Use \u201cBrowse this computer\u201d.'); return; }
      FsDrives.list().then(function (drives) {
        if (!drives.length) note('No drives yet. Mount a folder in the Hub drive (Files app), or use \u201cBrowse this computer\u201d.');
        else note('Pick a drive, then the CSV or Excel file. A folder you mounted in the Hub appears here.');
        drives.forEach(function (d) {
          row(d.name, 'drive', function () { enterDrive(d); }, d.kind === 'folder' ? 'folder' : d.kind === 'local' ? 'browser storage' : '');
        });
      }).catch(function (e) { note('Could not list the drives: ' + ((e && e.message) || e)); });
    }
    function enterDrive(d) {
      FsDrives.access(d.id).then(function (a) {
        if (a === 'granted') { state.drive = d.id; state.driveName = d.name; state.path = []; showDir(); return; }
        list.textContent = ''; renderCrumb();
        note('\u201c' + d.name + '\u201d needs your permission again after a reload.');
        var b = h('button', 'dlg-btn dlg-ok mm-allow', 'Allow access');
        b.type = 'button';
        b.addEventListener('click', function () {
          FsDrives.allow(d.id).then(function (ok) { if (ok) enterDrive(d); else note('Access was not granted.'); });
        });
        list.appendChild(b);
      });
    }
    function dirHandle() {
      return FsDrives.handle(state.drive).then(function (root) {
        var p = Promise.resolve(root);
        state.path.forEach(function (part) { p = p.then(function (d) { return d.getDirectoryHandle(part); }); });
        return p;
      });
    }
    function showDir() {
      list.textContent = ''; renderCrumb(); note('Loading\u2026');
      dirHandle().then(function (dir) { return FsOps.list(dir); }).then(function (items) {
        items.sort(function (a, b) { return (a.kind === b.kind ? 0 : a.kind === 'directory' ? -1 : 1) || a.name.localeCompare(b.name); });
        var shown = 0;
        list.textContent = '';
        items.forEach(function (it) {
          if (it.kind === 'directory') {
            shown++;
            row(it.name, 'dir', function () { state.path.push(it.name); showDir(); });
          } else if (isDataName(it.name)) {
            shown++;
            row(it.name, 'file', function () {
              var ref = { drive: state.drive, path: state.path.join('/'), name: it.name };
              m.close();
              useSource(M.sourceFromDrive(ref));
            }, it.size ? Math.max(1, Math.round(it.size / 1024)) + ' KB' : '');
          }
        });
        note(shown ? 'Pick a .csv or .xlsx file.' : 'No folders, CSV or Excel files here.');
      }).catch(function (e) { note('Could not open this folder: ' + ((e && e.message) || e)); });
    }

    var btns = buttons(m.box, [
      { label: 'Browse this computer\u2026', key: 'browse', fn: function () { m.close(); pickFromComputer(); } },
      { label: 'Cancel', key: 'cancel', fn: function () { m.close(); } }
    ]);
    btns.browse.title = 'Fallback: pick a CSV or Excel file with the system file dialog';
    showDrives();
    return m;
  }

  /* ---------------------------------------------------------- refresh / live polling */
  function doRefresh(auto) {
    var p;
    if (!M.source && M.settings.src && M.settings.src.kind === 'drive') {
      M.source = M.sourceFromDrive(M.settings.src);
    }
    if (!M.source) { if (!auto) toast('Choose a CSV or Excel file first'); return Promise.resolve(); }
    var go = function () {
      return M.readSource({ keepRow: true }).then(function (r) {
        if (r && r.changed && !r.first && M.data) setNotice((M.data.kind === 'xlsx' ? 'Excel file' : 'CSV') + ' updated: ' + plural(M.data.rows.length, 'row') + ', ' + plural(M.data.header.length, 'field'));
        else if (!auto && r && !r.error && !r.changed) toast((M.data && M.data.kind === 'xlsx' ? 'Excel file' : 'CSV') + ' is up to date');
        renderStatus();
        return r;
      });
    };
    if (!auto && M.errorCode === 'access' && M.source.kind === 'drive' && window.FsDrives) {
      p = FsDrives.allow(M.source.drive).then(function () { return go(); });
    } else p = go();
    return p;
  }

  function tick() {
    if (polling || !M.source || document.hidden) return;
    polling = true;
    M.poll().then(function (ch) {
      if (ch && U.previewOn) return doRefresh(true);
    }).catch(function () { /* next tick */ }).then(function () { polling = false; renderStatus(); });
  }
  function startPolling() { if (!pollTimer) pollTimer = setInterval(tick, M.pollMs); }

  /* ---------------------------------------------------------- preview */
  function placePreview() {
    var ws = $('workspace'), pv = $('mmPreview');
    if (!ws || pv.hidden) return;
    var r = ws.getBoundingClientRect();
    pv.style.top = r.top + 'px'; pv.style.left = r.left + 'px';
    pv.style.width = r.width + 'px'; pv.style.height = r.height + 'px';
    var sheet = $('mmSheet');
    sheet.style.zoom = '';
    var avail = r.width - 48, w = sheet.offsetWidth;
    if (w > avail && avail > 120) sheet.style.zoom = String(avail / w);
  }

  function hfLine(slots) {
    if (!slots || !slots.join('').trim()) return null;
    var map = M.index(), line = h('div', 'mm-hf');
    slots.forEach(function (t) {
      var txt = M.mergeText(t, M.row, map).replace(/\{date\}/g, Draftly.hf.today ? Draftly.hf.today() : '');
      line.appendChild(h('span', null, txt));
    });
    return line;
  }

  function renderPreview() {
    var doc = $('mmDoc'), sheet = $('mmSheet');
    if (!doc) return;
    var has = M.data && M.count();
    var head = $('mmHfHead'), foot = $('mmHfFoot');
    head.textContent = ''; foot.textContent = '';
    if (!has) {
      doc.textContent = 'This file has no data rows yet.';
    } else {
      doc.innerHTML = M.mergeHtml(pvBase, M.row, { mark: true });   /* values are text nodes: never markup */
      if (Draftly.hf && Draftly.hf.data) {
        var a = hfLine(Draftly.hf.data.head), b = hfLine(Draftly.hf.data.foot);
        if (a) head.appendChild(a);
        if (b) foot.appendChild(b);
      }
    }
    var pb = doc.querySelectorAll('.dr-pagebreak');
    for (var i = 0; i < pb.length; i++) pb[i].setAttribute('data-label', 'Page break');
    sheet.setAttribute('aria-label', 'Preview of row ' + (M.row + 1));
    placePreview();
    renderStatus();
  }

  function setPreview(on) {
    var pv = $('mmPreview'), ws = $('workspace'), btn = $('mmPreviewBtn');
    if (on === U.previewOn) return;
    if (on) {
      if (!M.data || !M.count()) { toast('Choose a file with data rows first'); return; }
      if (Draftly.editor) Draftly.editor.saveSelection();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      pvBase = M.docHtml();
      U.previewOn = true;
      pv.hidden = false;
      ws.inert = true;
      document.body.classList.add('mm-previewing');
      renderPreview();
      tick();
    } else {
      U.previewOn = false;
      pv.hidden = true;
      ws.inert = false;
      document.body.classList.remove('mm-previewing');
      setNotice('');
      pvBase = '';
      $('mmDoc').textContent = '';
    }
    btn.classList.toggle('active', U.previewOn);
    btn.setAttribute('aria-pressed', U.previewOn ? 'true' : 'false');
    renderStatus();
  }

  /* ---------------------------------------------------------- Export all */
  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function exportDialog() {
    if (!M.data || !M.count()) { toast('Choose a file with data rows first'); return; }
    if (U.previewOn) setPreview(false);
    scan();
    var n = M.count(), tooMany = n > M.maxRowsExport;
    var m = modal('Export all', true);
    m.box.appendChild(h('div', 'dlg-message', plural(n, 'document') + ' from ' + M.data.name + ', as DOCX.'));
    var fmt = M.settings.fmt === 'combined' ? 'combined' : 'zip';
    var radios = h('div', 'mm-radios');
    function radio(value, label, hint) {
      var l = h('label', 'mm-radio');
      var i = h('input'); i.type = 'radio'; i.name = 'mmFmt'; i.value = value; i.checked = fmt === value;
      i.addEventListener('change', function () { fmt = value; sync(); });
      var t = h('span'); t.appendChild(h('strong', null, label)); t.appendChild(h('span', 'mm-radio-hint', hint));
      l.appendChild(i); l.appendChild(t);
      radios.appendChild(l);
    }
    radio('zip', 'Separate files (.zip)', 'One DOCX per row, named with the pattern below.');
    radio('combined', 'One combined file', 'One DOCX, a page break between rows. Header / footer fields are left blank.');
    m.box.appendChild(radios);
    var lab = h('label', 'dlg-label');
    lab.appendChild(h('span', null, 'File name pattern'));
    var pat = h('input', 'dlg-input'); pat.type = 'text'; pat.spellcheck = false; pat.id = 'mmPattern';
    pat.placeholder = docName() + '-{{#}}';
    pat.value = M.settings.pattern || '';
    lab.appendChild(pat);
    m.box.appendChild(lab);
    var ex = h('div', 'mm-example'); m.box.appendChild(ex);
    var unk = U.unknown || [];
    if (unk.length) m.box.appendChild(h('div', 'dlg-error mm-warn-line', 'Unknown fields stay as typed: ' + unk.map(function (u) { return '{{' + u + '}}'; }).join(', ')));
    if (tooMany) m.box.appendChild(h('div', 'dlg-error', 'Too many rows (' + n + '). The limit is ' + M.maxRowsExport + ': split the data file.'));
    else if (n > M.confirmRows) m.box.appendChild(h('div', 'dlg-message mm-big', n + ' documents will take a while. You can cancel while it runs.'));
    function sync() {
      lab.hidden = fmt !== 'zip'; ex.hidden = fmt !== 'zip';
      var first = M.fileNames(pat.value, docName(), [0])[0];
      var last = n > 1 ? M.fileNames(pat.value, docName(), [n - 1])[0] : '';
      ex.textContent = 'e.g. ' + first + '.docx' + (last ? ', \u2026, ' + last + '.docx' : '');
    }
    pat.addEventListener('input', sync);
    var b = buttons(m.box, [
      { label: 'Cancel', key: 'cancel', fn: function () { m.close(); } },
      { label: 'Export', key: 'go', ok: true, id: 'mmExportGo', fn: function () {
        M.settings.pattern = pat.value.trim(); M.settings.fmt = fmt; M.saveSettings();
        m.close();
        runExport(fmt, M.settings.pattern);
      } }
    ]);
    if (tooMany) b.go.disabled = true;
    sync();
    (fmt === 'zip' ? pat : b.go).focus();
  }

  function runExport(fmt, pattern) {
    var X = Draftly.export, n = M.count(), map = M.index();
    var base = M.docHtml(), name = docName();
    var names = fmt === 'zip' ? M.fileNames(pattern, name) : null;
    var hfOn = Draftly.hf && !Draftly.hf.isEmpty();
    var pm = modal('Exporting\u2026', false);
    pm.sticky = true;
    var bar = h('progress', 'mm-progress'); bar.max = n; bar.value = 0;
    var label = h('div', 'dlg-message', '0 of ' + n);
    pm.box.appendChild(label); pm.box.appendChild(bar);
    var cancelled = false, finished = false;
    buttons(pm.box, [{ label: 'Cancel', fn: function () { cancelled = true; } }]);
    pm.onClose = function () { if (!finished) cancelled = true; };
    var i = 0, entries = [], pieces = [];
    var PB = '<br clear="all" style="page-break-before:always">';

    function hfFor(idx) {
      if (!hfOn) return null;
      var d = Draftly.hf.data;
      return { head: d.head.map(function (t) { return M.mergeText(t, idx, map); }), foot: d.foot.map(function (t) { return M.mergeText(t, idx, map); }) };
    }
    function fail(e) {
      finished = true; pm.close();
      console.warn('draftly merge export:', e);
      toast('Export failed: ' + ((e && e.message) || e));
    }
    function finish() {
      finished = true;
      var out, fname;
      try {
        if (fmt === 'zip') { out = Draftly.zip.build(entries); fname = M.cleanName(name, 'merge') + ' (merged).zip'; }
        else {
          var hf = hfOn ? { head: Draftly.hf.data.head.map(function (t) { return M.mergeText(t, null, map); }),
                            foot: Draftly.hf.data.foot.map(function (t) { return M.mergeText(t, null, map); }) } : null;
          out = X.makeDocxBlob(pieces.join(PB), hf); fname = M.cleanName(name, 'merge') + ' (merged).docx';
        }
      } catch (e) { fail(e); return; }
      pm.close();
      download(out, fname);
      toast('Exported ' + plural(n, 'document') + ' to ' + fname);
    }
    function next() {
      if (cancelled) { finished = true; pm.close(); toast('Export cancelled'); return; }
      if (i >= n) { finish(); return; }
      var idx = i++;
      try {
        var body = X.docxHtml(M.mergeHtml(base, idx));
        if (fmt === 'combined') { pieces.push(body); step(); return; }
        var blob = X.makeDocxBlob(body, hfFor(idx));
        blob.arrayBuffer().then(function (ab) {
          entries.push({ name: names[idx] + '.docx', data: new Uint8Array(ab) });
          step();
        }).catch(fail);
      } catch (e) { fail(e); }
    }
    function step() {
      bar.value = i; label.textContent = i + ' of ' + n;
      setTimeout(next, 0);   /* let the page repaint and take clicks between rows */
    }
    setTimeout(next, 30);
  }

  /* ---------------------------------------------------------- wiring */
  function bind() {
    if (!$('panelMerge')) return;
    $('mmChooseBtn').addEventListener('click', openChooser);
    $('mmRefreshBtn').addEventListener('click', function () { doRefresh(false); });
    $('mmDelim').addEventListener('change', function () {
      M.settings.delim = this.value; M.saveSettings();
      if (M.source) M.readSource({ force: true, keepRow: true });
    });
    $('mmSheetPick').addEventListener('change', function () {
      var v = this.value;
      M.setSheet(v).then(function (r) {
        if (r && r.error) toast(r.error);
        else if (M.data) setNotice('Sheet "' + M.data.sheet + '": ' + plural(M.data.rows.length, 'row') + ', ' + plural(M.data.header.length, 'field'));
        renderStatus();
      });
    });
    $('mmFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (f) useSource(M.sourceFromFile(f));
    });
    $('mmFieldsBtn').addEventListener('click', function () {
      if (Draftly.editor) Draftly.editor.saveSelection();
      Draftly.view.togglePop('mmFieldsMenu', 'mmFieldsBtn');
    });
    $('mmWarnBtn').addEventListener('click', function () { Draftly.view.togglePop('mmWarnMenu', 'mmWarnBtn'); });
    $('mmPreviewBtn').addEventListener('click', function () { setPreview(!U.previewOn); });
    $('mmPrevBtn').addEventListener('click', function () { M.setRow(M.row - 1); });
    $('mmNextBtn').addEventListener('click', function () { M.setRow(M.row + 1); });
    $('mmExportBtn').addEventListener('click', exportDialog);
    document.addEventListener('keydown', function (e) {
      if (!U.previewOn) return;
      if (e.key === 'Escape' && !document.querySelector('.mm-backdrop')) { e.preventDefault(); setPreview(false); }
    });
    window.addEventListener('resize', placePreview);

    /* leaving the Merge tab closes the preview (the editor would be hidden behind it) */
    var sel = Draftly.ribbon.selectTab;
    Draftly.ribbon.selectTab = function (name, focus) {
      if (name !== TAB && U.previewOn) setPreview(false);
      var r = sel.apply(this, arguments);
      if (name === TAB) scheduleScan();
      return r;
    };

    /* highlight + warnings follow the text */
    var pages = $('pages');
    if (pages && window.MutationObserver) {
      new MutationObserver(function () { if (M.data) scheduleScan(); })
        .observe(pages, { childList: true, characterData: true, subtree: true });
    }
    if (Draftly.hf && Draftly.hf.set) {   /* header / footer text counts for the warnings */
      var hset = Draftly.hf.set;
      Draftly.hf.set = function () { var r = hset.apply(this, arguments); scheduleScan(); return r; };
    }
    startPolling();
    renderFields(); renderWarn(); renderStatus();
    restore();
  }

  /* Reconnect to the last file (Hub drive), or take one handed over as #drive=…&path=…&file=… */
  function restore() {
    var ref = window.FsRef && FsRef.parse(location.hash);
    var src = null;
    if (ref && isDataName(ref.name)) src = ref;
    else if (M.settings.src && M.settings.src.kind === 'drive' && window.FsRef) src = M.settings.src;
    if (!src) return;
    M.setSource(M.sourceFromDrive(src), ref === src).then(function () { renderStatus(); });
  }

  U.setPreview = setPreview;
  U.refresh = doRefresh;
  U.scan = scan;
  U.tick = tick;
  U.runExport = runExport;
  bind();
})();
