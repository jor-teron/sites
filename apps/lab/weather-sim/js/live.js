/* live.js — WS2/WS3: user-settable place + one-shot live weather from Open-Meteo
   Standalone: never reads My Day / dashboard storage. Pure mapping is
   liveToSliders() so tests can check sea-level inverse + clamping without a network.
   WS3: no preset select — one place button; Temperature range defaults 0…50. */

const LIVE_API = "https://api.open-meteo.com/v1/forecast";
const LIVE_GEO = "https://geocoding-api.open-meteo.com/v1/search";
const LIVE_TIMEOUT_MS = 8000;

/* ---- pure: Open-Meteo "current" → slider values ---- */

function clampNum(n, lo, hi) {
  if (!isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/* Parse "2026-11-09T14:05" or "...T14:05:00" into hours as a float (14.083…). */
function localHourFromIso(iso) {
  if (typeof iso !== "string") return 12;
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return 12;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

/**
 * Map a live "current" block onto the five slider values.
 * Temperature: API gives local air; we invert temperatureAt() so the
 * Temperature slider (sea-level air) lands in the right place.
 *
 * @param {object} current  Open-Meteo current: temperature_2m, relative_humidity_2m,
 *                          wind_speed_10m (km/h), cloud_cover, time
 * @param {number} elevM    place elevation in metres
 * @param {object} ranges   { tempMin, tempMax, humidityMax, windMax, cloudMax, timeMax }
 * @returns {{ temperature, humidity, wind, cloud, time }}
 */
function liveToSliders(current, elevM, ranges) {
  const r = ranges || {};
  const tempMin = r.tempMin != null ? r.tempMin : 0;
  const tempMax = r.tempMax != null ? r.tempMax : 50;
  const humidityMax = r.humidityMax != null ? r.humidityMax : 100;
  const windMax = r.windMax != null ? r.windMax : 100;
  const cloudMax = r.cloudMax != null ? r.cloudMax : 100;
  const timeMax = r.timeMax != null ? r.timeMax : 24;

  const local = Number(current && current.temperature_2m);
  const elev = typeof elevM === "number" && isFinite(elevM) ? elevM : 0;
  const sea = seaLevelFromLocal(isFinite(local) ? local : tempMin, elev);

  return {
    temperature: Math.round(clampNum(sea, tempMin, tempMax)),
    humidity: Math.round(clampNum(Number(current && current.relative_humidity_2m), 0, humidityMax)),
    wind: Math.round(clampNum(Number(current && current.wind_speed_10m), 0, windMax)),
    cloud: Math.round(clampNum(Number(current && current.cloud_cover), 0, cloudMax)),
    time: Math.round(clampNum(localHourFromIso(current && current.time), 0, timeMax) * 10) / 10,
  };
}

/* ---- fetch with timeout ---- */

function fetchJson(url, ms) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms || LIVE_TIMEOUT_MS);
  return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .finally(() => clearTimeout(t));
}

function forecastUrl(lat, lon) {
  return LIVE_API +
    "?latitude=" + encodeURIComponent(lat) +
    "&longitude=" + encodeURIComponent(lon) +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,is_day" +
    "&timezone=auto";
}

/* ---- status line ---- */

function setLiveStatus(text) {
  const el = $("live-status");
  if (el) el.textContent = text || "";
}

function formatLiveClock(iso) {
  const m = typeof iso === "string" && iso.match(/T(\d{2}):(\d{2})/);
  return m ? m[1] + ":" + m[2] : "";
}

/* ---- apply mapped values through the same path a slider uses ---- */

function applySliderValues(vals) {
  for (const key of ["temperature", "humidity", "wind", "cloud", "time"]) {
    if (!(key in vals)) continue;
    const s = SLIDERS[key];
    if (!s) continue;
    s.el.value = vals[key];
    state[key] = parseFloat(s.el.value);
    if (s.after) s.after(state[key]);
  }
  renderAll();
  saveWeather();
}

/* ---- one-shot live pull (never auto-loops while simulating) ---- */

let liveBusy = false;

function pullLiveWeather(opts) {
  opts = opts || {};
  const place = getCustomPlace();
  if (!place) {
    setLiveStatus("Set a place to pull live weather");
    return Promise.resolve(false);
  }
  if (navigator.onLine === false) {
    setLiveStatus("Offline — using saved values");
    return Promise.resolve(false);
  }
  if (liveBusy) return Promise.resolve(false);
  liveBusy = true;
  if (!opts.silent) setLiveStatus("Fetching live…");

  return fetchJson(forecastUrl(place.lat, place.lon), LIVE_TIMEOUT_MS)
    .then((data) => {
      const current = data && data.current;
      if (!current) throw new Error("no current");
      /* Prefer the forecast elevation (terrain model) when the saved one is missing. */
      if ((place.elev == null || !isFinite(place.elev)) && typeof data.elevation === "number") {
        place.elev = data.elevation;
        saveCustomPlace(place);
        registerCustomPlace(place);
      }
      if (data.timezone) {
        place.tz = data.timezone;
        saveCustomPlace(place);
      }
      const elev = elevationOf(CUSTOM_PLACE_KEY);
      const vals = liveToSliders(current, elev, {
        tempMin: SEA_TEMP_MIN,
        tempMax: SEA_TEMP_MAX,
        humidityMax: 100,
        windMax: 100,
        cloudMax: 100,
        timeMax: 24,
      });
      applySliderValues(vals);
      const clock = formatLiveClock(current.time);
      setLiveStatus(clock ? "Live · " + clock : "Live");
      return true;
    })
    .catch(() => {
      setLiveStatus(navigator.onLine === false
        ? "Offline — using saved values"
        : "Could not reach weather — using saved values");
      return false;
    })
    .finally(() => { liveBusy = false; });
}

/* ---- geocoding + GPS ---- */

function searchPlaces(query) {
  const q = (query || "").trim();
  if (!q) return Promise.resolve([]);
  const url = LIVE_GEO + "?count=5&language=en&format=json&name=" + encodeURIComponent(q);
  return fetchJson(url, LIVE_TIMEOUT_MS)
    .then((j) => (j && j.results) || [])
    .catch(() => []);
}

function pickGeocodeResult(g) {
  const name = g.name +
    (g.admin1 ? ", " + g.admin1 : "") +
    (g.country_code ? " (" + g.country_code + ")" : "");
  const elev = typeof g.elevation === "number" && isFinite(g.elevation) ? g.elevation : 0;
  return {
    name: name,
    lat: g.latitude,
    lon: g.longitude,
    elev: elev,
    tz: g.timezone || "",
  };
}

function useMyLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location not available"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 100) / 100;
        const lon = Math.round(pos.coords.longitude * 100) / 100;
        /* Name + elevation come from the forecast response. */
        fetchJson(forecastUrl(lat, lon), LIVE_TIMEOUT_MS)
          .then((data) => {
            const elev = typeof data.elevation === "number" ? data.elevation : 0;
            resolve({
              name: "My location",
              lat: lat,
              lon: lon,
              elev: elev,
              tz: data.timezone || "",
            });
          })
          .catch(() => {
            resolve({ name: lat + ", " + lon, lat: lat, lon: lon, elev: 0, tz: "" });
          });
      },
      () => reject(new Error("Location permission denied")),
      { timeout: 15000 }
    );
  });
}

