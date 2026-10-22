/*
  File: share.js
  Project: devbench
  Role: Share card: draws the result as a 1080×1350 PNG (gradient, score ring, top parts,
  game verdicts, browser line) on a canvas. Uses the phone share sheet when it can share
  files, else downloads the PNG. Exposes window.DevbenchShare.make(state).
*/

function devbenchShareDraw(state) {
  var W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  var g = cv.getContext("2d");
  var bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#ff5fa2"); bg.addColorStop(0.55, "#7c5cff"); bg.addColorStop(1, "#1b1640");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.12)"; g.beginPath(); g.ellipse(W / 2, 120, 520, 220, 0, 0, 7); g.fill();
  g.fillStyle = "#fff"; g.textAlign = "center";
  g.font = "800 64px system-ui, sans-serif"; g.fillText("Device Benchmark", W / 2, 130);
  var score = state.score ? state.score.overall : 0;
  /* Ring */
  g.lineCap = "round"; g.lineWidth = 46;
  g.strokeStyle = "rgba(255,255,255,0.2)"; g.beginPath(); g.arc(W / 2, 470, 230, 0, 7); g.stroke();
  g.strokeStyle = "#fff"; g.beginPath(); g.arc(W / 2, 470, 230, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * score / 100); g.stroke();
  g.font = "900 200px system-ui, sans-serif"; g.fillText(String(score), W / 2, 540);
  g.font = "600 44px system-ui, sans-serif"; g.globalAlpha = 0.8; g.fillText("/ 100", W / 2, 600); g.globalAlpha = 1;
  /* Parts as bars */
  var parts = state.score ? state.score.parts : {}, labels = {};
  window.DevbenchScore.parts.forEach(function (p) { labels[p.key] = p.label; });
  var keys = Object.keys(parts).slice(0, 8), y = 800;
  g.textAlign = "left"; g.font = "600 36px system-ui, sans-serif";
  keys.forEach(function (k, i) {
    var col = i % 2, row = Math.floor(i / 2), x = 90 + col * 470, yy = y + row * 90;
    g.fillStyle = "#fff"; g.fillText(labels[k] + "  " + parts[k], x, yy);
    g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(x, yy + 16, 400, 14);
    g.fillStyle = "#fff"; g.fillRect(x, yy + 16, 4 * parts[k], 14);
  });
  /* Verdicts + browser */
  var vy = y + Math.ceil(keys.length / 2) * 90 + 40, LV = { ok: "Good", warn: "OK", no: "Poor" };
  g.font = "600 34px system-ui, sans-serif";
  (state.verdicts || []).forEach(function (v, i) { g.fillText("🎮 " + v.game + ": " + LV[v.level], 90, vy + i * 50); });
  var browser = "";
  document.querySelectorAll("#sys-out > div").forEach(function (r) { if (r.firstChild.textContent === "Browser") { browser = r.lastChild.textContent; } });
  g.textAlign = "center"; g.font = "28px system-ui, sans-serif"; g.globalAlpha = 0.85;
  g.fillText(browser.slice(0, 60) + " · " + new Date().toLocaleDateString(), W / 2, H - 50);
  return cv;
}

async function devbenchShareMake(state) {
  var cv = devbenchShareDraw(state);
  var blob = await new Promise(function (r) { cv.toBlob(r, "image/png"); });
  var file = new File([blob], "devbench-score.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Device Benchmark" }); return; } catch (e) { if (e && e.name === "AbortError") { return; } }
  }
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

window.DevbenchShare = { make: devbenchShareMake };
