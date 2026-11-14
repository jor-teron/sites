/* clock.js — WS7: draggable 12-hour analog clock in the scene
   Pure maths first (tests/ws7.test.cjs slices this block). The DOM
   wiring at the bottom is skipped in Node. Hands follow state.time;
   dragging writes the same state.time the Time of Day slider uses. */

/* ---- pure clock maths ---- */

/* Snap a hours-float onto the 1-minute grid and wrap into [0, 24). */
function wrapTime(t) {
  if (!isFinite(t)) return 0;
  const minutes = Math.round(t * 60);
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return wrapped / 60;
}

function timeToParts(time) {
  const t = wrapTime(time);
  const total = Math.round(t * 60);
  return { hours: Math.floor(total / 60), minutes: total % 60, total: total };
}

function normalizeAngle(deg) {
  deg = deg % 360;
  if (deg < 0) deg += 360;
  return deg;
}

function angularDistance(a, b) {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(d, 360 - d);
}

/* 0° at 12 o'clock, clockwise. 6° per minute, snapped to 1 minute. */
function angleToMinutes(angle) {
  let m = Math.round(normalizeAngle(angle) / 6);
  if (m === 60) m = 0;
  return m;
}

function minutesToAngle(m) {
  return normalizeAngle(((m % 60) + 60) % 60 * 6);
}

function timeToMinuteAngle(time) {
  return minutesToAngle(timeToParts(time).minutes);
}

/* Hour hand: 30° per hour + 0.5° per minute, 12-hour face. */
function timeToHourAngle(time) {
  const p = timeToParts(time);
  return normalizeAngle((p.hours % 12) * 30 + p.minutes * 0.5);
}

/* Minutes from 12:00 within the current 12-hour half (0…719). */
function timeToHalfMinutes(time) {
  return timeToParts(time).total % 720;
}

function angleToHalfMinutes(angle) {
  let m = Math.round(normalizeAngle(angle) / 0.5);
  m = ((m % 720) + 720) % 720;
  return m;
}

/* Minute hand: set minutes (1-min snap). Crossing 12 clockwise adds an
   hour; crossing it anticlockwise subtracts one. 24 wraps to 0.
   Pass allowWrap=false on pointerdown so a first click far from 12
   only sets the minutes inside the current hour. */
function applyMinuteDrag(prevTime, newMinuteAngle, allowWrap) {
  const prev = timeToParts(prevTime);
  const newMin = angleToMinutes(newMinuteAngle);
  let hour = prev.hours;
  if (allowWrap !== false) {
    const d = newMin - prev.minutes;
    if (d > 30) hour -= 1;       // jumped back across 12
    else if (d < -30) hour += 1; // jumped forward across 12
  }
  hour = ((hour % 24) + 24) % 24;
  return wrapTime(hour + newMin / 60);
}

/* Hour hand: set the time within the current AM/PM half from the hand
   angle (minutes come along, 0.5° each). Crossing 12 flips AM ↔ PM.
   11 PM → 12 AM wraps to 0. Pass allowWrap=false on pointerdown. */
function applyHourDrag(prevTime, newHourAngle, allowWrap) {
  const prevHalf = timeToHalfMinutes(prevTime);
  const newHalf = angleToHalfMinutes(newHourAngle);
  const raw = newHalf - prevHalf;
  const crossedFwd = raw < -360;
  const crossedBack = raw > 360;
  const prevHour = timeToParts(prevTime).hours;
  let period = prevHour >= 12 ? 12 : 0;
  if (allowWrap !== false && (crossedFwd || crossedBack)) {
    period = period === 0 ? 12 : 0;
  }
  return wrapTime(period + newHalf / 60);
}

/* ☀️ 6:00–18:59, 🌙 otherwise. Period follows the 12-hour clock. */
function clockPeriodLabel(time) {
  const t = wrapTime(time);
  const p = timeToParts(t);
  const icon = (t >= 6 && t < 19) ? "☀️" : "🌙";
  const period = p.hours >= 12 ? "PM" : "AM";
  return icon + " " + period;
}

/* aria-valuetext, e.g. "7:30 PM". */
function formatClockAria(time) {
  const p = timeToParts(time);
  let h12 = p.hours % 12;
  if (h12 === 0) h12 = 12;
  const period = p.hours >= 12 ? "PM" : "AM";
  return h12 + ":" + String(p.minutes).padStart(2, "0") + " " + period;
}

const CLOCK_CLOSE_DEG = 20;
const CLOCK_OUTER = 0.55; // outer ~45% of the radius

function pickHand(pointerAngle, pointerR, radius, hourAngle, minuteAngle) {
  const hourDist = angularDistance(pointerAngle, hourAngle);
  const minuteDist = angularDistance(pointerAngle, minuteAngle);
  const outer = radius > 0 && (pointerR / radius) >= CLOCK_OUTER;
  const close = angularDistance(hourAngle, minuteAngle) <= CLOCK_CLOSE_DEG;
  if (outer && close) return "minute";
  return minuteDist <= hourDist ? "minute" : "hour";
}

/* ---- /pure clock maths ---- */

/* ---- DOM wiring (browser only) ---- */
function clockPointerPolar(e, el) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  /* atan2(dx, -dy): 0° at 12 o'clock, clockwise (screen Y is down). */
  return {
    angle: normalizeAngle(Math.atan2(dx, -dy) * 180 / Math.PI),
    r: Math.hypot(dx, dy),
    radius: rect.width / 2,
  };
}

