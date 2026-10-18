/*
  File: fun.js
  Project: devbench
  Role: Playful layer (R4): score dial that fills and wobbles in, count-up number,
  "vs last run" note, and pop-in of each card when its test completes.
  Listens to devbench.js events (devbench:test, devbench:finish). No test logic.
*/

/* Pop a card again even if it popped before. */
function devbenchPop(el) {
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
}

/* Count the number up to `to` over ~0.9 s. */
function devbenchCountUp(el, to) {
  var from = parseInt(el.textContent, 10) || 0, t0 = performance.now();
  function step(t) {
    var p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (p < 1) { requestAnimationFrame(step); }
  }
  requestAnimationFrame(step);
}

var devbenchLastShown = null;

/* Fill the dial; wobble only when the score changed. */
function devbenchDial(score) {
  var dial = document.getElementById("dial"), fill = document.getElementById("dial-fill");
  if (!dial || score == null) { return; }
  fill.style.strokeDashoffset = String(314.16 * (1 - score / 100));
  if (score !== devbenchLastShown) {
    devbenchCountUp(document.getElementById("score-num"), score);
    dial.classList.remove("wobble"); void dial.offsetWidth; dial.classList.add("wobble");
    devbenchLastShown = score;
  }
}

document.addEventListener("devbench:test", function (e) { devbenchPop(e.detail.card); });
document.addEventListener("devbench:finish", function (e) {
  var s = e.detail.score;
  devbenchDial(s ? s.overall : null);
  var share = document.getElementById("share-btn");
  if (share) { share.hidden = !s; }
});
