/* precip.js — canvas rain / snow particles
   WS1: fewer particles when prefers-reduced-motion is on
   WS6: precip is driven ONLY by the Rain slider (mm/h). Cloud darkens the sky
   but never starts rain on its own. Amount = sqrt(rain/8), lightly scaled by cloud.

   Only one thing here knows about the place: the *bottom* of the fall.
   Drops stop at the horizon — the line where the trees stand and where the
   eye meets the far valley. On a summit that line is high up the screen, at a
   basin it is low, and the far valley below it never gets wet: it is drawn
   behind the ground in front of you. */

const canvas = $("weather-canvas");
const ctx = canvas.getContext("2d");

const MAX_PARTICLES = 420;
/* WS1: cut the particle budget when the device asks for less motion */
const REDUCE_MOTION = (typeof matchMedia === "function") &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
const PARTICLE_CAP = REDUCE_MOTION ? Math.round(MAX_PARTICLES * 0.4) : MAX_PARTICLES;
let particles = [];
let canvasW = 0;
let canvasH = 0;
let floorY = 0;   // px from the top of the canvas where drops disappear

/* Word for the Rain slider label / report, from mm/h. */
function rainWord(mm) {
  const r = Number(mm) || 0;
  if (!(r > 0)) return "none";
  if (r <= 0.5) return "drizzle";
  if (r <= 2.5) return "light";
  if (r <= 7.5) return "moderate";
  return "heavy";
}

/* "0 mm/h · none", "2.4 mm/h · light" */
function formatRain(mm) {
  const n = Math.round((Number(mm) || 0) * 10) / 10;
  const text = (Math.abs(n - Math.round(n)) < 1e-9) ? String(Math.round(n)) : n.toFixed(1);
  return text + " mm/h · " + rainWord(n);
}

/* what is falling? WS6: rain == 0 → none; else snow if temp ≤ 0, else rain. */
function precipType() {
  if (!(state.rain > 0)) return "none";
  if (state.temperature <= 0) return "snow";
  return "rain";
}

/* amount 0..1 from mm/h. Curve: min(1, sqrt(rain/8)) so ~2 mm/h ≈ 0.5, 8+ = full.
   Cloud may dim the visual intensity a little, but never creates precip alone. */
function precipAmount() {
  const r = Number(state.rain) || 0;
  if (r <= 0) return 0;
  const base = Math.min(1, Math.sqrt(r / 8));
  const cloudScale = 0.7 + 0.3 * ((Number(state.cloud) || 0) / 100);
  return Math.min(1, base * cloudScale);
}

/* where the fall ends, in px (called on resize and on every render) */
function syncFallFloor() {
  /* fractions are 0 at the bottom of the scene, 1 at the top;
     the canvas is the same size as the scene */
  const line = fallTarget(state.place);
  floorY = canvasH * (1 - line);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvasW = canvas.clientWidth;
  canvasH = canvas.clientHeight;
  canvas.width = Math.round(canvasW * dpr);
  canvas.height = Math.round(canvasH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  syncFallFloor();
}

function spawnParticle(type, anywhere = false) {
  return {
    x: Math.random() * canvasW,
    /* anywhere=false → start above the top, like a drop entering the frame */
    y: anywhere ? Math.random() * floorY : Math.random() * -canvasH,
    type,
    len: type === "rain" ? 10 + Math.random() * 14 : 0,
    size: type === "snow" ? 1.5 + Math.random() * 2.5 : 1.2,
    vy: type === "rain" ? 380 + Math.random() * 260 : 40 + Math.random() * 55,
    wobble: Math.random() * Math.PI * 2,
  };
}

function syncParticles() {
  syncFallFloor();

  const type = precipType();
  const target = type === "none" ? 0 : Math.round(PARTICLE_CAP * precipAmount());

  const currentType = particles.length ? particles[0].type : type;

  if (particles.length && currentType !== type) {
    particles = [];   // rain ↔ snow: rebuild, never mix
  }

  while (particles.length > target) particles.pop();
  while (particles.length < target) particles.push(spawnParticle(type, true));
}

function tickParticles(dt) {
  if (!particles.length) return;

  const drift = windPx() * 0.6;

  particles.forEach((p) => {
    p.y += p.vy * dt;

    if (p.type === "rain") {
      p.x += drift * dt;
    } else {
      p.wobble += dt * 2.4;
      p.x += (drift * 0.4 + Math.sin(p.wobble) * 14) * dt;
    }

    /* landed: back above the sky */
    if (p.y > floorY) {
      p.y = -20 - Math.random() * 60;
      p.x = Math.random() * canvasW;
    }
    if (p.x > canvasW + 20) p.x = -20;
    if (p.x < -20) p.x = canvasW + 20;
  });
}

function drawParticles() {
  ctx.clearRect(0, 0, canvasW, canvasH);
  if (!particles.length) return;

  if (particles[0].type === "rain") {
    ctx.strokeStyle = "rgba(180, 215, 255, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    particles.forEach((p) => {
      const slant = windPx() * 0.05;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - slant * p.len, p.y + p.len);
    });
    ctx.stroke();
  } else {
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    particles.forEach((p) => {
      ctx.moveTo(p.x + p.size, p.y);
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    });
    ctx.fill();
  }
}

window.addEventListener("resize", () => {
  resizeCanvas();
  syncParticles();
});