function buildClockSvg() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const face = document.createElementNS(NS, "circle");
  face.setAttribute("class", "face");
  face.setAttribute("cx", "50");
  face.setAttribute("cy", "50");
  face.setAttribute("r", "48");
  svg.appendChild(face);

  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const inner = (i % 3 === 0) ? 38 : 41;
    const tick = document.createElementNS(NS, "line");
    tick.setAttribute("class", i % 3 === 0 ? "tick major" : "tick");
    tick.setAttribute("x1", String(50 + Math.sin(a) * inner));
    tick.setAttribute("y1", String(50 - Math.cos(a) * inner));
    tick.setAttribute("x2", String(50 + Math.sin(a) * 46));
    tick.setAttribute("y2", String(50 - Math.cos(a) * 46));
    svg.appendChild(tick);
  }

  const hour = document.createElementNS(NS, "line");
  hour.setAttribute("class", "hand hour");
  hour.setAttribute("x1", "50");
  hour.setAttribute("y1", "54");
  hour.setAttribute("x2", "50");
  hour.setAttribute("y2", "26");
  hour.setAttribute("id", "sim-clock-hour");
  svg.appendChild(hour);

  const minute = document.createElementNS(NS, "line");
  minute.setAttribute("class", "hand minute");
  minute.setAttribute("x1", "50");
  minute.setAttribute("y1", "56");
  minute.setAttribute("x2", "50");
  minute.setAttribute("y2", "16");
  minute.setAttribute("id", "sim-clock-minute");
  svg.appendChild(minute);

  const hub = document.createElementNS(NS, "circle");
  hub.setAttribute("class", "hub");
  hub.setAttribute("cx", "50");
  hub.setAttribute("cy", "50");
  hub.setAttribute("r", "3.2");
  svg.appendChild(hub);

  return svg;
}

let clockLastDrawn = null;
let clockDragHand = null;

function updateClock() {
  const el = typeof $ === "function" ? $("sim-clock") : null;
  if (!el) return;
  const t = wrapTime(state.time);
  const key = Math.round(t * 60);
  if (clockLastDrawn === key) return;
  clockLastDrawn = key;

  const hourAng = timeToHourAngle(t);
  const minAng = timeToMinuteAngle(t);
  const hourEl = $("sim-clock-hour");
  const minEl = $("sim-clock-minute");
  if (hourEl) hourEl.setAttribute("transform", "rotate(" + hourAng + " 50 50)");
  if (minEl) minEl.setAttribute("transform", "rotate(" + minAng + " 50 50)");

  const label = el.querySelector(".sim-clock-period");
  if (label) label.textContent = clockPeriodLabel(t);

  const aria = formatClockAria(t);
  el.setAttribute("aria-valuetext", aria);
  el.setAttribute("aria-valuenow", String(Math.round(t * 100) / 100));
}

function setTimeFromClock(next) {
  const t = wrapTime(next);
  if (Math.round(wrapTime(state.time) * 60) === Math.round(t * 60)) return;
  state.time = t;
  if (typeof SLIDERS !== "undefined" && SLIDERS.time && SLIDERS.time.el) {
    SLIDERS.time.el.value = t;
  }
  clockLastDrawn = null; /* force the hands to catch this write */
  if (typeof renderAll === "function") renderAll();
  if (typeof saveWeather === "function") saveWeather();
}

function initClock() {
  const el = typeof $ === "function" ? $("sim-clock") : null;
  if (!el) return;

  if (!el.querySelector("svg")) {
    el.appendChild(buildClockSvg());
    const period = document.createElement("span");
    period.className = "sim-clock-period";
    period.setAttribute("aria-hidden", "true");
    el.appendChild(period);
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    el.focus();
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    el.classList.add("is-dragging");
    const polar = clockPointerPolar(e, el);
    clockDragHand = pickHand(
      polar.angle,
      polar.r,
      polar.radius,
      timeToHourAngle(state.time),
      timeToMinuteAngle(state.time)
    );
    const next = clockDragHand === "minute"
      ? applyMinuteDrag(state.time, polar.angle, false)
      : applyHourDrag(state.time, polar.angle, false);
    setTimeFromClock(next);
  });

  el.addEventListener("pointermove", (e) => {
    if (clockDragHand == null) return;
    if (el.hasPointerCapture && !el.hasPointerCapture(e.pointerId)) return;
    const polar = clockPointerPolar(e, el);
    const next = clockDragHand === "minute"
      ? applyMinuteDrag(state.time, polar.angle, false)
      : applyHourDrag(state.time, polar.angle, false);
    setTimeFromClock(next);
  });

  function endDrag(e) {
    if (el.hasPointerCapture && e && e.pointerId != null) {
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    el.classList.remove("is-dragging");
    clockDragHand = null;
  }
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);

  el.addEventListener("keydown", (e) => {
    let delta = 0;
    if (e.key === "ArrowLeft") delta = -5 / 60;
    else if (e.key === "ArrowRight") delta = 5 / 60;
    else if (e.key === "ArrowUp") delta = 1;
    else if (e.key === "ArrowDown") delta = -1;
    else return;
    e.preventDefault();
    setTimeFromClock(state.time + delta);
  });
}

if (typeof document !== "undefined") {
  initClock();
}
