/* Image Converter — ic_ui.js: convert, presets, edits, photo info, icon set. CI3 */
(function (root) {
  'use strict';

  var RELEASE = 'CI3';
  var H = root.ICHelpers;
  var Zip = root.ICZip;
  var Theme = root.ICTheme;
  var Dlg = root.ICDlg;
  var Conv = root.ICConvert;
  var Presets = root.ICPresets;
  var Edit = root.ICEdit;
  var Exif = root.ICExif;
  var Ico = root.ICIco;

  var items = [];
  var selectedId = null;
  var previewUrl = null;
  var previewBase = null;
  var previewItemId = null;
  var previewPaint = 0;
  var logoImage = null;
  var logoName = '';
  var busy = false;
  var cancelled = false;
  var stale = false;
  var heicWarned = false;
  var avifOk = false;
  var activePreset = '';
  var cropDrag = null;
  var gpsAck = false;

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
      pattern: '{name}_{n}',
      cropRatio: 'none',
      bg: '#ffffff',
      wmText: '',
      wmPosition: 'bottom-right',
      wmOpacity: 60,
      wmColor: '#ffffff',
      wmScale: 12,
      keepDate: false,
      keepCamera: false,
      keepGps: false
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
    if (typeof s.cropRatio === 'string' && s.cropRatio) d.cropRatio = s.cropRatio;
    if (typeof s.bg === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.bg)) d.bg = s.bg;
    if (typeof s.wmText === 'string') d.wmText = s.wmText;
    if (typeof s.wmPosition === 'string' && s.wmPosition) d.wmPosition = s.wmPosition;
    if (Number(s.wmOpacity) > 0) d.wmOpacity = Math.round(Number(s.wmOpacity));
    if (typeof s.wmColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.wmColor)) d.wmColor = s.wmColor;
    if (Number(s.wmScale) > 0) d.wmScale = Math.round(Number(s.wmScale));
    if (typeof s.keepDate === 'boolean') d.keepDate = s.keepDate;
    if (typeof s.keepCamera === 'boolean') d.keepCamera = s.keepCamera;
    if (typeof s.keepGps === 'boolean') d.keepGps = s.keepGps;
    if (typeof s.activePreset === 'string') activePreset = s.activePreset;
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
    s.cropRatio = cfg.cropRatio;
    s.bg = cfg.bg;
    s.wmText = cfg.wmText;
    s.wmPosition = cfg.wmPosition;
    s.wmOpacity = cfg.wmOpacity;
    s.wmColor = cfg.wmColor;
    s.wmScale = cfg.wmScale;
    s.keepDate = cfg.keepDate;
    s.keepCamera = cfg.keepCamera;
    s.keepGps = cfg.keepGps;
    s.activePreset = activePreset;
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
      pattern: ($('patternIn') && $('patternIn').value.trim()) || '{name}_{n}',
      cropRatio: currentSeg('cropSeg', 'none'),
      bg: ($('bgIn') && $('bgIn').value) || '#ffffff',
      wmText: ($('wmText') && $('wmText').value) || '',
      wmPosition: currentSeg('wmPosSeg', 'bottom-right'),
      wmOpacity: numVal('wmOpacity', 60),
      wmColor: ($('wmColor') && $('wmColor').value) || '#ffffff',
      wmScale: numVal('wmScale', 12),
      keepDate: $('keepDate') ? $('keepDate').checked : false,
      keepCamera: $('keepCamera') ? $('keepCamera').checked : false,
      keepGps: $('keepGps') ? $('keepGps').checked : false
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
    setSeg('cropSeg', cfg.cropRatio || 'none');
    if ($('bgIn')) $('bgIn').value = cfg.bg || '#ffffff';
    if ($('wmText')) $('wmText').value = cfg.wmText || '';
    setSeg('wmPosSeg', cfg.wmPosition || 'bottom-right');
    if ($('wmOpacity')) $('wmOpacity').value = cfg.wmOpacity;
    if ($('wmOpacityVal')) $('wmOpacityVal').textContent = String(cfg.wmOpacity) + '%';
    if ($('wmColor')) $('wmColor').value = cfg.wmColor || '#ffffff';
    if ($('wmScale')) $('wmScale').value = cfg.wmScale;
    if ($('wmScaleVal')) $('wmScaleVal').textContent = String(cfg.wmScale) + '%';
    if ($('keepDate')) $('keepDate').checked = !!cfg.keepDate;
    if ($('keepCamera')) $('keepCamera').checked = !!cfg.keepCamera;
    if ($('keepGps')) $('keepGps').checked = !!cfg.keepGps;
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

  function settingsChanged(opts) {
    opts = opts || {};
    if (!opts.keepPreset) activePreset = '';
    persistSettings(readSettings());
    if ($('qualityVal') && $('qualityIn')) $('qualityVal').textContent = String($('qualityIn').value);
    if ($('wmOpacityVal') && $('wmOpacity')) $('wmOpacityVal').textContent = String($('wmOpacity').value) + '%';
    if ($('wmScaleVal') && $('wmScale')) $('wmScaleVal').textContent = String($('wmScale').value) + '%';
    syncSettingVisibility();
    renderPresets();
    markStale();
    if (!opts.skipPreview) renderPreview();
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
        error: '',
        rotate: 0,
        flipH: false,
        flipV: false,
        crop: null,
        kind: kindOf(name),
        exifInfo: undefined
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
          dropPreviewBase();
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
      if (cfg.keepDate || cfg.keepCamera || cfg.keepGps) {
        await ensureExif(item);
      }
      var convSettings = itemSettings(item, cfg);
      convSettings.exifInfo = item.exifInfo || null;
      convSettings.exifKeep = {
        date: !!cfg.keepDate,
        camera: !!cfg.keepCamera,
        gps: !!cfg.keepGps
      };
      var result = await Conv.processFile(item.file, convSettings);
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

  function customPresets() {
    var s = Theme && Theme.loadStore ? Theme.loadStore() : {};
    return Presets ? Presets.sanitizeCustom(s.customPresets) : [];
  }

  function saveCustomPresets(list) {
    if (!Theme || !Theme.loadStore || !Theme.saveStore) return;
    var s = Theme.loadStore();
    s.customPresets = list;
    Theme.saveStore(s);
  }

  function allPresets() {
    var list = Presets ? Presets.builtinList() : [];
    return list.concat(customPresets());
  }

  function findPreset(id) {
    var list = allPresets();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function applyPreset(id) {
    var p = findPreset(id);
    if (!p) return;
    var cfg = Presets.applyTo(p, readSettings());
    activePreset = p.id;
    writeSettings(cfg);
    for (var i = 0; i < items.length; i++) items[i].crop = null;
    settingsChanged({ keepPreset: true });
  }

  function savePresetDialog() {
    Dlg.open({
      title: 'Save preset',
      html: '<p>Save the current format, resize, crop, background and watermark text as a preset on this device.</p>' +
        '<label for="presetNameIn">Name</label>' +
        '<input type="text" id="presetNameIn" maxlength="40" style="display:block;width:100%;min-height:36px;margin-top:6px;padding:0 8px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font:inherit">',
      actions: [
        { label: 'Cancel', cls: 'secondary-btn' },
        { label: 'Save', cls: 'primary-btn', fn: function () {
          var name = ($('presetNameIn') && $('presetNameIn').value.trim()) || '';
          if (!name) {
            Dlg.message('Name needed', 'Type a name for this preset.');
            return false;
          }
          var row = Presets.snapshotSettings(readSettings(), name);
          var list = customPresets();
          list.push(row);
          saveCustomPresets(list);
          activePreset = row.id;
          persistSettings(readSettings());
          renderPresets();
        } }
      ],
      onOpen: function () {
        var el = $('presetNameIn');
        if (el) el.focus();
      }
    });
  }

  function deletePresetDialog() {
    var p = findPreset(activePreset);
    if (!p) {
      Dlg.message('No preset selected', 'Tap a saved preset first. Built-in presets cannot be deleted.');
      return;
    }
    if (p.builtin) {
      Dlg.message('Built-in preset', 'WhatsApp, Instagram, Email, Passport photo and Signature cannot be deleted.');
      return;
    }
    Dlg.open({
      title: 'Delete preset?',
      text: 'Remove "' + p.name + '" from this device? This cannot be undone.',
      actions: [
        { label: 'Cancel', cls: 'secondary-btn' },
        { label: 'Delete', cls: 'primary-btn', fn: function () {
          saveCustomPresets(customPresets().filter(function (x) { return x.id !== p.id; }));
          activePreset = '';
          persistSettings(readSettings());
          renderPresets();
        } }
      ]
    });
  }

  function renderPresets() {
    var row = $('presetRow');
    if (!row) return;
    row.textContent = '';
    allPresets().forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset-chip' + (p.id === activePreset ? ' on' : '');
      b.textContent = p.name;
      b.setAttribute('data-id', p.id);
      b.addEventListener('click', function () { applyPreset(p.id); });
      row.appendChild(b);
    });
  }

  function itemSettings(item, cfg) {
    var s = Object.assign({}, cfg);
    if (item) {
      s.rotate = item.rotate || 0;
      s.flipH = !!item.flipH;
      s.flipV = !!item.flipV;
      s.crop = item.crop || null;
    }
    var text = (cfg.wmText || '').trim();
    if (text || logoImage) {
      s.watermark = {
        text: text,
        logo: logoImage,
        position: cfg.wmPosition || 'bottom-right',
        opacity: (Number(cfg.wmOpacity) || 60) / 100,
        color: cfg.wmColor || '#ffffff',
        scale: Number(cfg.wmScale) || 12
      };
    }
    return s;
  }

  function kindOf(name) {
    var ext = H.extOf(name);
    if (ext === 'svg') return 'svg';
    if (ext === 'gif') return 'gif';
    if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
    return ext || '';
  }

  async function ensureExif(item) {
    if (!item) return null;
    if (item.exifInfo !== undefined) return item.exifInfo;
    item.exifInfo = null;
    if (!Exif || !item.file) return null;
    try {
      var buf = new Uint8Array(await item.file.arrayBuffer());
      item.exifInfo = Exif.describe(buf);
    } catch (_) {
      item.exifInfo = null;
    }
    return item.exifInfo;
  }

  function esc(s) {
    return H.escapeHtml(s);
  }

  async function showInfo(id) {
    var item = findItem(id);
    if (!item) {
      Dlg.message('Select a photo', 'Tap a photo in the list first, then open Photo info.');
      return;
    }
    selectedId = item.id;
    renderList();
    var info = await ensureExif(item);
    var rows = '';
    function row(lab, val) {
      if (val == null || val === '') return;
      rows += '<tr><th>' + esc(lab) + '</th><td>' + esc(String(val)) + '</td></tr>';
    }
    rows += '<tr><th>File</th><td>' + esc(item.name) + ' · ' + esc(H.formatBytes(item.size)) + '</td></tr>';
    if (item.kind === 'gif') {
      rows += '<tr><th>Note</th><td>Animated GIFs: only the first frame is used.</td></tr>';
    }
    if (item.kind === 'svg') {
      rows += '<tr><th>Note</th><td>SVG is drawn as a bitmap at the size you choose.</td></tr>';
    }
    var warn = '';
    if (info) {
      row('Size', (info.width && info.height) ? (info.width + '×' + info.height) : '');
      row('Camera', info.camera);
      row('Date', info.date);
      if (info.hasGps && info.gps) {
        row('Location', info.gps.text);
        warn = '<p class="privacy-warn">This photo has a GPS location. It is stripped from the converted file unless you turn on “Keep location (GPS)”.</p>';
      } else {
        row('Location', 'None in this file');
      }
    } else {
      rows += '<tr><th>Info</th><td>No JPEG EXIF was found. PNG, WebP, SVG and GIF do not carry this camera and GPS block, and some JPEGs have already had it removed.</td></tr>';
    }
    rows += '<tr><th>Keep</th><td>When saving as JPG, only the date, camera name and GPS you tick are written back. Maker notes, lens data and thumbnails are not copied.</td></tr>';
    Dlg.open({
      title: 'Photo info',
      wide: true,
      html: warn + '<table class="info-table">' + rows + '</table>',
      actions: [
        { label: 'Copy data URL', cls: 'secondary-btn', fn: function () { copyDataUrl(item.id); return false; } },
        { label: 'OK', cls: 'primary-btn' }
      ]
    });
  }

  async function copyDataUrl(id) {
    var item = findItem(id);
    if (!item) {
      Dlg.message('Select a photo', 'Tap a photo in the list first.');
      return;
    }
    var src = item.outBlob || item.file;
    if (!src) {
      Dlg.message('Nothing to copy', 'This photo could not be read.');
      return;
    }
    try {
      var url = await Conv.blobToDataUrl(src);
      var copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch (_) { copied = false; }
      }
      if (copied) {
        Dlg.message('Copied', 'The data URL is on the clipboard. It starts with data:image/… and then Base64 bytes.');
        return;
      }
      Dlg.open({
        title: 'Data URL',
        wide: true,
        html: '<p>This browser blocked clipboard access. Select the text below and copy it yourself.</p>' +
          '<textarea id="dataUrlOut" readonly></textarea>',
        actions: [{ label: 'OK', cls: 'primary-btn' }],
        onOpen: function () {
          var ta = $('dataUrlOut');
          if (ta) {
            ta.value = url;
            ta.focus();
            ta.select();
          }
        }
      });
    } catch (err) {
      Dlg.message('Copy failed', (err && err.message) || 'Could not build a data URL.');
    }
  }

  function iconSetDialog() {
    var item = selectedItem();
    if (!item) {
      Dlg.message('Select a photo', 'Tap a photo in the list first, then make an icon set from it.');
      return;
    }
    var sizes = (Ico && Ico.DEFAULT_SIZES) ? Ico.DEFAULT_SIZES.slice() : [16, 32, 48, 64, 128, 256];
    var checks = sizes.map(function (s) {
      return '<label class="chk"><input type="checkbox" class="icon-size" value="' + s + '" checked> ' + s + ' px</label>';
    }).join('');
    Dlg.open({
      title: 'Icon set',
      wide: true,
      html: '<p>Make icons from “' + esc(item.name) + '”. Each size is a square PNG (the photo is fitted inside, with a transparent background). You can download an ICO that contains those PNGs, or a zip of the PNG files.</p>' +
        '<div class="size-checks">' + checks + '</div>' +
        '<p class="hint">SVG is drawn as a bitmap. A GIF uses its first frame. Current rotate, flip and crop are applied.</p>',
      actions: [
        { label: 'Cancel', cls: 'secondary-btn' },
        { label: 'Download ICO', cls: 'secondary-btn', fn: function () { buildIconSet(item, 'ico'); return false; } },
        { label: 'Download PNG zip', cls: 'primary-btn', fn: function () { buildIconSet(item, 'zip'); return false; } }
      ]
    });
  }

  function selectedIconSizes() {
    var boxes = document.querySelectorAll('.icon-size:checked');
    var out = [];
    for (var i = 0; i < boxes.length; i++) {
      var n = Number(boxes[i].value);
      if (n > 0) out.push(n);
    }
    return out;
  }

  async function buildIconSet(item, kind) {
    var sizes = selectedIconSizes();
    if (!sizes.length) {
      Dlg.message('Pick a size', 'Tick at least one icon size.');
      return;
    }
    if (busy) return;
    var cfg = readSettings();
    busy = true;
    cancelled = false;
    var prog = Dlg.progress({
      title: 'Making icons',
      note: item.name,
      onCancel: function () { cancelled = true; }
    });
    var work = null;
    try {
      work = await Conv.rasterize(item.file, itemSettings(item, cfg));
      var entries = [];
      for (var i = 0; i < sizes.length; i++) {
        if (cancelled) break;
        prog.update(((i + 1) / (sizes.length + 1)) * 100, sizes[i] + ' px', item.name);
        var blob = await Conv.pngAtSize(work, sizes[i], '');
        var data = new Uint8Array(await blob.arrayBuffer());
        entries.push({ width: sizes[i], height: sizes[i], data: data, name: 'icon-' + sizes[i] + '.png' });
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      if (cancelled) {
        Dlg.message('Stopped', 'The icon set was not created.');
        return;
      }
      if (!entries.length) {
        Dlg.message('Icon set failed', 'No icon sizes were created.');
        return;
      }
      var stem = H.stemOf(item.name) || 'icon';
      if (kind === 'zip') {
        var zip = Zip.writeStoreZip(entries.map(function (e) {
          return { name: e.name, data: e.data };
        }));
        Conv.downloadBlob(new Blob([zip], { type: 'application/zip' }), stem + '-icons.zip');
      } else {
        var ico = Ico.writeIco(entries);
        Conv.downloadBlob(new Blob([ico], { type: 'image/x-icon' }), stem + '.ico');
      }
    } catch (err) {
      Dlg.message('Icon set failed', (err && err.message) || 'Could not build the icons.');
    } finally {
      if (work && Conv.dropCanvas) Conv.dropCanvas(work);
      busy = false;
      prog.close();
      renderAll();
    }
  }

  function dropPreviewBase() {
    if (previewBase && Conv && Conv.dropCanvas) Conv.dropCanvas(previewBase);
    previewBase = null;
    previewItemId = null;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  function selectedItem() {
    return findItem(selectedId);
  }

  function editSelected(fn) {
    var item = selectedItem();
    if (!item) {
      Dlg.message('Select a photo', 'Tap a photo in the list first, then rotate, flip or crop it.');
      return;
    }
    fn(item);
    dropOut(item);
    stale = items.some(function (it) { return it.outBlob; });
    renderList();
    renderStatus();
    renderPreview();
  }

  function rotateSelected(dir) {
    editSelected(function (item) {
      item.rotate = ((item.rotate || 0) + dir + 360) % 360;
      item.crop = null;
    });
  }

  function flipSelected(axis) {
    editSelected(function (item) {
      if (axis === 'h') item.flipH = !item.flipH;
      else item.flipV = !item.flipV;
      item.crop = null;
    });
  }

  function resetSelectedEdits() {
    editSelected(function (item) {
      item.rotate = 0;
      item.flipH = false;
      item.flipV = false;
      item.crop = null;
    });
  }

  function onCropRatio() {
    for (var i = 0; i < items.length; i++) items[i].crop = null;
    settingsChanged();
  }

  function workSize(base, item) {
    if (!base) return { width: 0, height: 0 };
    if (Edit) return Edit.sizeAfterRotate(base.width, base.height, item && item.rotate);
    return { width: base.width, height: base.height };
  }

  function paintPreviewCanvas(base, item) {
    var canvas = $('previewCanvas');
    if (!canvas || !base) return;
    var rot = (item && item.rotate) || 0;
    var flipH = !!(item && item.flipH);
    var flipV = !!(item && item.flipV);
    var size = workSize(base, item);
    canvas.width = size.width;
    canvas.height = size.height;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(size.width / 2, size.height / 2);
    ctx.rotate((rot || 0) * Math.PI / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(base, -base.width / 2, -base.height / 2);
    ctx.restore();
  }

  function displayRect() {
    var canvas = $('previewCanvas');
    var stage = $('previewStage');
    if (!canvas || !stage) return null;
    var cr = canvas.getBoundingClientRect();
    var sr = stage.getBoundingClientRect();
    if (!cr.width || !cr.height) return null;
    return { x: cr.left - sr.left, y: cr.top - sr.top, w: cr.width, h: cr.height };
  }

  function currentPixelCrop(base, item, cfg) {
    if (!base || !Edit) return null;
    var size = workSize(base, item);
    return Edit.resolveCrop(size.width, size.height, {
      cropRatio: cfg.cropRatio,
      crop: item && item.crop
    });
  }

  function layoutCrop(base, item, cfg) {
    var layer = $('cropLayer');
    var rect = $('cropRect');
    if (!layer || !rect) return;
    var ratio = Edit && Edit.parseRatio(cfg.cropRatio);
    if (!ratio) {
      layer.classList.add('hidden');
      return;
    }
    var disp = displayRect();
    var crop = currentPixelCrop(base, item, cfg);
    if (!disp || !crop) {
      layer.classList.add('hidden');
      return;
    }
    var size = workSize(base, item);
    var sx = disp.w / size.width;
    var sy = disp.h / size.height;
    layer.classList.remove('hidden');
    rect.style.left = (disp.x + crop.x * sx) + 'px';
    rect.style.top = (disp.y + crop.y * sy) + 'px';
    rect.style.width = (crop.w * sx) + 'px';
    rect.style.height = (crop.h * sy) + 'px';
  }

  function storeCropFromRect(base, item, cfg) {
    var disp = displayRect();
    var rect = $('cropRect');
    if (!disp || !rect || !item || !Edit) return;
    var size = workSize(base, item);
    var sx = disp.w / size.width;
    var sy = disp.h / size.height;
    var px = {
      x: (parseFloat(rect.style.left) - disp.x) / sx,
      y: (parseFloat(rect.style.top) - disp.y) / sy,
      w: parseFloat(rect.style.width) / sx,
      h: parseFloat(rect.style.height) / sy
    };
    var ratio = Edit.parseRatio(cfg.cropRatio);
    var clamped = Edit.clampCrop(px, size.width, size.height, ratio);
    item.crop = Edit.cropToFrac(clamped, size.width, size.height);
    dropOut(item);
    stale = items.some(function (it) { return it.outBlob; });
  }

  function startCropDrag(e) {
    var item = selectedItem();
    if (!item || !previewBase) return;
    var handle = e.target.closest && e.target.closest('.crop-h');
    var rect = $('cropRect');
    if (!rect) return;
    var typ = handle ? handle.getAttribute('data-h') : 'move';
    var r = rect.getBoundingClientRect();
    var pt = e.touches ? e.touches[0] : e;
    cropDrag = {
      type: typ,
      startX: pt.clientX,
      startY: pt.clientY,
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      stage: $('previewStage').getBoundingClientRect()
    };
    e.preventDefault();
  }

  function moveCropDrag(e) {
    if (!cropDrag) return;
    var pt = e.touches ? e.touches[0] : e;
    var dx = pt.clientX - cropDrag.startX;
    var dy = pt.clientY - cropDrag.startY;
    var rect = $('cropRect');
    if (!rect) return;
    var sr = cropDrag.stage;
    var left = cropDrag.left - sr.left;
    var top = cropDrag.top - sr.top;
    var w = cropDrag.width;
    var h = cropDrag.height;
    var typ = cropDrag.type;
    if (typ === 'move') {
      left += dx;
      top += dy;
    } else {
      var ratio = cropDrag.width / cropDrag.height;
      if (typ.indexOf('w') >= 0) { w = cropDrag.width - dx; left = (cropDrag.left - sr.left) + dx; }
      if (typ.indexOf('e') >= 0) { w = cropDrag.width + dx; }
      if (typ.indexOf('n') >= 0) { h = cropDrag.height - dy; top = (cropDrag.top - sr.top) + dy; }
      if (typ.indexOf('s') >= 0) { h = cropDrag.height + dy; }
      h = w / (ratio || 1);
      if (typ.indexOf('n') >= 0) top = (cropDrag.top + cropDrag.height - sr.top) - h;
      if (typ.indexOf('w') >= 0) left = (cropDrag.left + cropDrag.width - sr.left) - w;
    }
    rect.style.left = left + 'px';
    rect.style.top = top + 'px';
    rect.style.width = Math.max(16, w) + 'px';
    rect.style.height = Math.max(16, h) + 'px';
    e.preventDefault();
  }

  function endCropDrag() {
    if (!cropDrag) return;
    cropDrag = null;
    var item = selectedItem();
    var cfg = readSettings();
    if (item && previewBase) {
      storeCropFromRect(previewBase, item, cfg);
      layoutCrop(previewBase, item, cfg);
      renderList();
      renderStatus();
    }
  }

  function showPreviewEmpty(on) {
    var empty = $('previewEmpty');
    var stage = $('previewStage');
    if (empty) empty.hidden = !on;
    if (stage) stage.classList.toggle('hidden', on);
  }

  async function renderPreview() {
    var item = selectedItem();
    var cfg = readSettings();
    if (!item) {
      dropPreviewBase();
      showPreviewEmpty(true);
      var layer = $('cropLayer');
      if (layer) layer.classList.add('hidden');
      return;
    }
    showPreviewEmpty(false);
    var token = ++previewPaint;
    try {
      if (previewItemId !== item.id || !previewBase) {
        dropPreviewBase();
        var decoded = await Conv.decodeOriented(item.file);
        if (token !== previewPaint) {
          if (decoded && decoded.canvas && Conv.dropCanvas) Conv.dropCanvas(decoded.canvas);
          return;
        }
        previewBase = decoded.canvas;
        previewItemId = item.id;
      }
      paintPreviewCanvas(previewBase, item);
      layoutCrop(previewBase, item, cfg);
    } catch (err) {
      if (token !== previewPaint) return;
      showPreviewEmpty(true);
      var empty = $('previewEmpty');
      if (empty) empty.textContent = (err && err.message) || 'Could not preview this photo.';
    }
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
        if (item.kind === 'gif') {
          var g = document.createElement('span');
          g.textContent = 'GIF — first frame only';
          sub.appendChild(g);
        } else if (item.kind === 'svg') {
          var sv = document.createElement('span');
          sv.textContent = 'SVG — drawn as a bitmap';
          sub.appendChild(sv);
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
        var info = document.createElement('button');
        info.type = 'button';
        info.className = 'btn secondary-btn';
        info.textContent = 'Info';
        info.addEventListener('click', function (ev) {
          ev.stopPropagation();
          showInfo(item.id);
        });
        acts.appendChild(info);
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
    renderPresets();
    var has = items.length > 0;
    if ($('convertBtn')) $('convertBtn').disabled = !has || busy;
    if ($('zipBtn')) $('zipBtn').disabled = !has || busy;
    if ($('clearBtn')) $('clearBtn').disabled = !has || busy;
    if ($('iconSetBtn')) $('iconSetBtn').disabled = !has || busy;
    if ($('infoBtn')) $('infoBtn').disabled = !has;
    if ($('copyDataBtn')) $('copyDataBtn').disabled = !has;
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
      '<li>Presets: WhatsApp, Instagram, Email, Indian passport photo (413×531, under 40 KB) and signature (300×80, under 30 KB). You can save your own.</li>' +
      '<li>Crop to 1:1, 4:5, 16:9 or passport (7:9). Rotate 90° and flip the selected photo.</li>' +
      '<li>Optional text or logo watermark, with position and opacity. A background colour fills transparent areas when saving as JPG.</li>' +
      '<li>Photo info shows camera, date and GPS from a JPEG, with a privacy warning if a location is present. When saving as JPG you can keep the date, the camera, or the location. Only those fields are written back; maker notes, lens data and thumbnails are not copied.</li>' +
      '<li>Icon set: make an ICO (PNG images inside) plus a zip of 16, 32, 48, 64, 128 and 256 px PNGs from the selected photo.</li>' +
      '<li>SVG files are drawn as a bitmap. Animated GIFs use the first frame. You can copy a photo as a data URL (Base64).</li>' +
      '<li>iPhone HEIC photos are not supported, because opening them offline needs a heavy library.</li>' +
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

    bindSeg('cropSeg', function () { onCropRatio(); });
    bindSeg('wmPosSeg', function () { settingsChanged(); });

    ['longestIn', 'percentIn', 'widthIn', 'heightIn', 'qualityIn', 'targetKb', 'patternIn', 'keepAspect', 'noEnlarge', 'useTarget', 'bgIn', 'wmText', 'wmOpacity', 'wmScale', 'wmColor', 'keepDate', 'keepCamera'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('change', settingsChanged);
      el.addEventListener('input', function () {
        if (id === 'qualityIn' && $('qualityVal')) $('qualityVal').textContent = String(el.value);
        if (id === 'wmOpacity' && $('wmOpacityVal')) $('wmOpacityVal').textContent = String(el.value) + '%';
        if (id === 'wmScale' && $('wmScaleVal')) $('wmScaleVal').textContent = String(el.value) + '%';
      });
    });

    if ($('savePresetBtn')) $('savePresetBtn').addEventListener('click', savePresetDialog);
    if ($('deletePresetBtn')) $('deletePresetBtn').addEventListener('click', deletePresetDialog);
    if ($('rotLeftBtn')) $('rotLeftBtn').addEventListener('click', function () { rotateSelected(-90); });
    if ($('rotRightBtn')) $('rotRightBtn').addEventListener('click', function () { rotateSelected(90); });
    if ($('flipHBtn')) $('flipHBtn').addEventListener('click', function () { flipSelected('h'); });
    if ($('flipVBtn')) $('flipVBtn').addEventListener('click', function () { flipSelected('v'); });
    if ($('resetEditBtn')) $('resetEditBtn').addEventListener('click', resetSelectedEdits);

    if ($('wmLogoBtn') && $('wmLogoInput')) {
      $('wmLogoBtn').addEventListener('click', function () { $('wmLogoInput').click(); });
      $('wmLogoInput').addEventListener('change', function () {
        var f = $('wmLogoInput').files && $('wmLogoInput').files[0];
        $('wmLogoInput').value = '';
        if (!f) return;
        if (logoImage && typeof logoImage.close === 'function') {
          try { logoImage.close(); } catch (_) { /* ok */ }
        }
        logoImage = null;
        var url = URL.createObjectURL(f);
        var img = new Image();
        img.onload = function () {
          URL.revokeObjectURL(url);
          logoImage = img;
          logoName = f.name || 'logo';
          if ($('wmLogoName')) $('wmLogoName').textContent = logoName;
          settingsChanged({ keepPreset: true });
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          Dlg.message('Logo failed', 'That file could not be opened as an image.');
        };
        img.src = url;
      });
    }
    if ($('wmLogoClear')) {
      $('wmLogoClear').addEventListener('click', function () {
        logoImage = null;
        logoName = '';
        if ($('wmLogoName')) $('wmLogoName').textContent = 'No logo';
        settingsChanged({ keepPreset: true });
      });
    }

    var cropRect = $('cropRect');
    if (cropRect) {
      cropRect.addEventListener('pointerdown', startCropDrag);
    }
    document.addEventListener('pointermove', moveCropDrag);
    document.addEventListener('pointerup', endCropDrag);
    document.addEventListener('pointercancel', endCropDrag);
    window.addEventListener('resize', function () {
      if (previewBase) layoutCrop(previewBase, selectedItem(), readSettings());
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
    if ($('iconSetBtn')) $('iconSetBtn').addEventListener('click', iconSetDialog);
    if ($('infoBtn')) $('infoBtn').addEventListener('click', function () { showInfo(selectedId); });
    if ($('copyDataBtn')) $('copyDataBtn').addEventListener('click', function () { copyDataUrl(selectedId); });
    if ($('keepGps')) {
      $('keepGps').addEventListener('change', function () {
        if ($('keepGps').checked && !gpsAck) {
          Dlg.open({
            title: 'Keep the location?',
            html: '<p class="privacy-warn">This will write the photo’s GPS coordinates into the new JPG. Only do this if you want to share where it was taken.</p>',
            dismissable: false,
            actions: [
              { label: 'Don’t keep', cls: 'secondary-btn', fn: function () {
                $('keepGps').checked = false;
                settingsChanged();
              } },
              { label: 'Keep location', cls: 'primary-btn', fn: function () {
                gpsAck = true;
                settingsChanged();
              } }
            ]
          });
          return;
        }
        settingsChanged();
      });
    }
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
