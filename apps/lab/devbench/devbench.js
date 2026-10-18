/*
  File: devbench.js
  Project: devbench
  Role: Loads the info card, wires every Run button, Run all and Download result.
  Updates progress bars and result text. Does not contain the test math.
*/

/* Every button locked while a test runs. */
const DEVBENCH_BUTTONS = ["cpu-run", "gpu-run", "disk-run", "mem-run", "js-run", "jpeg-run", "video-run", "ping-run", "dl-run", "run-all", "save-run"];

/* Run buttons used by Run all, in page order. Download is skipped on purpose. */
const DEVBENCH_RUN_ALL = ["cpu-run", "gpu-run", "mem-run", "js-run", "disk-run", "jpeg-run", "video-run", "ping-run"];

/* Click handlers by button id, so Run all can await each in turn. */
const devbenchRunners = {};

/* Format a number with grouped digits and fixed decimals. */
function devbenchFmt(value, digits) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

/* Set a bar fill to a 0..1 fraction. */
function devbenchBar(id, fraction) {
  document.getElementById(id).style.width = Math.round(fraction * 100) + "%";
}

/* Lock all run buttons while one test is active. */
function devbenchLock(locked) {
  DEVBENCH_BUTTONS.forEach(function (id) {
    document.getElementById(id).disabled = locked;
  });
}

/* Bind one button to an async runner and write its result. */
function devbenchBind(buttonId, barId, outId, runner) {
  async function go(noLock) {
    if (!noLock) { devbenchLock(true); }
    devbenchBar(barId, 0);
    document.getElementById(outId).textContent = "Running…";
    try {
      var result = await runner(function (fraction) {
        devbenchBar(barId, fraction);
      });
      devbenchBar(barId, 1);
      document.getElementById(outId).textContent = result;
    } catch (err) {
      document.getElementById(outId).textContent = err && err.message ? err.message : "Failed";
    }
    if (!noLock) { devbenchLock(false); }
  }
  devbenchRunners[buttonId] = go;
  document.getElementById(buttonId).addEventListener("click", function () { go(false); });
}

/* Attach the system card and the three tests after the page nodes exist. */
function devbenchInit() {
  if (window.DevbenchInfo) {
    window.DevbenchInfo.load();
  }
  devbenchBind("cpu-run", "cpu-bar", "cpu-out", async function (onProgress) {
    var score = await window.DevbenchCpu.run(onProgress);
    return score.cores + " cores · " + devbenchFmt(score.opsPerSec, 0) + " ops/s";
  });
  devbenchBind("gpu-run", "gpu-bar", "gpu-out", async function (onProgress) {
    var canvas = document.getElementById("gpu-canvas");
    var score = await window.DevbenchGpu.run(canvas, onProgress);
    return devbenchFmt(score.mpixPerSec, 0) + " Mpix/s · " + devbenchFmt(score.fillsPer60HzFrame, 0) +
      " full-canvas layers per 60 Hz frame · " + devbenchFmt(score.draws, 0) + " draws";
  });
  devbenchBind("disk-run", "disk-bar", "disk-out", async function (onProgress) {
    var score = await window.DevbenchDisk.run(onProgress);
    return "write " + devbenchFmt(score.writeMBps, 1) + " MB/s · read " + devbenchFmt(score.readMBps, 1) + " MB/s";
  });
  devbenchBind("mem-run", "mem-bar", "mem-out", async function (p) {
    var r = await window.DevbenchMemory.run(p);
    return "copy " + devbenchFmt(r.copyGBps, 1) + " GB/s · read " + devbenchFmt(r.readGBps, 1) + " GB/s";
  });
  devbenchBind("js-run", "js-bar", "js-out", async function (p) {
    var r = await window.DevbenchJs.run(p);
    return devbenchFmt(r.roundsPerSec, 2) + " rounds/s · " + devbenchFmt(r.msPerRound, 0) + " ms/round";
  });
  devbenchBind("jpeg-run", "jpeg-bar", "jpeg-out", async function (p) {
    var r = await window.DevbenchMedia.jpeg(p);
    return "encode " + devbenchFmt(r.encMs, 0) + " ms (" + devbenchFmt(r.encMPs, 1) + " MP/s) · decode " +
      devbenchFmt(r.decMs, 0) + " ms (" + devbenchFmt(r.decMPs, 1) + " MP/s)";
  });
  devbenchBind("video-run", "video-bar", "video-out", async function (p) {
    var r = await window.DevbenchMedia.video(p);
    if (!r.supported) { return "Not supported (no WebCodecs encoder)"; }
    var dec = r.decFps == null ? "decode not supported" : "decode " + devbenchFmt(r.decFps, 0) + " fps";
    return r.codec + " · encode " + devbenchFmt(r.encFps, 0) + " fps · " + dec + " · hw: " + r.hw;
  });
  devbenchBind("ping-run", "ping-bar", "ping-out", async function (p) {
    var r = await window.DevbenchNet.ping(p);
    function f(x) { return x ? "min " + devbenchFmt(x.min, 0) + " / avg " + devbenchFmt(x.avg, 0) + " ms" : "unreachable"; }
    return "site " + f(r.own) + " · PeerJS " + f(r.peer);
  });
  devbenchBind("dl-run", "dl-bar", "dl-out", async function (p) {
    var r = await window.DevbenchNet.download(p);
    return devbenchFmt(r.mbps, 1) + " Mbps · " + devbenchFmt(r.mb, 1) + " MB used";
  });
  document.getElementById("dl-warn").textContent = "Uses ~" + window.DevbenchNet.approxMB + " MB data. Not part of Run all.";
  document.getElementById("run-all").addEventListener("click", async function () {
    devbenchLock(true);
    for (var i = 0; i < DEVBENCH_RUN_ALL.length; i++) {
      await devbenchRunners[DEVBENCH_RUN_ALL[i]](true);
    }
    devbenchLock(false);
  });
  document.getElementById("save-run").addEventListener("click", devbenchSave);
}

/* Two-digit pad for file names. */
function devbenchPad(n) { return String(n).padStart(2, "0"); }

/* Save every card as readable "label: value" lines in a .txt file. */
function devbenchSave() {
  var lines = ["Device Benchmark result", "Date: " + new Date().toString(), "", "[Device info]"];
  var browser = "browser";
  document.querySelectorAll("#sys-out > div").forEach(function (row) {
    lines.push(row.firstChild.textContent + ": " + row.lastChild.textContent);
    if (row.firstChild.textContent === "Browser") { browser = row.lastChild.textContent; }
  });
  var group = "";
  document.querySelectorAll("main > h2.group, main > section.card:not(#sys-card)").forEach(function (el) {
    if (el.tagName === "H2") { group = el.textContent; lines.push("", "[" + group + "]"); return; }
    lines.push(el.querySelector("h2").textContent + ": " + el.querySelector(".out").textContent);
  });
  var d = new Date();
  var stamp = d.getFullYear() + devbenchPad(d.getMonth() + 1) + devbenchPad(d.getDate()) + "-" + devbenchPad(d.getHours()) + devbenchPad(d.getMinutes());
  var slug = browser.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "device";
  var blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "devbench-" + slug + "-" + stamp + ".txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

devbenchInit();
