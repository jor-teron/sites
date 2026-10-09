/*
  Project: paper-keyboard
  File: paper-corners.js
  Role: Find the four solid corner shapes on the printed sheet in one camera frame.
  TL circle, TR square, BL triangle, BR plus. Each corner is named by its shape,
  so a turned sheet still names the right corners. No DOM here.
*/
(function () {
  /* Shape numbers, tuned on pixel-sized shapes (math ideal: circle 0.564/0.159,
     square 0.707/0.167, triangle 0.943/0.194, plus 0.71/0.193). */
  /* Ideal shape numbers. rmax = farthest pixel from the centre / sqrt(area).
     spread = (mu20 + mu02) / area^2. Both stay the same when the shape turns. */
  const SHAPES = {
    tl: { name: "circle", rmax: 0.564, spread: 0.159 },
    tr: { name: "square", rmax: 0.707, spread: 0.167 },
    bl: { name: "triangle", rmax: 0.89, spread: 0.194 },
    br: { name: "plus", rmax: 0.73, spread: 0.197 }
  };

  /*
    Paper white per block: block means, then the brightest block nearby.
    A big black shape never fills a 3x3 block window, so paper shows through.
  */
  function whiteMap(lum, w, h, block) {
    const bw = Math.ceil(w / block);
    const bh = Math.ceil(h / block);
    const sum = new Float32Array(bw * bh);
    const cnt = new Float32Array(bw * bh);
    for (let y = 0; y < h; y += 1) {
      const row = ((y / block) | 0) * bw;
      for (let x = 0; x < w; x += 1) {
        const b = row + ((x / block) | 0);
        sum[b] += lum[y * w + x];
        cnt[b] += 1;
      }
    }
    const mean = new Float32Array(bw * bh);
    for (let i = 0; i < mean.length; i += 1) {
      mean[i] = sum[i] / cnt[i];
    }
    const white = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by += 1) {
      for (let bx = 0; bx < bw; bx += 1) {
        let best = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = bx + dx;
            const ny = by + dy;
            if (nx >= 0 && ny >= 0 && nx < bw && ny < bh && mean[ny * bw + nx] > best) {
              best = mean[ny * bw + nx];
            }
          }
        }
        white[by * bw + bx] = best;
      }
    }
    return { white: white, cols: bw };
  }

  /* Score one blob against one shape. Lower is better, under 1 is a match. */
  function distance(f, s) {
    const a = (f.rmax - s.rmax) / 0.08;
    const b = (f.spread - s.spread) / 0.012;
    return a * a + b * b;
  }

  /*
    detect(data, w, h): data is RGBA from getImageData.
    Returns { tl, tr, bl, br }, each { x, y, size } in frame pixels, or null.
  */
  function detect(data, w, h) {
    const n = w * h;
    const lum = new Uint8Array(n);
    for (let i = 0, k = 0; i < n; i += 1, k += 4) {
      lum[i] = (data[k] * 77 + data[k + 1] * 150 + data[k + 2] * 29) >> 8;
    }
    const block = Math.max(8, Math.round(w / 10));
    const map = whiteMap(lum, w, h, block);
    const dark = new Uint8Array(n);
    for (let y = 0; y < h; y += 1) {
      const row = ((y / block) | 0) * map.cols;
      for (let x = 0; x < w; x += 1) {
        const paper = map.white[row + ((x / block) | 0)];
        const v = lum[y * w + x];
        if (v < paper * 0.55 && v < paper - 35) {
          dark[y * w + x] = 1;
        }
      }
    }

    const minSide = w * 0.025;
    const maxSide = w * 0.2;
    const seen = new Uint8Array(n);
    const stack = new Int32Array(n);
    const list = new Int32Array(n);
    const best = { tl: null, tr: null, bl: null, br: null };

    for (let start = 0; start < n; start += 1) {
      if (!dark[start] || seen[start]) {
        continue;
      }
      let top = 0;
      let count = 0;
      let edge = false;
      let minX = w;
      let maxX = 0;
      let minY = h;
      let maxY = 0;
      let sumX = 0;
      let sumY = 0;
      stack[top++] = start;
      seen[start] = 1;
      while (top) {
        const p = stack[--top];
        list[count++] = p;
        const px = p % w;
        const py = (p - px) / w;
        sumX += px;
        sumY += py;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        if (px === 0 || py === 0 || px === w - 1 || py === h - 1) {
          edge = true;
          continue;
        }
        if (dark[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
        if (dark[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
        if (dark[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[top++] = p - w; }
        if (dark[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[top++] = p + w; }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const aspect = bw / bh;
      if (edge || bw < minSide || bh < minSide || bw > maxSide || bh > maxSide ||
          aspect < 0.6 || aspect > 1.6 || count < 30) {
        continue;
      }
      const cx = sumX / count;
      const cy = sumY / count;
      let mu = 0;
      let far = 0;
      for (let i = 0; i < count; i += 1) {
        const px = list[i] % w;
        const dx = px - cx;
        const dy = (list[i] - px) / w - cy;
        const d2 = dx * dx + dy * dy;
        mu += d2;
        if (d2 > far) far = d2;
      }
      /* +0.5 px: pixel centres sit half a pixel inside the true outline. */
      const feat = {
        rmax: (Math.sqrt(far) + 0.5) / Math.sqrt(count),
        spread: mu / (count * count),
        fill: count / (bw * bh)
      };
      /* Solid shapes only: thin letters and rings fail fill or spread. */
      if (feat.fill < 0.4) {
        continue;
      }
      const center = dark[Math.round(cy) * w + Math.round(cx)];
      Object.keys(SHAPES).forEach(function (key) {
        const d = distance(feat, SHAPES[key]);
        if (d >= 1 || !center) {
          return;
        }
        if (key === "tr" && feat.fill < 0.6) {
          return;
        }
        if (!best[key] || d < best[key].score) {
          best[key] = { x: cx, y: cy, size: Math.max(bw, bh), score: d };
        }
      });
    }

    const out = {};
    Object.keys(best).forEach(function (key) {
      const b = best[key];
      out[key] = b ? { x: b.x, y: b.y, size: b.size } : null;
    });
    return out;
  }

  window.PaperCorners = { detect: detect, SHAPES: SHAPES };
})();
