/*
  File: devbench.js
  Project: devbench
  Role: Loads the system card and wires the three Run buttons.
  Updates progress bars and result text. Does not contain the test math.
*/

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
  ["cpu-run", "gpu-run", "disk-run"].forEach(function (id) {
    document.getElementById(id).disabled = locked;
  });
}

/* Bind one button to an async runner and write its result. */
function devbenchBind(buttonId, barId, outId, runner) {
  document.getElementById(buttonId).addEventListener("click", async function () {
    devbenchLock(true);
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
    devbenchLock(false);
  });
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
    return devbenchFmt(score.mpixPerSec, 0) + " Mpix/s · " + score.draws + " draws";
  });
  devbenchBind("disk-run", "disk-bar", "disk-out", async function (onProgress) {
    var score = await window.DevbenchDisk.run(onProgress);
    return "write " + devbenchFmt(score.writeMBps, 1) + " MB/s · read " + devbenchFmt(score.readMBps, 1) + " MB/s";
  });
}

devbenchInit();
