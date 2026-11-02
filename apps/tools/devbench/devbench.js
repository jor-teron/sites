/*
  File: devbench.js
  Project: devbench
  Role: Page controller. Builds a card per test from tests.js into its tab, runs one test
  at a time (all buttons lock), Run all (skips extra tests), score + verdicts, tabs (#hash),
  Settings sheet, export, share and history buttons. No test maths here.
*/

var devbenchState = { tests: {}, features: null, score: null, verdicts: null };
var devbenchBusy = false;

function devbench$(id) { return document.getElementById(id); }

/* Lock or unlock every button that starts work. */
function devbenchLock(on) {
  document.querySelectorAll("button[data-run], #run-all").forEach(function (b) { b.disabled = on; });
}

/* Show one tab panel and remember it in the URL hash. */
function devbenchShowTab(name) {
  document.querySelectorAll(".tabs [data-tab]").forEach(function (b) {
    var on = b.dataset.tab === name;
    b.classList.toggle("on", on); b.setAttribute("aria-selected", on);
  });
  document.querySelectorAll(".panel").forEach(function (p) { p.hidden = p.dataset.panel !== name; });
  if (location.hash !== "#" + name) { history.replaceState(null, "", "#" + name); }
  document.dispatchEvent(new CustomEvent("devbench:tab", { detail: name }));
}

/* One test card: title, Run button, description, stage, progress bar, result line. */
function devbenchCard(t) {
  var el = document.createElement("section");
  el.className = "card test"; el.id = "card-" + t.id;
  el.innerHTML = '<div class="head"><h2></h2><button type="button" data-run="' + t.id + '">Run</button></div>' +
    '<p class="desc"></p><div class="stage"></div><div class="bar"><span></span></div><div class="out muted">Not run</div>';
  el.querySelector("h2").textContent = t.name;
  el.querySelector(".desc").textContent = t.desc;
  return el;
}

/* Run one test by id and write its result. */
async function devbenchRun(id) {
  var t = window.DEVBENCH_TESTS.find(function (x) { return x.id === id; });
  var card = devbench$("card-" + id), bar = card.querySelector(".bar > span"), out = card.querySelector(".out");
  card.classList.add("running"); bar.style.width = "0"; out.className = "out muted"; out.textContent = "Running…";
  var ctx = { stage: card.querySelector(".stage"), progress: function (p) { bar.style.width = Math.round(p * 100) + "%"; } };
  try {
    var r = await t.run(ctx);
    devbenchState.tests[id] = r; out.className = "out"; out.textContent = r.text;
  } catch (err) {
    var msg = String(err && err.message || err || "Failed");
    devbenchState.tests[id] = { error: msg, text: "Error: " + msg }; out.className = "out bad"; out.textContent = "Error: " + msg;
  }
  bar.style.width = "100%"; card.classList.remove("running");
  document.dispatchEvent(new CustomEvent("devbench:test", { detail: { id: id, card: card } }));
}

/* Recompute score + verdicts and paint them. */
function devbenchFinish() {
  var s = devbenchState;
  s.score = window.DevbenchScore.compute(s.tests);
  s.verdicts = window.DevbenchScore.verdicts(s.tests, s.features);
  devbench$("score-num").textContent = s.score ? s.score.overall : "–";
  var LV = { ok: "Good", warn: "OK", no: "Poor" };
  devbench$("verdicts").innerHTML = s.verdicts.map(function (v) {
    return '<li><b>' + v.game + ':</b> <span class="' + v.level + '">' + LV[v.level] + '</span> — ' + v.note + '</li>';
  }).join("");
  document.dispatchEvent(new CustomEvent("devbench:finish", { detail: s }));
}

/* Run one test with locking (card buttons). */
async function devbenchRunSingle(id) {
  if (devbenchBusy) { return; }
  devbenchBusy = true; devbenchLock(true);
  await devbenchRun(id);
  devbenchBusy = false; devbenchLock(false); devbenchFinish();
}

/* Run all main tests in order, switching to each test's tab. */
async function devbenchRunAll() {
  if (devbenchBusy) { return; }
  devbenchBusy = true; devbenchLock(true);
  var list = window.DEVBENCH_TESTS.filter(function (t) { return !t.extra; });
  devbench$("score-note").textContent = "Running…";
  for (var i = 0; i < list.length; i++) {
    devbench$("all-bar").style.width = Math.round(i / list.length * 100) + "%";
    devbenchShowTab(list[i].tab);
    await devbenchRun(list[i].id);
  }
  devbench$("all-bar").style.width = "100%";
  devbench$("score-note").textContent = "Done. Tap a test's Run to repeat it.";
  devbenchBusy = false; devbenchLock(false); devbenchFinish();
  document.dispatchEvent(new CustomEvent("devbench:runall", { detail: devbenchState }));
}

/* Paint the feature checklist. */
function devbenchRenderFeatures(f) {
  var L = window.DevbenchFeatures.labels;
  devbench$("features").innerHTML = Object.keys(f).map(function (k) {
    return '<li><span class="' + (f[k] ? "ok" : "no") + '">' + (f[k] ? "✔" : "✘") + "</span> " + (L[k] || k) + "</li>";
  }).join("");
}

function devbenchInit() {
  window.DEVBENCH_TESTS.forEach(function (t) {
    var host = t.extra ? devbench$("extra-tests") : document.querySelector('[data-panel="' + t.tab + '"]');
    host.appendChild(devbenchCard(t));
  });
  document.addEventListener("click", function (e) {
    var id = e.target.dataset && e.target.dataset.run;
    if (id) { devbenchRunSingle(id); }
    var tab = e.target.dataset && e.target.dataset.tab;
    if (tab) { devbenchShowTab(tab); }
  });
  devbench$("run-all").addEventListener("click", devbenchRunAll);
  devbench$("settings-btn").addEventListener("click", function () { devbench$("settings").showModal(); });
  devbench$("settings-close").addEventListener("click", function () { devbench$("settings").close(); });
  devbench$("dl-json").addEventListener("click", function () { window.DevbenchExport.json(devbenchState); });
  devbench$("dl-txt").addEventListener("click", function () { window.DevbenchExport.txt(devbenchState); });
  devbench$("share-btn").addEventListener("click", function () { window.DevbenchShare.make(devbenchState); });
  var start = location.hash.slice(1);
  devbenchShowTab(["device", "speed", "games", "ai", "history"].indexOf(start) >= 0 ? start : "device");
  window.DevbenchInfo.load();
  window.DevbenchFeatures.detect().then(function (f) { devbenchState.features = f; devbenchRenderFeatures(f); devbenchFinish(); });
}

devbenchInit();
