/* Video Editor — ve_export.js: canvas + audio-mix MediaRecorder export. VD2
   Draws each playing <video> into a canvas (contain, letterbox) with optional
   fade-through-black, captures canvas.captureStream() for video, and mixes
   clip audio through one AudioContext + MediaStreamDestination. */
(function (root) {
  'use strict';

  var H = root.VEHelpers;
  var E = root.VEEdits;
  var S = root.VESeq;

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

  function even(n) {
    n = Math.max(2, Math.round(n));
    return n % 2 ? n + 1 : n;
  }

  function chooseSize(clips) {
    var w = 0, h = 0;
    (clips || []).forEach(function (c) {
      if ((c.width || 0) > w) w = c.width;
      if ((c.height || 0) > h) h = c.height;
    });
    if (w < 2) w = 1280;
    if (h < 2) h = 720;
    var long = Math.max(w, h);
    if (long > 1280) {
      var s = 1280 / long;
      w = w * s;
      h = h * s;
    }
    return { width: even(w), height: even(h) };
  }

  function drawFrame(ctx, video, width, height, alpha) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    var vw = video.videoWidth || width;
    var vh = video.videoHeight || height;
    if (!vw || !vh) return;
    var scale = Math.min(width / vw, height / vh);
    var dw = vw * scale;
    var dh = vh * scale;
    var x = (width - dw) / 2;
    var y = (height - dh) / 2;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    try { ctx.drawImage(video, x, y, dw, dh); } catch (_) { /* not ready */ }
    ctx.globalAlpha = 1;
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
      try { video.currentTime = t; } catch (err) { fail({ error: err }); return; }
      if (!video.seeking && Math.abs(video.currentTime - t) < 0.04) setTimeout(finish, 0);
    });
  }

  function combineStreams(canvasStream, audioStream) {
    var tracks = [];
    if (canvasStream && canvasStream.getVideoTracks) {
      tracks = tracks.concat(canvasStream.getVideoTracks());
    }
    if (audioStream && audioStream.getAudioTracks) {
      tracks = tracks.concat(audioStream.getAudioTracks());
    }
    if (typeof MediaStream === 'function') return new MediaStream(tracks);
    return canvasStream;
  }

  /**
   * Export a sequence of clips.
   * hooks.getPlayer(clip) -> { video, gain }  (gain may be null)
   * hooks.canvas, hooks.audioStream (optional MediaStream from MediaStreamDestination)
   * hooks.onStatus, hooks.onProgress, hooks.onShow(clip)
   * @returns {{promise:Promise<Blob|null>, cancel:Function}}
   */
  function exportSequence(clips, fade, hooks) {
    hooks = hooks || {};
    var onStatus = hooks.onStatus || function () {};
    var onProgress = hooks.onProgress || function () {};
    var cancelled = false;
    var recorder = null;
    var started = false;
    var raf = 0;

    function cancel() {
      cancelled = true;
      if (raf) { try { cancelAnimationFrame(raf); } catch (_) { /* ok */ } raf = 0; }
      try {
        if (recorder && recorder.state && recorder.state !== 'inactive') recorder.stop();
      } catch (_) { /* ok */ }
    }

    var promise = new Promise(function (resolve, reject) {
      var list = (clips || []).filter(function (c) { return S.clipKept(c) > 0; });
      var total = S.sequenceDuration(list);
      if (!list.length || total < H.MIN_EXPORT) {
        reject(new Error('The edited video must be at least ' + H.MIN_EXPORT + ' seconds long.'));
        return;
      }
      var canvas = hooks.canvas;
      if (!canvas || !canvas.getContext) {
        reject(new Error('Export canvas is missing.'));
        return;
      }
      var mimeType = pickMime();
      if (!mimeType) {
        reject(new Error('MediaRecorder is not supported in this browser.'));
        return;
      }
      var size = chooseSize(list);
      canvas.width = size.width;
      canvas.height = size.height;
      var ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not draw to the export canvas.'));
        return;
      }
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size.width, size.height);

      var canvasStream = null;
      try {
        canvasStream = canvas.captureStream ? canvas.captureStream(30) : null;
      } catch (err) {
        reject(err);
        return;
      }
      if (!canvasStream) {
        reject(new Error('This browser cannot capture the canvas stream for export.'));
        return;
      }

      var stream = combineStreams(canvasStream, hooks.audioStream || null);
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
        if (cancelled) { resolve(null); return; }
        try {
          resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
        } catch (err) { reject(err); }
      };

      function canPause() {
        return recorder && typeof recorder.pause === 'function' && typeof recorder.resume === 'function';
      }

      function startRec() {
        if (started || cancelled) return;
        started = true;
        recorder.start(200);
      }

      function setGain(player, value) {
        if (player && player.gain && player.gain.gain) {
          try { player.gain.gain.value = value; } catch (_) { /* ok */ }
        }
      }

      function playUntil(player, clip, clipIndex, seg, globalBase) {
        var video = player.video;
        var kept = S.clipKept(clip);
        return new Promise(function (res, rej) {
          var running = true;
          function tick() {
            if (!running) return;
            if (cancelled) {
              cleanup();
              try { video.pause(); } catch (_) { /* ok */ }
              setGain(player, 0);
              res('cancelled');
              return;
            }
            var localEdited = E.sourceToEdited(video.currentTime, clip.segments);
            var alpha = S.fadeAlpha(localEdited, kept, fade, clipIndex, list.length);
            drawFrame(ctx, video, size.width, size.height, alpha);
            setGain(player, alpha);
            onProgress(globalBase + Math.max(0, Math.min(seg.end, video.currentTime) - seg.start), total);
            if (video.currentTime >= seg.end - 0.02 || video.ended) {
              try { video.pause(); } catch (_) { /* ok */ }
              cleanup();
              res('ok');
              return;
            }
            raf = requestAnimationFrame(tick);
          }
          function fail(ev) {
            cleanup();
            rej((ev && ev.error) || new Error('Playback failed during export.'));
          }
          function cleanup() {
            running = false;
            video.removeEventListener('ended', onEnded);
            video.removeEventListener('error', fail);
            if (raf) { try { cancelAnimationFrame(raf); } catch (_) { /* ok */ } raf = 0; }
          }
          function onEnded() {
            if (!running) return;
            cleanup();
            res('ok');
          }
          video.addEventListener('ended', onEnded);
          video.addEventListener('error', fail);
          var p = video.play();
          raf = requestAnimationFrame(tick);
          if (p && typeof p.then === 'function') p.then(function () { /* playing */ }).catch(fail);
        });
      }

      (async function run() {
        try {
          onStatus('Preparing export…');
          if (canPause()) {
            startRec();
            try { recorder.pause(); } catch (_) { /* ok */ }
          }

          var acc = 0;
          for (var i = 0; i < list.length; i++) {
            if (cancelled) break;
            var clip = list[i];
            var player = hooks.getPlayer(clip);
            if (!player || !player.video) {
              throw new Error('A clip could not be opened for export.');
            }
            if (hooks.onShow) hooks.onShow(clip);
            var segs = clip.segments || [];
            for (var s = 0; s < segs.length; s++) {
              if (cancelled) break;
              var seg = segs[s];
              onStatus('Seeking to the next part…');
              setGain(player, 0);
              await onceSeeked(player.video, seg.start);
              if (cancelled) break;
              if (!started) startRec();
              else if (canPause() && recorder.state === 'paused') {
                try { recorder.resume(); } catch (_) { /* ok */ }
              }
              onStatus('Recording… Export runs in real time.');
              var result = await playUntil(player, clip, i, seg, acc);
              acc += seg.end - seg.start;
              if (result !== 'ok' || cancelled) break;
              setGain(player, 0);
              if ((s < segs.length - 1 || i < list.length - 1) && canPause() && recorder.state === 'recording') {
                try { recorder.pause(); } catch (_) { /* ok */ }
              }
              onProgress(acc, total);
            }
            try { player.video.pause(); } catch (_) { /* ok */ }
            setGain(player, 0);
          }

          if (raf) { try { cancelAnimationFrame(raf); } catch (_) { /* ok */ } raf = 0; }
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

    return { promise: promise, cancel: cancel };
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
    chooseSize: chooseSize,
    drawFrame: drawFrame,
    exportSequence: exportSequence,
    downloadBlob: downloadBlob
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pickMime: pickMime, chooseSize: chooseSize };
  }
})(typeof window !== 'undefined' ? window : globalThis);
