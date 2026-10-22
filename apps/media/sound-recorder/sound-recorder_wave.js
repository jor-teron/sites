/*
 * Sound Recorder — waveform drawing on <canvas>. Height uses a 60 dB scale, so loud = tall
 * and silence stays flat even for quiet speech.
 * SRWave.draw(canvas, peaks, pps, t0, t1, { regions, dur, playhead, win:[a,b] })
 */
const SRWave = {
  colors() {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
    return { bg: g('--card'), wave: g('--wave'), sil: g('--sil'), snd: g('--acc'), play: g('--play'), fg: g('--fg'), dim: g('--dim') };
  },
  fit(cv) {
    const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { w, h, d };
  },
  amp(m) { const v = (20 * Math.log10(m || 1e-6) + 60) / 60; return v < 0 ? 0 : v > 1 ? 1 : v; },
  draw(cv, peaks, pps, t0, t1, o = {}) {
    const { w, h, d } = this.fit(cv), x = cv.getContext('2d'), c = o.colors || this.colors();
    x.clearRect(0, 0, w, h);
    const span = t1 - t0; if (!(span > 0)) return;
    const sx = w / span, X = (t) => (t - t0) * sx;
    if (o.regions) {
      const end = o.dur != null ? o.dur : peaks.length / pps;
      x.fillStyle = c.sil; x.fillRect(Math.max(0, X(0)), 0, Math.min(w, X(end)) - Math.max(0, X(0)), h);
      for (const r of o.regions) {
        if (r.e < t0 || r.s > t1) continue;
        const a = Math.max(0, X(r.s)), b = Math.min(w, X(r.e));
        x.clearRect(a, 0, b - a, h);
        x.fillStyle = c.snd; x.fillRect(a, h - 3 * d, Math.max(d, b - a), 3 * d);
      }
    }
    x.fillStyle = c.wave;
    const mid = h / 2, max = h / 2 - 2 * d, n = peaks.length;
    for (let px = 0; px < w; px++) {
      let b0 = Math.floor((t0 + px / sx) * pps), b1 = Math.floor((t0 + (px + 1) / sx) * pps);
      if (b1 <= b0) b1 = b0 + 1;
      if (b0 >= n || b1 <= 0) continue;
      b0 = Math.max(0, b0); b1 = Math.min(n, b1);
      let m = 0; for (let i = b0; i < b1; i++) if (peaks[i] > m) m = peaks[i];
      const hh = Math.max(d * 0.5, this.amp(m) * max);
      x.fillRect(px, mid - hh, 1, hh * 2);
    }
    if (o.win) {
      const a = X(o.win[0]), b = X(o.win[1]);
      x.fillStyle = c.dim; x.fillRect(0, 0, Math.max(0, a), h); x.fillRect(b, 0, w - b, h);
      x.strokeStyle = c.fg; x.lineWidth = 1.5 * d; x.strokeRect(a + d, d, Math.max(2 * d, b - a - 2 * d), h - 2 * d);
    }
    if (o.playhead != null && o.playhead >= t0 && o.playhead <= t1) {
      x.fillStyle = c.play; x.fillRect(Math.round(X(o.playhead) - d), 0, 2 * d, h);
    }
  },
};
