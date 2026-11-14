/* main.js — wiring: sliders ↔ state, render loop, reset, keyboard, save
   WS1: pause rAF while the tab is hidden; resume without a big dt jump
   WS2: custom place registration before load; live pull on pick; Reset keeps the place
   WS3: no preset select — one place button; Temperature 0…50; unknown saved keys fall back
   WS5: syncCloudShadowLook on every redraw (patchy shadows + overcast dim)
   WS6: Rain slider (mm/h) after Cloud Cover; Reset clears rain to 0 */

const sceneEl = $("scene");

/* The Temperature slider is SEA LEVEL air. Your place bends it:
   high air is colder, a deep basin is warmer. ground.js owns that maths.
   SEA_TEMP_MIN / SEA_TEMP_MAX live in state.js (shared with save / live). */

const SLIDERS = {
  temperature: {
    el: $("temperature"),
    out: $("temperature-out"),
    mark: $("temperature-mark"),
    fmt: (v) => Math.round(v) + " °C",
    /* stored = sea level °C, shown = local °C (applyTemperature writes it) */
    after: (v) => applyTemperature(v),
    /* the output says both numbers: the air here, and how far it moved */
    show: () => {
      const here = state.temperature;
      const sea = Math.round(parseFloat(SLIDERS.temperature.el.value));
      const diff = here - sea;
      return Math.round(here) + " °C" + (diff ? ` (${diff > 0 ? "+" : "−"}${Math.abs(diff)} local)` : "");
    },
    /* the small print under the label: the slider's own value, in words */
    markText: () => {
      const sea = Math.round(parseFloat(SLIDERS.temperature.el.value));
      const m = elevationOf(state.place);
      if (m > 60 || m < 0) return `sea level ${sea} °C`;
      return "sea level";
    },
  },
  humidity: { el: $("humidity"), out: $("humidity-out"), fmt: (v) => Math.round(v) + " %" },
  wind:     { el: $("wind"),     out: $("wind-out"),     fmt: (v) => Math.round(v) + " km/h" },
  cloud:    { el: $("cloud"),    out: $("cloud-out"),    fmt: (v) => Math.round(v) + " %" },
  rain:     { el: $("rain"),     out: $("rain-out"),     fmt: formatRain },
  time:     { el: $("time"),     out: $("time-out"),     fmt: formatTime },
};

function formatTime(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* push state → UI text */
function syncLabels() {
  for (const key in SLIDERS) {
    const s = SLIDERS[key];
    s.out.textContent = s.show ? s.show() : s.fmt(state[key]);
    if (s.mark) s.mark.textContent = s.markText();
  }

  /* elevation tag: arrow turns over below sea level.
     The height comes from the place (elevationOf), never from state. */
  const tag = $("altitude-tag");
  const place = PLACE_BY_KEY[state.place] || PLACE_BY_KEY[DEFAULT_PLACE_KEY] || PLACES[0];
  const metres = elevationOf(state.place);
  tag.querySelector(".arrow").textContent = metres < 0 ? "▼" : "▲";
  $("altitude-tag-value").textContent = formatAltitude(metres);
  $("altitude-tag-water").textContent = metres < 0
    ? (place[5] || "sea") + " level"
    : isElevated(state.place) ? "above sea level" : "at sea level";
  tag.setAttribute("data-place", state.place);
}

/* full redraw of everything driven by state */
function renderAll() {
  syncLabels();
  updateHorizon();     // ground height + sea (elevation)
  syncPlaceLook();     // altitude tint, crest snow, tree line
  renderSky();
  updateCloudVisibility();
  syncCloudShadowLook(); // WS5: patchy shadows + overcast dim
  syncParticles();
  updateGround();
  syncTreeLook();      // frost / fog fade / snow on branches
  layoutTrees();       // wind moves trees, the place hides the ones in the sea
  renderReport();
  if (typeof refreshPlaceButton === "function") refreshPlaceButton();
}

/* slider input → state → redraw → remember */
for (const key in SLIDERS) {
  const s = SLIDERS[key];
  s.el.addEventListener("input", () => {
    state[key] = parseFloat(s.el.value);
    if (s.after) s.after(state[key]);
    renderAll();
    saveWeather();
  });
}

/* place → height bends the air you set. Unknown / removed keys fall back. */
function applyPlace(key) {
  key = resolvePlaceKey(key);
  state.place = key;
  applyTemperature(parseFloat(SLIDERS.temperature.el.value));
}

/* ---- the snow pile changes the ground, the trees and the report ---- */
function tickSnowUI(dt) {
  const before = snowAmount();
  tickSnow(dt);
  if (Math.abs(snowAmount() - before) <= 0.0015) return;

  updateGround();
  syncTreeLook();    // snow builds up on the branches as the pile grows
  renderReport();    // keeps "x cm snow" and the Snow Day rule live
  saveWeatherSoon(); // ...and the pile survives a reload (max 1 write/sec)
}

/* ---- animation loop ---- */
/* WS1: stop burning battery in a hidden tab. Cap dt so a long pause
   never jumps the snow / trees / rain when the tab comes back. */
let last = performance.now();
let rafId = 0;
let looping = false;

function loop(now) {
  if (!looping) return;
  const dt = Math.min((now - last) / 1000, 0.05); // clamp big gaps (tab switch)
  last = now;

  tickClouds(dt, now);
  tickParticles(dt);
  drawParticles();
  tickSnowUI(dt);
  tickTrees(dt);

  rafId = requestAnimationFrame(loop);
}

function startLoop() {
  if (looping) return;
  looping = true;
  last = performance.now(); // WS1: reset so the first frame after resume has a tiny dt
  rafId = requestAnimationFrame(loop);
}

function stopLoop() {
  looping = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

/* own listener; save.js keeps its own visibilitychange for writing */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopLoop();
  else startLoop();
});

