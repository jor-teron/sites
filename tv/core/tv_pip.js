/*
 * TV: auto picture-in-picture (tv/core/tv_pip.js)
 * Android Chrome + desktop: the video goes PiP when the page is hidden
 * (Home / other app / tab switch) and comes back on return. Best-effort;
 * browsers may deny. The channel grid stays in the page.
 */
(function () {
  'use strict';
  var video = window.TV.player.video;

  function supported() {
    return !!(
      document.pictureInPictureEnabled &&
      video &&
      typeof video.requestPictureInPicture === 'function' &&
      !video.disablePictureInPicture
    );
  }

  function enter() {
    if (!supported()) return;
    if (document.pictureInPictureElement) return;
    if (video.paused || video.ended) return;
    if (video.readyState < 2) return;
    video.requestPictureInPicture().catch(function () {});
  }

  function exit() {
    if (!document.pictureInPictureElement) return;
    document.exitPictureInPicture().catch(function () {});
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) enter();
    else exit();
  });
  window.addEventListener('pagehide', enter);

  window.TV.pip = { enter: enter, exit: exit };
})();
