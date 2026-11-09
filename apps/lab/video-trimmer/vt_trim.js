/* Video Trimmer — vt_trim.js: preview cut + MediaRecorder export. VT1
   Keeps the original captureStream / MediaRecorder behaviour. */
(function (root) {
  'use strict';

  var previewChecker = null;
  var recordChecker = null;

  function clearChecker(video, ref) {
    if (ref && video) {
      try { video.removeEventListener('timeupdate', ref); } catch (_) { /* ok */ }
    }
  }

  /** Play from start to end, then pause. */
  function previewCut(video, start, end) {
    if (!video) return;
    clearChecker(video, previewChecker);
    previewChecker = null;
    video.currentTime = start;
    var checker = function () {
      if (video.currentTime >= end) {
        video.pause();
        clearChecker(video, checker);
        if (previewChecker === checker) previewChecker = null;
      }
    };
    previewChecker = checker;
    video.addEventListener('timeupdate', checker);
    var p = video.play();
    if (p && typeof p.catch === 'function') p.catch(function () { /* autoplay blocked */ });
  }

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      return 'video/webm;codecs=vp9,opus';
    }
    if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
    if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4';
    return '';
  }

  /**
   * Record the preview element from start..end and download the blob.
   * @returns {Promise<void>}
   */
  function trimAndDownload(video, start, end, hooks) {
    hooks = hooks || {};
    var onStatus = hooks.onStatus || function () {};
    var onDone = hooks.onDone || function () {};
    var onError = hooks.onError || function () {};

    return new Promise(function (resolve, reject) {
      if (!video) {
        var err0 = new Error('No video element.');
        onError(err0);
        reject(err0);
        return;
      }
      if (end - start < 0.5) {
        var err1 = new Error('Clip duration must be at least 0.5 seconds.');
        onError(err1);
        reject(err1);
        return;
      }

      clearChecker(video, recordChecker);
      recordChecker = null;

      var mimeType = pickMime();
      if (!mimeType) {
        var err2 = new Error('MediaRecorder is not supported in this browser.');
        onError(err2);
        reject(err2);
        return;
      }

      var stream = null;
      try {
        stream = video.captureStream
          ? video.captureStream()
          : (video.mozCaptureStream && video.mozCaptureStream());
      } catch (e) {
        onError(e);
        reject(e);
        return;
      }
      if (!stream) {
        var err3 = new Error('captureStream() not supported on this browser.');
        onError(err3);
        reject(err3);
        return;
      }

      onStatus('Preparing clip... Playback will start automatically.');

      var recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: mimeType });
      } catch (e2) {
        onError(e2);
        reject(e2);
        return;
      }

      var chunks = [];
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = function () {
        try {
          var blob = new Blob(chunks, { type: mimeType.split(';')[0] });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'trimmed-clip-' + Date.now() + (mimeType.indexOf('mp4') >= 0 ? '.mp4' : '.webm');
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) { /* ok */ } }, 2000);
          onDone();
          resolve();
        } catch (e3) {
          onError(e3);
          reject(e3);
        }
      };

      video.currentTime = start;
      var started = false;

      function startRec() {
        if (started) return;
        started = true;
        video.removeEventListener('seeked', startRec);
        var playP = video.play();
        function go() {
          try {
            recorder.start();
            onStatus('Recording clip... Please wait until end time.');
          } catch (e4) {
            onError(e4);
            reject(e4);
          }
        }
        if (playP && typeof playP.then === 'function') {
          playP.then(go).catch(function (e5) {
            onError(e5);
            reject(e5);
          });
        } else {
          go();
        }
      }

      var monitor = function () {
        if (video.currentTime >= end || video.paused) {
          video.pause();
          if (recorder.state === 'recording') recorder.stop();
          clearChecker(video, monitor);
          if (recordChecker === monitor) recordChecker = null;
        }
      };
      recordChecker = monitor;
      video.addEventListener('timeupdate', monitor);
      video.addEventListener('seeked', startRec);
      // If already at start (no seek), kick off soon
      setTimeout(function () {
        if (!started && Math.abs(video.currentTime - start) < 0.05) startRec();
      }, 50);
    });
  }

  function cancelMonitors(video) {
    clearChecker(video, previewChecker);
    clearChecker(video, recordChecker);
    previewChecker = null;
    recordChecker = null;
  }

  root.VTTrim = {
    previewCut: previewCut,
    trimAndDownload: trimAndDownload,
    cancelMonitors: cancelMonitors,
    pickMime: pickMime
  };
})(typeof window !== 'undefined' ? window : globalThis);
