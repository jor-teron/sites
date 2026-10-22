/*
 * Line graph (apps/system/sysmon/sm_chart.js) — tiny canvas chart in the Device Benchmark style
 * (apps/system/devbench/chart.js: gradient line, soft fill) for the last ~60 one-second samples.
 * SMChart.draw(canvas, samples, { max, label(v), color }) — max: fixed top (e.g. 1 for 100%),
 * else 115% of the largest sample. Draws right-aligned so the newest sample is at the right edge.
 */
window.SMChart = (function () {
  'use strict';
  const N = 60;
  function draw(cv, samples, o) {
    o = o || {};
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 300, h = cv.clientHeight || 120;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const pad = 6, top = 18;
    // grid
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = Math.round(top + (h - top - pad) * i / 4) + 0.5; g.beginPath(); g.moveTo(pad, y); g.lineTo(w - pad, y); g.stroke(); }
    const vals = samples.filter((v) => v != null && isFinite(v));
    g.fillStyle = '#9aa0a6'; g.font = '12px system-ui, sans-serif';
    if (!vals.length) { g.fillText('Collecting\u2026', pad, 13); return; }
    const max = o.max || Math.max.apply(null, vals) * 1.15 || 1;
    const step = (w - 2 * pad) / (N - 1);
    const x = (i) => w - pad - (samples.length - 1 - i) * step;
    const y = (v) => h - pad - (h - top - pad) * Math.min(1, v / max);
    const grad = g.createLinearGradient(0, 0, w, 0);
    const c = o.color || ['#3dd6ff', '#7c5cff', '#ff5fa2'];
    grad.addColorStop(0, c[0]); grad.addColorStop(0.5, c[1]); grad.addColorStop(1, c[2]);
    g.beginPath();
    let first = -1;
    samples.forEach((v, i) => {
      if (v == null || !isFinite(v)) return;
      if (first < 0) { first = i; g.moveTo(x(i), y(v)); } else g.lineTo(x(i), y(v));
    });
    g.lineWidth = 2.5; g.lineJoin = 'round'; g.strokeStyle = grad; g.stroke();
    g.lineTo(x(samples.length - 1), h - pad); g.lineTo(x(first), h - pad); g.closePath();
    g.globalAlpha = 0.18; g.fillStyle = grad; g.fill(); g.globalAlpha = 1;
    const fmt = o.label || ((v) => String(Math.round(v)));
    g.fillStyle = '#e8eaed';
    const last = fmt(vals[vals.length - 1]), tw = g.measureText(last).width;
    g.fillText(last, w - pad - tw, 13);
    g.fillStyle = '#9aa0a6';
    g.fillText('60 s', pad, 13);
  }
  return { draw };
})();
