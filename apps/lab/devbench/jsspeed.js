/*
  File: jsspeed.js
  Project: devbench
  Role: JavaScript speed. Fixed mixed round (sort, JSON, regex, DOM) for ~3 s.
  Exposes window.DevbenchJs.run(onProgress) -> { roundsPerSec, msPerRound }.
*/

/* Test length in milliseconds. */
const DEVBENCH_JS_MS = 3000;

/* Fixed seeded data so every device does the same work. */
function devbenchJsData() {
  var seed = 1, nums = new Array(100000);
  for (var i = 0; i < nums.length; i++) { seed = (seed * 16807) % 2147483647; nums[i] = seed; }
  var obj = [];
  for (var k = 0; k < 8000; k++) { obj.push({ id: k, name: "item-" + k, tags: ["a", "b", "c"], v: k * 1.5, ok: k % 2 === 0, note: "lorem ipsum dolor sit amet" }); }
  return { nums: nums, obj: obj };
}

/* One round of the mixed workload. */
function devbenchJsRound(data) {
  data.nums.slice().sort(function (a, b) { return a - b; });
  var back = JSON.parse(JSON.stringify(data.obj));
  var text = back.map(function (o) { return o.name + " " + o.note; }).join("\n");
  var hits = (text.match(/item-\d+3\b/g) || []).length;
  text.replace(/[aeiou]/g, "").toUpperCase().split(" ").reverse();
  var frag = document.createDocumentFragment();
  for (var i = 0; i < 2000; i++) { var d = document.createElement("div"); d.textContent = i; d.className = "x"; frag.appendChild(d); }
  while (frag.firstChild) { frag.removeChild(frag.firstChild); }
  return hits;
}

/* Count full rounds within the time budget. */
async function devbenchJsRun(onProgress) {
  var data = devbenchJsData();
  var start = performance.now(), rounds = 0, now = start;
  while (now - start < DEVBENCH_JS_MS) {
    devbenchJsRound(data);
    rounds++;
    now = performance.now();
    onProgress(Math.min(1, (now - start) / DEVBENCH_JS_MS));
    await new Promise(function (r) { setTimeout(r, 0); });
  }
  var sec = (now - start) / 1000;
  return { roundsPerSec: rounds / sec, msPerRound: (now - start) / rounds };
}

window.DevbenchJs = { run: devbenchJsRun };
