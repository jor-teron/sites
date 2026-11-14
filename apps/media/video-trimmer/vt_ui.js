/* Video Trimmer — vt_ui.js: upload, drag-drop, wire range + trim actions. VT1 */
(function (root) {
  'use strict';

  var H = root.VTHelpers;
  var rangeApi = null;
  var videoFile = null;
  var objectUrl = null;

  function $(id) { return document.getElementById(id); }

  function showStatus(text) {
    var banner = $('statusBanner');
    var statusText = $('statusText');
    if (!banner) return;
    banner.classList.remove('hidden');
    if (statusText) statusText.textContent = text || '';
  }

  function hideStatus() {
    var banner = $('statusBanner');
    if (banner) banner.classList.add('hidden');
  }

  function setBusy(busy) {
    ['previewTrimBtn', 'trimBtn', 'resetBtn'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !!busy;
    });
  }

  function revokeUrl() {
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch (_) { /* ok */ }
      objectUrl = null;
    }
  }

  function loadVideo(file) {
    var video = $('videoPreview');
    var uploadSection = $('uploadSection');
    var editorSection = $('editorSection');
    if (!video || !file) return;

    videoFile = file;
    revokeUrl();
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadedmetadata = function () {
      var dur = video.duration;
      if (!isFinite(dur) || dur <= 0) {
        alert('Could not read this video\'s duration.');
        return;
      }
      if (rangeApi) {
        rangeApi.setDuration(dur);
        rangeApi.setRange(0, dur, 'both');
      }
      uploadSection.classList.add('hidden');
      editorSection.classList.remove('hidden');
      hideStatus();
    };
  }

  function reset() {
    var video = $('videoPreview');
    var videoInput = $('videoInput');
    var uploadSection = $('uploadSection');
    var editorSection = $('editorSection');
    if (video) {
      root.VTTrim.cancelMonitors(video);
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    revokeUrl();
    videoFile = null;
    if (videoInput) videoInput.value = '';
    if (editorSection) editorSection.classList.add('hidden');
    if (uploadSection) uploadSection.classList.remove('hidden');
    hideStatus();
    setBusy(false);
  }

  function init() {
    var videoInput = $('videoInput');
    var dropZone = document.querySelector('.drop-zone');
    var video = $('videoPreview');
    var previewTrimBtn = $('previewTrimBtn');
    var trimBtn = $('trimBtn');
    var resetBtn = $('resetBtn');

    rangeApi = root.VTRange.create({
      track: $('rangeTrack'),
      fill: $('rangeFill'),
      handleStart: $('handleStart'),
      handleEnd: $('handleEnd'),
      startChip: $('startChip'),
      endChip: $('endChip'),
      durEl: $('selDur'),
      onChange: function () { /* painted by range */ },
      onSeek: function (t) {
        if (video && isFinite(t)) {
          try { video.currentTime = t; } catch (_) { /* ok */ }
        }
      }
    });

    if (videoInput) {
      videoInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) loadVideo(file);
      });
    }

    if (dropZone) {
      dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('drag-over');
      });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && file.type && file.type.indexOf('video/') === 0) loadVideo(file);
        else alert('Please drop a valid video file.');
      });
    }

    if (previewTrimBtn) {
      previewTrimBtn.addEventListener('click', function () {
        if (!rangeApi || !video) return;
        var r = rangeApi.getRange();
        root.VTTrim.previewCut(video, r.start, r.end);
      });
    }

    if (trimBtn) {
      trimBtn.addEventListener('click', function () {
        if (!rangeApi || !video) return;
        var r = rangeApi.getRange();
        setBusy(true);
        root.VTTrim.trimAndDownload(video, r.start, r.end, {
          onStatus: showStatus,
          onDone: function () {
            hideStatus();
            setBusy(false);
            video.pause();
            alert('Clip successfully trimmed and downloaded!');
          },
          onError: function (err) {
            hideStatus();
            setBusy(false);
            alert('Error recording clip: ' + (err && err.message ? err.message : err) +
              '\nNote: Some browsers restrict stream recording on certain video codecs.');
          }
        });
      });
    }

    if (resetBtn) resetBtn.addEventListener('click', reset);
  }

  root.VTUI = { init: init, loadVideo: loadVideo, reset: reset };
})(typeof window !== 'undefined' ? window : globalThis);
