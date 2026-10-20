/*
  File: sprites.js
  Project: devbench
  Role: Light 2D canvas test (from Browser Bench, shortened): add moving sprites until the
  frame rate drops under 30 fps, max ~4 s. Used for the AoE RTS verdict.
  Exposes window.DevbenchSprites.run(stage, onProgress) -> { maxSprites, lastFps }.
*/

var DEVBENCH_SPRITE_MS = 4000;

/* Average fps over ms while calling draw() each frame. */
function devbenchFps(ms, draw) {
  return new Promise(function (resolve) {
    var frames = 0, t0 = 0;
    function tick(t) {
      if (!t0) { t0 = t; }
      draw();
      if (t - t0 < ms) { frames++; requestAnimationFrame(tick); return; }
      resolve(frames * 1000 / Math.max(1, t - t0));
    }
    requestAnimationFrame(tick);
  });
}

async function devbenchSpritesRun(stage, onProgress) {
  var W = 480, H = 270;
  var cv = document.createElement("canvas"); cv.width = W; cv.height = H; stage.replaceChildren(cv);
  var g = cv.getContext("2d");
  var sp = document.createElement("canvas"); sp.width = sp.height = 24;
  var sg = sp.getContext("2d"), gr = sg.createRadialGradient(12, 9, 2, 12, 12, 12);
  gr.addColorStop(0, "#ffe08a"); gr.addColorStop(1, "#ff4f9a"); sg.fillStyle = gr;
  sg.beginPath(); sg.arc(12, 12, 11, 0, 7); sg.fill();
  var S = [];
  var add = function (n) { for (var i = 0; i < n; i++) { S.push({ x: Math.random() * (W - 24), y: Math.random() * (H - 24), vx: Math.random() * 4 - 2, vy: Math.random() * 4 - 2 }); } };
  var draw = function () {
    g.fillStyle = "#14102a"; g.fillRect(0, 0, W, H);
    for (var i = 0; i < S.length; i++) {
      var s = S[i]; s.x += s.vx; s.y += s.vy;
      if (s.x < 0 || s.x > W - 24) { s.vx *= -1; }
      if (s.y < 0 || s.y > H - 24) { s.vy *= -1; }
      g.drawImage(sp, s.x, s.y);
    }
  };
  var best = 0, lastFps = 0, start = performance.now();
  add(300);
  while (performance.now() - start < DEVBENCH_SPRITE_MS) {
    lastFps = await devbenchFps(250, draw);
    onProgress(Math.min(1, (performance.now() - start) / DEVBENCH_SPRITE_MS));
    if (lastFps < 30) { break; }
    best = S.length; add(Math.ceil(S.length * 0.6));
  }
  stage.replaceChildren();
  return { maxSprites: best, lastFps: lastFps };
}

window.DevbenchSprites = { run: devbenchSpritesRun };
