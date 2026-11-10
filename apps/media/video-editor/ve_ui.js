/* Video Editor — ve_ui.js: sequence preview, clips, projects, looks, titles, export. VD3 */
(function (root) {
  'use strict';

  var RELEASE = 'VD3';
  var PREFS = 'video-editor-v1';
  var H = root.VEHelpers;
  var E = root.VEEdits;
  var S = root.VESeq;
  var F = root.VEFx;

  var rangeApi = null;
  var seekApi = null;
  var history = S.createHistory({ fade: 0, clips: [] });
  var projectId = '';
  var projectName = '';
  var projectCreated = 0;
  var selectedId = '';
  var files = {};
  var players = {};
  var marks = {};
  var globalTime = 0;
  var playing = false;
  var playingId = '';
  var seeking = false;
  var exporting = false;
  var exportJob = null;
  var audioCtx = null;
  var audioDest = null;
  var saveTimer = 0;
  var saveBusy = false;
  var warnedLow = false;
  var drag = null;
  var selectedOverlayId = '';
  var adjTab = 'look';
  var fxSliding = false;
  var cropDrag = null;
  var filterOk = true;

  function $(id) { return document.getElementById(id); }

  function pack(patch) {
    var st = history.get();
    patch = patch || {};
    return F.migrateState({
      fade: patch.fade != null ? patch.fade : st.fade,
      clips: patch.clips != null ? patch.clips : st.clips,
      overlays: patch.overlays != null ? patch.overlays : st.overlays,
      outputSize: patch.outputSize != null ? patch.outputSize : st.outputSize
    });
  }

  function prefs() {
    try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (_) { return {}; }
  }

  function writePrefs(patch) {
    var s = prefs();
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    try { localStorage.setItem(PREFS, JSON.stringify(s)); } catch (_) { /* blocked */ }
  }

  function state() { return history.get(); }
  function clips() { return state().clips; }
  function fadeVal() { return state().fade; }

  function selected() {
    var list = clips();
    var i = S.findIndex(list, selectedId);
    if (i >= 0) return list[i];
    return list[0] || null;
  }

  function selectedIndex() { return S.findIndex(clips(), selectedId); }

  function setSelected(id) {
    selectedId = id || '';
    var clip = selected();
    if (clip) selectedId = clip.id;
  }

  function formatEta(seconds) {
    var s = Math.max(0, Math.round(seconds));
    if (s < 60) return s + ' second' + (s === 1 ? '' : 's');
    var m = Math.floor(s / 60);
    var r = s % 60;
    if (m < 60) return r ? (m + ' min ' + r + ' sec') : (m + ' min');
    return H.formatTime(s);
  }

  function setPlayLabel(on) {
    var btn = $('playBtn');
    if (!btn) return;
    btn.textContent = on ? 'Pause' : 'Play';
    btn.setAttribute('aria-label', on ? 'Pause' : 'Play');
  }

  function setSaveState(text) {
    var el = $('saveState');
    if (!el) return;
    if (!text) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = text;
  }

  function setFadeButtons() {
    var seg = $('fadeSeg');
    if (!seg) return;
    var v = String(fadeVal());
    var buttons = seg.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('on', buttons[i].getAttribute('data-v') === v);
    }
  }

  function setBusyButtons(on) {
    ['playBtn', 'frameBackBtn', 'frameFwdBtn', 'setInBtn', 'setOutBtn',
      'cutBtn', 'keepBtn', 'addClipBtn', 'splitBtn', 'deleteClipBtn',
      'moveLeftBtn', 'moveRightBtn', 'resetBtn', 'projectsBtn'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !!on;
    });
    var fade = $('fadeSeg');
    if (fade) {
      var bs = fade.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) bs[i].disabled = !!on;
    }
  }

  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = root.AudioContext || root.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
      audioDest = audioCtx.createMediaStreamDestination();
    }
    if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function hookAudio(rec) {
    if (!rec || rec.hooked === true) return rec;
    if (!ensureAudio()) { rec.hooked = 'failed'; return rec; }
    try {
      rec.source = audioCtx.createMediaElementSource(rec.video);
      rec.gain = audioCtx.createGain();
      rec.source.connect(rec.gain);
      rec.gain.connect(audioCtx.destination);
      rec.gain.connect(audioDest);
      rec.gain.gain.value = 0;
      rec.hooked = true;
    } catch (_) {
      rec.hooked = 'failed';
    }
    return rec;
  }

  function setGain(rec, value) {
    if (rec && rec.gain && rec.gain.gain) {
      try { rec.gain.gain.value = value; } catch (_) { /* ok */ }
    }
  }

  function silenceAll() {
    Object.keys(players).forEach(function (id) { setGain(players[id], 0); });
  }

  function ensurePlayer(clip) {
    if (!clip) return null;
    if (players[clip.id]) return players[clip.id];
    var file = files[clip.fileId];
    if (!file) return null;
    var video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('data-clip', clip.id);
    var url = URL.createObjectURL(file);
    video.src = url;
    try {
      video.preservesPitch = true;
      video.mozPreservesPitch = true;
      video.webkitPreservesPitch = true;
    } catch (_) { /* ok */ }
    var rec = { video: video, url: url, fileId: clip.fileId, source: null, gain: null, hooked: false };
    players[clip.id] = rec;
    var frame = $('previewStage') || $('videoFrame');
    if (frame) frame.appendChild(video);
    video.addEventListener('timeupdate', function () { onPlayerTime(clip.id); });
    video.addEventListener('ended', function () { onPlayerEnded(clip.id); });
    return rec;
  }

  function showClip(id) {
    Object.keys(players).forEach(function (cid) {
      players[cid].video.classList.toggle('active', cid === id && !exporting);
    });
    var canvas = $('exportCanvas');
    if (canvas) canvas.classList.toggle('hidden', !exporting);
  }

  function disposePlayers() {
    Object.keys(players).forEach(function (id) {
      var rec = players[id];
      try { rec.video.pause(); } catch (_) { /* ok */ }
      try { rec.video.removeAttribute('src'); rec.video.load(); } catch (_) { /* ok */ }
      if (rec.video.parentNode) rec.video.parentNode.removeChild(rec.video);
      try { URL.revokeObjectURL(rec.url); } catch (_) { /* ok */ }
    });
    players = {};
    playingId = '';
  }

  function captureThumb(video) {
    try {
      var vw = video.videoWidth;
      var vh = video.videoHeight;
      if (!vw || !vh) return '';
      var c = document.createElement('canvas');
      c.width = 96;
      c.height = Math.max(1, Math.round(96 * vh / vw));
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } catch (_) { return ''; }
  }

  function readMeta(file) {
    return new Promise(function (resolve, reject) {
      var v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      var url = URL.createObjectURL(file);
      var done = false;
      function finish(err, info) {
        if (done) return;
        done = true;
        try { URL.revokeObjectURL(url); } catch (_) { /* ok */ }
        try { v.removeAttribute('src'); v.load(); } catch (_) { /* ok */ }
        if (err) reject(err);
        else resolve(info);
      }
      v.onloadedmetadata = function () {
        var dur = v.duration;
        if (!isFinite(dur) || dur <= 0) {
          finish(new Error('Could not read this video\'s duration.'));
          return;
        }
        var info = {
          duration: dur,
          width: v.videoWidth || 0,
          height: v.videoHeight || 0,
          thumb: ''
        };
        function gotThumb() { info.thumb = captureThumb(v); finish(null, info); }
        v.onseeked = gotThumb;
        v.onerror = function () { finish(null, info); };
        try {
          v.currentTime = Math.min(0.4, Math.max(0, dur * 0.05));
        } catch (_) { finish(null, info); }
        setTimeout(function () { if (!done) finish(null, info); }, 1500);
      };
      v.onerror = function () {
        finish(new Error('This browser could not play ' + (file.name || 'that file') + '.'));
      };
      v.src = url;
    });
  }

  function paintTime() {
    var st = state();
    var total = S.sequenceDuration(st.clips);
    var cur = $('curTime');
    var src = $('srcDur');
    if (cur) cur.textContent = H.formatTime(globalTime);
    if (src) src.textContent = H.formatTime(total);
    paintOverlays();
    if (seekApi) {
      seekApi.setDuration(total);
      seekApi.setCurrent(globalTime);
    }
    var clip = selected();
    if (rangeApi && clip) {
      var rec = players[clip.id];
      var srcT;
      var loc = S.globalToLocal(globalTime, st.clips);
      if (loc && loc.clip.id === clip.id) srcT = loc.sourceTime;
      else if (rec) srcT = rec.video.currentTime;
      else srcT = 0;
      rangeApi.setCurrent(srcT, true);
    }
  }

  function paintRange() {
    var clip = selected();
    if (!rangeApi) return;
    if (!clip) {
      rangeApi.setDuration(0);
      rangeApi.setSegments([]);
      return;
    }
    rangeApi.setDuration(clip.duration);
    rangeApi.setSegments(clip.segments);
    var m = marks[clip.id];
    if (m) rangeApi.setRange(m.start, m.end, 'both');
    else rangeApi.setRange(0, clip.duration, 'both');
  }

  function paintStrip() {
    var strip = $('clipStrip');
    if (!strip) return;
    var st = state();
    var layout = S.sequenceLayout(st.clips);
    strip.innerHTML = '';
    layout.items.forEach(function (it) {
      if (drag && drag.insert === it.index && drag.active) {
        var gap = document.createElement('div');
        gap.className = 'clip-insert';
        gap.setAttribute('aria-hidden', 'true');
        strip.appendChild(gap);
      }
      var clip = st.clips[it.index];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'clip-block' + (clip.id === selectedId ? ' selected' : '') +
        (drag && drag.active && drag.id === clip.id ? ' dragging' : '');
      btn.setAttribute('data-id', clip.id);
      btn.style.flexGrow = String(Math.max(1, Math.round(it.duration * 10)));
      if (clip.thumb) btn.style.backgroundImage = 'url(' + clip.thumb + ')';
      btn.title = clip.name;
      btn.innerHTML = '<span class="clip-shade"></span><span class="clip-name">' +
        H.escapeHtml(clip.name) + '</span><span class="clip-len">' +
        H.escapeHtml(H.formatTime(it.duration)) + '</span>';
      strip.appendChild(btn);
    });
    if (drag && drag.active && drag.insert === layout.items.length) {
      var end = document.createElement('div');
      end.className = 'clip-insert';
      end.setAttribute('aria-hidden', 'true');
      strip.appendChild(end);
    }
  }

  function paintChrome() {
    var st = state();
    var list = st.clips;
    var total = S.sequenceDuration(list);
    var clip = selected();
    var idx = selectedIndex();
    var label = $('clipLabel');
    if (label) {
      label.textContent = clip
        ? ('Clip ' + (idx + 1) + ' of ' + list.length + ' · ' + clip.name)
        : 'No clip';
    }
    var undoBtn = $('undoBtn');
    var redoBtn = $('redoBtn');
    if (undoBtn) undoBtn.disabled = exporting || !history.canUndo();
    if (redoBtn) redoBtn.disabled = exporting || !history.canRedo();
    var exportBtn = $('exportBtn');
    if (exportBtn) exportBtn.disabled = exporting || total < H.MIN_EXPORT;
    ['cutBtn', 'keepBtn', 'setInBtn', 'setOutBtn', 'splitBtn', 'deleteClipBtn'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = exporting || !clip;
    });
    var left = $('moveLeftBtn');
    var right = $('moveRightBtn');
    if (left) left.disabled = exporting || idx <= 0;
    if (right) right.disabled = exporting || idx < 0 || idx >= list.length - 1;
    var add = $('addClipBtn');
    if (add) add.disabled = exporting;
    setFadeButtons();
    var hasClips = list.length > 0;
    var editor = $('editorSection');
    var upload = $('uploadSection');
    if (editor) editor.classList.toggle('hidden', !hasClips);
    if (upload) upload.classList.toggle('hidden', hasClips);
  }

  function refresh() {
    var clip = selected();
    if (!clip && clips().length) setSelected(clips()[0].id);
    paintStrip();
    paintRange();
    paintTime();
    paintChrome();
    if (clip) {
      ensurePlayer(clip);
      showClip(clip.id);
    }
    applyLooks();
    syncAdjust();
    paintOverlays();
    layoutPreview();
  }

  function commit(patch, record) {
    history.set(pack(patch), record !== false);
    refresh();
    scheduleSave();
  }

  function scheduleSave() {
    if (!projectId && !clips().length) return;
    setSaveState('Saving…');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = 0; saveNow(); }, 800);
  }

  function ensureProjectMeta() {
    if (!projectId) {
      projectId = H.uid('p');
      projectCreated = Date.now();
      var first = clips()[0];
      projectName = projectName || (first && first.name ? first.name.replace(/\.[^.]+$/, '') : 'Untitled project');
    }
    if (!projectName) projectName = 'Untitled project';
  }

  function saveNow() {
    if (saveBusy || exporting) { scheduleSave(); return; }
    var st = state();
    if (!st.clips.length && !projectId) { setSaveState(''); return; }
    ensureProjectMeta();
    var rec = {
      id: projectId,
      name: projectName,
      created: projectCreated || Date.now(),
      updated: Date.now(),
      version: F.PROJECT_VERSION,
      fade: st.fade,
      outputSize: st.outputSize,
      clips: S.copyClips(st.clips),
      overlays: F.copyOverlays(st.overlays)
    };
    var used = {};
    rec.clips.forEach(function (c) { if (c.fileId && files[c.fileId]) used[c.fileId] = files[c.fileId]; });
    saveBusy = true;
    return root.VEStore.putFiles(used).then(function () {
      return root.VEStore.saveProject(rec);
    }).then(function () {
      writePrefs({ currentProjectId: projectId });
      return root.VEStore.gcFiles(history.fileIds());
    }).then(function () {
      saveBusy = false;
      setSaveState('Saved');
      return root.VEStore.estimate().then(maybeWarnLow);
    }).catch(function (err) {
      saveBusy = false;
      setSaveState('Not saved');
      if (root.VEStore.isQuota(err)) {
        root.VEDlg.message(
          'Storage is full',
          'This device is out of space for projects. Export your video, then delete a project in Projects to free space.'
        );
      } else {
        root.VEDlg.message('Could not save', (err && err.message) ? err.message : 'Project storage failed.');
      }
    });
  }

  function maybeWarnLow(info) {
    if (!info || !info.low || warnedLow) return;
    warnedLow = true;
    var used = H.formatBytes(info.usage);
    var cap = H.formatBytes(info.quota);
    root.VEDlg.message(
      'Storage is almost full',
      'Projects on this device are using ' + used + (info.quota ? (' of ' + cap) : '') +
        '. Export anything you need, then delete old projects to free space.'
    );
  }

  function pauseSequence() {
    playing = false;
    playingId = '';
    setPlayLabel(false);
    silenceAll();
    Object.keys(players).forEach(function (id) {
      try { players[id].video.pause(); } catch (_) { /* ok */ }
    });
  }

  function seekGlobal(t, keepPlaying) {
    var st = state();
    var total = S.sequenceDuration(st.clips);
    var x = Number(t);
    if (!isFinite(x)) x = 0;
    x = Math.max(0, Math.min(total, x));
    globalTime = x;
    var loc = S.globalToLocal(x, st.clips);
    if (!loc) { paintTime(); return; }
    setSelected(loc.clip.id);
    var rec = ensurePlayer(loc.clip);
    showClip(loc.clip.id);
    if (rec) {
      seeking = true;
      try { rec.video.currentTime = loc.sourceTime; } catch (_) { /* ok */ }
      setTimeout(function () { seeking = false; }, 40);
    }
    refresh();
    if (keepPlaying && playing) startClipPlay(loc);
  }

  function startClipPlay(loc) {
    if (!loc || !loc.clip) return;
    var rec = ensurePlayer(loc.clip);
    if (!rec) return;
    hookAudio(rec);
    ensureAudio();
    silenceAll();
    showClip(loc.clip.id);
    playingId = loc.clip.id;
    setSelected(loc.clip.id);
    paintRange();
    paintStrip();
    paintChrome();
    try { rec.video.currentTime = loc.sourceTime; } catch (_) { /* ok */ }
    try { rec.video.playbackRate = F.normalizeSpeed(loc.clip.speed); } catch (_) { /* ok */ }
    try { rec.video.volume = loc.clip.mute ? 0 : Math.min(1, Math.max(0, (Number(loc.clip.volume) || 0) / 100)); } catch (_) { /* ok */ }
    setGain(rec, F.audioGain(loc.clip, 1));
    var p = rec.video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () {
        pauseSequence();
      });
    }
  }

  function playSequence() {
    if (exporting) return;
    var st = state();
    var total = S.sequenceDuration(st.clips);
    if (total < 0.01) return;
    var loc = S.globalToLocal(globalTime, st.clips);
    if (!loc || loc.atEnd || (loc.item && globalTime >= total - 0.04)) {
      globalTime = 0;
      loc = S.globalToLocal(0, st.clips);
    }
    if (!loc) return;
    if (!E.containingSegment(loc.sourceTime, loc.clip.segments)) {
      var n = E.nextKeptTime(loc.sourceTime, loc.clip.segments);
      if (n != null) {
        globalTime = S.localToGlobal(loc.index, n, st.clips);
        loc = S.globalToLocal(globalTime, st.clips);
      }
    }
    playing = true;
    setPlayLabel(true);
    startClipPlay(loc);
  }

  function togglePlay() {
    if (exporting || !clips().length) return;
    if (playing) pauseSequence();
    else playSequence();
  }

  function advanceFrom(clipId, sourceTime) {
    var st = state();
    var idx = S.findIndex(st.clips, clipId);
    if (idx < 0) { pauseSequence(); return; }
    var clip = st.clips[idx];
    var seg = E.containingSegment(sourceTime, clip.segments);
    if (seg && sourceTime < seg.end - 0.04) return;
    var nextT = E.nextKeptTime(sourceTime + 0.001, clip.segments);
    if (nextT != null && nextT > sourceTime) {
      var rec = players[clipId];
      if (rec) {
        seeking = true;
        try { rec.video.currentTime = nextT; } catch (_) { /* ok */ }
        setTimeout(function () { seeking = false; }, 40);
      }
      globalTime = S.localToGlobal(idx, nextT, st.clips);
      paintTime();
      return;
    }
    if (idx + 1 < st.clips.length) {
      var next = st.clips[idx + 1];
      var first = next.segments && next.segments[0];
      try { if (players[clipId]) players[clipId].video.pause(); } catch (_) { /* ok */ }
      setGain(players[clipId], 0);
      globalTime = S.localToGlobal(idx + 1, first ? first.start : 0, st.clips);
      startClipPlay(S.globalToLocal(globalTime, st.clips));
      return;
    }
    globalTime = S.sequenceDuration(st.clips);
    pauseSequence();
    paintTime();
  }

  function onPlayerTime(clipId) {
    if (exporting || seeking) return;
    var rec = players[clipId];
    if (!rec) return;
    var st = state();
    var idx = S.findIndex(st.clips, clipId);
    if (idx < 0) return;
    if (playing && playingId === clipId) {
      globalTime = S.localToGlobal(idx, rec.video.currentTime, st.clips);
      paintTime();
      paintStrip();
      var clip = st.clips[idx];
      var t = rec.video.currentTime;
      var seg = E.containingSegment(t, clip.segments);
      if (!seg || t >= (seg.end - 0.04)) advanceFrom(clipId, t);
    } else if (selectedId === clipId && !playing) {
      paintTime();
    }
  }

  function onPlayerEnded(clipId) {
    if (exporting || !playing || playingId !== clipId) return;
    var rec = players[clipId];
    advanceFrom(clipId, rec ? rec.video.currentTime : 1e9);
  }

  function stepFrame(dir) {
    if (exporting || !clips().length) return;
    var wasPlaying = playing;
    pauseSequence();
    seekGlobal(globalTime + dir * H.frameStep(H.DEFAULT_FPS), wasPlaying);
  }

  function setMark(which) {
    var clip = selected();
    if (!clip || !rangeApi) return;
    var loc = S.globalToLocal(globalTime, clips());
    var t;
    if (loc && loc.clip.id === clip.id) t = loc.sourceTime;
    else {
      var rec = players[clip.id];
      t = rec ? rec.video.currentTime : 0;
    }
    var r = rangeApi.getRange();
    if (which === 'start') rangeApi.setRange(t, r.end, 'start');
    else rangeApi.setRange(r.start, t, 'end');
    marks[clip.id] = rangeApi.getRange();
  }

  function applyCutOrKeep(kind) {
    if (!rangeApi || exporting) return;
    var clip = selected();
    if (!clip) return;
    var r = rangeApi.getRange();
    var nextSegs = kind === 'keep'
      ? E.keepRange(clip.segments, r.start, r.end)
      : E.cutRange(clip.segments, r.start, r.end);
    if (!nextSegs.length) {
      root.VEDlg.message(
        'Nothing left',
        kind === 'keep'
          ? 'Keep selection would remove every remaining part of this clip. Move the In and Out marks, or delete the clip instead.'
          : 'Cut selection would remove every remaining part of this clip. Narrow the In and Out marks, or delete the clip instead.'
      );
      return;
    }
    if (E.sameSegs(clip.segments, nextSegs)) {
      root.VEDlg.message('No change', 'That range does not overlap any remaining part of this clip.');
      return;
    }
    var st = state();
    var nextClips = S.copyClips(st.clips);
    var i = S.findIndex(nextClips, clip.id);
    nextClips[i].segments = nextSegs;
    commit({ fade: st.fade, clips: nextClips }, true);
    var loc = S.globalToLocal(globalTime, nextClips);
    if (loc) {
      globalTime = Math.min(globalTime, S.sequenceDuration(nextClips));
      seekGlobal(globalTime, false);
    }
  }

  function splitAtPlayhead() {
    if (exporting) return;
    var st = state();
    var loc = S.globalToLocal(globalTime, st.clips);
    if (!loc || loc.atEnd) {
      root.VEDlg.message('Cannot split', 'Move the playhead onto a clip, not right at the end.');
      return;
    }
    var parts = S.splitClip(loc.clip, loc.sourceTime, H.uid('c'));
    if (!parts) {
      root.VEDlg.message(
        'Cannot split',
        'The playhead needs to sit inside a kept part of the clip, not on a cut or right at either end.'
      );
      return;
    }
    var nextClips = S.copyClips(st.clips);
    nextClips.splice(loc.index, 1, parts.left, parts.right);
    // New right-hand clip needs its own player (same file, different element).
    setSelected(parts.left.id);
    commit({ fade: st.fade, clips: nextClips }, true);
    seekGlobal(globalTime, false);
  }

  function deleteSelectedClip() {
    if (exporting) return;
    var st = state();
    var i = selectedIndex();
    if (i < 0) return;
    var nextClips = S.copyClips(st.clips);
    nextClips.splice(i, 1);
    var nextSel = nextClips[i] || nextClips[i - 1];
    setSelected(nextSel ? nextSel.id : '');
    commit({ fade: st.fade, clips: nextClips }, true);
    globalTime = Math.min(globalTime, S.sequenceDuration(nextClips));
    if (nextClips.length) seekGlobal(globalTime, false);
    else pauseSequence();
  }

  function moveSelected(delta) {
    if (exporting) return;
    var st = state();
    var i = selectedIndex();
    if (i < 0) return;
    var nextClips = S.moveBy(st.clips, i, delta);
    if (S.sameState(st, { fade: st.fade, clips: nextClips })) return;
    commit({ fade: st.fade, clips: nextClips }, true);
    seekGlobal(S.localToGlobal(S.findIndex(nextClips, selectedId), 
      (S.globalToLocal(globalTime, st.clips) || {}).sourceTime || 0, nextClips), false);
  }

  function setFade(v) {
    var fade = Number(v);
    if (fade !== 0.5 && fade !== 1) fade = 0;
    var st = state();
    if (st.fade === fade) return;
    commit({ fade: fade, clips: st.clips }, true);
  }

  function undo() {
    if (exporting || !history.canUndo()) return;
    var prev = history.undo();
    if (!prev) return;
    if (S.findIndex(prev.clips, selectedId) < 0) setSelected(prev.clips[0] && prev.clips[0].id);
    globalTime = Math.min(globalTime, S.sequenceDuration(prev.clips));
    refresh();
    scheduleSave();
    if (prev.clips.length) seekGlobal(globalTime, false);
  }

  function redo() {
    if (exporting || !history.canRedo()) return;
    var next = history.redo();
    if (!next) return;
    if (S.findIndex(next.clips, selectedId) < 0) setSelected(next.clips[0] && next.clips[0].id);
    globalTime = Math.min(globalTime, S.sequenceDuration(next.clips));
    refresh();
    scheduleSave();
    if (next.clips.length) seekGlobal(globalTime, false);
  }

  function addFiles(fileList, prependNewProject) {
    var incoming = [];
    for (var i = 0; i < fileList.length; i++) {
      if (H.isVideoFile(fileList[i])) incoming.push(fileList[i]);
    }
    if (!incoming.length) {
      root.VEDlg.message('Cannot open', 'Please choose a video file the browser can play.');
      return;
    }
    var wasEmpty = !clips().length;
    var jobs = incoming.map(function (file) {
      var fileId = H.uid('f');
      return readMeta(file).then(function (info) {
        files[fileId] = file;
        return F.migrateClip({
          id: H.uid('c'),
          fileId: fileId,
          name: file.name || 'clip',
          duration: info.duration,
          width: info.width,
          height: info.height,
          thumb: info.thumb || '',
          segments: E.initialSegments(info.duration)
        });
      });
    });
    Promise.all(jobs.map(function (p) {
      return p.then(function (c) { return { ok: true, clip: c }; })
        .catch(function (err) { return { ok: false, error: err }; });
    })).then(function (results) {
      var added = [];
      var errors = [];
      results.forEach(function (r) {
        if (r.ok) added.push(r.clip);
        else errors.push((r.error && r.error.message) || 'A file could not be opened.');
      });
      if (added.length) {
        var st = state();
        var nextClips = wasEmpty && prependNewProject ? added : S.copyClips(st.clips).concat(added);
        if (wasEmpty && !projectId) {
          history.reset(pack({ fade: st.fade, clips: nextClips }));
        } else {
          history.set(pack({ clips: nextClips }), true);
        }
        setSelected(added[0].id);
        if (wasEmpty) globalTime = 0;
        ensureProjectMeta();
        refresh();
        seekGlobal(wasEmpty ? 0 : S.localToGlobal(S.findIndex(nextClips, added[0].id), added[0].segments[0].start, nextClips), false);
        scheduleSave();
      }
      if (errors.length) {
        root.VEDlg.message('Some files could not be opened', errors.slice(0, 4).join(' '));
      }
    });
  }

  function clearSession() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    pauseSequence();
    if (exportJob) { try { exportJob.cancel(); } catch (_) { /* ok */ } exportJob = null; }
    exporting = false;
    disposePlayers();
    files = {};
    marks = {};
    selectedId = '';
    globalTime = 0;
    projectId = '';
    projectName = '';
    projectCreated = 0;
    history.reset(F.migrateState({ fade: 0, clips: [] }));
    selectedOverlayId = '';
    writePrefs({ currentProjectId: '' });
    setSaveState('');
    refresh();
  }

  function newProject() {
    if (exporting) return;
    function go() {
      if (projectId && clips().length) {
        saveNow();
      }
      clearSession();
    }
    if (clips().length || history.canUndo()) {
      root.VEDlg.open({
        title: 'Start a new project?',
        text: 'The current project stays in Projects if it was saved. This screen will be cleared so you can add new clips.',
        actions: [
          { label: 'Cancel', cls: 'secondary-btn' },
          { label: 'New project', cls: 'primary-btn', fn: go }
        ]
      });
      return;
    }
    go();
  }

  function openProject(id) {
    return root.VEStore.getProject(id).then(function (proj) {
      if (!proj) throw new Error('That project is no longer saved on this device.');
      var ids = (proj.clips || []).map(function (c) { return c.fileId; });
      return root.VEStore.getFiles(ids).then(function (map) {
        var missing = (proj.clips || []).filter(function (c) { return !map[c.fileId]; });
        if (missing.length && missing.length === (proj.clips || []).length) {
          throw new Error('The video files for this project are missing from this browser\'s storage.');
        }
        pauseSequence();
        disposePlayers();
        files = map;
        marks = {};
        projectId = proj.id;
        projectName = proj.name || 'Untitled project';
        projectCreated = proj.created || Date.now();
        var keptClips = (proj.clips || []).filter(function (c) { return map[c.fileId]; });
        history.reset(F.migrateState({
          fade: proj.fade,
          outputSize: proj.outputSize,
          clips: keptClips,
          overlays: proj.overlays
        }));
        selectedOverlayId = (proj.overlays && proj.overlays[0] && proj.overlays[0].id) || '';
        setSelected(keptClips[0] && keptClips[0].id);
        globalTime = 0;
        writePrefs({ currentProjectId: projectId });
        refresh();
        if (keptClips.length) seekGlobal(0, false);
        setSaveState('Saved');
        if (missing.length) {
          root.VEDlg.message(
            'Some clips are missing',
            'This project opened, but ' + missing.length + ' clip(s) could not be found in storage and were skipped.'
          );
        }
      });
    }).catch(function (err) {
      root.VEDlg.message('Could not open', (err && err.message) ? err.message : 'The project could not be opened.');
    });
  }

  function renameProject(id, currentName) {
    root.VEDlg.open({
      title: 'Rename project',
      html: '<label for="projName">Name</label><input id="projName" class="dlg-field" maxlength="80" value="' +
        H.escapeHtml(currentName || '') + '">',
      actions: [
        { label: 'Cancel', cls: 'secondary-btn' },
        { label: 'Save', cls: 'primary-btn', fn: function () {
          var name = ($('projName') && $('projName').value || '').trim();
          if (!name) { root.VEDlg.message('Name needed', 'Please enter a project name.'); return false; }
          var finish = function (proj) {
            if (!proj) return;
            proj.name = name;
            proj.updated = Date.now();
            return root.VEStore.saveProject(proj).then(function () {
              if (projectId === id) projectName = name;
              openProjects();
            });
          };
          if (id === projectId) {
            projectName = name;
            ensureProjectMeta();
            saveNow().then(function () { openProjects(); });
          } else {
            root.VEStore.getProject(id).then(finish);
          }
          return false;
        } }
      ],
      onOpen: function () { var el = $('projName'); if (el) { el.focus(); el.select(); } }
    });
  }

  function confirmDeleteProject(id, name) {
    root.VEDlg.open({
      title: 'Delete project?',
      text: 'Delete “' + name + '” from this device? The saved video files for this project will be removed. This cannot be undone.',
      actions: [
        { label: 'Cancel', cls: 'secondary-btn' },
        { label: 'Delete', cls: 'primary-btn', fn: function () {
          root.VEStore.deleteProject(id).then(function () {
            return root.VEStore.gcFiles(id === projectId ? history.fileIds() : []);
          }).then(function () {
            if (id === projectId) clearSession();
            openProjects();
          }).catch(function (err) {
            root.VEDlg.message('Could not delete', (err && err.message) ? err.message : 'Delete failed.');
          });
          return false;
        } }
      ]
    });
  }

  function openProjects() {
    Promise.all([root.VEStore.listProjects(), root.VEStore.estimate()]).then(function (pair) {
      var list = pair[0] || [];
      var est = pair[1] || {};
      var usage = est.supported
        ? ('Storage used: ' + H.formatBytes(est.usage) + (est.quota ? ' of ' + H.formatBytes(est.quota) : ''))
        : 'Storage use is not reported by this browser.';
      var warn = est.low ? '<p class="proj-warn">Storage is almost full. Delete a project to free space.</p>' : '';
      var items = list.length ? list.map(function (p) {
        var dur = S.sequenceDuration(p.clips || []);
        var when = p.updated ? new Date(p.updated).toLocaleString() : '';
        var current = p.id === projectId ? ' current' : '';
        return '<li class="proj-item' + current + '" data-id="' + H.escapeHtml(p.id) + '">' +
          '<div class="proj-info"><div class="proj-name">' + H.escapeHtml(p.name || 'Untitled') +
          (p.id === projectId ? ' (open)' : '') + '</div><div class="proj-sub">' +
          H.escapeHtml(H.formatTime(dur)) + (when ? ' · ' + H.escapeHtml(when) : '') +
          ' · ' + (p.clips ? p.clips.length : 0) + ' clip' + ((p.clips && p.clips.length === 1) ? '' : 's') +
          '</div></div>' +
          '<button type="button" class="btn secondary-btn" data-act="open">Open</button>' +
          '<button type="button" class="btn secondary-btn" data-act="rename">Rename</button>' +
          '<button type="button" class="btn secondary-btn" data-act="delete">Delete</button>' +
          '</li>';
      }).join('') : '<li class="proj-meta">No saved projects yet. Add a clip and it will be saved automatically.</li>';
      root.VEDlg.open({
        title: 'Projects',
        wide: true,
        html: '<p class="proj-meta">' + H.escapeHtml(usage) + '</p>' + warn +
          '<ul class="proj-list" id="projList">' + items + '</ul>',
        actions: [{ label: 'Close', cls: 'primary-btn' }],
        onOpen: function () {
          var ul = $('projList');
          if (!ul) return;
          ul.addEventListener('click', function (e) {
            var btn = e.target.closest && e.target.closest('button[data-act]');
            if (!btn) return;
            var item = btn.closest('.proj-item');
            if (!item) return;
            var id = item.getAttribute('data-id');
            var act = btn.getAttribute('data-act');
            var name = item.querySelector('.proj-name');
            var nm = name ? name.textContent.replace(/ \(open\)$/, '') : '';
            if (act === 'open') {
              if (id === projectId) { root.VEDlg.close(); return; }
              if (projectId && clips().length) saveNow();
              root.VEDlg.close();
              openProject(id);
            } else if (act === 'rename') {
              renameProject(id, nm);
            } else if (act === 'delete') {
              confirmDeleteProject(id, nm);
            }
          });
        }
      });
    }).catch(function (err) {
      root.VEDlg.message('Projects unavailable', (err && err.message) ? err.message : 'Could not read project storage.');
    });
  }


  function setAdjTab(tab) {
    adjTab = tab === 'motion' || tab === 'titles' ? tab : 'look';
    var tabs = document.querySelectorAll('#adjTabs button');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === adjTab);
    }
    ['look', 'motion', 'titles'].forEach(function (name) {
      var pan = name === 'look' ? $('adjLook') : name === 'motion' ? $('adjMotion') : $('adjTitles');
      if (pan) pan.classList.toggle('hidden', name !== adjTab);
    });
    layoutPreview();
    if (root.VETip && VETip.sweep) VETip.sweep();
  }

  function patchClip(partial, record) {
    var st = state();
    var i = selectedIndex();
    if (i < 0) return;
    var next = S.copyClips(st.clips);
    var merged = {};
    Object.keys(next[i]).forEach(function (k) { merged[k] = next[i][k]; });
    Object.keys(partial).forEach(function (k) { merged[k] = partial[k]; });
    next[i] = F.migrateClip(merged);
    var srcKeep = null;
    var loc = S.globalToLocal(globalTime, st.clips);
    if (loc && loc.clip.id === next[i].id) srcKeep = loc.sourceTime;
    commit({ clips: next }, record);
    if (srcKeep != null) {
      var nst = state();
      var ni = S.findIndex(nst.clips, next[i].id);
      if (ni >= 0) seekGlobal(S.localToGlobal(ni, srcKeep, nst.clips), playing);
    }
  }

  function sliderRecord(evt) {
    return evt.type === 'change' || evt.type === 'pointerup';
  }

  function bindFxSlider(id, key, fmt) {
    var el = $(id);
    if (!el) return;
    var first = false;
    function apply(record) {
      var v = Number(el.value);
      var label = $(id + 'V');
      if (label) label.textContent = fmt ? fmt(v) : (Math.round(v) + '%');
      var patch = {};
      patch[key] = v;
      patchClip(patch, !!record);
    }
    el.addEventListener('pointerdown', function () { fxSliding = true; first = true; });
    el.addEventListener('input', function () { apply(first); first = false; });
    el.addEventListener('change', function () { apply(first); first = false; fxSliding = false; });
    el.addEventListener('pointerup', function () { fxSliding = false; first = false; });
  }

  function applyLooks() {
    var st = state();
    st.clips.forEach(function (clip) {
      var rec = players[clip.id];
      if (!rec) return;
      rec.video.style.filter = F.cssFilter(clip);
      try { rec.video.playbackRate = F.normalizeSpeed(clip.speed); } catch (_) { /* ok */ }
      try { rec.video.volume = clip.mute ? 0 : Math.min(1, Math.max(0, (Number(clip.volume) || 0) / 100)); } catch (_) { /* ok */ }
      if (playing && playingId === clip.id) setGain(rec, F.audioGain(clip, 1));
    });
  }

  function layoutPreview() {
    var frame = $('videoFrame');
    var stage = $('previewStage');
    if (!frame || !stage) return;
    var st = state();
    var size = F.outputSize(st.clips, st.outputSize);
    var fw = frame.clientWidth;
    var fh = frame.clientHeight;
    if (fw < 2 || fh < 2) return;
    var scale = Math.min(fw / size.width, fh / size.height);
    var dw = Math.max(2, size.width * scale);
    var dh = Math.max(2, size.height * scale);
    stage.style.width = dw + 'px';
    stage.style.height = dh + 'px';
    var clip = selected();
    if (clip && players[clip.id]) layoutActiveVideo(clip, dw, dh, adjTab === 'look');
    paintOverlays();
    paintCrop(dw, dh, clip);
  }

  function uncroppedBox(clip, stageW, stageH) {
    var rot = F.rotatedSize(clip.width || 16, clip.height || 9, clip.rotate);
    if (!(rot.width > 0) || !(rot.height > 0)) rot = { width: 16, height: 9 };
    var s = Math.min(stageW / rot.width, stageH / rot.height);
    var w = rot.width * s;
    var h = rot.height * s;
    return { x: (stageW - w) / 2, y: (stageH - h) / 2, w: w, h: h, rot: rot, scale: s };
  }

  function layoutActiveVideo(clip, stageW, stageH, showFull) {
    var rec = players[clip.id];
    if (!rec) return;
    var v = rec.video;
    var c = F.migrateClip(clip);
    var srcW = v.videoWidth || c.width || 16;
    var srcH = v.videoHeight || c.height || 9;
    var rotS = F.rotatedSize(srcW, srcH, c.rotate);
    var crop = showFull ? { x: 0, y: 0, w: 1, h: 1 } : F.normalizeCrop(c.crop);
    var cropW = Math.max(1, rotS.width * crop.w);
    var cropH = Math.max(1, rotS.height * crop.h);
    var s = Math.min(stageW / cropW, stageH / cropH);
    var dispRotW = rotS.width * s;
    var dispRotH = rotS.height * s;
    var elW = (c.rotate === 90 || c.rotate === 270) ? dispRotH : dispRotW;
    var elH = (c.rotate === 90 || c.rotate === 270) ? dispRotW : dispRotH;
    var boxW = cropW * s;
    var boxH = cropH * s;
    var boxX = (stageW - boxW) / 2;
    var boxY = (stageH - boxH) / 2;
    var imgX = boxX - crop.x * dispRotW;
    var imgY = boxY - crop.y * dispRotH;
    v.style.width = elW + 'px';
    v.style.height = elH + 'px';
    v.style.left = (imgX + dispRotW / 2) + 'px';
    v.style.top = (imgY + dispRotH / 2) + 'px';
    v.style.filter = F.cssFilter(c);
    var sx = c.flipH ? -1 : 1;
    var sy = c.flipV ? -1 : 1;
    v.style.transform = 'translate(-50%, -50%) rotate(' + c.rotate + 'deg) scale(' + sx + ',' + sy + ')';
  }

  function paintCrop(stageW, stageH, clip) {
    var layer = $('cropLayer');
    var rect = $('cropRect');
    if (!layer || !rect) return;
    var show = adjTab === 'look' && clip && !exporting;
    layer.classList.toggle('hidden', !show);
    if (!show || !clip) return;
    var stage = $('previewStage');
    var sw = stageW || (stage && stage.clientWidth) || 1;
    var sh = stageH || (stage && stage.clientHeight) || 1;
    var box = uncroppedBox(clip, sw, sh);
    var c = F.normalizeCrop(clip.crop);
    rect.style.left = (box.x + c.x * box.w) + 'px';
    rect.style.top = (box.y + c.y * box.h) + 'px';
    rect.style.width = (c.w * box.w) + 'px';
    rect.style.height = (c.h * box.h) + 'px';
  }

  function cropFromEvent(ev, clip) {
    var stage = $('previewStage');
    if (!stage || !clip) return null;
    var sr = stage.getBoundingClientRect();
    var box = uncroppedBox(clip, sr.width, sr.height);
    if (box.w < 2 || box.h < 2) return null;
    return {
      x: (ev.clientX - sr.left - box.x) / box.w,
      y: (ev.clientY - sr.top - box.y) / box.h,
      box: box
    };
  }

  function onCropDown(ev) {
    if (exporting || adjTab !== 'look') return;
    var clip = selected();
    if (!clip) return;
    var handle = ev.target.closest && ev.target.closest('.crop-h');
    var which = handle ? handle.getAttribute('data-h') : 'move';
    if (ev.target.id !== 'cropRect' && ev.target !== $('cropLayer') && !handle) return;
    if (ev.target.id === 'cropLayer') return;
    ev.preventDefault();
    ev.stopPropagation();
    var pos = cropFromEvent(ev, clip);
    if (!pos) return;
    cropDrag = { which: which, start: pos, crop: F.normalizeCrop(clip.crop) };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (_) { /* ok */ }
  }

  function onCropMove(ev) {
    if (!cropDrag) return;
    var clip = selected();
    if (!clip) return;
    ev.preventDefault();
    var pos = cropFromEvent(ev, clip);
    if (!pos) return;
    var c = {
      x: cropDrag.crop.x,
      y: cropDrag.crop.y,
      w: cropDrag.crop.w,
      h: cropDrag.crop.h
    };
    var dx = pos.x - cropDrag.start.x;
    var dy = pos.y - cropDrag.start.y;
    var w = cropDrag.which;
    if (w === 'move') { c.x += dx; c.y += dy; }
    if (w.indexOf('n') >= 0) { c.y += dy; c.h -= dy; }
    if (w.indexOf('s') >= 0) { c.h += dy; }
    if (w.indexOf('w') >= 0) { c.x += dx; c.w -= dx; }
    if (w.indexOf('e') >= 0) { c.w += dx; }
    patchClip({ crop: F.normalizeCrop(c) }, false);
  }

  function onCropUp() {
    if (!cropDrag) return;
    cropDrag = null;
    var clip = selected();
    if (clip) patchClip({ crop: clip.crop }, true);
  }

  function syncAdjust() {
    var clip = selected();
    var st = state();
    var out = $('outputSize');
    if (out && document.activeElement !== out) out.value = st.outputSize || 'auto';
    if (!clip) return;
    function setSlider(id, val, fmt) {
      var el = $(id);
      var lab = $(id + 'V');
      if (el && document.activeElement !== el) el.value = String(val);
      if (lab) lab.textContent = fmt ? fmt(val) : (Math.round(val) + '%');
    }
    setSlider('fxBrightness', clip.brightness);
    setSlider('fxContrast', clip.contrast);
    setSlider('fxSaturation', clip.saturation);
    setSlider('fxGreyscale', clip.greyscale);
    setSlider('fxSepia', clip.sepia);
    setSlider('fxBlur', clip.blur, function (v) { return String(v); });
    setSlider('fxVolume', clip.volume);
    var mute = $('fxMute');
    if (mute) mute.checked = !!clip.mute;
    var speedSeg = $('speedSeg');
    if (speedSeg) {
      var bs = speedSeg.querySelectorAll('button');
      var sp = String(F.normalizeSpeed(clip.speed));
      for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-v') === sp);
    }
    if (!fxSliding && !cropDrag) {
      var c = F.normalizeCrop(clip.crop);
      ['X', 'Y', 'W', 'H'].forEach(function (k) {
        var el = $('crop' + k);
        if (el && document.activeElement !== el) {
          var val = k === 'X' ? c.x : k === 'Y' ? c.y : k === 'W' ? c.w : c.h;
          el.value = String(Math.round(val * 100));
        }
      });
    }
    paintTitleList();
    syncTitleEditor();
  }

  function paintTitleList() {
    var ul = $('titleList');
    if (!ul) return;
    var list = state().overlays || [];
    ul.innerHTML = '';
    list.forEach(function (o) {
      var li = document.createElement('li');
      if (o.id === selectedOverlayId) li.className = 'selected';
      li.setAttribute('data-id', o.id);
      li.textContent = (o.text || 'Title').split('\n')[0] + '  ·  ' + H.formatTime(o.start) + '–' + H.formatTime(o.end);
      li.addEventListener('click', function () {
        selectedOverlayId = o.id;
        paintTitleList();
        syncTitleEditor();
        paintOverlays();
      });
      ul.appendChild(li);
    });
    var del = $('deleteTitleBtn');
    if (del) del.disabled = exporting || !selectedOverlayId;
  }

  function selectedOverlay() {
    var list = state().overlays || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === selectedOverlayId) return list[i];
    return null;
  }

  function syncTitleEditor() {
    var ed = $('titleEditor');
    var o = selectedOverlay();
    if (ed) ed.classList.toggle('hidden', !o);
    if (!o) return;
    function fill(id, val) {
      var el = $(id);
      if (el && document.activeElement !== el) el.value = val;
    }
    fill('titleText', o.text);
    fill('titleStart', H.formatTime(o.start));
    fill('titleEnd', H.formatTime(o.end));
    fill('titleColor', o.color);
    var box = $('titleBox');
    if (box) box.checked = !!o.box;
    var size = $('titleSize');
    var sizeV = $('titleSizeV');
    if (size && document.activeElement !== size) size.value = String(Math.round(o.size * 100));
    if (sizeV) sizeV.textContent = Math.round(o.size * 100) + '%';
    function fadeSlider(id, sec) {
      var el = $(id);
      var lab = $(id + 'V');
      if (el && document.activeElement !== el) el.value = String(Math.round(sec * 10));
      if (lab) lab.textContent = (Math.round(sec * 10) / 10) + 's';
    }
    fadeSlider('titleFadeIn', o.fadeIn);
    fadeSlider('titleFadeOut', o.fadeOut);
    var pos = $('titlePos');
    if (pos) {
      var bs = pos.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) {
        bs[i].classList.toggle('on', bs[i].getAttribute('data-v') === o.preset);
      }
    }
  }

  function patchOverlay(partial, record) {
    var st = state();
    var list = F.copyOverlays(st.overlays);
    var i;
    for (i = 0; i < list.length; i++) if (list[i].id === selectedOverlayId) break;
    if (i === list.length) return;
    var merged = {};
    Object.keys(list[i]).forEach(function (k) { merged[k] = list[i][k]; });
    Object.keys(partial).forEach(function (k) { merged[k] = partial[k]; });
    if (partial.preset && partial.preset !== 'custom') {
      var xy = F.presetPosition(partial.preset);
      merged.x = xy[0];
      merged.y = xy[1];
    }
    list[i] = F.migrateOverlay(merged);
    commit({ overlays: list }, record !== false);
    selectedOverlayId = list[i].id;
  }

  function addTitle() {
    var st = state();
    var total = S.sequenceDuration(st.clips);
    var o = F.migrateOverlay(F.defaultOverlay());
    o.id = H.uid('t');
    o.start = globalTime;
    o.end = Math.min(total || (globalTime + 3), globalTime + 3);
    if (o.end <= o.start) o.end = o.start + 1;
    var list = F.copyOverlays(st.overlays);
    list.push(o);
    selectedOverlayId = o.id;
    setAdjTab('titles');
    commit({ overlays: list }, true);
  }

  function deleteTitle() {
    if (!selectedOverlayId) return;
    var st = state();
    var list = F.copyOverlays(st.overlays).filter(function (o) { return o.id !== selectedOverlayId; });
    selectedOverlayId = list[0] ? list[0].id : '';
    commit({ overlays: list }, true);
  }

  function paintOverlays() {
    var layer = $('overlayLayer');
    if (!layer) return;
    var st = state();
    var size = F.outputSize(st.clips, st.outputSize);
    layer.innerHTML = '';
    (st.overlays || []).forEach(function (o) {
      var a = F.overlayAlpha(o, globalTime);
      if (a <= 0 && o.id !== selectedOverlayId) return;
      var div = document.createElement('div');
      div.className = 'overlay-item' + (o.box ? ' has-box' : '') + (o.id === selectedOverlayId ? ' selected' : '');
      div.setAttribute('data-id', o.id);
      div.textContent = o.text || '';
      div.style.left = (o.x * 100) + '%';
      div.style.top = (o.y * 100) + '%';
      div.style.fontSize = (o.size * size.height) * (layer.clientHeight / Math.max(1, size.height)) + 'px';
      div.style.color = o.color;
      div.style.opacity = o.id === selectedOverlayId && a <= 0 ? 0.45 : String(a || 0);
      if (a > 0 || o.id === selectedOverlayId) {
        div.style.pointerEvents = 'auto';
        div.addEventListener('pointerdown', onOverlayPointerDown);
      }
      layer.appendChild(div);
    });
  }

  var overlayDrag = null;
  function onOverlayPointerDown(ev) {
    var id = ev.currentTarget.getAttribute('data-id');
    selectedOverlayId = id;
    setAdjTab('titles');
    paintTitleList();
    syncTitleEditor();
    ev.preventDefault();
    ev.stopPropagation();
    var layer = $('overlayLayer');
    var r = layer.getBoundingClientRect();
    overlayDrag = { id: id, pointerId: ev.pointerId };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (_) { /* ok */ }
    ev.currentTarget.addEventListener('pointermove', onOverlayMove);
    ev.currentTarget.addEventListener('pointerup', onOverlayUp);
    ev.currentTarget.addEventListener('pointercancel', onOverlayUp);
  }
  function onOverlayMove(ev) {
    if (!overlayDrag) return;
    var layer = $('overlayLayer');
    var r = layer.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    var x = F.clamp((ev.clientX - r.left) / r.width, 0, 1);
    var y = F.clamp((ev.clientY - r.top) / r.height, 0, 1);
    patchOverlay({ preset: 'custom', x: x, y: y }, false);
  }
  function onOverlayUp() {
    if (!overlayDrag) return;
    overlayDrag = null;
    var o = selectedOverlay();
    if (o) patchOverlay({ preset: 'custom', x: o.x, y: o.y }, true);
  }

  function saveFrame() {
    if (exporting || !clips().length) return;
    var st = state();
    var loc = S.globalToLocal(globalTime, st.clips);
    if (!loc) return;
    var rec = ensurePlayer(loc.clip);
    if (!rec) return;
    showClip(loc.clip.id);
    var go = function () {
      var size = F.outputSize(st.clips, st.outputSize);
      var usedFilter = filterOk;
      if (!filterOk && st.clips.some(function (c) { return F.hasFilter(c); })) usedFilter = false;
      root.VEDraw.snapshotBlob({
        video: rec.video,
        clip: loc.clip,
        overlays: st.overlays,
        time: globalTime,
        size: size,
        filterOk: usedFilter
      }).then(function (blob) {
        var name = (st.clips[0] && st.clips[0].name || 'video').replace(/\.[^.]+$/, '') + '_frame.png';
        root.VEExport.downloadBlob(blob, name);
        var note = 'Saved as ' + name + '.';
        if (!usedFilter && st.clips.some(function (c) { return F.hasFilter(c); })) {
          note += ' This browser could not paint colour filters into the image, so those looks were left off.';
        }
        root.VEDlg.message('Frame saved', note);
      }).catch(function (err) {
        root.VEDlg.message('Could not save the frame', (err && err.message) ? err.message : 'The snapshot failed.');
      });
    };
    if (Math.abs(rec.video.currentTime - loc.sourceTime) > 0.04) {
      rec.video.addEventListener('seeked', function once() {
        rec.video.removeEventListener('seeked', once);
        go();
      });
      try { rec.video.currentTime = loc.sourceTime; } catch (_) { go(); }
    } else go();
  }

  function openHelp() {
    root.VEDlg.open({
      title: 'Keyboard shortcuts',
      wide: true,
      html: '<dl class="shortcut-list">' +
        '<dt>Space</dt><dd>Play or pause the sequence</dd>' +
        '<dt>← →</dt><dd>Step one frame back or forward</dd>' +
        '<dt>I / O</dt><dd>Set In or Out on the selected clip</dd>' +
        '<dt>S</dt><dd>Split the clip at the playhead</dd>' +
        '<dt>Delete</dt><dd>Cut the In–Out selection</dd>' +
        '<dt>Ctrl+Z / Ctrl+Y</dt><dd>Undo / Redo</dd>' +
        '<dt>P</dt><dd>Save the current frame as a PNG</dd>' +
        '<dt>?</dt><dd>Show this list</dd>' +
        '</dl>',
      actions: [{ label: 'Close', cls: 'primary-btn' }]
    });
  }

  function openSettings() {
    var cur = String((root.VETip && VETip.delay()) || 100);
    root.VEDlg.open({
      title: 'Settings',
      html: '<p>Hover tips (mouse only). Off hides them completely.</p>' +
        '<div class="seg" id="tipSeg" role="group" aria-label="Hover tip delay">' +
        '<button type="button" data-v="0">Off</button>' +
        '<button type="button" data-v="100">100 ms</button>' +
        '<button type="button" data-v="500">500 ms</button>' +
        '<button type="button" data-v="1000">1000 ms</button></div>',
      actions: [{ label: 'Close', cls: 'primary-btn' }],
      onOpen: function () {
        var seg = $('tipSeg');
        if (!seg) return;
        var buttons = seg.querySelectorAll('button');
        function paint() {
          var d = String((root.VETip && VETip.delay()) || 100);
          for (var i = 0; i < buttons.length; i++) buttons[i].classList.toggle('on', buttons[i].getAttribute('data-v') === d);
        }
        paint();
        seg.addEventListener('click', function (e) {
          var b = e.target.closest && e.target.closest('button');
          if (!b) return;
          if (root.VETip) VETip.setDelay(Number(b.getAttribute('data-v')));
          paint();
        });
      }
    });
  }

  function startExport() {
    if (exporting) return;
    var st = state();
    var total = S.sequenceDuration(st.clips);
    if (total < H.MIN_EXPORT) {
      root.VEDlg.message('Too short', 'The edited video must be at least half a second long to export.');
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !root.VEExport.pickMime()) {
      root.VEDlg.message(
        'Export not supported',
        'This browser cannot record a video stream. Try Chrome or Edge, or a recent Firefox.'
      );
      return;
    }
    pauseSequence();
    ensureAudio();
    st.clips.forEach(function (c) { hookAudio(ensurePlayer(c)); });
    if (!audioDest) {
      root.VEDlg.message('Export not supported', 'This browser cannot mix audio for export.');
      return;
    }

    var skipLooks = !filterOk && st.clips.some(function (c) { return F.hasFilter(c); });
    if (skipLooks && !startExport._ok) {
      root.VEDlg.open({
        title: 'Filters will be skipped',
        text: 'This browser cannot apply colour filters while exporting (common on Safari). The file will be exported without brightness, contrast, saturation, greyscale, sepia or blur. Rotate, crop, speed and titles still apply. The preview will still show the filters.',
        actions: [
          { label: 'Cancel', cls: 'secondary-btn' },
          { label: 'Export anyway', cls: 'primary-btn', fn: function () { startExport._ok = true; startExport(); startExport._ok = false; } }
        ]
      });
      return;
    }

    exporting = true;
    setBusyButtons(true);
    showClip(st.clips[0] && st.clips[0].id);
    var canvas = $('exportCanvas');
    if (canvas) canvas.classList.remove('hidden');
    refresh();

    var note = 'Export plays the kept parts in real time, so this takes about ' +
      formatEta(total) + '. Fades, looks and titles are drawn during export. Leave this tab open until it finishes.' +
      (skipLooks ? ' Colour filters will be left off in this browser.' : '');
    var prog = root.VEDlg.progress({
      title: 'Exporting',
      note: note,
      onCancel: function () { if (exportJob) exportJob.cancel(); }
    });

    exportJob = root.VEExport.exportSequence(st.clips, st.fade, {
      canvas: canvas,
      audioStream: audioDest.stream,
      overlays: st.overlays || [],
      outputSize: st.outputSize,
      filterOk: filterOk,
      getPlayer: function (clip) { return players[clip.id]; },
      onShow: function (clip) { showClip(clip.id); if (canvas) canvas.classList.remove('hidden'); },
      onStatus: function (text) {
        prog.update(null, null, text + ' This takes about ' + formatEta(total) + '.');
      },
      onProgress: function (done, all) {
        var pct = all > 0 ? (done / all) * 100 : 0;
        var left = Math.max(0, all - done);
        prog.update(
          pct,
          Math.round(pct) + '%  ·  ' + H.formatTime(done) + ' / ' + H.formatTime(all),
          'Export runs in real time. About ' + formatEta(left) + ' left. Leave this tab open.'
        );
      }
    });

    exportJob.promise.then(function (blob) {
      prog.close();
      exportJob = null;
      exporting = false;
      setBusyButtons(false);
      if (canvas) canvas.classList.add('hidden');
      silenceAll();
      Object.keys(players).forEach(function (id) { try { players[id].video.pause(); } catch (_) { /* ok */ } });
      refresh();
      showClip(selectedId);
      if (!blob) return;
      if (!blob.size) {
        root.VEDlg.message('Export failed', 'The recording was empty. Try a different browser, or a slightly longer sequence.');
        return;
      }
      var first = st.clips[0];
      var mime = blob.type || (root.VEExport.pickMime() || '');
      var name = H.exportName(first && first.name, mime);
      root.VEExport.downloadBlob(blob, name);
      root.VEDlg.message('Export finished', 'Saved as ' + name + '.');
    }).catch(function (err) {
      prog.close();
      exportJob = null;
      exporting = false;
      setBusyButtons(false);
      if (canvas) canvas.classList.add('hidden');
      silenceAll();
      refresh();
      showClip(selectedId);
      var msg = (err && err.message) ? err.message : String(err || 'Unknown error');
      root.VEDlg.message(
        'Export failed',
        msg + ' Some browsers cannot record a canvas stream. Try Chrome or Edge.'
      );
    });
  }

  function typingInField() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  }

  function handleOnFocus() {
    var el = document.activeElement;
    return el && (el.id === 'handleStart' || el.id === 'handleEnd');
  }

  function onKey(ev) {
    if (typingInField()) return;
    var dlg = $('dlg');
    if (dlg && !dlg.hidden) return;
    var key = ev.key;
    var ctrl = ev.ctrlKey || ev.metaKey;
    if (ctrl && (key === 'z' || key === 'Z')) {
      ev.preventDefault();
      if (ev.shiftKey) redo(); else undo();
      return;
    }
    if (ctrl && (key === 'y' || key === 'Y')) { ev.preventDefault(); redo(); return; }
    if (key === '?' || (ev.shiftKey && key === '/')) { ev.preventDefault(); openHelp(); return; }
    if (!clips().length || exporting) return;
    if (key === 'p' || key === 'P') { ev.preventDefault(); saveFrame(); return; }
    if (key === ' ' || key === 'Spacebar') { ev.preventDefault(); togglePlay(); return; }
    if (key === 'ArrowLeft' && !handleOnFocus()) { ev.preventDefault(); stepFrame(-1); return; }
    if (key === 'ArrowRight' && !handleOnFocus()) { ev.preventDefault(); stepFrame(1); return; }
    if (key === 'i' || key === 'I') { ev.preventDefault(); setMark('start'); return; }
    if (key === 'o' || key === 'O') { ev.preventDefault(); setMark('end'); return; }
    if (key === 's' || key === 'S') { ev.preventDefault(); splitAtPlayhead(); return; }
    if (key === 'Delete' || key === 'Backspace') { ev.preventDefault(); applyCutOrKeep('cut'); }
  }

  function bindDrop(el, highlight) {
    if (!el) return;
    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (highlight) el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', function () {
      if (highlight) el.classList.remove('drag-over');
    });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (highlight) el.classList.remove('drag-over');
      if (exporting) return;
      var list = e.dataTransfer && e.dataTransfer.files;
      if (list && list.length) addFiles(list, false);
    });
  }

  function insertIndexFromEvent(ev, strip) {
    var blocks = strip.querySelectorAll('.clip-block');
    if (!blocks.length) return 0;
    for (var i = 0; i < blocks.length; i++) {
      var r = blocks[i].getBoundingClientRect();
      var mid = r.left + r.width / 2;
      if (ev.clientX < mid) return i;
    }
    return blocks.length;
  }

  function onStripPointerDown(ev) {
    if (exporting) return;
    var block = ev.target.closest && ev.target.closest('.clip-block');
    if (!block) return;
    if (ev.button != null && ev.button !== 0) return;
    var id = block.getAttribute('data-id');
    drag = {
      id: id,
      from: S.findIndex(clips(), id),
      insert: S.findIndex(clips(), id),
      x: ev.clientX,
      y: ev.clientY,
      active: false,
      pointerId: ev.pointerId
    };
    try { $('clipStrip').setPointerCapture(ev.pointerId); } catch (_) { /* ok */ }
  }

  function onStripPointerMove(ev) {
    if (!drag) return;
    var strip = $('clipStrip');
    if (!drag.active && Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 8) {
      drag.active = true;
      pauseSequence();
    }
    if (!drag.active) return;
    ev.preventDefault();
    var insert = insertIndexFromEvent(ev, strip);
    // Account for the hole left by the dragged clip: insert is a target index
    // in the current visual list. After removal, if insert > from, subtract 1? 
    // We show a gap at `insert` in the current (unmoved) list. On drop we
    // map to moveClip's `to` as: if insert > from, insert - 1, else insert.
    drag.insert = insert;
    paintStrip();
  }

  function onStripPointerUp(ev) {
    if (!drag) return;
    var info = drag;
    drag = null;
    try { $('clipStrip').releasePointerCapture(ev.pointerId); } catch (_) { /* ok */ }
    if (info.active) {
      var to = info.insert;
      if (to > info.from) to = to - 1;
      var st = state();
      var next = S.moveClip(st.clips, info.from, to);
      if (!S.sameState(st, { fade: st.fade, clips: next })) {
        setSelected(info.id);
        commit({ fade: st.fade, clips: next }, true);
      } else {
        paintStrip();
      }
    } else {
      setSelected(info.id);
      var st2 = state();
      var i = S.findIndex(st2.clips, info.id);
      if (i >= 0) {
        var first = st2.clips[i].segments[0];
        globalTime = S.localToGlobal(i, first ? first.start : 0, st2.clips);
      }
      refresh();
      seekGlobal(globalTime, false);
    }
  }

  function init() {
    rangeApi = root.VERange.create({
      track: $('rangeTrack'),
      fill: $('rangeFill'),
      removedLayer: $('rangeRemoved'),
      handleStart: $('handleStart'),
      handleEnd: $('handleEnd'),
      playhead: $('playhead'),
      startChip: $('startChip'),
      endChip: $('endChip'),
      durEl: $('selDur'),
      onChange: function (start, end) {
        if (selectedId) marks[selectedId] = { start: start, end: end };
      },
      onSeek: function (t) {
        var clip = selected();
        if (!clip) return;
        pauseSequence();
        var st = state();
        var i = S.findIndex(st.clips, clip.id);
        var rec = ensurePlayer(clip);
        showClip(clip.id);
        if (rec) {
          seeking = true;
          try { rec.video.currentTime = t; } catch (_) { /* ok */ }
          setTimeout(function () { seeking = false; }, 40);
        }
        if (E.containingSegment(t, clip.segments)) {
          globalTime = S.localToGlobal(i, t, st.clips);
        }
        paintTime();
      }
    });

    seekApi = root.VERange.createSeek({
      track: $('seqTrack'),
      fill: $('seqFill'),
      playhead: $('seqPlayhead'),
      onSeek: function (t) {
        pauseSequence();
        seekGlobal(t, false);
      }
    });

    var videoInput = $('videoInput');
    if (videoInput) {
      videoInput.addEventListener('change', function (e) {
        var list = e.target.files;
        if (list && list.length) addFiles(list, false);
        e.target.value = '';
      });
    }

    bindDrop(document.querySelector('.drop-zone'), true);
    bindDrop($('editorSection'), false);

    $('playBtn') && $('playBtn').addEventListener('click', togglePlay);
    $('frameBackBtn') && $('frameBackBtn').addEventListener('click', function () { stepFrame(-1); });
    $('frameFwdBtn') && $('frameFwdBtn').addEventListener('click', function () { stepFrame(1); });
    $('setInBtn') && $('setInBtn').addEventListener('click', function () { setMark('start'); });
    $('setOutBtn') && $('setOutBtn').addEventListener('click', function () { setMark('end'); });
    $('cutBtn') && $('cutBtn').addEventListener('click', function () { applyCutOrKeep('cut'); });
    $('keepBtn') && $('keepBtn').addEventListener('click', function () { applyCutOrKeep('keep'); });
    $('undoBtn') && $('undoBtn').addEventListener('click', undo);
    $('redoBtn') && $('redoBtn').addEventListener('click', redo);
    $('exportBtn') && $('exportBtn').addEventListener('click', startExport);
    $('resetBtn') && $('resetBtn').addEventListener('click', newProject);
    $('addClipBtn') && $('addClipBtn').addEventListener('click', function () {
      if (videoInput) videoInput.click();
    });
    $('splitBtn') && $('splitBtn').addEventListener('click', splitAtPlayhead);
    $('deleteClipBtn') && $('deleteClipBtn').addEventListener('click', deleteSelectedClip);
    $('moveLeftBtn') && $('moveLeftBtn').addEventListener('click', function () { moveSelected(-1); });
    $('moveRightBtn') && $('moveRightBtn').addEventListener('click', function () { moveSelected(1); });
    $('projectsBtn') && $('projectsBtn').addEventListener('click', function () { openProjects(); });
    $('fadeSeg') && $('fadeSeg').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b) return;
      setFade(b.getAttribute('data-v'));
    });

    var strip = $('clipStrip');
    if (strip) {
      strip.addEventListener('pointerdown', onStripPointerDown);
      strip.addEventListener('pointermove', onStripPointerMove);
      strip.addEventListener('pointerup', onStripPointerUp);
      strip.addEventListener('pointercancel', onStripPointerUp);
    }

    $('helpBtn') && $('helpBtn').addEventListener('click', openHelp);
    $('settingsBtn') && $('settingsBtn').addEventListener('click', openSettings);
    $('snapBtn') && $('snapBtn').addEventListener('click', saveFrame);
    $('outputSize') && $('outputSize').addEventListener('change', function () {
      commit({ outputSize: F.normalizeOutput($('outputSize').value) }, true);
    });
    $('adjTabs') && $('adjTabs').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-tab]');
      if (b) setAdjTab(b.getAttribute('data-tab'));
    });
    bindFxSlider('fxBrightness', 'brightness');
    bindFxSlider('fxContrast', 'contrast');
    bindFxSlider('fxSaturation', 'saturation');
    bindFxSlider('fxGreyscale', 'greyscale');
    bindFxSlider('fxSepia', 'sepia');
    bindFxSlider('fxBlur', 'blur', function (v) { return String(v); });
    bindFxSlider('fxVolume', 'volume');
    $('fxMute') && $('fxMute').addEventListener('change', function () {
      patchClip({ mute: !!$('fxMute').checked }, true);
    });
    $('resetLooksBtn') && $('resetLooksBtn').addEventListener('click', function () {
      patchClip({ brightness: 100, contrast: 100, saturation: 100, greyscale: 0, sepia: 0, blur: 0 }, true);
    });
    $('rotLeftBtn') && $('rotLeftBtn').addEventListener('click', function () {
      var c = selected(); if (c) patchClip({ rotate: F.normalizeRotate(c.rotate - 90) }, true);
    });
    $('rotRightBtn') && $('rotRightBtn').addEventListener('click', function () {
      var c = selected(); if (c) patchClip({ rotate: F.normalizeRotate(c.rotate + 90) }, true);
    });
    $('flipHBtn') && $('flipHBtn').addEventListener('click', function () {
      var c = selected(); if (c) patchClip({ flipH: !c.flipH }, true);
    });
    $('flipVBtn') && $('flipVBtn').addEventListener('click', function () {
      var c = selected(); if (c) patchClip({ flipV: !c.flipV }, true);
    });
    $('resetXformBtn') && $('resetXformBtn').addEventListener('click', function () {
      patchClip({ rotate: 0, flipH: false, flipV: false, crop: { x: 0, y: 0, w: 1, h: 1 } }, true);
    });
    ['X', 'Y', 'W', 'H'].forEach(function (k) {
      var el = $('crop' + k);
      if (!el) return;
      el.addEventListener('change', function () {
        var c = selected();
        if (!c) return;
        var crop = F.normalizeCrop(c.crop);
        var v = Number(el.value) / 100;
        if (k === 'X') crop.x = v;
        if (k === 'Y') crop.y = v;
        if (k === 'W') crop.w = v;
        if (k === 'H') crop.h = v;
        patchClip({ crop: crop }, true);
      });
    });
    $('speedSeg') && $('speedSeg').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (b) patchClip({ speed: Number(b.getAttribute('data-v')) }, true);
    });
    $('addTitleBtn') && $('addTitleBtn').addEventListener('click', addTitle);
    $('deleteTitleBtn') && $('deleteTitleBtn').addEventListener('click', deleteTitle);
    $('titleText') && $('titleText').addEventListener('change', function () {
      patchOverlay({ text: $('titleText').value }, true);
    });
    $('titleStart') && $('titleStart').addEventListener('change', function () {
      var n = H.parseTime($('titleStart').value);
      if (isFinite(n)) patchOverlay({ start: n }, true);
    });
    $('titleEnd') && $('titleEnd').addEventListener('change', function () {
      var n = H.parseTime($('titleEnd').value);
      if (isFinite(n)) patchOverlay({ end: n }, true);
    });
    $('titleStartHere') && $('titleStartHere').addEventListener('click', function () {
      patchOverlay({ start: globalTime }, true);
    });
    $('titleEndHere') && $('titleEndHere').addEventListener('click', function () {
      patchOverlay({ end: globalTime }, true);
    });
    $('titlePos') && $('titlePos').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (b) patchOverlay({ preset: b.getAttribute('data-v') }, true);
    });
    $('titleSize') && $('titleSize').addEventListener('input', function () {
      patchOverlay({ size: Number($('titleSize').value) / 100 }, false);
    });
    $('titleSize') && $('titleSize').addEventListener('change', function () {
      patchOverlay({ size: Number($('titleSize').value) / 100 }, true);
    });
    $('titleFadeIn') && $('titleFadeIn').addEventListener('input', function () {
      patchOverlay({ fadeIn: Number($('titleFadeIn').value) / 10 }, false);
    });
    $('titleFadeIn') && $('titleFadeIn').addEventListener('change', function () {
      patchOverlay({ fadeIn: Number($('titleFadeIn').value) / 10 }, true);
    });
    $('titleFadeOut') && $('titleFadeOut').addEventListener('input', function () {
      patchOverlay({ fadeOut: Number($('titleFadeOut').value) / 10 }, false);
    });
    $('titleFadeOut') && $('titleFadeOut').addEventListener('change', function () {
      patchOverlay({ fadeOut: Number($('titleFadeOut').value) / 10 }, true);
    });
    $('titleColor') && $('titleColor').addEventListener('change', function () {
      patchOverlay({ color: $('titleColor').value }, true);
    });
    $('titleBox') && $('titleBox').addEventListener('change', function () {
      patchOverlay({ box: !!$('titleBox').checked }, true);
    });
    var cropLayer = $('cropLayer');
    if (cropLayer) {
      cropLayer.addEventListener('pointerdown', onCropDown);
      cropLayer.addEventListener('pointermove', onCropMove);
      cropLayer.addEventListener('pointerup', onCropUp);
      cropLayer.addEventListener('pointercancel', onCropUp);
    }
    window.addEventListener('resize', function () { layoutPreview(); });

    document.addEventListener('keydown', onKey);

    if (root.VEDraw && VEDraw.supportsCtxFilter) filterOk = VEDraw.supportsCtxFilter();

    var bootId = prefs().currentProjectId || '';
    root.VEStore.estimate().then(maybeWarnLow).catch(function () { /* ok */ });
    if (bootId) {
      openProject(bootId).then(function () { refresh(); });
    } else {
      refresh();
    }
  }

  root.VEUI = { init: init, RELEASE: RELEASE };
})(typeof window !== 'undefined' ? window : globalThis);
