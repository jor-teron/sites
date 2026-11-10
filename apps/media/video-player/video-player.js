/* Video Player VPL3 — local files, folder list, resume, SRT/VTT, speed, PiP.
   Helpers live in video-player_helpers.js (VPL). In-app dialogs only. */
(function () {
  'use strict';
  var STORE = 'video-player-v1', RESUME = 'video-player-resume-v1', MARKS = 'video-player-marks-v1';
  var RESUME_CAP = 200, RESUME_MS = 2000, HIDE_MS = 2500;
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app'), vid = $('vid'), chromeEl = $('chrome');
  var items = [], subs = [], index = -1, objectUrl = '', subUrl = '';
  var seeking = false, hideTimer = 0, resumeTimer = 0, dialogOpen = false;
  var listOpen = false, menuOpen = false;
  var order = [], loopA = null, loopB = null, sleepUntil = 0, sleepTimer = 0, addMode = false;
  var audioCtx = null, mediaSrc = null, gainNode = null;
  var BG = { off: 'transparent', dark: 'rgba(0,0,0,.65)', solid: 'rgba(0,0,0,.95)' };
  var settings = { theme: 'auto', subSize: 'm', volume: 1, muted: false, speed: 1, subOn: true,
    subColor: '#ffffff', subBg: 'dark', subPos: 'bottom', subShift: 0, shuffle: false, repeat: 'off',
    brightness: 100, contrast: 100, zoomFill: false, rotate: 0, boost: 100 };

  /* ---------- settings + resume ---------- */
  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (s && typeof s === 'object') {
        if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'auto') settings.theme = s.theme;
        if (s.subSize === 's' || s.subSize === 'm' || s.subSize === 'l') settings.subSize = s.subSize;
        if (typeof s.volume === 'number') settings.volume = Math.max(0, Math.min(1, s.volume));
        if (typeof s.muted === 'boolean') settings.muted = s.muted;
        if (typeof s.speed === 'number' && s.speed >= 0.5 && s.speed <= 2) settings.speed = s.speed;
        if (typeof s.subOn === 'boolean') settings.subOn = s.subOn;
        if (s.subColor && /^#[0-9a-fA-F]{6}$/.test(s.subColor)) settings.subColor = s.subColor;
        if (s.subBg === 'off' || s.subBg === 'dark' || s.subBg === 'solid') settings.subBg = s.subBg;
        if (s.subPos === 'top' || s.subPos === 'middle' || s.subPos === 'bottom') settings.subPos = s.subPos;
        if (typeof s.subShift === 'number' && isFinite(s.subShift)) settings.subShift = Math.round(s.subShift * 10) / 10;
        if (typeof s.shuffle === 'boolean') settings.shuffle = s.shuffle;
        if (s.repeat === 'off' || s.repeat === 'one' || s.repeat === 'all') settings.repeat = s.repeat;
        if (typeof s.brightness === 'number') settings.brightness = Math.max(50, Math.min(200, s.brightness));
        if (typeof s.contrast === 'number') settings.contrast = Math.max(50, Math.min(200, s.contrast));
        if (typeof s.zoomFill === 'boolean') settings.zoomFill = s.zoomFill;
        if (typeof s.rotate === 'number') settings.rotate = ((Math.round(s.rotate / 90) * 90) % 360 + 360) % 360;
        if (typeof s.boost === 'number') settings.boost = Math.max(100, Math.min(200, s.boost));
      }
    } catch (e) { /* blocked or bad json */ }
  }
  function saveSettings() {
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) { /* full or blocked */ }
  }
  function applyTheme() {
    var m = settings.theme || 'auto', dark = m === 'dark';
    if (m === 'auto') {
      var t = '';
      try { t = localStorage.getItem('sites-hub.theme') || ''; } catch (e) { /* blocked */ }
      dark = t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    }
    document.documentElement.classList.toggle('dark', dark);
    document.querySelectorAll('#themeSeg button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === settings.theme);
    });
  }
  function applySubSize() {
    app.classList.remove('sub-s', 'sub-m', 'sub-l');
    app.classList.add('sub-' + (settings.subSize || 'm'));
    document.querySelectorAll('#subSizeSeg button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === settings.subSize);
    });
  }
  function applyCueLook() {
    app.style.setProperty('--cue-fg', settings.subColor || '#ffffff');
    app.style.setProperty('--cue-bg', BG[settings.subBg] || BG.dark);
    document.querySelectorAll('#subColorSeg button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v').toLowerCase() === String(settings.subColor).toLowerCase());
    });
    document.querySelectorAll('#subBgSeg button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === settings.subBg);
    });
    document.querySelectorAll('#subPosSeg button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === settings.subPos);
    });
    applyCuePos();
  }
  function applyCuePos() {
    var pos = settings.subPos || 'bottom';
    var tracks = vid.textTracks;
    for (var i = 0; i < tracks.length; i++) {
      var cues = tracks[i].cues;
      if (!cues) continue;
      for (var j = 0; j < cues.length; j++) {
        try {
          if (pos === 'top') { cues[j].snapToLines = true; cues[j].line = 0; }
          else if (pos === 'middle') { cues[j].snapToLines = false; cues[j].line = 50; }
          else { cues[j].snapToLines = true; cues[j].line = 'auto'; }
        } catch (e) { /* some browsers keep cues read-only */ }
      }
    }
  }
  function setShiftUi() {
    var n = Math.round((settings.subShift || 0) * 10) / 10;
    var sign = n > 0 ? '+' : '';
    $('shiftVal').textContent = sign + n.toFixed(1) + ' s';
  }
  function changeShift(d) {
    var n = Math.round(((settings.subShift || 0) + d) * 10) / 10;
    if (n > 30) n = 30;
    if (n < -30) n = -30;
    settings.subShift = n;
    saveSettings();
    setShiftUi();
    if (items[index]) bindSubs(items[index]);
  }
  function setPlayModeUi() {
    document.querySelectorAll('#shuffleSeg button').forEach(function (b) {
      b.classList.toggle('on', (b.getAttribute('data-v') === '1') === !!settings.shuffle);
    });
    document.querySelectorAll('#repeatSeg button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === settings.repeat);
    });
    if ($('menuAdd')) $('menuAdd').hidden = !items.length;
  }
  function rebuildOrder() {
    order = items.map(function (_, i) { return i; });
    if (settings.shuffle && order.length > 1) {
      var i, j, t;
      for (i = order.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        t = order[i]; order[i] = order[j]; order[j] = t;
      }
      if (index >= 0) {
        var p = order.indexOf(index);
        if (p > 0) { order.splice(p, 1); order.unshift(index); }
      }
    }
  }
  function nextIndex() {
    if (settings.repeat === 'one') return index;
    if (!order.length) rebuildOrder();
    var pos = order.indexOf(index);
    if (pos < 0) pos = 0;
    if (pos + 1 < order.length) return order[pos + 1];
    if (settings.repeat === 'all' && order.length) return order[0];
    return -1;
  }
  function setAbUi() {
    var a = loopA == null ? '—' : VPL.formatTime(loopA);
    var b = loopB == null ? '—' : VPL.formatTime(loopB);
    var on = loopA != null && loopB != null && loopB > loopA;
    $('abState').textContent = on ? ('Looping ' + a + ' – ' + b) : ('A ' + a + '  B ' + b + (loopA != null || loopB != null ? '' : '  (off)'));
  }
  function clearAb() { loopA = null; loopB = null; setAbUi(); }
  function tickAb() {
    if (loopA == null || loopB == null || loopB <= loopA) return;
    if ((vid.currentTime || 0) >= loopB - 0.04) {
      try { vid.currentTime = loopA; } catch (e) { /* ignore */ }
    }
  }
  function setSleep(minutes) {
    if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = 0; }
    minutes = Number(minutes) || 0;
    sleepUntil = minutes ? Date.now() + minutes * 60 * 1000 : 0;
    document.querySelectorAll('#sleepSeg button').forEach(function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-v')) === minutes);
    });
    if (!sleepUntil) { $('sleepState').hidden = true; return; }
    tickSleep();
  }
  function tickSleep() {
    if (!sleepUntil) return;
    var left = sleepUntil - Date.now();
    if (left <= 0) {
      sleepUntil = 0;
      if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = 0; }
      document.querySelectorAll('#sleepSeg button').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-v') === '0');
      });
      $('sleepState').hidden = true;
      vid.pause();
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      dialog('Sleep timer', 'Playback was paused.');
      return;
    }
    $('sleepState').hidden = false;
    $('sleepState').textContent = 'Pauses in ' + VPL.formatTime(left / 1000);
    sleepTimer = setTimeout(tickSleep, Math.min(1000, left));
  }
  function fillAudioTracks() {
    var row = $('audioRow'), sel = $('audioSel');
    var list = vid.audioTracks;
    if (!list || list.length < 2) { row.hidden = true; sel.innerHTML = ''; return; }
    row.hidden = false;
    sel.innerHTML = '';
    var i, t, opt, label;
    for (i = 0; i < list.length; i++) {
      t = list[i];
      label = t.label || t.language || ('Track ' + (i + 1));
      opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = label;
      if (t.enabled) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  function setAudioTrack(i) {
    var list = vid.audioTracks;
    if (!list) return;
    for (var n = 0; n < list.length; n++) list[n].enabled = n === i;
  }
  function applyPicture() {
    var b = settings.brightness || 100, c = settings.contrast || 100;
    vid.style.filter = (b === 100 && c === 100) ? '' : ('brightness(' + (b / 100) + ') contrast(' + (c / 100) + ')');
    vid.style.objectFit = settings.zoomFill ? 'cover' : 'contain';
    $('bright').value = String(b);
    $('brightVal').textContent = b + '%';
    $('contrast').value = String(c);
    $('contrastVal').textContent = c + '%';
    document.querySelectorAll('#zoomSeg button').forEach(function (btn) {
      btn.classList.toggle('on', (btn.getAttribute('data-v') === '1') === !!settings.zoomFill);
    });
    applyRotate();
  }
  function applyRotate() {
    var r = ((settings.rotate || 0) % 360 + 360) % 360;
    $('rotVal').textContent = r + '°';
    var box = $('stage').getBoundingClientRect();
    if ((r === 90 || r === 270) && box.width && box.height) {
      vid.style.width = box.height + 'px';
      vid.style.height = box.width + 'px';
      vid.style.left = ((box.width - box.height) / 2) + 'px';
      vid.style.top = ((box.height - box.width) / 2) + 'px';
    } else {
      vid.style.width = '100%';
      vid.style.height = '100%';
      vid.style.left = '0';
      vid.style.top = '0';
    }
    vid.style.transform = r ? ('rotate(' + r + 'deg)') : '';
  }
  function ensureBoost() {
    if (gainNode) return gainNode;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      audioCtx = audioCtx || new AC();
      mediaSrc = mediaSrc || audioCtx.createMediaElementSource(vid);
      gainNode = audioCtx.createGain();
      mediaSrc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
    } catch (e) {
      gainNode = null;
      return null;
    }
    return gainNode;
  }
  function setBoost(pct, fromUi) {
    pct = Math.max(100, Math.min(200, Math.round(Number(pct) || 100)));
    settings.boost = pct;
    $('boost').value = String(pct);
    $('boostVal').textContent = pct + '%';
    if (!fromUi) { /* keep */ }
    if (pct > 100 || gainNode) {
      var g = ensureBoost();
      if (g) g.gain.value = pct / 100;
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }
    saveSettings();
  }
  function saveFrame() {
    if (!items.length || !vid.videoWidth) {
      dialog('Save frame', 'Open a video first, then save a frame.');
      return;
    }
    var c = document.createElement('canvas');
    c.width = vid.videoWidth;
    c.height = vid.videoHeight;
    try {
      c.getContext('2d').drawImage(vid, 0, 0);
    } catch (e) {
      dialog('Save frame', 'The frame could not be saved.');
      return;
    }
    var name = VPL.baseName(items[index] && items[index].name || 'frame') + '-' + VPL.formatTime(vid.currentTime).replace(/:/g, '-') + '.png';
    var done = function (blob) {
      if (!blob) { dialog('Save frame', 'The frame could not be saved.'); return; }
      var a = document.createElement('a');
      var url = URL.createObjectURL(blob);
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    };
    if (c.toBlob) c.toBlob(done, 'image/png');
    else {
      try {
        var data = c.toDataURL('image/png');
        var a = document.createElement('a'); a.href = data; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e2) { dialog('Save frame', 'The frame could not be saved.'); }
    }
    c.width = 0; c.height = 0;
  }
  function rdMarks() {
    try { var v = JSON.parse(localStorage.getItem(MARKS) || '{}'); return v && typeof v === 'object' ? v : {}; }
    catch (e) { return {}; }
  }
  function wrMarks(all) {
    try { localStorage.setItem(MARKS, JSON.stringify(all)); } catch (e) { /* full or blocked */ }
  }
  function marksFor(it) {
    if (!it) return [];
    var rec = rdMarks()[VPL.resumeKey(it.name, it.size)];
    return rec && rec.items ? rec.items.slice() : [];
  }
  function writeMarks(it, list) {
    if (!it) return;
    var all = rdMarks(), key = VPL.resumeKey(it.name, it.size);
    if (!list || !list.length) delete all[key];
    else all[key] = { at: Date.now(), items: list };
    var ks = Object.keys(all);
    if (ks.length > 80) {
      ks.sort(function (a, b) { return (all[a].at || 0) - (all[b].at || 0); })
        .slice(0, ks.length - 80)
        .forEach(function (k) { delete all[k]; });
    }
    wrMarks(all);
  }
  function renderMarks() {
    var ul = $('markList');
    ul.innerHTML = '';
    var list = marksFor(items[index]);
    list.sort(function (a, b) { return a.t - b.t; });
    list.forEach(function (m, i) {
      var li = document.createElement('li');
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'go';
      go.textContent = VPL.formatTime(m.t) + (m.note ? '  ' + m.note : '');
      go.addEventListener('click', function () {
        if (isFinite(vid.duration)) vid.currentTime = Math.max(0, Math.min(vid.duration, m.t));
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.setAttribute('aria-label', 'Remove bookmark');
      del.textContent = '×';
      del.addEventListener('click', function () {
        var next = marksFor(items[index]).filter(function (x) { return !(x.t === m.t && x.note === m.note); });
        writeMarks(items[index], next);
        renderMarks();
      });
      li.appendChild(go);
      li.appendChild(del);
      ul.appendChild(li);
    });
  }
  function addMark() {
    var it = items[index];
    if (!it) { dialog('Bookmarks', 'Open a video first, then add a bookmark.'); return; }
    var t = Math.round((vid.currentTime || 0) * 10) / 10;
    var note = ($('markNote').value || '').trim().slice(0, 80);
    var list = marksFor(it);
    if (list.length >= 40) { dialog('Bookmarks', 'This file already has 40 bookmarks.'); return; }
    list.push({ t: t, note: note });
    writeMarks(it, list);
    $('markNote').value = '';
    renderMarks();
  }
  function fillInfo() {
    var box = $('infoBox');
    var it = items[index];
    if (!it) {
      box.innerHTML = '<p class="note">Open a video to see its size, type, resolution and duration.</p>';
      return;
    }
    function row(k, v) { return '<div><dt>' + k + '</dt><dd></dd></div>'; }
    box.innerHTML = row('Name') + row('Resolution') + row('Duration') + row('Size') + row('Type');
    var dds = box.querySelectorAll('dd');
    var w = vid.videoWidth, h = vid.videoHeight;
    dds[0].textContent = it.name;
    dds[1].textContent = w && h ? (w + ' × ' + h) : '—';
    dds[2].textContent = isFinite(vid.duration) && vid.duration ? VPL.formatTime(vid.duration) : '—';
    dds[3].textContent = VPL.formatSize(it.size);
    dds[4].textContent = it.type || ('.' + VPL.ext(it.name)) || '—';
  }

  function rdResume() {
    try { var v = JSON.parse(localStorage.getItem(RESUME) || '{}'); return v && typeof v === 'object' ? v : {}; }
    catch (e) { return {}; }
  }
  function wrResume(all) {
    try { localStorage.setItem(RESUME, JSON.stringify(all)); } catch (e) { /* full or blocked */ }
  }
  function resumeGet(key) {
    var a = rdResume()[key];
    return a ? { pos: +a[0] || 0, dur: +a[1] || 0, at: +a[2] || 0 } : null;
  }
  function resumeSet(key, pos, dur) {
    if (!key) return;
    var all = rdResume();
    all[key] = [Math.round((+pos || 0) * 10) / 10, Math.round(+dur || 0), Date.now()];
    var ks = Object.keys(all);
    if (ks.length > RESUME_CAP) {
      ks.sort(function (a, b) { return all[a][2] - all[b][2]; })
        .slice(0, ks.length - RESUME_CAP)
        .forEach(function (x) { delete all[x]; });
    }
    wrResume(all);
  }
  function scheduleResume() {
    if (resumeTimer) return;
    resumeTimer = setTimeout(function () {
      resumeTimer = 0;
      flushResume();
    }, RESUME_MS);
  }
  function flushResume() {
    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = 0; }
    var it = items[index];
    if (!it || !isFinite(vid.duration) || vid.duration <= 0) return;
    var pos = vid.currentTime || 0;
    if (pos < 1 || pos >= vid.duration - 2) {
      var all = rdResume();
      if (all[VPL.resumeKey(it.name, it.size)]) { delete all[VPL.resumeKey(it.name, it.size)]; wrResume(all); }
      return;
    }
    resumeSet(VPL.resumeKey(it.name, it.size), pos, vid.duration);
  }

  /* ---------- dialogs / chrome ---------- */
  function dialog(title, message, buttons) {
    dialogOpen = true;
    $('dlgT').textContent = title || '';
    $('dlgM').textContent = message || '';
    $('dlgM').hidden = !message;
    var acts = $('dlgActs');
    acts.innerHTML = '';
    (buttons || [{ id: 'ok', label: 'OK', acc: true }]).forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn' + (b.acc ? ' acc' : '');
      el.textContent = b.label;
      el.addEventListener('click', function () { closeDialog(); if (b.fn) b.fn(); });
      acts.appendChild(el);
    });
    $('dlg').hidden = false;
    var first = acts.querySelector('button');
    if (first) first.focus();
  }
  function closeDialog() {
    $('dlg').hidden = true;
    dialogOpen = false;
    bumpChrome();
  }
  function showMsg(text) {
    var el = $('msg');
    el.textContent = text || '';
    el.hidden = !text;
  }
  function bumpChrome() {
    app.classList.remove('hide-chrome');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = 0;
    if (!vid.paused && !listOpen && !menuOpen && !dialogOpen && items.length) {
      hideTimer = setTimeout(function () {
        hideTimer = 0;
        if (!vid.paused && !listOpen && !menuOpen && !dialogOpen) app.classList.add('hide-chrome');
      }, HIDE_MS);
    }
  }
  function setPlayingUi() {
    var on = !vid.paused && !vid.ended;
    $('icPlay').hidden = on;
    $('icPause').hidden = !on;
    $('btnPlay').setAttribute('aria-label', on ? 'Pause' : 'Play');
    bumpChrome();
  }
  function setTimeUi() {
    var d = isFinite(vid.duration) ? vid.duration : 0;
    var t = vid.currentTime || 0;
    $('time').textContent = VPL.formatTime(t) + ' / ' + VPL.formatTime(d);
    if (!seeking) {
      $('seek').max = 1000;
      $('seek').value = d ? String(Math.round((t / d) * 1000)) : '0';
    }
  }
  function setVolUi() {
    $('vol').value = String(Math.round((vid.muted ? 0 : vid.volume) * 100));
    $('icVol').hidden = vid.muted || vid.volume === 0;
    $('icMuted').hidden = !($('icVol').hidden);
    $('btnMute').setAttribute('aria-label', vid.muted ? 'Unmute' : 'Mute');
  }
  function setSpeedUi() {
    var s = settings.speed;
    var label = (s === 1 ? '1' : String(s)) + '×';
    $('btnSpeed').textContent = label;
    document.querySelectorAll('#speedMenu button').forEach(function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-sp')) === s);
    });
  }
  function setFsUi() {
    var on = !!document.fullscreenElement;
    $('icFs').hidden = on;
    $('icFsExit').hidden = !on;
    $('btnFs').setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  }
  function placePop(pop, anchor, prefer) {
    pop.hidden = false;
    var r = anchor.getBoundingClientRect();
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = r.left, top = prefer === 'up' ? r.top - h - 6 : r.bottom + 6;
    if (left + w > innerWidth - 8) left = innerWidth - w - 8;
    if (left < 8) left = 8;
    if (top + h > innerHeight - 8) top = r.top - h - 6;
    if (top < 8) top = r.bottom + 6;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function closePops() {
    $('openMenu').hidden = true;
    $('speedMenu').hidden = true;
  }

  /* ---------- files ---------- */
  function collect(fileList) {
    var videos = [], found = [];
    var list = fileList && fileList.length != null ? Array.prototype.slice.call(fileList) : [];
    list.forEach(function (f) {
      var path = f.webkitRelativePath || f.name;
      if (VPL.isVideo(f.name)) videos.push({ name: f.name, path: path, size: f.size, type: f.type || '', file: f });
      else if (VPL.isSubtitle(f.name)) found.push({ name: f.name, path: path, size: f.size, file: f });
    });
    return { videos: VPL.sortByPath(videos), subs: found };
  }
  function revokeUrls() {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
    if (subUrl) { URL.revokeObjectURL(subUrl); subUrl = ''; }
    Array.prototype.slice.call(vid.querySelectorAll('track')).forEach(function (t) { t.remove(); });
  }
  function bindSubs(item) {
    if (!item || !item.subFile) { setSubUi(); return Promise.resolve(); }
    return readText(item.subFile).then(function (text) {
      revokeSubOnly();
      var vtt = VPL.shiftVtt(VPL.srtToVtt(text), settings.subShift || 0);
      subUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      var tr = document.createElement('track');
      tr.kind = 'subtitles';
      tr.label = 'Subtitles';
      tr.srclang = 'en';
      tr.src = subUrl;
      tr.default = true;
      vid.appendChild(tr);
      setTimeout(function () { applySubMode(); applyCuePos(); }, 0);
    }).catch(function () {
      dialog('Subtitles', 'That subtitle file could not be read.');
    });
  }
  function revokeSubOnly() {
    if (subUrl) { URL.revokeObjectURL(subUrl); subUrl = ''; }
    Array.prototype.slice.call(vid.querySelectorAll('track')).forEach(function (t) { t.remove(); });
  }
  function applySubMode() {
    var tracks = vid.textTracks;
    for (var i = 0; i < tracks.length; i++) {
      tracks[i].mode = settings.subOn ? 'showing' : 'hidden';
    }
    setSubUi();
    applyCuePos();
  }
  function setSubUi() {
    var has = !!(items[index] && items[index].subFile) || vid.textTracks.length > 0;
    $('btnSub').classList.toggle('on', has && settings.subOn);
    $('btnSub').setAttribute('aria-pressed', has && settings.subOn ? 'true' : 'false');
  }
  function readText(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result || '')); };
      r.onerror = function () { rej(r.error); };
      r.readAsText(file);
    });
  }
  function attachSubsToVideos(videos, found) {
    videos.forEach(function (v) {
      var hit = VPL.matchSubtitle(v.path || v.name, found);
      v.subFile = hit ? hit.file : null;
    });
  }
  function refreshListUi() {
    app.classList.add('has-video');
    $('btnList').hidden = items.length < 2;
    if (items.length < 2) { listOpen = false; $('list').hidden = true; $('btnList').setAttribute('aria-pressed', 'false'); }
    setPlayModeUi();
    renderList();
  }
  function ingest(fileList, play, append) {
    var bag = collect(fileList);
    if (!bag.videos.length) {
      dialog('No videos', 'That selection did not contain a video this app can open (MP4, WebM, MKV, MOV, OGV or 3GP).');
      return;
    }
    if (append && items.length) {
      subs = subs.concat(bag.subs);
      attachSubsToVideos(bag.videos, subs);
      items = items.concat(bag.videos);
      attachSubsToVideos(items, subs);
      rebuildOrder();
      refreshListUi();
      return;
    }
    flushResume();
    revokeUrls();
    items = bag.videos;
    subs = bag.subs;
    attachSubsToVideos(items, subs);
    index = -1;
    clearAb();
    rebuildOrder();
    refreshListUi();
    load(0, play !== false);
  }
  function renderList() {
    var ul = $('listIn');
    ul.innerHTML = '';
    items.forEach(function (it, i) {
      var li = document.createElement('li');
      li.textContent = it.name;
      li.title = it.path || it.name;
      if (i === index) li.className = 'on';
      li.addEventListener('click', function () { load(i, true); });
      ul.appendChild(li);
    });
  }
  function likelyType(file) {
    if (file.type) return file.type;
    var map = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/mp4', '3gp': 'video/3gpp', mkv: 'video/x-matroska' };
    return map[VPL.ext(file.name)] || '';
  }
  function load(i, autoplay) {
    var it = items[i];
    if (!it) return;
    flushResume();
    revokeUrls();
    index = i;
    clearAb();
    showMsg('');
    $('now').textContent = it.name;
    renderList();
    objectUrl = URL.createObjectURL(it.file);
    vid.src = objectUrl;
    vid.playbackRate = settings.speed;
    vid.volume = settings.volume;
    vid.muted = settings.muted;
    bindSubs(it);
    renderMarks();
    fillInfo();
    applyPicture();
    var typ = likelyType(it.file);
    if (typ && vid.canPlayType && vid.canPlayType(typ) === '') {
      /* still try: some browsers leave canPlayType empty for MKV they can play */
    }
    if (autoplay) {
      var p = vid.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked; wait for a tap */ });
    }
    bumpChrome();
  }
  function playNext() {
    var n = nextIndex();
    if (n < 0) return;
    if (n === index) {
      try { vid.currentTime = 0; } catch (e) { /* ignore */ }
      var p = vid.play();
      if (p && p.catch) p.catch(function () { /* blocked */ });
      return;
    }
    load(n, true);
  }

  /* ---------- open / drop ---------- */
  function openFilePicker() { closePops(); $('inFile').value = ''; $('inFile').click(); }
  function openFolderPicker() { closePops(); $('inFolder').value = ''; $('inFolder').click(); }
  function openSubPicker() { $('inSub').value = ''; $('inSub').click(); }

  function walkEntry(entry, prefix) {
    return new Promise(function (resolve) {
      if (!entry) return resolve([]);
      if (entry.isFile) {
        entry.file(function (f) {
          try { Object.defineProperty(f, 'webkitRelativePath', { value: prefix ? prefix + '/' + f.name : f.name }); } catch (e) { /* ignore */ }
          resolve([f]);
        }, function () { resolve([]); });
        return;
      }
      if (!entry.isDirectory) return resolve([]);
      var reader = entry.createReader(), all = [];
      var pre = prefix ? prefix + '/' + entry.name : entry.name;
      function next() {
        reader.readEntries(function (ents) {
          if (!ents.length) return resolve(all);
          var jobs = [];
          for (var i = 0; i < ents.length; i++) {
            if (ents[i].name && ents[i].name.charAt(0) === '.') continue;
            jobs.push(walkEntry(ents[i], pre));
          }
          Promise.all(jobs).then(function (chunks) {
            chunks.forEach(function (c) { all = all.concat(c); });
            next();
          });
        }, function () { resolve(all); });
      }
      next();
    });
  }
  function fromDrop(dt) {
    var itemsDt = dt && dt.items ? Array.prototype.slice.call(dt.items) : [];
    var entries = [];
    itemsDt.forEach(function (it) {
      var en = it.webkitGetAsEntry && it.webkitGetAsEntry();
      if (en) entries.push(en);
    });
    if (entries.length) {
      return Promise.all(entries.map(function (e) {
        var pre = e.isDirectory ? '' : '';
        return walkEntry(e, pre);
      })).then(function (chunks) {
        var files = [];
        chunks.forEach(function (c) { files = files.concat(c); });
        return files;
      });
    }
    return Promise.resolve(Array.prototype.slice.call((dt && dt.files) || []));
  }

  /* ---------- events ---------- */
  function onPlay() { setPlayingUi(); }
  function onPause() { setPlayingUi(); flushResume(); }
  function onTime() { setTimeUi(); tickAb(); if (!vid.paused) scheduleResume(); }
  function onMeta() {
    setTimeUi();
    var it = items[index];
    if (!it) return;
    var rec = resumeGet(VPL.resumeKey(it.name, it.size));
    if (rec && rec.pos > 2 && rec.pos < vid.duration - 5) {
      try { vid.currentTime = rec.pos; } catch (e) { /* ignore */ }
    }
    fillAudioTracks();
    applyCuePos();
    fillInfo();
    renderMarks();
    applyPicture();
  }
  function onEnded() {
    flushResume();
    playNext();
    setPlayingUi();
  }
  function onError() {
    var it = items[index];
    var name = it ? it.name : 'This file';
    dialog(
      'Can’t play this file',
      name + ' can’t be played in this browser. Try an MP4 (H.264) or WebM file.'
    );
  }

  function togglePlay() {
    if (!items.length) return;
    if (vid.paused) {
      var p = vid.play();
      if (p && p.catch) p.catch(function () { dialog('Playback', 'The browser blocked play. Tap Play to start.'); });
    } else vid.pause();
  }
  function skip(dt) {
    if (!items.length || !isFinite(vid.duration)) return;
    vid.currentTime = Math.max(0, Math.min(vid.duration, (vid.currentTime || 0) + dt));
    flushResume();
    bumpChrome();
  }
  function changeVolume(d) {
    vid.muted = false;
    settings.muted = false;
    vid.volume = Math.max(0, Math.min(1, Math.round((vid.volume + d) * 20) / 20));
    settings.volume = vid.volume;
    saveSettings();
    setVolUi();
    bumpChrome();
  }
  function setSpeed(s) {
    s = Number(s);
    if (!s || s < 0.5 || s > 2) s = 1;
    settings.speed = s;
    vid.playbackRate = s;
    saveSettings();
    setSpeedUi();
    $('speedMenu').hidden = true;
    bumpChrome();
  }
  function toggleMute() {
    vid.muted = !vid.muted;
    settings.muted = vid.muted;
    saveSettings();
    setVolUi();
    bumpChrome();
  }
  function toggleFs() {
    if (!document.fullscreenElement) {
      var el = app;
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el);
    } else if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
  function togglePip() {
    if (!document.pictureInPictureEnabled || !vid.requestPictureInPicture) {
      dialog('Picture-in-picture', 'This browser does not support picture-in-picture.');
      return;
    }
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else vid.requestPictureInPicture().catch(function () {
      dialog('Picture-in-picture', 'Picture-in-picture could not be started.');
    });
  }
  function toggleList() {
    if (items.length < 2) return;
    listOpen = !listOpen;
    $('list').hidden = !listOpen;
    $('btnList').setAttribute('aria-pressed', listOpen ? 'true' : 'false');
    bumpChrome();
  }
  function togglePanel(force) {
    var on = force == null ? $('panel').hidden : !!force;
    $('panel').hidden = !on;
    menuOpen = on;
    if (on) closePops();
    bumpChrome();
  }
  function toggleSub() {
    var it = items[index];
    if (!it || !it.subFile) {
      if (!items.length) { dialog('Subtitles', 'Open a video first, then load an SRT or VTT file.'); return; }
      openSubPicker();
      return;
    }
    settings.subOn = !settings.subOn;
    saveSettings();
    applySubMode();
  }
  function assignSubFile(file) {
    var it = items[index];
    if (!it || !file) return;
    it.subFile = file;
    settings.subOn = true;
    saveSettings();
    bindSubs(it);
    renderMarks();
    fillInfo();
    applyPicture();
  }

  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (dialogOpen) {
      if (e.key === 'Escape') { closeDialog(); e.preventDefault(); }
      return;
    }
    if (e.key === 'Escape') {
      if (!$('panel').hidden) { togglePanel(false); e.preventDefault(); return; }
      closePops();
      return;
    }
    var k = e.key;
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); togglePlay(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); skip(-10); }
    else if (k === 'ArrowRight') { e.preventDefault(); skip(10); }
    else if (k === 'ArrowUp') { e.preventDefault(); changeVolume(0.05); }
    else if (k === 'ArrowDown') { e.preventDefault(); changeVolume(-0.05); }
    else if (k === 'f' || k === 'F') { e.preventDefault(); toggleFs(); }
    else if (k === 'm' || k === 'M') { e.preventDefault(); toggleMute(); }
  }

  function bind() {
    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    vid.addEventListener('timeupdate', onTime);
    vid.addEventListener('loadedmetadata', onMeta);
    vid.addEventListener('durationchange', setTimeUi);
    vid.addEventListener('ended', onEnded);
    vid.addEventListener('error', onError);
    vid.addEventListener('volumechange', function () {
      settings.volume = vid.volume;
      settings.muted = vid.muted;
      setVolUi();
    });
    vid.addEventListener('ratechange', function () { settings.speed = vid.playbackRate; setSpeedUi(); });
    vid.addEventListener('click', function (e) {
      if (e.detail > 1) return;
      togglePlay();
    });

    $('btnPlay').addEventListener('click', togglePlay);
    $('seek').addEventListener('input', function () {
      seeking = true;
      var d = isFinite(vid.duration) ? vid.duration : 0;
      var t = d * (Number($('seek').value) || 0) / 1000;
      $('time').textContent = VPL.formatTime(t) + ' / ' + VPL.formatTime(d);
      bumpChrome();
    });
    $('seek').addEventListener('change', function () {
      var d = isFinite(vid.duration) ? vid.duration : 0;
      if (d) vid.currentTime = d * (Number($('seek').value) || 0) / 1000;
      seeking = false;
      flushResume();
    });
    $('vol').addEventListener('input', function () {
      vid.muted = false;
      vid.volume = (Number($('vol').value) || 0) / 100;
      settings.volume = vid.volume;
      settings.muted = false;
      saveSettings();
      setVolUi();
      bumpChrome();
    });
    $('btnMute').addEventListener('click', toggleMute);
    $('btnSpeed').addEventListener('click', function (e) {
      e.stopPropagation();
      var pop = $('speedMenu');
      if (!pop.hidden) { pop.hidden = true; return; }
      closePops();
      placePop(pop, $('btnSpeed'), 'up');
    });
    $('speedMenu').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-sp]');
      if (b) setSpeed(b.getAttribute('data-sp'));
    });
    $('btnSub').addEventListener('click', toggleSub);
    $('btnFs').addEventListener('click', toggleFs);
    $('btnOpen').addEventListener('click', function (e) {
      e.stopPropagation();
      var pop = $('openMenu');
      if (!pop.hidden) { pop.hidden = true; return; }
      closePops();
      placePop(pop, $('btnOpen'), 'down');
    });
    $('btnList').addEventListener('click', toggleList);
    $('btnMore').addEventListener('click', function (e) { e.stopPropagation(); togglePanel(); });
    $('panelClose').addEventListener('click', function () { togglePanel(false); });
    $('panel').addEventListener('click', function (e) { e.stopPropagation(); });
    $('emptyFile').addEventListener('click', function () { addMode = false; openFilePicker(); });
    $('emptyFolder').addEventListener('click', openFolderPicker);
    $('menuFile').addEventListener('click', function () { addMode = false; openFilePicker(); });
    $('menuFolder').addEventListener('click', openFolderPicker);
    $('btnLoadSub').addEventListener('click', openSubPicker);
    $('btnPip').addEventListener('click', togglePip);
    $('btnAddQueue').addEventListener('click', function () { addMode = true; openFilePicker(); });
    $('menuAdd').addEventListener('click', function () { addMode = true; openFilePicker(); });
    $('shiftDown').addEventListener('click', function () { changeShift(-0.1); });
    $('shiftUp').addEventListener('click', function () { changeShift(0.1); });
    $('subColorSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      settings.subColor = b.getAttribute('data-v'); saveSettings(); applyCueLook();
    });
    $('subBgSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      settings.subBg = b.getAttribute('data-v'); saveSettings(); applyCueLook();
    });
    $('subPosSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      settings.subPos = b.getAttribute('data-v'); saveSettings(); applyCueLook();
    });
    $('shuffleSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      settings.shuffle = b.getAttribute('data-v') === '1';
      saveSettings(); rebuildOrder(); setPlayModeUi();
    });
    $('repeatSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      settings.repeat = b.getAttribute('data-v');
      saveSettings(); setPlayModeUi();
    });
    $('btnSetA').addEventListener('click', function () { loopA = vid.currentTime || 0; setAbUi(); });
    $('btnSetB').addEventListener('click', function () {
      var t = vid.currentTime || 0;
      if (loopA != null && t <= loopA) { dialog('A–B loop', 'Point B needs to be after point A.'); return; }
      loopB = t; setAbUi();
    });
    $('btnClearAB').addEventListener('click', clearAb);
    $('sleepSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      setSleep(Number(b.getAttribute('data-v')));
    });
    $('audioSel').addEventListener('change', function () { setAudioTrack(Number($('audioSel').value) || 0); });
    $('btnFrame').addEventListener('click', saveFrame);
    $('bright').addEventListener('input', function () {
      settings.brightness = Number($('bright').value) || 100; saveSettings(); applyPicture();
    });
    $('contrast').addEventListener('input', function () {
      settings.contrast = Number($('contrast').value) || 100; saveSettings(); applyPicture();
    });
    $('zoomSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      settings.zoomFill = b.getAttribute('data-v') === '1'; saveSettings(); applyPicture();
    });
    $('btnRotate').addEventListener('click', function () {
      settings.rotate = ((settings.rotate || 0) + 90) % 360; saveSettings(); applyPicture();
    });
    $('boost').addEventListener('input', function () { setBoost($('boost').value, true); });
    $('btnAddMark').addEventListener('click', addMark);
    $('markNote').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addMark(); }
    });
    window.addEventListener('resize', applyRotate);

    if (vid.audioTracks && vid.audioTracks.addEventListener) {
      vid.audioTracks.addEventListener('addtrack', fillAudioTracks);
      vid.audioTracks.addEventListener('removetrack', fillAudioTracks);
    }
    if (vid.textTracks && vid.textTracks.addEventListener) {
      vid.textTracks.addEventListener('addtrack', function () { applySubMode(); applyCuePos(); });
    }

    $('inFile').addEventListener('change', function () {
      if (this.files && this.files.length) { ingest(this.files, true, addMode); addMode = false; }
    });
    $('inFolder').addEventListener('change', function () {
      if (this.files && this.files.length) ingest(this.files, true);
    });
    $('inSub').addEventListener('change', function () {
      if (this.files && this.files[0]) assignSubFile(this.files[0]);
    });

    $('themeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (!b) return;
      settings.theme = b.getAttribute('data-v');
      saveSettings();
      applyTheme();
    });
    $('subSizeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (!b) return;
      settings.subSize = b.getAttribute('data-v');
      saveSettings();
      applySubSize();
    });

    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', setFsUi);
    document.addEventListener('webkitfullscreenchange', setFsUi);
    document.addEventListener('mousemove', bumpChrome);
    document.addEventListener('pointerdown', bumpChrome);
    app.addEventListener('click', function () { closePops(); });

    window.addEventListener('dragover', function (e) { e.preventDefault(); app.classList.add('dragover'); });
    window.addEventListener('dragleave', function (e) {
      if (e.relatedTarget && app.contains(e.relatedTarget)) return;
      app.classList.remove('dragover');
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      app.classList.remove('dragover');
      fromDrop(e.dataTransfer).then(function (files) {
        if (files && files.length) ingest(files, true);
      });
    });
    window.addEventListener('pagehide', flushResume);
    window.addEventListener('beforeunload', flushResume);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flushResume(); });
    if (window.matchMedia) {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (settings.theme === 'auto') applyTheme();
      });
    }
    window.addEventListener('storage', function (e) {
      if (e.key === 'sites-hub.theme' && settings.theme === 'auto') applyTheme();
    });
  }

  loadSettings();
  applyTheme();
  applySubSize();
  applyCueLook();
  setShiftUi();
  setPlayModeUi();
  setAbUi();
  setSleep(0);
  applyPicture();
  setBoost(settings.boost);
  fillInfo();
  renderMarks();
  vid.volume = settings.volume;
  vid.muted = settings.muted;
  setVolUi();
  setSpeedUi();
  setPlayingUi();
  $('rel').textContent = VPL.RELEASE;
  if (!document.pictureInPictureEnabled) $('btnPip').hidden = true;
  bind();
  bumpChrome();
})();
