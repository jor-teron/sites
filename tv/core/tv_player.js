/*
 * TV: player (tv/core/tv_player.js)
 * Plays one stream: hls.js (vendor/hls) when supported, else native HLS
 * (Safari / iOS). A failed stream leaves the "no signal" poster
 * (image/no_signal.svg, set on the <video> in tv.html); errors go to the console.
 */
(function () {
  'use strict';
  var TV = window.TV;
  var video = document.getElementById('video');
  var hls = null;

  function play(ch) {
    if (hls) {
      hls.destroy();
      hls = null;
    }
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
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = ch.url;
      video.play().catch(function () {});
    } else {
      console.error('HLS not supported');
    }
  }

  TV.player = { video: video, play: play };
})();
