/* ground.js — where you are: a place, its latitude, its elevation, and how high
   the ground is drawn.
   WS2: registerCustomPlace() adds a user-set "custom" row; seaLevelFromLocal()
   is the inverse of temperatureAt() so live local air can drive the sea-level slider.
   WS3: fixed presets removed. Only a built-in "default" (sea-level land) plus the
   user "custom" place remain. Shore/sea drawing code is kept (unused until a
   custom place has elevation < 0).
   WS4: horizon capped at 25% of scene height; --horizon is the shared source of
   truth for the ground crest and the trees' feet.

   Two ideas do all the work.

   1. A PLACE is five numbers: latitude, longitude, elevation, and a name for
      the water beside you. Latitude is the important one — it decides how hot
      the air is before you climb anywhere. `baseTemperatureAt()` can tell you
      that sea-level air, but it never sets the slider behind your back: the
      air mass is *your* choice, and changing height is a separate lesson.

   2. The SCENE is a window on a column of air, drawn in bands:
        - the sky, down to the horizon line (where the trees stand)
        - below the horizon: the far valley (or the sea, in a deep basin)
        - at the bottom: the ground you stand on, with the trees on its crest
      Every place gets its own horizon (capped at 25% in WS4), so the ground
      stays a readable strip. Height is told by the view DOWN, not by the
      ground creeping up the screen. */

/* [key, name, latitude, longitude, elevation (m), name of the water beside you]
   latitude > 0 = north, < 0 = south
   WS3: only the neutral default. Custom is registered at runtime. */
const DEFAULT_PLACE_KEY = "default";
const PLACES = [
  [DEFAULT_PLACE_KEY, "Set your place", 26.18, 91.75, 0, ""],
];

const PLACE_BY_KEY = Object.fromEntries(PLACES.map((p) => [p[0], p]));

const CUSTOM_PLACE_KEY = "custom";

/* resolve an unknown / removed preset key → custom (if set) or default */
function resolvePlaceKey(placeKey) {
  if (placeKey && PLACE_BY_KEY[placeKey]) return placeKey;
  if (PLACE_BY_KEY[CUSTOM_PLACE_KEY]) return CUSTOM_PLACE_KEY;
  return DEFAULT_PLACE_KEY;
}

/* metres of the place (derived from the place — never typed by hand) */
function elevationOf(placeKey) {
  return (PLACE_BY_KEY[placeKey] || PLACE_BY_KEY[DEFAULT_PLACE_KEY] || PLACES[0])[4];
}

/* ---- where the world changes character ---- */
const TREE_LINE_M = 2600;   // above this: no forest, just rock
const SNOW_LINE_M = 1200;   // from here up, the crest can hold snow

/* ---- the base air: how warm it is at sea level, at this latitude ---- */

const SEA_LEVEL_TEMP = 27;   // °C on the equator at sea level
const TEMP_FALLOFF = 0.42;   // °C colder per degree of latitude away from it

/* An idealised, symmetric year: summer north = winter south, and the warm
   belt shifts towards whichever hemisphere is having summer. */
const SEASON_SWING = 0.62;   // 7.4° of shift at the poles, nothing at the equator
const HEMISPHERE = 1;        // +1 = northern summer now, −1 = southern summer

/* the temperature a sea-level air mass would have at this latitude.
   Shown to the reader as the "sea level 24 °C" hint, not applied on its own. */
function baseTemperatureAt(placeKey) {
  const lat = Math.abs((PLACE_BY_KEY[placeKey] || PLACE_BY_KEY[DEFAULT_PLACE_KEY] || PLACES[0])[2]);
  const shift = HEMISPHERE * Math.sin((lat * Math.PI) / 90) * (12 * SEASON_SWING);
  const effective = Math.max(0, lat - shift);
  return SEA_LEVEL_TEMP - effective * TEMP_FALLOFF;
}

/* ---- climbing: air cools as you go up ---- */
const LAPSE = 6.5;      // °C lost per 1000 m up
const BELOW_RATE = 11;  // °C gained per 1000 m down into a deep basin

/* the local temperature of a place, given sea-level air */
function temperatureAt(placeKey, seaLevelTemp) {
  const km = elevationOf(placeKey) / 1000;
  return seaLevelTemp + (km > 0 ? -km * LAPSE : -km * BELOW_RATE);
}

/* write the local temperature into state (report.js reads state.temperature) */
function applyTemperature(seaLevelTemp) {
  state.temperature = Math.round(temperatureAt(state.place, seaLevelTemp));
}

