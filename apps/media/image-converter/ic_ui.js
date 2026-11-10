/* Image Converter — ic_ui.js: add files, convert one at a time, list, zip, settings. CI1 */
(function (root) {
  'use strict';

  var RELEASE = 'CI1';
  var H = root.ICHelpers;
  var Zip = root.ICZip;
  var Theme = root.ICTheme;
  var Dlg = root.ICDlg;
  var Conv = root.ICConvert;

  var items = [];
  var selectedId = null;
  var previewUrl = null;
  var busy = false;
  var cancelled = false;
  var stale = false;
  var heicWarned = false;
  var avifOk = false;

  function $(id) { return document.getElementById(id); }

  function defaultSettings() {
    return {
      format: 'jpeg',
      resize: 'none',
      longest: 1920,
      percent: 100,
      width: 1920,
      height: 1080,
      keepAspect: true,
      noEnlarge: true,
      quality: 80,
      useTarget: false,
      targetKb: 100,
      pattern: '{name}_{n}'
    };
  }

  function loadSettings() {
    var d = defaultSettings();
    var s = Theme && Theme.loadStore ? Theme.loadStore() : {};
    if (!s || typeof s !== 'object') return d;
    if (s.format === 'jpeg' || s.format === 'png' || s.format === 'webp' || s.format === 'avif') d.format = s.format;
    if (s.resize === 'none' || s.resize === 'longest' || s.resize === 'percent' || s.resize === 'exact') d.resize = s.resize;
    if (Number(s.longest) > 0) d.longest = Math.round(Number(s.longest));
    if (Number(s.percent) > 0) d.percent = Math.round(Number(s.percent));
    if (Number(s.width) > 0) d.width = Math.round(Number(s.width));
    if (Number(s.height) > 0) d.height = Math.round(Number(s.height));
    if (typeof s.keepAspect === 'boolean') d.keepAspect = s.keepAspect;
    if (typeof s.noEnlarge === 'boolean') d.noEnlarge = s.noEnlarge;
    if (Number(s.quality) > 0) d.quality = Math.round(Number(s.quality));
    if (typeof s.useTarget === 'boolean') d.useTarget = s.useTarget;
    if (Number(s.targetKb) > 0) d.targetKb = Math.round(Number(s.targetKb));
    if (typeof s.pattern === 'string' && s.pattern.trim()) d.pattern = s.pattern;
    return d;
  }

  function persistSettings(cfg) {
    if (!Theme || !Theme.loadStore || !Theme.saveStore) return;
    var s = Theme.loadStore();
    s.format = cfg.format;
    s.resize = cfg.resize;
    s.longest = cfg.longest;
    s.percent = cfg.percent;
    s.width = cfg.width;
    s.height = cfg.height;
    s.keepAspect = cfg.keepAspect;
    s.noEnlarge = cfg.noEnlarge;
    s.quality = cfg.quality;
    s.useTarget = cfg.useTarget;
    s.targetKb = cfg.targetKb;
    s.pattern = cfg.pattern;
    Theme.saveStore(s);
  }

  function readSettings() {
    var cfg = {
      format: currentSeg('formatSeg', 'jpeg'),
      resize: currentSeg('resizeSeg', 'none'),
      longest: numVal('longestIn', 1920),
      percent: numVal('percentIn', 100),
      width: numVal('widthIn', 1920),
      height: numVal('heightIn', 1080),
      keepAspect: $('keepAspect') ? $('keepAspect').checked : true,
      noEnlarge: $('noEnlarge') ? $('noEnlarge').checked : true,
      quality: numVal('qualityIn', 80),
      useTarget: $('useTarget') ? $('useTarget').checked : false,
      targetKb: numVal('targetKb', 100),
      pattern: ($('patternIn') && $('patternIn').value.trim()) || '{name}_{n}'
    };
    if (cfg.format === 'avif' && !avifOk) cfg.format = 'jpeg';
    return cfg;
  }

  function numVal(id, fallback) {
    var el = $(id);
    var n = el ? Number(el.value) : fallback;
    return isFinite(n) ? n : fallback;
  }

  function currentSeg(id, fallback) {
    var on = $(id) && $(id).querySelector('button.on');
    return (on && on.getAttribute('data-v')) || fallback;
  }

  function setSeg(id, value) {
    var box = $(id);
    if (!box) return;
    var buttons = box.querySelectorAll('button[data-v]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('on', buttons[i].getAttribute('data-v') === value);
    }
  }

  function writeSettings(cfg) {
    setSeg('formatSeg', cfg.format);
    setSeg('resizeSeg', cfg.resize);
    if ($('longestIn')) $('longestIn').value = cfg.longest;
    if ($('percentIn')) $('percentIn').value = cfg.percent;
    if ($('widthIn')) $('widthIn').value = cfg.width;
    if ($('heightIn')) $('heightIn').value = cfg.height;
    if ($('keepAspect')) $('keepAspect').checked = cfg.keepAspect;
    if ($('noEnlarge')) $('noEnlarge').checked = cfg.noEnlarge;
    if ($('qualityIn')) $('qualityIn').value = cfg.quality;
    if ($('qualityVal')) $('qualityVal').textContent = String(cfg.quality);
    if ($('useTarget')) $('useTarget').checked = cfg.useTarget;
    if ($('targetKb')) $('targetKb').value = cfg.targetKb;
    if ($('patternIn')) $('patternIn').value = cfg.pattern;
    syncSettingVisibility();
  }

  function syncSettingVisibility() {
    var cfg = readSettings();
    var showQ = cfg.format !== 'png';
    if ($('qualityRow')) $('qualityRow').dataset.hidden = showQ ? '' : '1';
    if ($('targetRow')) $('targetRow').dataset.hidden = showQ ? '' : '1';
    var mode = cfg.resize;
    if ($('longestRow')) $('longestRow').dataset.hidden = mode === 'longest' ? '' : '1';
    if ($('percentRow')) $('percentRow').dataset.hidden = mode === 'percent' ? '' : '1';
    if ($('exactRow')) $('exactRow').dataset.hidden = mode === 'exact' ? '' : '1';
    if ($('ratioRow')) $('ratioRow').dataset.hidden = mode === 'none' ? '1' : '';
  }

  function markStale() {
    if (!items.some(function (it) { return it.outBlob; })) return;
    stale = true;
    renderList();
    renderStatus();
  }

  function settingsChanged() {
    persistSettings(readSettings());
    if ($('qualityVal') && $('qualityIn')) $('qualityVal').textContent = String($('qualityIn').value);
    syncSettingVisibility();
    markStale();
  }

  function dropOut(item) {
    if (!item) return;
    item.outBlob = null;
    item.outName = '';
    item.outSize = 0;
    item.outW = 0;
    item.outH = 0;
    item.qualityUsed = null;
    item.overTarget = false;
    if (item.status === 'done' || item.status === 'error') item.status = 'ready';
    item.error = '';
  }

  function addFiles(fileList) {
    var list = Array.prototype.slice.call(fileList || []);
    var added = 0;
    var skippedHeic = 0;
    var skippedOther = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f) continue;
      var name = f.name || '';
      if (name.charAt(0) === '.' || name === 'Thumbs.db' || name === 'desktop.ini') continue;
      if (H.isHeicFile(f)) { skippedHeic += 1; continue; }
      if (!H.isImageFile(f)) { skippedOther += 1; continue; }
      items.push({
        id: H.uid(),
        file: f,
        name: H.basename(name || ('photo-' + (items.length + 1))),
        size: f.size || 0,
        status: 'ready',
        outBlob: null,
        outName: '',
        outSize: 0,
        outW: 0,
        outH: 0,
        qualityUsed: null,
        overTarget: false,
        error: ''
      });
      added += 1;
    }
    if (added && !selectedId && items.length) selectedId = items[0].id;
    renderAll();
    if (skippedHeic && !heicWarned) {
      heicWarned = true;
      Dlg.message(
        'HEIC not supported',
        'iPhone HEIC photos are not opened in this release, because that needs a heavy library of about 1.5 MB. Convert them to JPG on the phone first, or use PNG or WebP.'
      );
    } else if (skippedHeic) {
      Dlg.message('HEIC not supported', skippedHeic + ' HEIC photo(s) were skipped.');
    }
    if (!added && !skippedHeic && skippedOther) {
      Dlg.message('No photos added', 'Drop JPG, PNG, WebP or another common image format.');
    }
    return added;
  }

  function removeItem(id) {
    items = items.filter(function (it) { return it.id !== id; });
    if (selectedId === id) selectedId = items[0] ? items[0].id : null;
    renderAll();
  }

  function clearList() {
    if (!items.length) return;
    Dlg.open({
      title: 'Clear the list?',
      text: 'Converted files in this list will be removed from memory. The originals on your device are not deleted.',
      actions: [
        { label: 'Cancel', cls: 'secondary-btn' },
        { label: 'Clear', cls: 'primary-btn', fn: function () {
          items = [];
          selectedId = null;
          stale = false;
          renderAll();
        } }
      ]
    });
  }

  function findItem(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function outNameFor(item, index, total, cfg) {
    return H.applyPattern(cfg.pattern, item.name, index, total, H.extOfFormat(cfg.format));
  }

  async function convertOne(item, cfg, index, total) {
    item.status = 'working';
    item.error = '';
    renderList();
    try {
      var result = await Conv.processFile(item.file, cfg);
      item.outBlob = result.blob;
      item.outSize = result.size;
      item.outW = result.width;
      item.outH = result.height;
      item.qualityUsed = result.qualityUsed;
      item.overTarget = result.overTarget;
      item.outName = outNameFor(item, index, total, cfg);
      item.status = 'done';
    } catch (err) {
      dropOut(item);
      item.status = 'error';
      item.error = (err && err.message) ? err.message : 'Could not convert this photo';
    }
  }

  async function convertAll() {
    if (busy) return;
    if (!items.length) {
      Dlg.message('Nothing to convert', 'Add photos first, or drop them onto the page.');
      return;
    }
    var cfg = readSettings();
    persistSettings(cfg);
    busy = true;
    cancelled = false;
    stale = false;
    var prog = Dlg.progress({
      title: 'Converting',
      note: 'One photo at a time.',
      onCancel: function () { cancelled = true; }
    });
    var total = items.length;
    var names = [];
    for (var n = 0; n < total; n++) names.push(outNameFor(items[n], n + 1, total, cfg));
    names = H.uniqueNames(names);
    try {
      for (var i = 0; i < items.length; i++) {
        if (cancelled) break;
        prog.update((i / total) * 100, (i + 1) + ' of ' + total, items[i].name);
        items[i].outName = names[i];
        await convertOne(items[i], cfg, i + 1, total);
        items[i].outName = names[i];
        renderList();
        renderStatus();
        if (items[i].id === selectedId) renderPreview();
        /* Yield so the UI can paint on a slow machine. */
        await new Promise(function (r) { setTimeout(r, 0); });
      }
    } finally {
      busy = false;
      prog.close();
      renderAll();
    }
    if (cancelled) {
      Dlg.message('Stopped', 'Conversion was cancelled. Photos already done are still in the list.');
    }
  }

  async function ensureConverted(item) {
    var cfg = readSettings();
    if (item.outBlob && item.status === 'done' && !stale) return item;
    var idx = items.indexOf(item) + 1;
    await convertOne(item, cfg, idx, items.length);
    renderList();
    renderStatus();
    return item;
  }

  async function downloadOne(id) {
    var item = findItem(id);
    if (!item) return;
    try {
      if (busy) return;
      busy = true;
      await ensureConverted(item);
      busy = false;
      if (!item.outBlob) {
        Dlg.message('Could not convert', item.error || 'This photo could not be converted.');
        return;
      }
      Conv.downloadBlob(item.outBlob, item.outName || outNameFor(item, 1, 1, readSettings()));
    } catch (err) {
      busy = false;
      Dlg.message('Download failed', (err && err.message) || 'Could not download this file.');
    }
    renderAll();
  }

  async function downloadZip() {
    if (!items.length) {
      Dlg.message('Nothing to zip', 'Add photos first.');
      return;
    }
    if (busy) return;
    var cfg = readSettings();
    persistSettings(cfg);
    busy = true;
    cancelled = false;
    stale = false;
    var prog = Dlg.progress({
      title: 'Preparing zip',
      note: 'Converting any photos that are not ready yet.',
      onCancel: function () { cancelled = true; }
    });
    try {
      var total = items.length;
      var names = [];
      for (var n = 0; n < total; n++) names.push(outNameFor(items[n], n + 1, total, cfg));
      names = H.uniqueNames(names);
      var entries = [];
      for (var i = 0; i < items.length; i++) {
        if (cancelled) break;
        prog.update((i / total) * 80, 'Photo ' + (i + 1) + ' of ' + total, items[i].name);
        if (!items[i].outBlob || items[i].status !== 'done') {
          await convertOne(items[i], cfg, i + 1, total);
        }
        items[i].outName = names[i];
        if (items[i].outBlob) {
          var buf = new Uint8Array(await items[i].outBlob.arrayBuffer());
          entries.push({ name: names[i], data: buf });
        }
        renderList();
        renderStatus();
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      if (cancelled) {
        Dlg.message('Stopped', 'The zip was not created.');
        return;
      }
      if (!entries.length) {
        Dlg.message('Nothing to zip', 'No photos were converted successfully.');
        return;
      }
      prog.update(90, 'Writing zip…', entries.length + ' file(s)');
      var bytes = Zip.writeStoreZip(entries);
      var blob = new Blob([bytes], { type: 'application/zip' });
      prog.update(100, 'Done', '');
      Conv.downloadBlob(blob, 'images.zip');
    } catch (err) {
      Dlg.message('Zip failed', (err && err.message) || 'Could not build the zip.');
    } finally {
      busy = false;
      prog.close();
      renderAll();
    }
  }

  function setPreview(item) {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    var img = $('previewImg');
    var empty = $('previewEmpty');
    if (!item) {
      if (img) { img.hidden = true; img.removeAttribute('src'); }
      if (empty) empty.hidden = false;
      return;
    }
    var src = item.outBlob || item.file;
    if (!src) {
      if (img) { img.hidden = true; img.removeAttribute('src'); }
      if (empty) empty.hidden = false;
      return;
    }
    previewUrl = URL.createObjectURL(src);
    if (empty) empty.hidden = true;
    if (img) {
      img.hidden = false;
      img.alt = item.name;
      img.src = previewUrl;
    }
  }

  function renderPreview() {
    setPreview(findItem(selectedId));
  }

  function renderList() {
    var ul = $('fileList');
    var wrap = $('listWrap');
    var drop = $('dropZone');
    if (!ul) return;
    ul.textContent = '';
    if (!items.length) {
      if (wrap) wrap.classList.add('hidden');
      if (drop) drop.classList.remove('hidden');
      return;
    }
    if (wrap) wrap.classList.remove('hidden');
    if (drop) drop.classList.add('hidden');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var li = document.createElement('li');
        li.className = 'file-row' + (item.id === selectedId ? ' on' : '');
        li.setAttribute('data-id', item.id);
        var meta = document.createElement('div');
        meta.className = 'file-meta';
        var name = document.createElement('div');
        name.className = 'file-name';
        name.textContent = item.name;
        var sub = document.createElement('div');
        sub.className = 'file-sub';
        var a = document.createElement('span');
        a.textContent = H.formatBytes(item.size);
        sub.appendChild(a);
        if (item.status === 'done' && item.outBlob) {
          var b = document.createElement('span');
          b.textContent = '→ ' + H.formatBytes(item.outSize);
          if (item.outW) b.textContent += ' · ' + item.outW + '×' + item.outH;
          sub.appendChild(b);
          var s = document.createElement('span');
          s.className = item.overTarget ? 'warn' : (item.outSize <= item.size ? 'ok' : 'warn');
          s.textContent = H.savedLabel(item.size, item.outSize);
          if (item.overTarget) s.textContent += ' · still over target';
          sub.appendChild(s);
          if (stale) {
            var st = document.createElement('span');
            st.className = 'warn';
            st.textContent = 'settings changed';
            sub.appendChild(st);
          }
        } else if (item.status === 'working') {
          var w = document.createElement('span');
          w.textContent = 'Converting…';
          sub.appendChild(w);
        } else if (item.status === 'error') {
          var e = document.createElement('span');
          e.className = 'err';
          e.textContent = item.error || 'Failed';
          sub.appendChild(e);
        } else {
          var r = document.createElement('span');
          r.textContent = 'Ready';
          sub.appendChild(r);
        }
        meta.appendChild(name);
        meta.appendChild(sub);
        var acts = document.createElement('div');
        acts.className = 'file-acts';
        var dl = document.createElement('button');
        dl.type = 'button';
        dl.className = 'btn secondary-btn';
        dl.textContent = 'Download';
        dl.addEventListener('click', function (ev) {
          ev.stopPropagation();
          downloadOne(item.id);
        });
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn secondary-btn';
        rm.textContent = 'Remove';
        rm.addEventListener('click', function (ev) {
          ev.stopPropagation();
          removeItem(item.id);
        });
        acts.appendChild(dl);
        acts.appendChild(rm);
        li.appendChild(meta);
        li.appendChild(acts);
        li.addEventListener('click', function () {
          selectedId = item.id;
          renderList();
          renderPreview();
        });
        ul.appendChild(li);
      })(items[i]);
    }
  }

  function renderStatus() {
    var el = $('statusText');
    if (!el) return;
    if (!items.length) {
      el.textContent = 'No photos yet.';
      return;
    }
    var before = 0, after = 0, done = 0, err = 0;
    for (var i = 0; i < items.length; i++) {
      before += items[i].size || 0;
      if (items[i].status === 'done' && items[i].outBlob) {
        after += items[i].outSize || 0;
        done += 1;
      }
      if (items[i].status === 'error') err += 1;
    }
    var parts = [items.length + ' photo' + (items.length === 1 ? '' : 's')];
    if (done) {
      parts.push(H.formatBytes(before) + ' → ' + H.formatBytes(after));
      var saved = before - after;
      if (saved > 0) parts.push('saved ' + H.formatBytes(saved));
      else if (saved < 0) parts.push('grew ' + H.formatBytes(-saved));
    } else {
      parts.push(H.formatBytes(before) + ' original');
    }
    if (err) parts.push(err + ' failed');
    if (stale) parts.push('settings changed — convert again');
    el.textContent = parts.join(' · ');
  }

  function renderTheme() {
    var mode = Theme ? Theme.getMode() : 'auto';
    setSeg('themeSeg', mode);
  }

  function renderAll() {
    renderList();
    renderStatus();
    renderPreview();
    renderTheme();
    var has = items.length > 0;
    if ($('convertBtn')) $('convertBtn').disabled = !has || busy;
    if ($('zipBtn')) $('zipBtn').disabled = !has || busy;
    if ($('clearBtn')) $('clearBtn').disabled = !has || busy;
  }

  function helpHtml() {
    return '<p>Image Converter resizes, compresses and converts photos on this device. Nothing is uploaded.</p>' +
      '<ul>' +
      '<li>Add photos with the buttons, a folder, or drag and drop.</li>' +
      '<li>JPG, PNG and WebP. AVIF appears only if this browser can actually write it.</li>' +
      '<li>Resize by longest side, by percent, or to an exact size. Aspect ratio is kept unless you turn it off.</li>' +
      '<li>Set a quality, or a target such as under 100 KB. The app searches for a quality that fits.</li>' +
      '<li>Location and camera data are removed. Photos are turned the right way up.</li>' +
      '<li>Download one file, or all of them as a zip. The rename pattern uses {name}, {n} and {ext}.</li>' +
      '<li>Photos are converted one at a time so a large batch stays light on a 4 GB machine.</li>' +
      '<li>iPhone HEIC photos are not opened in this release.</li>' +
      '</ul>' +
      '<p class="hint">Release ' + RELEASE + '. Fully offline.</p>';
  }

  function bindSeg(id, onPick) {
    var box = $(id);
    if (!box) return;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (!b || b.hidden) return;
      var v = b.getAttribute('data-v');
      setSeg(id, v);
      if (onPick) onPick(v);
    });
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    $('dropZone') && $('dropZone').classList.remove('drag');
    var dt = e.dataTransfer;
    if (!dt) return;
    if (dt.files && dt.files.length) addFiles(dt.files);
  }

  function init() {
    writeSettings(loadSettings());
    renderAll();

    bindSeg('themeSeg', function (v) {
      if (Theme) Theme.setMode(v);
      renderTheme();
    });
    bindSeg('formatSeg', settingsChanged);
    bindSeg('resizeSeg', settingsChanged);

    ['longestIn', 'percentIn', 'widthIn', 'heightIn', 'qualityIn', 'targetKb', 'patternIn', 'keepAspect', 'noEnlarge', 'useTarget'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('change', settingsChanged);
      el.addEventListener('input', function () {
        if (id === 'qualityIn' && $('qualityVal')) $('qualityVal').textContent = String(el.value);
      });
    });

    if ($('addFilesBtn') && $('fileInput')) {
      $('addFilesBtn').addEventListener('click', function () { $('fileInput').click(); });
      $('fileInput').addEventListener('change', function () {
        addFiles($('fileInput').files);
        $('fileInput').value = '';
      });
    }
    if ($('addFolderBtn') && $('folderInput')) {
      $('addFolderBtn').addEventListener('click', function () { $('folderInput').click(); });
      $('folderInput').addEventListener('change', function () {
        addFiles($('folderInput').files);
        $('folderInput').value = '';
      });
    }
    if ($('convertBtn')) $('convertBtn').addEventListener('click', function () { convertAll(); });
    if ($('zipBtn')) $('zipBtn').addEventListener('click', function () { downloadZip(); });
    if ($('clearBtn')) $('clearBtn').addEventListener('click', clearList);
    if ($('helpBtn')) {
      $('helpBtn').addEventListener('click', function () {
        Dlg.open({
          title: 'Image Converter',
          html: helpHtml(),
          wide: true,
          actions: [{ label: 'OK', cls: 'primary-btn' }]
        });
      });
    }

    var drop = $('dropZone');
    var app = $('app');
    function prevent(e) { e.preventDefault(); e.stopPropagation(); }
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function (ev) {
      document.addEventListener(ev, prevent);
    });
    document.addEventListener('dragover', function (e) {
      if (drop) drop.classList.add('drag');
      e.dataTransfer && (e.dataTransfer.dropEffect = 'copy');
    });
    document.addEventListener('dragleave', function (e) {
      if (e.relatedTarget && app && app.contains(e.relatedTarget)) return;
      if (drop) drop.classList.remove('drag');
    });
    document.addEventListener('drop', onDrop);

    if (Conv && Conv.detectAvif) {
      Conv.detectAvif().then(function (ok) {
        avifOk = !!ok;
        if ($('avifBtn')) $('avifBtn').hidden = !avifOk;
        if (!avifOk && currentSeg('formatSeg', 'jpeg') === 'avif') {
          setSeg('formatSeg', 'jpeg');
          settingsChanged();
        }
      });
    }
  }

  root.ICUI = {
    RELEASE: RELEASE,
    init: init
  };
})(typeof window !== 'undefined' ? window : globalThis);
