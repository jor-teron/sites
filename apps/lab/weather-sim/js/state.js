/* state.js — single source of truth for slider values + helpers
   WS3: default place is "default" (neutral sea-level); Temperature slider is 0…50 °C.

   Nothing in here knows about CSS or the DOM except the one element
   lookup every other file uses ($).

   Note what is NOT here: elevation. Your height above the sea is a property
   of the place, so it lives with the places (js/ground.js) and is read with
   elevationOf(state.place). Nothing should ever store a second copy. */

/* Temperature slider range (sea-level air). Shared by main / save / live. */
const SEA_TEMP_MIN = 0;
const SEA_TEMP_MAX = 50;

const DEFAULT_STATE = {
  place: "default", // key into PLACES (js/ground.js) — neutral until user sets one
  temperature: 20,  // °C AT YOUR PLACE — ground.js derives it from the slider
                    // (the slider itself holds sea-level air)
  humidity: 50,     // %
  wind: 10,         // km/h — the same number wind speed and wind chill use
  cloud: 40,        // %
  time: 12,         // hours, 0–24
};

const state = { ...DEFAULT_STATE };

const $ = (id) => document.getElementById(id);

/* is it night? (after sunset / before sunrise) */
function isNight() {
  return state.time < 6 || state.time >= 19;
}

/* wind in px/s for animations (scaled so the scene does not crawl).
   This is a drawing decision, not a unit change: state.wind stays km/h. */
function windPx() {
  return state.wind * 0.8;
}

/* how cloudy it feels, 0..1 */
function cloudAmount() {
  return state.cloud / 100;
}

/* short name of wind strength, in km/h */
function windName() {
  const w = state.wind;
  if (w < 5) return "Calm";
  if (w < 20) return "Light breeze";
  if (w < 40) return "Breezy";
  if (w < 65) return "Windy";
  if (w < 85) return "Strong wind";
  return "Gale";
}

/* meters, signed: 3100 → "+3,100 m", -430 → "−430 m" */
function formatAltitude(m) {
  const n = Math.round(m);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + Math.abs(n).toLocaleString("en-US") + " m";
}