/* realistic-looking pressure for the elevation.
   A barometer at 3,100 m really does read about 690 hPa. */
function pressureAt(placeKey) {
  const metres = elevationOf(placeKey);
  if (metres >= 0) {
    /* hypsometric approximation: good enough for a number to read */
    return Math.round(1013.25 * Math.pow(1 - (0.0065 * metres) / 288.15, 5.255));
  }
  /* down in a basin the air is denser than the sea beside it */
  return Math.round(1013 + (-metres / 100) * 12.4);
}

/* =========================================================
   LAYOUT: where the two lines are drawn
   =========================================================

   Two numbers, both fractions of the scene height, 0 = bottom, 1 = top:

     horizon  the line where the trees stand. The sky ends here.
     sea      where the water surface is, if there is water. 0 = no water.

   They never share a formula. The ground does not move because of the sea,
   and the sea does not move because of the ground. Each place gets its own
   pair, so the ground stays the same readable size at the top of a mountain
   and at the coast. */

const HORIZON_COAST = 0.16;   // low coast: lots of sky
const HORIZON_HIGH = 0.25;    // WS4 hard cap: ground never more than 25% tall
const HORIZON_MAX_M = 3600;   // metres that reach HORIZON_HIGH
const SEA_SURFACE = 0.08;     // in a basin the water is just below your feet

/* where the trees stand, and where the ground's crest is drawn.
   Purely a function of height — the sea is not part of this sum.
   Always ≤ HORIZON_HIGH (0.25), so the ground never eats the sky. */
function horizonLine(placeKey) {
  const metres = Math.max(0, elevationOf(placeKey));
  const climb = Math.min(1, metres / HORIZON_MAX_M);
  return HORIZON_COAST + climb * (HORIZON_HIGH - HORIZON_COAST);
}

/* the water surface: only where you are below sea level.
   Between the shore and your feet, so you look DOWN at the water.
   WS3: unused for the default inland place; still used if a custom place
   has elevation < 0. */
function seaLine(placeKey) {
  return elevationOf(placeKey) < 0 ? SEA_SURFACE : 0;
}

/* a place high enough to look down on the world */
function isElevated(placeKey) {
  return elevationOf(placeKey) > 60;
}

/* where falling drops stop: the horizon the eye sees.
   Rain lands on the ground in front of you, never on the far valley. */
function fallTarget(placeKey) {
  return horizonLine(placeKey);
}

/* ---- scene hooks ---- */

/* called from renderAll: place the horizon and the water */
function updateHorizon() {
  const horizon = horizonLine(state.place);
  const sea = seaLine(state.place);

  sceneEl.style.setProperty("--horizon", horizon.toFixed(3));
  sceneEl.style.setProperty("--sea-level", sea.toFixed(3));
  /* the valley band runs from the water up to your feet; the trees keep
     clear of the shore part so none of them stands in the water */
  sceneEl.style.setProperty("--water-span", sea > 0 ? sea : 0);
  sceneEl.classList.toggle("has-water", sea > 0);
  sceneEl.classList.toggle("is-elevated", isElevated(state.place));
  sceneEl.dataset.place = state.place;
}

/* ---- WS2/WS3: custom (user-set) place ----
   One extra row, key "custom". Water name is "" so an inland town stays land
   (seaLine only draws water when elevation < 0). Elevation comes from the
   geocoder or from the forecast response. */

/* inverse of temperatureAt: local air + height → the sea-level slider value */
function seaLevelFromLocal(localTemp, elevM) {
  const km = (typeof elevM === "number" && isFinite(elevM) ? elevM : 0) / 1000;
  if (km > 0) return localTemp + km * LAPSE;
  if (km < 0) return localTemp + km * BELOW_RATE;
  return localTemp;
}

/* put / refresh the custom row so elevationOf / temperatureAt / look all work */
function registerCustomPlace(p) {
  if (!p || typeof p.lat !== "number" || typeof p.lon !== "number") return;
  const elev = typeof p.elev === "number" && isFinite(p.elev) ? p.elev : 0;
  const name = (p.name && String(p.name)) || "My place";
  const row = [CUSTOM_PLACE_KEY, name, p.lat, p.lon, elev, ""];
  const idx = PLACES.findIndex((r) => r[0] === CUSTOM_PLACE_KEY);
  if (idx >= 0) PLACES[idx] = row;
  else PLACES.push(row);
  PLACE_BY_KEY[CUSTOM_PLACE_KEY] = row;
}

function hasCustomPlaceRegistered() {
  return !!PLACE_BY_KEY[CUSTOM_PLACE_KEY];
}
