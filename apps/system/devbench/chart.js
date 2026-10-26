/*
  File: chart.js
  Project: devbench
  Role: Tiny canvas line chart for the sustained (throttling) run: one GFLOPS point per second,
  gradient line, soft fill, first/last labels. Exposes window.DevbenchChart.draw(canvas, samples).
*/

function devbenchChartDraw(cv, samples) {
  var dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 300, h = cv.clientHeight || 120;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  if (!samples.length) { return; }
  var max = Math.max.apply(null, samples) * 1.15 || 1, pad = 8;
  var x = function (i) { return pad + (w - 2 * pad) * (samples.length < 2 ? 0.5 : i / (samples.length - 1)); };
  var y = function (v) { return h - pad - (h - 2 * pad - 14) * (v / max); };
  var grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "#3dd6ff"); grad.addColorStop(0.5, "#7c5cff"); grad.addColorStop(1, "#ff5fa2");
  g.beginPath();
  samples.forEach(function (v, i) { if (i) { g.lineTo(x(i), y(v)); } else { g.moveTo(x(i), y(v)); } });
  g.lineWidth = 3; g.lineJoin = "round"; g.strokeStyle = grad; g.stroke();
  g.lineTo(x(samples.length - 1), h - pad); g.lineTo(x(0), h - pad); g.closePath();
  g.globalAlpha = 0.18; g.fillStyle = grad; g.fill(); g.globalAlpha = 1;
  g.fillStyle = (getComputedStyle(document.documentElement).getPropertyValue("--text") || "").trim() || "#e8eaed"; g.font = "12px system-ui, sans-serif";   // H20: theme text colour
  g.fillText(samples[0].toFixed(2) + " GFLOPS", pad, 12);
  var last = samples[samples.length - 1].toFixed(2), tw = g.measureText(last).width;
  g.fillText(last, w - pad - tw, 12);
}

window.DevbenchChart = { draw: devbenchChartDraw };
