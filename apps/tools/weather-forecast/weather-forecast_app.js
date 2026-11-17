/*
 * Weather Forecast — page logic (WX1a).
 * Paints the current-conditions card and handles loading, error, offline and refresh.
 * WX1b adds the 7-day outlook, WX1c the hourly curve.
 */
var WXApp = (function () {
  "use strict";

  var CFG = WEATHER_FORECAST_CONFIG;
  var T = CFG.text;
  var el = {};
  var busy = false;
  var last = null;

  function $(id) { return document.getElementById(id); }

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
    el.errorCard.hidden = false;
    el.errorText.textContent = msg;
    setStatus("", "");
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
    el.errorCard = $("errorCard");
    el.errorText = $("errorText");
    el.refresh = $("refresh");
    el.retry = $("retry");

    el.refresh.addEventListener("click", function () { refresh(true); });
    el.retry.addEventListener("click", function () { refresh(true); });

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

    refresh(false);
  }

  return { init: init, refresh: refresh };
})();

WXApp.init();
