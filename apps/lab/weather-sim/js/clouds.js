/* clouds.js — drifting cloud blobs, amount from cloud slider, speed from wind */

const cloudsEl = $("clouds");

const CLOUD_MAX = 14;
const clouds = [];

let lastCloudTime = 0;

function makeCloud() {
  const el = document.createElement("div");
  el.className = "cloud";
  cloudsEl.appendChild(el);

  const cloud = {
    el,
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
    } else if (!shouldShow && c.active) {
      c.active = false;
      c.el.style.opacity = "0";
    }
  });
}

/* animate drift */
function tickClouds(dt, now) {
  const w = cloudsEl.clientWidth || 600;
  const wind = windPx();

  clouds.forEach((c) => {
    if (!c.active) return;
    c.x += wind * c.speed * dt;

    // recycle when fully off the right edge
    if (c.x > w + 20) {
      respawnCloud(c, false);
    }
    c.el.style.transform = `translateX(${c.x}px)`;
  });
}

function buildClouds() {
  for (let i = 0; i < CLOUD_MAX; i++) makeCloud();
  updateCloudVisibility();
}

window.addEventListener("resize", () => {
  // keep clouds sensible after a size change
  clouds.forEach((c) => {
    if (c.x > cloudsEl.clientWidth) respawnCloud(c, false);
  });
});
