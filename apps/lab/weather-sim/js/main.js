/* main.js — wiring: sliders ↔ state, render loop, reset, keyboard, save */

const sceneEl = $("scene");

/* The Temperature slider is SEA LEVEL air. Your place bends it:
   high air is colder, a deep basin is warmer. ground.js owns that maths. */
const SEA_TEMP_MIN = 20;   // slider low
const SEA_TEMP_MAX = 60;   // slider high

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
  time:     { el: $("time"),     out: $("time-out"),     fmt: formatTime },
};

const placeEl = $("place");

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
  const place = PLACE_BY_KEY[state.place] || PLACES[0];
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
  syncParticles();
  updateGround();
  syncTreeLook();      // frost / fog fade / snow on branches
  layoutTrees();       // wind moves trees, the place hides the ones in the sea
  renderReport();
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

/* place picker → the place decides height; height bends the air you set.
   The place is the boss: there is no state.altitude to set, height is read
   with elevationOf(state.place).

   Picking a place does NOT move the Temperature slider. The air mass you
   set stays; only the height it has to climb changes. (It used to snap to
   the latitude's base air, which hid the lesson: same air, colder up top.) */
function applyPlace(key) {
  if (!PLACE_BY_KEY[key]) key = PLACES[0][0];
  state.place = key;
  applyTemperature(parseFloat(SLIDERS.temperature.el.value));
}

placeEl.addEventListener("change", () => {
  applyPlace(placeEl.value);
  renderAll();
  saveWeather();
});

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
let last = performance.now();

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // clamp big gaps (tab switch)
  last = now;

  tickClouds(dt, now);
  tickParticles(dt);
  drawParticles();
  tickSnowUI(dt);
  tickTrees(dt);

  requestAnimationFrame(loop);
}

/* ---- reset: forget the settings, not just move the sliders ---- */
function doReset() {
  Object.assign(state, DEFAULT_STATE);
  for (const key in SLIDERS) {
    SLIDERS[key].el.value = state[key];
  }
  applyPlace(DEFAULT_STATE.place);
  placeEl.value = state.place;
  resetSnow();     // a clean slate: no old snow, no storm
  clearSave();     // and a reload should bring back *this*, not the old storm
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
const saved = loadSave();

if (saved) {
  /* the place comes first: the saved temperature is sea-level air *for that
     place*, so it must not be read before the place is known */
  if (saved.place) state.place = saved.place;
  for (const key of SAVED_KEYS) {
    if (key === "place") continue;
    if (key in saved) state[key] = saved[key];
  }
  if (typeof saved.snow === "number") snow = saved.snow;
}

/* the sliders are only drawn from state — this is the single point where
   HTML default values are replaced by the remembered ones */
for (const key in SLIDERS) {
  SLIDERS[key].el.value = state[key];
}
placeEl.value = state.place;
applyTemperature(state.temperature); // slider = sea level, state = here

buildClouds();
resizeCanvas();
renderAll();
requestAnimationFrame(loop);
