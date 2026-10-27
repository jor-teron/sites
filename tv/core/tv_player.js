/*
 * TV: player (tv/core/tv_player.js)
 * Plays one stream: hls.js (vendor/hls) when supported, else native HLS
 * (Safari / iOS). A failed stream leaves the "no signal" poster
 * (image/no_signal.png, set on the <video> in tv.html); errors go to the console.
 */
(function () {
  'use strict';
  var TV = window.TV;
  var video = document.getElementById('video');
  var hls = null;
  var nativeMode = false; // TV5: video 'error' events only count for native HLS

  // Native HLS (Safari / iOS): a failed stream fires 'error' on the <video>.
  video.addEventListener('error', function () {
    if (!nativeMode || !video.getAttribute('src')) return;
    console.error('Stream error', video.error);
    TV.ui.toast('Channel unavailable');
  });

  function play(ch) {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    nativeMode = false;
    video.removeAttribute('src');
    video.load();

    var Hls = window.Hls;
    if (Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(ch.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        video.play().catch(function () {});
      });
      hls.on(Hls.Events.ERROR, function (_e, data) {
        // Fatal stream errors: console only; the poster is the cue.
        if (data && data.fatal) {
          console.error('Stream error', data);
          TV.ui.toast('Channel unavailable');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      nativeMode = true;
      video.src = ch.url;
      video.play().catch(function () {});
    } else {
      console.error('HLS not supported');
      TV.ui.toast('This browser cannot play these streams');
    }
  }

  TV.player = { video: video, play: play };
})();