/* ---- reset: forget the weather; keep the saved custom place (WS2/WS3) ---- */
function doReset() {
  Object.assign(state, DEFAULT_STATE);
  /* place is a setting: stay on custom when one is registered */
  state.place = hasCustomPlaceRegistered() ? CUSTOM_PLACE_KEY : DEFAULT_PLACE_KEY;
  for (const key in SLIDERS) {
    SLIDERS[key].el.value = key === "temperature"
      ? Math.min(SEA_TEMP_MAX, Math.max(SEA_TEMP_MIN, state[key]))
      : state[key];
  }
  /* DEFAULT_STATE.temperature is local-ish placeholder; slider holds sea-level.
     Use the default sea-level number (same as DEFAULT_STATE.temperature at elev 0). */
  SLIDERS.temperature.el.value = DEFAULT_STATE.temperature;
  state.temperature = DEFAULT_STATE.temperature;
  applyPlace(state.place);
  resetSnow();     // a clean slate: no old snow, no storm
  clearSave();     // weather snapshot only — custom place stays in its own key
  setLiveStatus("");
  renderAll();
}

$("reset").addEventListener("click", doReset);

/* R key also resets (handy on desktop) */
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" && document.activeElement.type === "range") e.preventDefault();
    doReset();
  }
});

/* ---- init: last session first, defaults only if there was none ---- */
/* WS2: register the custom place BEFORE loadSave validates the place key */
const savedCustom = loadCustomPlace();
if (savedCustom) registerCustomPlace(savedCustom);

const saved = loadSave();

if (saved) {
  /* the place comes first: the saved temperature is sea-level air *for that
     place*, so it must not be read before the place is known */
  if (saved.place) {
    state.place = saved.place;
  } else if (hasCustomPlaceRegistered()) {
    /* WS3: removed preset was dropped by loadSave → prefer custom if set */
    state.place = CUSTOM_PLACE_KEY;
  }
  for (const key of SAVED_KEYS) {
    if (key === "place") continue;
    if (key in saved) state[key] = saved[key];
  }
  if (typeof saved.snow === "number") snow = saved.snow;
}

/* WS3: unknown / removed preset keys → custom (if set) or default */
state.place = resolvePlaceKey(state.place);

/* WS3: clamp sea-level temperature into the new 0…50 range */
if (typeof state.temperature === "number" && isFinite(state.temperature)) {
  state.temperature = Math.min(SEA_TEMP_MAX, Math.max(SEA_TEMP_MIN, state.temperature));
}

/* WS6: clamp rain mm/h into 0…10; missing old saves stay at DEFAULT 0 */
if (typeof state.rain === "number" && isFinite(state.rain)) {
  const lo = typeof RAIN_MIN === "number" ? RAIN_MIN : 0;
  const hi = typeof RAIN_MAX === "number" ? RAIN_MAX : 10;
  state.rain = Math.round(Math.min(hi, Math.max(lo, state.rain)) * 10) / 10;
} else {
  state.rain = 0;
}

/* keep the range attribute in sync with the shared constants */
SLIDERS.temperature.el.min = SEA_TEMP_MIN;
SLIDERS.temperature.el.max = SEA_TEMP_MAX;
if (SLIDERS.rain) {
  SLIDERS.rain.el.min = typeof RAIN_MIN === "number" ? RAIN_MIN : 0;
  SLIDERS.rain.el.max = typeof RAIN_MAX === "number" ? RAIN_MAX : 10;
}

/* the sliders are only drawn from state — this is the single point where
   HTML default values are replaced by the remembered ones */
for (const key in SLIDERS) {
  SLIDERS[key].el.value = state[key];
}
applyTemperature(state.temperature); // slider = sea level, state = here

buildClouds();
resizeCanvas();
renderAll();
startLoop();
initLiveWeather(); // WS2: wire Set place / Live, optional one-shot pull
