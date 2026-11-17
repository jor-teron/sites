/*
 * Weather Forecast — page logic (WX1c).
 * Paints current conditions, the 7-day forecast and today's hourly curve; handles loading,
 * error, offline and refresh. WX1d adds the 12-hour strip and detail chips.
 */
var WXApp = (function () {
  "use strict";

  var CFG = WEATHER_FORECAST_CONFIG;
  var T = CFG.text;
  var el = {};
  var busy = false;
  var last = null;
  var prefs = {};

  function $(id) { return document.getElementById(id); }

  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(CFG.prefs.key) || "{}") || {}; } catch (e) { return {}; }
  }

  function writePrefs() {
    try { localStorage.setItem(CFG.prefs.key, JSON.stringify(prefs)); } catch (e) { /* optional */ }
  }

  /* ---- inline SVG icons (no external files, no network) ---- */

  function rays(cx, cy, r1, r2, n) {
    var out = "", i, a;
    for (i = 0; i < n; i++) {
      a = (Math.PI * 2 / n) * i - Math.PI / 2;
      out += '<line x1="' + (cx + Math.cos(a) * r1).toFixed(1) + '" y1="' + (cy + Math.sin(a) * r1).toFixed(1) +
        '" x2="' + (cx + Math.cos(a) * r2).toFixed(1) + '" y2="' + (cy + Math.sin(a) * r2).toFixed(1) + '"/>';
    }
    return out;
  }

  var CLOUD = '<path d="M20 46h26a9 9 0 0 0 1.2-17.9A12.5 12.5 0 0 0 22.6 25 8.6 8.6 0 0 0 20 46z" fill="var(--wx-cloud, #8b98ab)"/>';
  var CLOUD_UP = '<g transform="translate(0,-5)">' + CLOUD + '</g>';
  var SUN = '<g stroke="#efa53c" stroke-width="3.2" stroke-linecap="round">' + rays(32, 32, 16, 21, 8) + '</g>' +
    '<circle cx="32" cy="32" r="10.5" fill="#efa53c"/>';

  function drops(xs, y1, y2) {
    var out = "", i;
    for (i = 0; i < xs.length; i++) {
      out += '<line x1="' + xs[i] + '" y1="' + y1 + '" x2="' + (xs[i] - 2) + '" y2="' + y2 + '"/>';
    }
    return out;
  }

  function flakes() {
    var xs = [22, 32, 42], out = "", i;
    for (i = 0; i < xs.length; i++) {
      out += '<path d="M' + xs[i] + ' 49v8M' + (xs[i] - 3.5) + ' 51l7 4M' + (xs[i] + 3.5) + ' 51l-7 4"/>';
    }
    return out;
  }

  function iconSvg(kind) {
    var head = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">';
    if (kind === "sun") return head + SUN + "</svg>";
    if (kind === "partly") {
      return head +
        '<g stroke="#efa53c" stroke-width="3" stroke-linecap="round">' + rays(25, 24, 9, 13, 8) + '</g>' +
        '<circle cx="25" cy="24" r="6.6" fill="#efa53c"/>' + CLOUD + "</svg>";
    }
    if (kind === "cloud") return head + CLOUD + "</svg>";
    if (kind === "rain") {
      return head + CLOUD_UP +
        '<g stroke="#4a86e8" stroke-width="3" stroke-linecap="round">' + drops([24, 32, 40], 44, 56) + '</g></svg>';
    }
    if (kind === "drizzle") {
      return head + CLOUD_UP +
        '<g stroke="#6f9fe8" stroke-width="3" stroke-linecap="round">' + drops([27, 37], 44, 51) + '</g></svg>';
    }
    if (kind === "snow") {
      return head + CLOUD_UP +
        '<g stroke="#7fb2e5" stroke-width="2.4" stroke-linecap="round">' + flakes() + '</g></svg>';
    }
    if (kind === "storm") {
      return head + CLOUD_UP +
        '<path d="M33 40l-8 13h7l-3 11 12-15h-7l4-9z" fill="#efa53c"/></svg>';
    }
    if (kind === "fog") {
      return head + CLOUD_UP +
        '<g stroke="var(--wx-cloud, #8b98ab)" stroke-width="3" stroke-linecap="round">' +
        '<line x1="20" y1="48" x2="44" y2="48"/><line x1="24" y1="54" x2="40" y2="54"/></g></svg>';
    }
    return head + CLOUD + "</svg>";
  }

  /* ---- today's curve ---- */

  var drawQueued = false;

  function scheduleDraw() {
    if (drawQueued) return;
    drawQueued = true;
    window.requestAnimationFrame(function () {
      drawQueued = false;
      drawChart();
    });
  }

  function hexA(hex, a) {
    var h = (hex || "").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-f]{6}$/i.test(h)) return "rgba(47, 111, 237, " + a + ")";
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + a + ")";
  }

  function chartHours(data) {
    var today = (data.at || "").slice(0, 10);
    var out = [], i, h;
    for (i = 0; i < (data.hours || []).length; i++) {
      h = data.hours[i];
      if (typeof h.temp === "number" && h.time.slice(0, 10) === today) out.push(h);
    }
    return out;
  }

  function drawChart() {
    var data = last && last.data;
    if (!data) return;
    var pts = chartHours(data);
    if (pts.length < 2) {
      el.chartCard.hidden = true;
      return;
    }
    el.chartCard.hidden = false;

    var C = CFG.chart;
    var canvas = el.canvas;
    var ctx = canvas.getContext("2d");
    var cssW = canvas.clientWidth || el.chartCard.clientWidth;
    var cssH = C.height;
    if (!cssW) {
      window.requestAnimationFrame(drawChart);
      return;
    }

    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var root = getComputedStyle(document.documentElement);
    var accent = root.getPropertyValue("--accent").trim() || "#2f6fed";
    var ink = root.getPropertyValue("--muted").trim() || "#5d6b7d";
    var lineCol = root.getPropertyValue("--line").trim() || "#dde4ee";

    var plotW = cssW - C.padLeft - C.padRight;
    var plotH = cssH - C.padTop - C.padBottom;
    var temps = pts.map(function (p) { return p.temp; });
    var lo = Math.min.apply(null, temps) - C.tempMargin;
    var hi = Math.max.apply(null, temps) + C.tempMargin;
    var span = Math.max(hi - lo, 1);
    var x = function (i) { return C.padLeft + (i / (pts.length - 1)) * plotW; };
    var y = function (t) { return C.padTop + ((hi - t) / span) * plotH; };

    function trace() {
      ctx.beginPath();
      ctx.moveTo(x(0), y(pts[0].temp));
      for (var i = 0; i < pts.length - 1; i++) {
        var xc = (x(i) + x(i + 1)) / 2;
        var yc = (y(pts[i].temp) + y(pts[i + 1].temp)) / 2;
        ctx.quadraticCurveTo(x(i), y(pts[i].temp), xc, yc);
      }
      ctx.lineTo(x(pts.length - 1), y(pts[pts.length - 1].temp));
    }

    // baseline
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(C.padLeft, cssH - C.padBottom + 0.5);
    ctx.lineTo(cssW - C.padRight, cssH - C.padBottom + 0.5);
    ctx.stroke();

    // soft fill under the curve
    trace();
    ctx.lineTo(x(pts.length - 1), cssH - C.padBottom);
    ctx.lineTo(x(0), cssH - C.padBottom);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, C.padTop, 0, cssH - C.padBottom);
    grad.addColorStop(0, hexA(accent, 0.3));
    grad.addColorStop(1, hexA(accent, 0.02));
    ctx.fillStyle = grad;
    ctx.fill();

    // curve
    trace();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // "now" marker
    var nowH = parseFloat((data.at || "").slice(11, 13)) + parseFloat((data.at || "").slice(14, 16)) / 60;
    var firstH = parseFloat(pts[0].time.slice(11, 13));
    var lastH = parseFloat(pts[pts.length - 1].time.slice(11, 13));
    var nx = null;
    if (isFinite(nowH) && lastH > firstH) {
      nx = C.padLeft + ((nowH - firstH) / (lastH - firstH)) * plotW;
      if (nx < C.padLeft || nx > cssW - C.padRight) nx = null;
      if (nx !== null) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = accent;
        ctx.beginPath();
        ctx.moveTo(nx, C.padTop - 8);
        ctx.lineTo(nx, cssH - C.padBottom);
        ctx.stroke();
        ctx.restore();
      }
    }

    // hour and temperature labels every few hours, skipping any that would overlap
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = "alphabetic";
    var rows = "", k, hh, label, tw, left, cx, lastRight = -1e9;
    for (k = 0; k < pts.length; k++) {
      hh = parseInt(pts[k].time.slice(11, 13), 10);
      rows += "<tr><td>" + WXFormat.hourLabel(pts[k].time) + "</td><td>" + WXFormat.fmtTemp(pts[k].temp) + "</td></tr>";
      if (hh % C.labelEvery !== 0) continue;

      label = WXFormat.hourLabel(pts[k].time);
      tw = ctx.measureText(label).width;
      cx = x(k);
      left = Math.max(cx - tw / 2, 2);
      if (left < lastRight + 6) continue;

      ctx.textAlign = "left";
      ctx.fillStyle = ink;
      ctx.fillText(label, left, cssH - C.padBottom + 16);
      lastRight = left + tw;

      // keep the temperature clear of the "now" line
      if (nx === null || Math.abs(cx - nx) > 16) {
        ctx.textAlign = "center";
        ctx.fillText(WXFormat.fmtTemp(pts[k].temp), cx, y(pts[k].temp) - 8);
      }
    }
    el.chartTable.innerHTML = rows;
  }

  /* ---- state ---- */

  function setBusy(on) {
    busy = on;
    el.refresh.disabled = on;
    el.refresh.classList.toggle("spin", on);
  }

  function setStatus(text, tone) {
    el.status.textContent = text || "";
    el.status.dataset.tone = tone || "";
  }

  function showError(msg) {
    el.nowCard.hidden = true;
    el.daysCard.hidden = true;
    el.chartCard.hidden = true;
    el.errorCard.hidden = false;
    el.errorText.textContent = msg;
    setStatus("", "");
  }

  function renderDays(days) {
    if (!days || !days.length) {
      el.daysCard.hidden = true;
      return;
    }
    var html = "", i, d, w;
    for (i = 0; i < days.length; i++) {
      d = days[i];
      w = WXFormat.wmo(d.code);
      html += '<li class="wx-day">' +
        '<span class="d">' + (i === 0 ? T.today : WXFormat.weekday(d.date)) + '</span>' +
        '<span class="i">' + iconSvg(w[1]) + '<span class="sr">' + w[0] + '</span></span>' +
        '<span class="r">' + (typeof d.rain === "number" ? WXFormat.pct(d.rain) : "") + '</span>' +
        '<span class="t"><b>' + WXFormat.fmtTemp(d.hi) + '</b><i>' + WXFormat.fmtTemp(d.lo) + '</i></span>' +
        '</li>';
    }
    el.dayList.innerHTML = html;
    el.daysCard.hidden = false;
    applyDaysExpanded();
  }

  function applyDaysExpanded() {
    var open = !!prefs.showAllDays;
    el.dayList.classList.toggle("expanded", open);
    el.moreDays.textContent = open ? T.showLess : T.showAll;
    el.moreDays.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function paint(res) {
    var d = res.data, now = d.now;
    var w = WXFormat.wmo(now.code);

    el.nowCard.hidden = false;
    el.errorCard.hidden = true;
    el.nowCard.setAttribute("aria-busy", "false");

    el.place.textContent = d.place;
    el.stamp.textContent = WXFormat.fmtDay(d.at) + " \u00B7 " + WXFormat.fmtClock(d.at) + " local";
    el.temp.textContent = WXFormat.roundTemp(now.temp);
    el.unit.textContent = d.units.temp;
    el.cond.textContent = w[0];
    el.icon.innerHTML = iconSvg(w[1]);
    el.feels.textContent = T.feels + " " + WXFormat.fmtTemp(now.feels);
    el.hi.textContent = WXFormat.fmtTemp(d.today.hi);
    el.lo.textContent = WXFormat.fmtTemp(d.today.lo);
    el.hum.textContent = typeof now.humidity === "number" ? Math.round(now.humidity) + "%" : "\u2013";
    el.wind.textContent = WXFormat.windText(now.wind, now.dir, d.units.wind);

    renderDays(d.days);
    drawChart();

    if (res.stale) {
      setStatus(T.offline + " " + WXFormat.freshness(Date.now() - res.savedAt) + ".", "warn");
    } else {
      setStatus(T.updated + " " + WXFormat.freshness(Date.now() - res.savedAt) + " \u00B7 " + T.source, "");
    }
  }

  function refresh(force) {
    if (busy) return;
    setBusy(true);
    if (!last) setStatus(T.loading, "");

    WXData.load(!!force)
      .then(function (res) {
        last = res;
        paint(res);
      })
      .catch(function (err) {
        showError(T.errorBody + (err && err.message ? " (" + err.message + ")" : ""));
      })
      .then(function () {
        setBusy(false);
      });
  }

  function init() {
    el.place = $("place");
    el.stamp = $("stamp");
    el.status = $("status");
    el.nowCard = $("nowCard");
    el.icon = $("icon");
    el.temp = $("temp");
    el.unit = $("unit");
    el.cond = $("cond");
    el.feels = $("feels");
    el.hi = $("hi");
    el.lo = $("lo");
    el.hum = $("hum");
    el.wind = $("wind");
    el.daysCard = $("daysCard");
    el.dayList = $("dayList");
    el.moreDays = $("moreDays");
    el.chartCard = $("chartCard");
    el.canvas = $("tempChart");
    el.chartTable = $("chartTable");
    el.errorCard = $("errorCard");
    el.errorText = $("errorText");
    el.refresh = $("refresh");
    el.retry = $("retry");

    prefs = readPrefs();

    el.refresh.addEventListener("click", function () { refresh(true); });
    el.retry.addEventListener("click", function () { refresh(true); });
    el.moreDays.addEventListener("click", function () {
      prefs.showAllDays = !prefs.showAllDays;
      writePrefs();
      applyDaysExpanded();
    });

    window.addEventListener("offline", function () {
      if (last) setStatus(T.offline + " " + WXFormat.freshness(Date.now() - last.savedAt) + ".", "warn");
    });
    window.addEventListener("online", function () { refresh(true); });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && last &&
          WXFormat.isStale(last.savedAt, Date.now(), CFG.cache.maxAge)) {
        refresh(true);
      }
    });

    window.addEventListener("resize", scheduleDraw);
    if (window.ResizeObserver) new ResizeObserver(scheduleDraw).observe(el.chartCard);
    if (window.HubTheme && HubTheme.onChange) HubTheme.onChange(scheduleDraw);

    refresh(false);
  }

  return { init: init, refresh: refresh };
})();

WXApp.init();
