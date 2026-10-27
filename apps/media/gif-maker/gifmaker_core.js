/* GIF Maker core: wraps gifenc for both the worker and the main-thread fallback. */
(function (g) {
  g.GMCore = {
    create(o) {
      const { GIFEncoder, quantize, applyPalette } = g.gifenc, gif = GIFEncoder();
      let first = true;
      return {
        add(rgba, delay) {
          const pal = quantize(rgba, o.colors, { format: 'rgb565' });
          const idx = applyPalette(rgba, pal, 'rgb565');
          /* repeat: 0 = forever, -1 = play once (only meaningful on the first frame) */
          gif.writeFrame(idx, o.w, o.h, { palette: pal, delay: delay != null ? delay : o.delay, repeat: first ? (o.loop ? 0 : -1) : undefined });
          first = false;
        },
        finish() { gif.finish(); return gif.bytes(); },
      };
    },
  };
})(typeof self !== 'undefined' ? self : window);
