/* Video Editor — ve_export.js: MediaRecorder export of kept segments. VD1
   Plays each kept range through captureStream + MediaRecorder (real time).
   Prefers WebM (vp9/vp8 + opus), then MP4 when the browser supports it. */
(function (root) {
  'use strict';

  var H = root.VEHelpers;
  var E = root.VEEdits;

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    var types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4'
    ];
    for (var i = 0; i < types.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(types[i])) return types[i];
      } catch (_) { /* ok */ }
    }
    return '';
  }

  function capture(video) {
    if (!video) return null;
    try {
      if (typeof video.captureStream === 'function') return video.captureStream();
      if (typeof video.mozCaptureStream === 'function') return video.mozCaptureStream();
    } catch (_) { /* not supported */ }
    return null;
  }

  function onceSeeked(video, t) {
    return new Promise(function (resolve, reject) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        video.removeEventListener('seeked', finish);
        video.removeEventListener('error', fail);
        resolve();
      }
      function fail(ev) {
        if (done) return;
        done = true;
        video.removeEventListener('seeked', finish);
        video.removeEventListener('error', fail);
        reject(ev && ev.error ? ev.error : new Error('Seek failed.'));
      }
      video.addEventListener('seeked', finish);
      video.addEventListener('error', fail);
      try {
        video.currentTime = t;
      } catch (err) {
        fail({ error: err });
        return;
      }
      if (!video.seeking && Math.abs(video.currentTime - t) < 0.04) {
        setTimeout(finish, 0);
      }
    });
  }

  /**
   * Export kept segments. Must be called from a user-gesture handler when
   * possible so MediaRecorder.start() is allowed.
   *
   * @returns {{promise:Promise<Blob|null>, cancel:Function}}
   *   promise resolves to a Blob, or null if cancelled.
   */
  function exportSegments(video, segments, hooks) {
    hooks = hooks || {};
    var onStatus = hooks.onStatus || function () {};
    var onProgress = hooks.onProgress || function () {};
    var cancelled = false;
    var recorder = null;
    var started = false;

    function cancel() {
      cancelled = true;
      try { video && video.pause(); } catch (_) { /* ok */ }
      try {
        if (recorder && recorder.state && recorder.state !== 'inactive') recorder.stop();
      } catch (_) { /* ok */ }
    }

    var promise = new Promise(function (resolve, reject) {
      var segs = (segments || []).filter(function (s) { return s.end - s.start > 0; });
      var total = E.keptDuration(segs);
      if (!video) {
        reject(new Error('No video element.'));
        return;
      }
      if (!segs.length || total < H.MIN_EXPORT) {
        reject(new Error('The edited video must be at least ' + H.MIN_EXPORT + ' seconds long.'));
        return;
      }

      var mimeType = pickMime();
      if (!mimeType) {
        reject(new Error('MediaRecorder is not supported in this browser.'));
        return;
      }

      var stream = capture(video);
      if (!stream) {
        reject(new Error('This browser cannot capture the video stream for export.'));
        return;
      }

      try {
        recorder = new MediaRecorder(stream, { mimeType: mimeType });
      } catch (err) {
        reject(err);
        return;
      }

      var chunks = [];
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      var stopped = false;
      recorder.onerror = function (ev) {
        if (stopped) return;
        stopped = true;
        reject((ev && ev.error) || new Error('Recording failed.'));
      };
      recorder.onstop = function () {
        if (stopped) return;
        stopped = true;
        if (cancelled) {
          resolve(null);
          return;
        }
        try {
          var blob = new Blob(chunks, { type: mimeType.split(';')[0] });
          resolve(blob);
        } catch (err) {
          reject(err);
        }
      };

      function canPause() {
        return recorder && typeof recorder.pause === 'function' && typeof recorder.resume === 'function';
      }

      function startRec() {
        if (started || cancelled) return;
        started = true;
        try { recorder.start(200); } catch (err) { throw err; }
      }

      function playUntil(end, index) {
        return new Promise(function (res, rej) {
          function tick() {
            if (cancelled) {
              cleanup();
              try { video.pause(); } catch (_) { /* ok */ }
              res('cancelled');
              return;
            }
            onProgress(E.exportedSoFar(segs, index, video.currentTime), total, index);
            if (video.currentTime >= end - 0.02 || video.ended) {
              try { video.pause(); } catch (_) { /* ok */ }
              cleanup();
              res('ok');
            }
          }
          function fail(ev) {
            cleanup();
            rej((ev && ev.error) || new Error('Playback failed during export.'));
          }
          function cleanup() {
            video.removeEventListener('timeupdate', tick);
            video.removeEventListener('ended', tick);
            video.removeEventListener('error', fail);
          }
          video.addEventListener('timeupdate', tick);
          video.addEventListener('ended', tick);
          video.addEventListener('error', fail);
          var p = video.play();
          if (p && typeof p.then === 'function') {
            p.then(function () { /* playing */ }).catch(fail);
          }
        });
      }

      (async function run() {
        try {
          onStatus('Preparing export…');
          // Start the recorder in this turn (user gesture), then pause until
          // the first segment is cued. Browsers that cannot pause will start
          // after the first seek instead.
          if (canPause()) {
            startRec();
            try { recorder.pause(); } catch (_) { /* ok */ }
          }

          for (var i = 0; i < segs.length; i++) {
            if (cancelled) break;
            var seg = segs[i];
            onStatus('Seeking to the next part…');
            await onceSeeked(video, seg.start);
            if (cancelled) break;

            if (!started) startRec();
            else if (canPause() && recorder.state === 'paused') {
              try { recorder.resume(); } catch (_) { /* ok */ }
            }

            onStatus('Recording… Export runs in real time.');
            var result = await playUntil(seg.end, i);
            if (result !== 'ok' || cancelled) break;

            if (i < segs.length - 1 && canPause() && recorder.state === 'recording') {
              try { recorder.pause(); } catch (_) { /* ok */ }
            }
            onProgress(E.exportedSoFar(segs, i, seg.end), total, i);
          }

          try { video.pause(); } catch (_) { /* ok */ }
          if (recorder.state && recorder.state !== 'inactive') {
            try { recorder.stop(); } catch (err) {
              if (!cancelled) reject(err);
              else resolve(null);
            }
          } else if (cancelled) {
            resolve(null);
          }
        } catch (err) {
          cancelled = true;
          try {
            if (recorder && recorder.state && recorder.state !== 'inactive') recorder.stop();
          } catch (_) { /* ok */ }
          reject(err);
        }
      })();
    });

    return { promise: promise, cancel: cancel, pickMime: pickMime };
  }

  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'video_edited.webm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (_) { /* ok */ }
    }, 2000);
  }

  root.VEExport = {
    pickMime: pickMime,
    exportSegments: exportSegments,
    downloadBlob: downloadBlob
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pickMime: pickMime };
  }
})(typeof window !== 'undefined' ? window : globalThis);
