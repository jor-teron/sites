/*
 * Photo Editor v2 — pe_transform.js
 * Rotate left/right and flip horizontal/vertical, done as a 2x2 orientation matrix
 * (only 90-degree steps, so it is lossless). "display = m · photo".
 * Also the geometry helpers shared by view, crop and save.
 */
(function (PE) {
  'use strict';

  const T = PE.transform = {};
  const S = PE.state;

  // m = [m11, m12, m21, m22]
  const ROT_R = [0, -1, 1, 0];   // 90° clockwise (screen y points down)
  const ROT_L = [0, 1, -1, 0];
  const FLIP_H = [-1, 0, 0, 1];
  const FLIP_V = [1, 0, 0, -1];

  T.mul = (A, B) => [
    A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3],
    A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]
  ];
  T.inv = (m) => [m[0], m[2], m[1], m[3]];          // orthogonal: inverse = transpose
  T.apply = (m, x, y) => [m[0] * x + m[1] * y, m[2] * x + m[3] * y];
  T.swaps = (m) => m[0] === 0;                       // 90/270°: width and height swap
  T.orientedSize = (w, h, m) => (T.swaps(m) ? { w: h, h: w } : { w: w, h: h });

  // Draw photo rect (sx,sy,sw,sh) oriented by m, centred in an outW x outH target, scaled.
  T.drawOriented = (ctx, img, sx, sy, sw, sh, m, outW, outH, scale) => {
    ctx.setTransform(m[0] * scale, m[2] * scale, m[1] * scale, m[3] * scale, outW / 2, outH / 2);
    ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  function mapRect(r, m, fromW, fromH, toW, toH) {
    const pts = [[r.x, r.y], [r.x + r.w, r.y + r.h]].map(([x, y]) => {
      const p = T.apply(m, x - fromW / 2, y - fromH / 2);
      return [p[0] + toW / 2, p[1] + toH / 2];
    });
    const x0 = Math.min(pts[0][0], pts[1][0]), y0 = Math.min(pts[0][1], pts[1][1]);
    return { x: x0, y: y0, w: Math.abs(pts[0][0] - pts[1][0]), h: Math.abs(pts[0][1] - pts[1][1]) };
  }

  // Rect on the full oriented photo (what the crop box is drawn on) -> rect in photo pixels.
  T.displayRectToSource = (r, m, W, H) => {
    const O = T.orientedSize(W, H, m);
    return mapRect(r, T.inv(m), O.w, O.h, W, H);
  };
  // Rect in photo pixels -> rect on the full oriented photo.
  T.sourceRectToDisplay = (r, m, W, H) => {
    const O = T.orientedSize(W, H, m);
    return mapRect(r, m, W, H, O.w, O.h);
  };

  // The crop rect is stored in original-photo pixels, so it simply stays put when the
  // orientation changes: rotating after a crop rotates the cropped result, nothing more.
  function changeOrientation(M) {
    if (!S.photo) return;
    const P = S.photo;
    const C = PE.crop;
    const newM = T.mul(M, S.edits.m);
    if (C && C.active && C.box) {
      // keep the box on the same part of the photo while cropping
      const src = T.displayRectToSource(C.box, S.edits.m, P.w, P.h);
      C.box = T.sourceRectToDisplay(src, newM, P.w, P.h);
      if (T.swaps(M)) C.ratioFlip = !C.ratioFlip;
    }
    S.apply((e) => { e.m = newM; }, 'geom');
  }

  T.rotate = (dir) => changeOrientation(dir < 0 ? ROT_L : ROT_R);
  T.flip = (axis) => changeOrientation(axis === 'v' ? FLIP_V : FLIP_H);

  // Size of the saved image for the current edits.
  T.outputSize = () => {
    const e = S.edits;
    return e ? T.orientedSize(e.crop.w, e.crop.h, e.m) : { w: 0, h: 0 };
  };
})(window.PE);
