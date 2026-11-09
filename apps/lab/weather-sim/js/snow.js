/* snow.js — snow piles up on the ground, then slowly melts */

const snowLayerEl = $("snow-layer");
const groundEl = document.querySelector(".ground");

const SNOW_ACC_RATE = 0.035;   // snow gained per second at full snowfall
const SNOW_MELT_RATE = 0.010;  // snow lost per second per °C above freezing
const SNOW_MAX = 0.85;         // how high the pile can get
const SNOW_CM_PER_UNIT = 20;   // 1.0 snow unit ≈ 20 cm

let snow = 0;                  // 0 = bare grass, SNOW_MAX = deepest snow

function snowAmount() {
  return snow;
}

/* back to bare grass (used by Reset) */
function resetSnow() {
  snow = 0;
}

/* called every frame: add snow while falling, melt when warm */
function tickSnow(dt) {
  const type = precipType();
  if (type === "snow") {
    snow += SNOW_ACC_RATE * precipAmount() * dt;
  } else if (state.temperature > 0) {
    // warmer = faster melt; that is why snow vanishes on a mild day
    snow -= SNOW_MELT_RATE * state.temperature * dt;
  }
  snow = Math.max(0, Math.min(SNOW_MAX, snow));
}

/* is the ground actually covered? */
function isSnowCovered() {
  return snow > 0.05;
}

/* push snow + temperature into the scene's ground.
   The ground is the box your feet stand on, so we use its own height —
   that number changes with the place now, but the maths does not care. */
function updateGround() {
  if (!snowLayerEl) return;

  // only the top 82% of the ground can be covered (a little grass always shows)
  const maxH = groundEl.clientHeight * 0.82;
  snowLayerEl.style.height = (snow / SNOW_MAX * maxH).toFixed(1) + "px";

  // frost the grass as it gets colder: green → grey-green
  const t = state.temperature;
  const k = t >= 15 ? 0 : Math.min(1, (15 - t) / 20); // 0 warm … 1 very cold
  const top = mixRgb([63, 143, 74], [186, 196, 196], k * 0.8);
  const bottom = mixRgb([36, 92, 46], [130, 140, 142], k * 0.8);
  groundEl.style.background = `linear-gradient(${rgbToCss(top)}, ${rgbToCss(bottom)})`;
}

window.addEventListener("resize", updateGround);