/* ---- place button + panel UI (WS3: no preset <select>) ---- */

function refreshPlaceButton() {
  const btn = $("place-btn");
  if (!btn) return;
  const p = getCustomPlace();
  if (p && p.name) {
    btn.textContent = "📍 " + p.name;
    btn.classList.remove("needs-place");
  } else {
    btn.textContent = "📍 Set your place";
    btn.classList.add("needs-place");
  }
}

function openPlacePanel() {
  const panel = $("place-panel");
  if (!panel) return;
  panel.hidden = false;
  const input = $("place-search");
  if (input) {
    input.value = "";
    setTimeout(() => input.focus(), 50);
  }
  const results = $("place-results");
  if (results) results.innerHTML = "";
  const msg = $("place-panel-msg");
  if (msg) msg.textContent = "";
}

function closePlacePanel() {
  const panel = $("place-panel");
  if (panel) panel.hidden = true;
}

function adoptCustomPlace(p) {
  saveCustomPlace(p);
  registerCustomPlace(p);
  refreshPlaceButton();
  closePlacePanel();
  applyPlace(CUSTOM_PLACE_KEY);
  renderAll();
  saveWeather();
  pullLiveWeather();
}

function renderGeoResults(list) {
  const box = $("place-results");
  const msg = $("place-panel-msg");
  if (!box) return;
  box.innerHTML = "";
  if (!list.length) {
    if (msg) msg.textContent = "No place found.";
    return;
  }
  if (msg) msg.textContent = "Pick one:";
  list.forEach((g) => {
    const p = pickGeocodeResult(g);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "place-result";
    btn.textContent = p.name;
    btn.addEventListener("click", () => adoptCustomPlace(p));
    box.appendChild(btn);
  });
}

function initLiveWeather() {
  refreshPlaceButton();

  const placeBtn = $("place-btn");
  if (placeBtn) placeBtn.addEventListener("click", openPlacePanel);

  const liveBtn = $("live-refresh");
  if (liveBtn) {
    liveBtn.addEventListener("click", () => {
      if (!getCustomPlace()) {
        setLiveStatus("Set a place first");
        openPlacePanel();
        return;
      }
      /* Ensure we are on the custom place before pulling. */
      if (state.place !== CUSTOM_PLACE_KEY) {
        applyPlace(CUSTOM_PLACE_KEY);
        renderAll();
        saveWeather();
      }
      pullLiveWeather();
    });
  }

  const cancel = $("place-cancel");
  if (cancel) cancel.addEventListener("click", () => {
    closePlacePanel();
    /* If custom was never saved, stay on the neutral default. */
    if (state.place === CUSTOM_PLACE_KEY && !getCustomPlace()) {
      applyPlace(DEFAULT_PLACE_KEY);
      renderAll();
      saveWeather();
    }
  });

  const searchBtn = $("place-search-btn");
  const input = $("place-search");
  function doSearch() {
    const msg = $("place-panel-msg");
    if (navigator.onLine === false) {
      if (msg) msg.textContent = "Search needs internet.";
      return;
    }
    if (msg) msg.textContent = "Searching…";
    searchPlaces(input && input.value).then(renderGeoResults);
  }
  if (searchBtn) searchBtn.addEventListener("click", doSearch);
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doSearch();
      }
    });
  }

  const gpsBtn = $("place-gps");
  if (gpsBtn) {
    gpsBtn.addEventListener("click", () => {
      const msg = $("place-panel-msg");
      if (msg) msg.textContent = "Finding you…";
      useMyLocation()
        .then(adoptCustomPlace)
        .catch((err) => {
          if (msg) msg.textContent = (err && err.message) || "Location failed. Search by name instead.";
        });
    });
  }

  /* On open: one automatic live pull if custom is the active place and online. */
  if (state.place === CUSTOM_PLACE_KEY && getCustomPlace()) {
    if (navigator.onLine === false) setLiveStatus("Offline — using saved values");
    else pullLiveWeather({ silent: true });
  } else if (!getCustomPlace()) {
    setLiveStatus("Set your place to pull live weather");
  }
}
