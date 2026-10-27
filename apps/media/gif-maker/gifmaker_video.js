/* GIF Maker video: frame grabbing by seeking a hidden <video> and drawing to a canvas. */
window.GMVideo = (function () {
  function seek(v, t) {
    return new Promise((res, rej) => {
      const done = () => { clear(); res(); }, bad = () => { clear(); rej(new Error('Could not seek the video')); };
      const to = setTimeout(done, 4000); /* some browsers skip 'seeked' for tiny moves */
      function clear() { clearTimeout(to); v.removeEventListener('seeked', done); v.removeEventListener('error', bad); }
      v.addEventListener('seeked', done); v.addEventListener('error', bad);
      v.currentTime = t;
    });
  }
  function load(url) {
    return new Promise((res, rej) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      v.onloadeddata = () => res(v); v.onerror = () => rej(new Error('This video format is not supported by the browser'));
    });
  }
  /* size: output width; height keeps aspect, both even */
  function dims(vw, vh, w) { w = Math.min(w, vw || w); const h = Math.max(2, Math.round(w * vh / vw / 2) * 2); return { w: Math.round(w / 2) * 2, h }; }
  /* yields ImageData frames through onFrame (awaited), stops when isCancelled() */
  async function grab(url, o, onFrame, isCancelled) {
    const v = await load(url), { w, h } = dims(v.videoWidth, v.videoHeight, o.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const n = Math.max(1, Math.round((o.end - o.start) * o.fps));
    for (let i = 0; i < n; i++) {
      if (isCancelled()) break;
      await seek(v, Math.min(o.start + i / o.fps, Math.max(0, v.duration - 0.001)));
      ctx.drawImage(v, 0, 0, w, h);
      await onFrame(ctx.getImageData(0, 0, w, h), i, n);
    }
    v.removeAttribute('src'); v.load();
    return { w, h, n };
  }
  return { grab, dims };
})();
