/* Video Editor — ve_ui.js: sequence preview, clips, projects, export wiring. VD2 */
(function (root) {
  'use strict';

  var RELEASE = 'VD2';
  var PREFS = 'video-editor-v1';
  var H = root.VEHelpers;
  var E = root.VEEdits;
  var S = root.VESeq;

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

  function $(id) { return document.getElementById(id); }

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
    var rec = { video: video, url: url, fileId: clip.fileId, source: null, gain: null, hooked: false };
    players[clip.id] = rec;
    var frame = $('videoFrame');
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
  }

  function commit(next, record) {
    history.set(next, record !== false);
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
      fade: st.fade,
      clips: S.copyClips(st.clips)
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
    setGain(rec, 1);
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
        return {
          id: H.uid('c'),
          fileId: fileId,
          name: file.name || 'clip',
          duration: info.duration,
          width: info.width,
          height: info.height,
          thumb: info.thumb || '',
          segments: E.initialSegments(info.duration)
        };
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
          history.reset({ fade: st.fade, clips: nextClips });
        } else {
          history.set({ fade: st.fade, clips: nextClips }, true);
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
    history.reset({ fade: 0, clips: [] });
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
        history.reset({ fade: proj.fade, clips: keptClips });
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

    exporting = true;
    setBusyButtons(true);
    showClip(st.clips[0] && st.clips[0].id);
    var canvas = $('exportCanvas');
    if (canvas) canvas.classList.remove('hidden');
    refresh();

    var note = 'Export plays the kept parts in real time, so this takes about ' +
      formatEta(total) + '. Fades, if set, are drawn during export. Leave this tab open until it finishes.';
    var prog = root.VEDlg.progress({
      title: 'Exporting',
      note: note,
      onCancel: function () { if (exportJob) exportJob.cancel(); }
    });

    exportJob = root.VEExport.exportSequence(st.clips, st.fade, {
      canvas: canvas,
      audioStream: audioDest.stream,
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
    if (!clips().length || exporting) return;
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

    document.addEventListener('keydown', onKey);

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
