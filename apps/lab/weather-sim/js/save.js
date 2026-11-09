/* save.js — remember the sliders after a reload
   WS2: custom place lives in its own key (weather-sim:custom-place). Reset
   clears the weather snapshot but keeps the place — it is a setting, not history.

   One object in localStorage, one line of code to read it back.
   We save exactly what the user can change:
     - the five slider values (temperature is stored as sea level °C)
     - the chosen place (elevation and horizon follow from it)
     - the snow pile, because it is the only value with "memory"
       (rain is gone the next second; a snowdrift lasts for hours)

   NOT saved: particles, clouds, trees, sky. Those are rebuilt every frame
   from state anyway — saving them would store copies of things that are
   already derived.

   Version 2: v1 stored the local temperature by mistake. v2 stores the
   sea-level number, so the same coast city comes back the same every time. */

const SAVE_KEY = "weather-sim:v2";
const OLD_KEYS = ["weather-sim:v1"];

/* which keys belong to the user's settings (not derived, not defaults) */
const SAVED_KEYS = ["place", "temperature", "humidity", "wind", "cloud", "time"];

/* are we allowed to use localStorage at all?
   (file:// pages, private mode and some embeds throw on access) */
function storageOk() {
  try {
    localStorage.setItem(SAVE_KEY + ":test", "1");
    localStorage.removeItem(SAVE_KEY + ":test");
    return true;
  } catch (e) {
    return false;
  }
}

const CAN_SAVE = storageOk();

/* read the snapshot, or null if there is nothing usable */
function loadSave() {
  if (!CAN_SAVE) return null;

  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return null;
  }
  if (!raw) {
    /* one-time upgrade: an old save is still better than nothing */
    for (const old of OLD_KEYS) {
      try {
        raw = localStorage.getItem(old);
      } catch (e) {}
      if (raw) break;
    }
  }
  if (!raw) return null;

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return null; // corrupt or hand-edited: start clean rather than crash
  }
  if (!data || typeof data !== "object") return null;

  /* validate before trusting: a bad place key or a NaN would poison state */
  const out = {};
  for (const key of SAVED_KEYS) {
    const v = data[key];
    if (key === "place") {
      if (typeof v === "string" && PLACE_BY_KEY[v]) out.place = v;
    } else if (typeof v === "number" && isFinite(v)) {
      out[key] = v;
    }
  }
  if (typeof data.snow === "number" && isFinite(data.snow)) {
    out.snow = Math.max(0, Math.min(1, data.snow));
  }
  return Object.keys(out).length ? out : null;
}

/* write the snapshot (cheap: a few dozen bytes) */
function saveWeather() {
  if (!CAN_SAVE) return;
  const data = { snow: Math.round(snowAmount() * 1000) / 1000 };
  for (const key of SAVED_KEYS) data[key] = state[key];
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    for (const old of OLD_KEYS) localStorage.removeItem(old);
  } catch (e) {
    /* quota full or storage blocked — the app keeps working, just forgetful */
  }
}

/* forget everything (used by Reset) */
function clearSave() {
  if (!CAN_SAVE) return;
  try {
    localStorage.removeItem(SAVE_KEY);
    for (const old of OLD_KEYS) localStorage.removeItem(old);
  } catch (e) {}
}

/* save at most this often while snow keeps changing;
   final save happens on tab hide / unload, so nothing is lost at the end */
let lastSaveAt = 0;
function saveWeatherSoon() {
  const now = performance.now();
  if (now - lastSaveAt < 1000) return;
  lastSaveAt = now;
  saveWeather();
}

/* the browser may kill a tab without a clean goodbye, so save on the way out */
window.addEventListener("pagehide", saveWeather);
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveWeather();
});

/* ---- WS2: custom place (separate from the weather snapshot) ----
   Shape: { name, lat, lon, elev, tz }. Reset must NOT clear this. */

const CUSTOM_SAVE_KEY = "weather-sim:custom-place";

function loadCustomPlace() {
  if (!CAN_SAVE) return null;
  let raw = null;
  try {
    raw = localStorage.getItem(CUSTOM_SAVE_KEY);
  } catch (e) {
    return null;
  }
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  if (typeof data.lat !== "number" || typeof data.lon !== "number") return null;
  if (!isFinite(data.lat) || !isFinite(data.lon)) return null;
  return {
    name: typeof data.name === "string" && data.name ? data.name : "My place",
    lat: data.lat,
    lon: data.lon,
    elev: typeof data.elev === "number" && isFinite(data.elev) ? data.elev : 0,
    tz: typeof data.tz === "string" ? data.tz : "",
  };
}

function saveCustomPlace(p) {
  if (!CAN_SAVE || !p) return;
  try {
    localStorage.setItem(CUSTOM_SAVE_KEY, JSON.stringify({
      name: p.name || "My place",
      lat: p.lat,
      lon: p.lon,
      elev: typeof p.elev === "number" && isFinite(p.elev) ? p.elev : 0,
      tz: p.tz || "",
    }));
  } catch (e) {}
}

function getCustomPlace() {
  return loadCustomPlace();
}
