/*
  File: info.js
  Project: devbench
  Role: Read-only system card. Fills #sys-out on load.
  Uses only browser APIs. Missing values are shown as n/a.
*/

/* Label used when an API is missing or blocked. */
const DEVBENCH_INFO_NA = "n/a";

/*
  Turn a fact list into definition rows inside the system card.
*/
function devbenchRenderFacts(rows) {
  var root = document.getElementById("sys-out");
  root.textContent = "";
  rows.forEach(function (row) {
    var wrap = document.createElement("div");
    var dt = document.createElement("dt");
    var dd = document.createElement("dd");
    dt.textContent = row[0];
    dd.textContent = row[1];
    wrap.appendChild(dt);
    wrap.appendChild(dd);
    root.appendChild(wrap);
  });
}

/*
  GPU vendor and renderer from WebGL. Often masked by the browser.
*/
function devbenchGpuStrings() {
  var canvas = document.createElement("canvas");
  var gl = canvas.getContext("webgl");
  if (!gl) {
    return { vendor: DEVBENCH_INFO_NA, renderer: DEVBENCH_INFO_NA };
  }
  var ext = gl.getExtension("WEBGL_debug_renderer_info");
  if (!ext) {
    return { vendor: DEVBENCH_INFO_NA, renderer: DEVBENCH_INFO_NA };
  }
  return {
    vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || DEVBENCH_INFO_NA,
    renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || DEVBENCH_INFO_NA
  };
}

/*
  Collect facts and paint the system card. High-entropy UA fields are optional.
*/
async function devbenchLoadInfo() {
  var ua = navigator.userAgentData;
  var high = {};
  if (ua && ua.getHighEntropyValues) {
    try {
      high = await ua.getHighEntropyValues(["architecture", "bitness", "model", "platform", "platformVersion"]);
    } catch (err) {
      high = {};
    }
  }
  var gpu = devbenchGpuStrings();
  var quota = DEVBENCH_INFO_NA;
  if (navigator.storage && navigator.storage.estimate) {
    try {
      var est = await navigator.storage.estimate();
      var used = Math.round((est.usage || 0) / (1024 * 1024));
      var cap = est.quota ? Math.round(est.quota / (1024 * 1024)) + " MB" : DEVBENCH_INFO_NA;
      quota = used + " MB used / " + cap;
    } catch (err) {
      quota = DEVBENCH_INFO_NA;
    }
  }
  devbenchRenderFacts([
    ["Cores", String(navigator.hardwareConcurrency || DEVBENCH_INFO_NA)],
    ["RAM (approx)", navigator.deviceMemory ? navigator.deviceMemory + " GB" : DEVBENCH_INFO_NA],
    ["Platform", high.platform || navigator.platform || DEVBENCH_INFO_NA],
    ["Architecture", high.architecture || DEVBENCH_INFO_NA],
    ["Bitness", high.bitness || DEVBENCH_INFO_NA],
    ["Model", high.model || DEVBENCH_INFO_NA],
    ["Screen", screen.width + "×" + screen.height + " @ " + (window.devicePixelRatio || 1) + "x"],
    ["GPU vendor", gpu.vendor],
    ["GPU renderer", gpu.renderer],
    ["Storage quota", quota]
  ]);
}

/* Public info API. Page controller calls load on startup. */
window.DevbenchInfo = {
  load: devbenchLoadInfo
};
