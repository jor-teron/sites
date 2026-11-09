/* clouds.js — drifting cloud blobs + ground shadows (WS5)
   Amount from cloud slider, speed from wind. Shadows mirror each cloud's x
   on the ground strip: soft radial ellipses, no per-frame filter:blur. */

const cloudsEl = $("clouds");
const cloudShadowsEl = $("cloud-shadows");

const CLOUD_MAX = 14;
const clouds = [];

let lastCloudTime = 0;
let reduceMotion = false;
try {
  reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => {
    reduceMotion = e.matches;
  });
} catch (_) { /* old browsers */ }

function makeCloud() {
  const el = document.createElement("div");
  el.className = "cloud";
  cloudsEl.appendChild(el);

  /* WS5: one soft shadow ellipse on the ground per cloud */
  const shadow = document.createElement("div");
  shadow.className = "cloud-shadow";
  if (cloudShadowsEl) cloudShadowsEl.appendChild(shadow);

  const cloud = {
    el,
    shadow,
    x: 0,          // px
    y: 0,          // % of scene height
    w: 0,          // px
    h: 0,
    speed: 0,      // px/s (own variance)
    active: false,
  };
  respawnCloud(cloud, true);
  clouds.push(cloud);
}

function respawnCloud(cloud, anywhere) {
  const sceneW = cloudsEl.clientWidth || 600;
  const sceneH = cloudsEl.clientHeight || 400;
  cloud.w = 90 + Math.random() * 140;
  cloud.h = cloud.w * (0.34 + Math.random() * 0.16);
  cloud.y = 4 + Math.random() * 42;              // % from top
  cloud.speed = 0.6 + Math.random() * 0.8;       // multiplier
  cloud.x = anywhere
    ? Math.random() * sceneW
    : -cloud.w - 20 - Math.random() * sceneW * 0.5;

  cloud.el.style.width = cloud.w + "px";
  cloud.el.style.height = cloud.h + "px";
  cloud.el.style.top = cloud.y + "%";
  cloud.el.style.transform = `translateX(${cloud.x}px)`;
  cloud.el.style.filter = `blur(${(cloud.w / 90).toFixed(1)}px)`;

  /* shadow is wider/flatter than the cloud, sits on the ground strip */
  if (cloud.shadow) {
    const sw = cloud.w * 1.15;
    cloud.shadow.style.width = sw.toFixed(0) + "px";
    cloud.shadow.style.height = Math.max(18, cloud.h * 0.55).toFixed(0) + "px";
    /* centre the shadow under the cloud's centre */
    cloud.shadow.style.transform = `translateX(${(cloud.x + cloud.w * 0.5 - sw * 0.5).toFixed(1)}px)`;
    cloud.shadow.style.opacity = cloud.active ? "1" : "0";
  }
}

/* decide how many clouds should be visible */
function updateCloudVisibility() {
  const visible = Math.round(cloudAmount() * CLOUD_MAX);
  clouds.forEach((c, i) => {
    const shouldShow = i < visible;
    if (shouldShow && !c.active) {
      c.active = true;
      if (c.x < 0) respawnCloud(c, true);
      else if (c.x - c.w > (cloudsEl.clientWidth || 600)) respawnCloud(c, false);
      c.el.style.opacity = (0.55 + Math.random() * 0.35).toFixed(2);
      if (c.shadow) c.shadow.style.opacity = "1";
    } else if (!shouldShow && c.active) {
      c.active = false;
      c.el.style.opacity = "0";
      if (c.shadow) c.shadow.style.opacity = "0";
    }
  });
}

/* animate drift */
function tickClouds(dt, now) {
  const w = cloudsEl.clientWidth || 600;
  const wind = windPx();
  /* WS5: under reduce-motion, shadows stay put (clouds may still crawl) */
  const moveShadows = !reduceMotion;

  clouds.forEach((c) => {
    if (!c.active) return;
    c.x += wind * c.speed * dt;

    // recycle when fully off the right edge
    if (c.x > w + 20) {
      respawnCloud(c, false);
    }
    c.el.style.transform = `translateX(${c.x}px)`;

    if (moveShadows && c.shadow) {
      const sw = parseFloat(c.shadow.style.width) || c.w;
      c.shadow.style.transform =
        `translateX(${(c.x + c.w * 0.5 - sw * 0.5).toFixed(1)}px)`;
    }
  });
}

/* WS5: patchy shadow strength + uniform overcast dim
   - 0 cover → no shadows
   - mid cover → patchy shadows peak
   - full overcast → patches fade; whole ground goes a bit dimmer
   - night / fog → fade both */
function syncCloudShadowLook() {
  if (!cloudShadowsEl || !groundEl) return;

  const cover = cloudAmount();
  const nightFade = isNight() ? 0.12 : 1;
  const fogFade = 1 - fogLevel() * 0.85;

  /* patchy: ramp up to ~0.65 cover, then fall off toward full overcast */
  let patchy = 0;
  if (cover <= 0.02) patchy = 0;
  else if (cover < 0.65) patchy = cover / 0.65;
  else patchy = Math.max(0, 1 - (cover - 0.65) / 0.35);

  /* uniform dim when heavily overcast (replaces the patches) */
  let dim = 0;
  if (cover > 0.72) dim = ((cover - 0.72) / 0.28) * 0.22;

  const patchyFinal = patchy * nightFade * fogFade * 0.85;
  const dimFinal = dim * nightFade * fogFade;

  cloudShadowsEl.style.opacity = patchyFinal.toFixed(3);
  groundEl.style.setProperty("--ground-dim", dimFinal.toFixed(3));
}

function buildClouds() {
  for (let i = 0; i < CLOUD_MAX; i++) makeCloud();
  updateCloudVisibility();
  syncCloudShadowLook();
}

window.addEventListener("resize", () => {
  // keep clouds sensible after a size change
  clouds.forEach((c) => {
    if (c.x > cloudsEl.clientWidth) respawnCloud(c, false);
  });
});
