/* Video Editor — ve_ui.js: open, preview, cut/keep, keys, export wiring. VD1 */
(function (root) {
  'use strict';

  var RELEASE = 'VD1';
  var H = root.VEHelpers;
  var E = root.VEEdits;

  var rangeApi = null;
  var history = null;
  var videoFile = null;
  var objectUrl = null;
  var duration = 0;
  var fps = H.DEFAULT_FPS;
  var playingEdited = false;
  var seeking = false;
  var exporting = false;
  var exportJob = null;
  var skipNextSeekPaint = false;

  function $(id) { return document.getElementById(id); }

  function segs() {
    return history ? history.get() : [];
  }

  function refreshEditUi() {
    var list = segs();
    var kept = E.keptDuration(list);
    if (rangeApi) rangeApi.setSegments(list);
    var editDur = $('editDur');
    if (editDur) editDur.textContent = H.formatTime(kept);
    var undoBtn = $('undoBtn');
    var redoBtn = $('redoBtn');
    if (undoBtn) undoBtn.disabled = exporting || !history || !history.canUndo();
    if (redoBtn) redoBtn.disabled = exporting || !history || !history.canRedo();
    var exportBtn = $('exportBtn');
    if (exportBtn) exportBtn.disabled = exporting || kept < H.MIN_EXPORT;
    var cutBtn = $('cutBtn');
    var keepBtn = $('keepBtn');
    if (cutBtn) cutBtn.disabled = exporting || !videoFile;
    if (keepBtn) keepBtn.disabled = exporting || !videoFile;
  }

  function setPlayLabel(playing) {
    var btn = $('playBtn');
    if (!btn) return;
    btn.textContent = playing ? 'Pause' : 'Play';
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function paintTime() {
    var video = $('videoPreview');
    var cur = $('curTime');
    var src = $('srcDur');
    var t = video ? video.currentTime : 0;
    if (cur) cur.textContent = H.formatTime(t);
    if (src) src.textContent = H.formatTime(duration);
    if (rangeApi && !seeking) rangeApi.setCurrent(t, true);
  }

  function seekTo(t, playIfNeeded) {
    var video = $('videoPreview');
    if (!video || !isFinite(t)) return;
    seeking = true;
    try { video.currentTime = Math.max(0, Math.min(duration, t)); } catch (_) { /* ok */ }
    if (rangeApi) rangeApi.setCurrent(video.currentTime, true);
    paintTime();
    if (playIfNeeded) { /* no-op */ }
    setTimeout(function () { seeking = false; }, 40);
  }

  function cueToKept(t) {
    var n = E.nextKeptTime(t, segs());
    if (n == null) n = E.previousKeptTime(t, segs());
    return n == null ? 0 : n;
  }

  function playEdited() {
    var video = $('videoPreview');
    if (!video || exporting) return;
    var list = segs();
    if (!list.length) return;
    var t = cueToKept(video.currentTime);
    if (E.containingSegment(t, list) && t >= list[list.length - 1].end - 0.04) {
      t = list[0].start;
    }
    if (!E.containingSegment(t, list)) t = list[0].start;
    playingEdited = true;
    setPlayLabel(true);
    if (Math.abs(video.currentTime - t) > 0.04) seekTo(t);
    var p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () {
        playingEdited = false;
        setPlayLabel(false);
      });
    }
  }

  function pauseEdited() {
    var video = $('videoPreview');
    playingEdited = false;
    if (video) video.pause();
    setPlayLabel(false);
  }

  function togglePlay() {
    var video = $('videoPreview');
    if (!video || !videoFile || exporting) return;
    if (playingEdited && !video.paused) pauseEdited();
    else playEdited();
  }

  function onTimeUpdate() {
    var video = $('videoPreview');
    if (!video) return;
    paintTime();
    if (!playingEdited || exporting) return;
    var list = segs();
    var t = video.currentTime;
    var cur = E.containingSegment(t, list);
    if (cur) {
      if (t >= cur.end - 0.04) {
        var idx = -1;
        for (var i = 0; i < list.length; i++) {
          if (list[i].start === cur.start && list[i].end === cur.end) { idx = i; break; }
        }
        var next = idx >= 0 ? list[idx + 1] : null;
        if (next) {
          skipNextSeekPaint = true;
          seekTo(next.start);
        } else {
          try { video.currentTime = cur.end; } catch (_) { /* ok */ }
          pauseEdited();
        }
      }
    } else {
      var n = E.nextKeptTime(t, list);
      if (n != null) seekTo(n);
      else pauseEdited();
    }
  }

  function stepFrame(dir) {
    var video = $('videoPreview');
    if (!video || !videoFile || exporting) return;
    pauseEdited();
    var dt = H.frameStep(fps);
    seekTo(video.currentTime + dir * dt);
  }

  function setMark(which) {
    var video = $('videoPreview');
    if (!rangeApi || !video) return;
    var r = rangeApi.getRange();
    var t = video.currentTime;
    if (which === 'start') rangeApi.setRange(t, r.end, 'start');
    else rangeApi.setRange(r.start, t, 'end');
  }

  function applyCutOrKeep(kind) {
    if (!rangeApi || !history || exporting) return;
    var r = rangeApi.getRange();
    var cur = segs();
    var next = kind === 'keep'
      ? E.keepRange(cur, r.start, r.end)
      : E.cutRange(cur, r.start, r.end);
    if (!next.length) {
      root.VEDlg.message(
        'Nothing left',
        kind === 'keep'
          ? 'Keep selection would remove every remaining part. Move the In and Out marks onto a part you still want to keep.'
          : 'Cut selection would remove every remaining part. Narrow the In and Out marks, or undo a previous cut first.'
      );
      return;
    }
    if (E.sameSegs(cur, next)) {
      root.VEDlg.message(
        'No change',
        kind === 'keep'
          ? 'That range does not overlap any remaining part of the video.'
          : 'That range does not overlap any remaining part of the video.'
      );
      return;
    }
    history.set(next, true);
    refreshEditUi();
    var video = $('videoPreview');
    if (video && !E.containingSegment(video.currentTime, next)) {
      seekTo(cueToKept(video.currentTime));
    }
  }

  function undo() {
    if (!history || exporting || !history.canUndo()) return;
    history.undo();
    refreshEditUi();
  }

  function redo() {
    if (!history || exporting || !history.canRedo()) return;
    history.redo();
    refreshEditUi();
  }

  function revokeUrl() {
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch (_) { /* ok */ }
      objectUrl = null;
    }
  }

  function resetEditor() {
    var video = $('videoPreview');
    var videoInput = $('videoInput');
    pauseEdited();
    if (exportJob) {
      try { exportJob.cancel(); } catch (_) { /* ok */ }
      exportJob = null;
    }
    exporting = false;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    revokeUrl();
    videoFile = null;
    duration = 0;
    fps = H.DEFAULT_FPS;
    history = null;
    if (rangeApi) {
      rangeApi.setDuration(0);
      rangeApi.setSegments([]);
    }
    if (videoInput) videoInput.value = '';
    var editor = $('editorSection');
    var upload = $('uploadSection');
    if (editor) editor.classList.add('hidden');
    if (upload) upload.classList.remove('hidden');
    setPlayLabel(false);
    paintTime();
  }

  function confirmReset() {
    if (exporting) return;
    if (history && history.canUndo()) {
      root.VEDlg.open({
        title: 'Choose another video?',
        text: 'The cuts you have made will be lost. This cannot be undone.',
        actions: [
          { label: 'Cancel', cls: 'secondary-btn' },
          { label: 'Choose another', cls: 'primary-btn', fn: function () { resetEditor(); } }
        ]
      });
      return;
    }
    resetEditor();
  }

  function loadVideo(file) {
    var video = $('videoPreview');
    if (!video || !file) return;
    if (!H.isVideoFile(file)) {
      root.VEDlg.message('Cannot open', 'Please choose a video file the browser can play.');
      return;
    }
    pauseEdited();
    videoFile = file;
    revokeUrl();
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadedmetadata = function () {
      var dur = video.duration;
      if (!isFinite(dur) || dur <= 0) {
        root.VEDlg.message('Cannot open', 'Could not read this video\'s duration.');
        resetEditor();
        return;
      }
      duration = dur;
      fps = H.DEFAULT_FPS;
      history = E.createHistory(E.initialSegments(dur));
      if (rangeApi) {
        rangeApi.setDuration(dur);
        rangeApi.setRange(0, dur, 'both');
        rangeApi.setCurrent(0, true);
        rangeApi.setSegments(history.get());
      }
      $('uploadSection').classList.add('hidden');
      $('editorSection').classList.remove('hidden');
      setPlayLabel(false);
      refreshEditUi();
      paintTime();
    };

    video.onerror = function () {
      root.VEDlg.message(
        'Cannot open',
        'This browser could not play that file. Try MP4 or WebM, or another clip.'
      );
      resetEditor();
    };
  }

  function formatEta(seconds) {
    var s = Math.max(0, Math.round(seconds));
    if (s < 60) return s + ' second' + (s === 1 ? '' : 's');
    var m = Math.floor(s / 60);
    var r = s % 60;
    if (m < 60) {
      return r ? (m + ' min ' + r + ' sec') : (m + ' min');
    }
    return H.formatTime(s);
  }

  function startExport() {
    var video = $('videoPreview');
    if (!video || !history || exporting) return;
    var list = segs();
    var total = E.keptDuration(list);
    if (total < H.MIN_EXPORT) {
      root.VEDlg.message(
        'Too short',
        'The edited video must be at least half a second long to export.'
      );
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !root.VEExport.pickMime()) {
      root.VEDlg.message(
        'Export not supported',
        'This browser cannot record a video stream. Try Chrome or Edge, or a recent Firefox.'
      );
      return;
    }

    pauseEdited();
    exporting = true;
    refreshEditUi();
    ['playBtn', 'frameBackBtn', 'frameFwdBtn', 'setInBtn', 'setOutBtn',
      'cutBtn', 'keepBtn', 'resetBtn'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = true;
    });

    var note = 'Export plays the kept parts in real time, so this takes about ' +
      formatEta(total) + '. Leave this tab open until it finishes.';

    var prog = root.VEDlg.progress({
      title: 'Exporting',
      note: note,
      onCancel: function () {
        if (exportJob) exportJob.cancel();
      }
    });

    exportJob = root.VEExport.exportSegments(video, list, {
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
      ['playBtn', 'frameBackBtn', 'frameFwdBtn', 'setInBtn', 'setOutBtn',
        'cutBtn', 'keepBtn', 'resetBtn'].forEach(function (id) {
        var el = $(id);
        if (el) el.disabled = false;
      });
      refreshEditUi();
      pauseEdited();
      if (!blob) return;
      if (!blob.size) {
        root.VEDlg.message('Export failed', 'The recording was empty. Try a different browser, or a slightly longer selection.');
        return;
      }
      var mime = blob.type || (root.VEExport.pickMime() || '');
      var name = H.exportName(videoFile && videoFile.name, mime);
      root.VEExport.downloadBlob(blob, name);
      root.VEDlg.message('Export finished', 'Saved as ' + name + '.');
    }).catch(function (err) {
      prog.close();
      exportJob = null;
      exporting = false;
      ['playBtn', 'frameBackBtn', 'frameFwdBtn', 'setInBtn', 'setOutBtn',
        'cutBtn', 'keepBtn', 'resetBtn'].forEach(function (id) {
        var el = $(id);
        if (el) el.disabled = false;
      });
      refreshEditUi();
      pauseEdited();
      var msg = (err && err.message) ? err.message : String(err || 'Unknown error');
      root.VEDlg.message(
        'Export failed',
        msg + ' Some browsers cannot record certain codecs. Try Chrome or Edge, or convert the clip to MP4 or WebM first.'
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
    if (!videoFile) return;

    var key = ev.key;
    var ctrl = ev.ctrlKey || ev.metaKey;

    if (ctrl && (key === 'z' || key === 'Z')) {
      ev.preventDefault();
      if (ev.shiftKey) redo();
      else undo();
      return;
    }
    if (ctrl && (key === 'y' || key === 'Y')) {
      ev.preventDefault();
      redo();
      return;
    }
    if (exporting) return;

    if (key === ' ' || key === 'Spacebar') {
      ev.preventDefault();
      togglePlay();
      return;
    }
    if (key === 'ArrowLeft' && !handleOnFocus()) {
      ev.preventDefault();
      stepFrame(-1);
      return;
    }
    if (key === 'ArrowRight' && !handleOnFocus()) {
      ev.preventDefault();
      stepFrame(1);
      return;
    }
    if (key === 'i' || key === 'I') {
      ev.preventDefault();
      setMark('start');
      return;
    }
    if (key === 'o' || key === 'O') {
      ev.preventDefault();
      setMark('end');
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      ev.preventDefault();
      applyCutOrKeep('cut');
    }
  }

  function wireDrop(el, highlight) {
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
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (!H.isVideoFile(file)) {
        root.VEDlg.message('Cannot open', 'Please drop a video file.');
        return;
      }
      if (videoFile && history && history.canUndo()) {
        root.VEDlg.open({
          title: 'Replace this video?',
          text: 'The cuts you have made will be lost. This cannot be undone.',
          actions: [
            { label: 'Cancel', cls: 'secondary-btn' },
            { label: 'Replace', cls: 'primary-btn', fn: function () { loadVideo(file); } }
          ]
        });
        return;
      }
      loadVideo(file);
    });
  }

  function init() {
    var video = $('videoPreview');
    var videoInput = $('videoInput');

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
      onChange: function () { /* painted by range */ },
      onSeek: function (t) {
        if (video && isFinite(t)) {
          pauseEdited();
          seekTo(t);
        }
      }
    });

    if (videoInput) {
      videoInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) loadVideo(file);
      });
    }

    wireDrop(document.querySelector('.drop-zone'), true);
    wireDrop($('editorSection'), false);

    if (video) {
      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('play', function () {
        if (!exporting) {
          playingEdited = true;
          setPlayLabel(true);
        }
      });
      video.addEventListener('pause', function () {
        if (!exporting) setPlayLabel(false);
        if (!exporting) playingEdited = false;
      });
      video.addEventListener('ended', function () {
        pauseEdited();
      });
      video.addEventListener('seeked', function () {
        seeking = false;
        paintTime();
        skipNextSeekPaint = false;
      });
    }

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
    $('resetBtn') && $('resetBtn').addEventListener('click', confirmReset);

    document.addEventListener('keydown', onKey);
    refreshEditUi();
  }

  root.VEUI = { init: init, loadVideo: loadVideo, reset: resetEditor, RELEASE: RELEASE };
})(typeof window !== 'undefined' ? window : globalThis);
