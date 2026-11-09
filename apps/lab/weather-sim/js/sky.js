/* sky.js — sky gradient, sun/moon path, stars, fog, label */

const skyEl = $("sky");
const sunEl = $("sun");
const moonEl = $("moon");
const starsEl = $("stars");
const fogEl = $("fog");
const sceneLabelEl = $("scene-label");

/* colour stops: [hour, top, bottom] as #rrggbb */
const SKY_STOPS = [
  [0,  "#0b1030", "#1b2450"],   // deep night
  [5,  "#141a3d", "#33406e"],   // late night
  [6,  "#3b4a7a", "#e08a6b"],   // sunrise
  [8,  "#6fb3e0", "#cfe6f5"],   // morning
  [12, "#5aa8e0", "#b8dcf2"],   // midday
  [17, "#71a9d6", "#c6dfef"],   // afternoon
  [19, "#5a4a7a", "#e8895f"],   // sunset
  [21, "#1d2148", "#3a3f6b"],   // dusk
  [24, "#0b1030", "#1b2450"],   // back to night
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* mix two rgb arrays → rgb array */
function mixRgb(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgbToCss(rgb) {
  return `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`;
}

/* build the background gradient for the current hour */
function skyGradient(hour) {
  let i = 0;
  while (i < SKY_STOPS.length - 2 && hour > SKY_STOPS[i + 1][0]) i++;
  const [h1, t1, b1] = SKY_STOPS[i];
  const [h2, t2, b2] = SKY_STOPS[i + 1];
  const p = (hour - h1) / (h2 - h1);

  let top = mixRgb(hexToRgb(t1), hexToRgb(t2), p);
  let bottom = mixRgb(hexToRgb(b1), hexToRgb(b2), p);

  // clouds wash the sky toward a flat grey
  const grey = hexToRgb(isNight() ? "#2a2f3d" : "#a9b1bd");
  const g = cloudAmount() * 0.55;
  top = mixRgb(top, grey, g);
  bottom = mixRgb(bottom, grey, g);

  return { top: rgbToCss(top), bottom: rgbToCss(bottom) };
}

/* sun path: rises 6:00, sets 19:00 */
function sunPosition(hour) {
  const p = (hour - 6) / 13; // 0..1
  const x = 8 + p * 84;      // % across
  const y = 78 - Math.sin(Math.max(0, Math.min(1, p)) * Math.PI) * 62;
  return { x, y, visible: p >= 0 && p <= 1 };
}

/* moon path: rises 19:00, sets 6:00 */
function moonPosition(hour) {
  const h = hour < 7 ? hour + 24 : hour;
  const p = (h - 19) / 11;   // 0..1
  const x = 8 + p * 84;
  const y = 78 - Math.sin(Math.max(0, Math.min(1, p)) * Math.PI) * 62;
  return { x, y, visible: p >= 0 && p <= 1 };
}

/* stars: created once, randomised positions */
function buildStars(count = 70) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.style.left = Math.random() * 100 + "%";
    s.style.top = Math.random() * 65 + "%";
    s.style.opacity = (0.35 + Math.random() * 0.65).toFixed(2);
    frag.appendChild(s);
  }
  starsEl.appendChild(frag);
}

function renderSky() {
  const { top, bottom } = skyGradient(state.time);
  skyEl.style.background = `linear-gradient(${top}, ${bottom})`;

  const clouds = cloudAmount();

  // sun
  const sun = sunPosition(state.time);
  sunEl.style.left = `calc(${sun.x}% - 35px)`;
  sunEl.style.top = `calc(${sun.y}% - 35px)`;
  sunEl.style.opacity = sun.visible ? String(1 - clouds * 0.85) : "0";

  // moon
  const moon = moonPosition(state.time);
  moonEl.style.left = `calc(${moon.x}% - 35px)`;
  moonEl.style.top = `calc(${moon.y}% - 35px)`;
  moonEl.style.opacity = moon.visible ? String(1 - clouds * 0.8) : "0";

  // stars: only at night, hidden by cloud
  const starOpacity = isNight() ? Math.max(0, 1 - clouds * 1.2) : 0;
  starsEl.style.opacity = starOpacity.toFixed(2);

  // fog: a milky layer that hides the sun and the far sky
  fogEl.style.opacity = fogLevel().toFixed(2);

  // label
  const h = Math.floor(state.time) % 24;
  let part = "Night";
  if (h >= 6 && h < 12) part = "Morning";
  else if (h >= 12 && h < 17) part = "Afternoon";
  else if (h >= 17 && h < 19) part = "Evening";
  if (state.time >= 5 && state.time < 7) part = "Sunrise";
  if (state.time >= 18 && state.time < 20) part = "Sunset";
  sceneLabelEl.textContent = part;
}

buildStars();
