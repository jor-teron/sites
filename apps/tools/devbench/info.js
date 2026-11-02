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
      high = await ua.getHighEntropyValues(["architecture", "bitness", "model", "platform", "platformVersion", "fullVersionList"]);
    } catch (err) {
      high = {};
    }
  }
  var dpr = window.devicePixelRatio || 1;
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
    ["Browser", devbenchBrowser(high)],
    ["Screen (CSS px)", screen.width + "×" + screen.height],
    ["Screen (physical px)", Math.round(screen.width * dpr) + "×" + Math.round(screen.height * dpr)],
    ["Pixel density", dpr + "x (≈" + Math.round(96 * dpr) + " dpi)"],
    ["Refresh rate", "Measuring…"],
    ["GPU vendor", gpu.vendor],
    ["GPU renderer", gpu.renderer],
    ["Storage quota", quota]
  ]);
  var hz = await devbenchRefreshRate();
  devbenchSetFact("Refresh rate", hz);
}

/* Common panel rates used to round the measured frame rate. */
const DEVBENCH_INFO_RATES = [30, 50, 60, 75, 90, 120, 144, 165, 240];

/*
  Count requestAnimationFrame frames for ~2 s, round to nearest common rate.
*/
function devbenchRefreshRate() {
  return new Promise(function (resolve) {
    var frames = 0, start = 0;
    function tick(t) {
      if (!start) { start = t; }
      frames++;
      if (t - start < 2000) { requestAnimationFrame(tick); return; }
      var fps = (frames - 1) / ((t - start) / 1000);
      var best = DEVBENCH_INFO_RATES.reduce(function (a, b) { return Math.abs(b - fps) < Math.abs(a - fps) ? b : a; });
      resolve(best + " Hz (measured " + fps.toFixed(1) + " fps)");
    }
    requestAnimationFrame(tick);
  });
}

/* Replace one fact value by its label. */
function devbenchSetFact(label, value) {
  document.querySelectorAll("#sys-out > div").forEach(function (row) {
    if (row.firstChild.textContent === label) { row.lastChild.textContent = value; }
  });
}

/*
  Browser name + version + OS. Client hints first, user-agent text fallback.
*/
function devbenchBrowser(high) {
  var ua = navigator.userAgent, name = "", ver = "", os = "";
  var list = high.fullVersionList || [];
  list.forEach(function (b) {
    if (!/Not.?A.?Brand|Chromium/i.test(b.brand) && !name) { name = b.brand; ver = b.version; }
  });
  if (!name && list.length) { name = list[list.length - 1].brand; ver = list[list.length - 1].version; }
  if (!name) {
    var m = ua.match(/(Edg|OPR|SamsungBrowser|Firefox|Chrome|Version)\/([\d.]+)/);
    if (m) {
      name = { Edg: "Edge", OPR: "Opera", Version: "Safari" }[m[1]] || m[1];
      ver = m[2];
    }
  }
  if (high.platform) {
    os = high.platform + (high.platformVersion ? " " + high.platformVersion : "");
  } else {
    var o = ua.match(/Android [\d.]+|Windows NT [\d.]+|Mac OS X [\d_]+|iPhone OS [\d_]+|CrOS|Linux/);
    os = o ? o[0].replace(/_/g, ".") : "";
  }
  return (name || DEVBENCH_INFO_NA) + (ver ? " " + ver : "") + (os ? " on " + os : "");
}

/* Public info API. Page controller calls load on startup. */
window.DevbenchInfo = {
  load: devbenchLoadInfo
};
