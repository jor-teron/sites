/* ============================================================
   WebDesk — webdesk.js
   Date: 2026-09-20
   Role: PIN lock, CSV icons/apps, Start menu, theme, wallpaper
   Related: webdesk.html, webdesk.css, desktop_icons.csv,
            apps.csv, wallpaper.csv, hash.txt
   ============================================================ */

/* Session: PIN length and 60-minute localStorage timeout */
const PIN_LEN = 4;
const SESSION_MS = 60 * 60 * 1000;
const AUTH_KEY = "webdesk_auth";
const AUTH_TS = "webdesk_ts";

/* SHA-1 hex; first 10 chars compared to hash.txt */
function sha1(str) {
  function rotl(n, s) { return (n << s) | (n >>> (32 - s)); }
  const bytes = unescape(encodeURIComponent(str));
  const words = [];
  for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes.charCodeAt(i) << (24 - (i % 4) * 8);
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  words[(((bytes.length + 8) >> 6) + 1) * 16 - 1] = bytes.length * 8;
  let h0 = 1732584193, h1 = -271733879, h2 = -1732584194, h3 = 271733878, h4 = -1009589776;
  for (let i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      const s = Math.floor(t / 20);
      const f = [ (b & c) | (~b & d), b ^ c ^ d, (b & c) | (b & d) | (c & d), b ^ c ^ d ][s];
      const k = [1518500249, 1859775393, -1894007588, -899497514][s];
      const temp = (rotl(a, 5) + f + e + k + (w[t] >>> 0)) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map(x => x.toString(16).padStart(8, "0")).join("");
}

/* Parse GROUP,NAME,URL,ICON rows (skip header) */
function parseCsv(text) {
  return text.trim().split(/\r?\n/).slice(1).map(line => {
    const [group, name, url, icon] = line.split(",").map(s => (s || "").trim());
    return { group, name, url, icon };
  });
}

/* Custom ICON or Google s2 favicon from the URL host */
function favicon(url, icon) {
  if (icon) return icon;
  if (!url) return "https://www.google.com/s2/favicons?domain=example.com&sz=64";
  try { return "https://www.google.com/s2/favicons?domain=" + new URL(url, location.href).hostname + "&sz=128"; }
  catch { return "https://www.google.com/s2/favicons?domain=example.com&sz=64"; }
}

/* True if unlock flag exists and session not expired */
function isAuthed() {
  const ok = localStorage.getItem(AUTH_KEY);
  const ts = parseInt(localStorage.getItem(AUTH_TS) || "0", 10);
  return ok === "1" && Date.now() < ts + SESSION_MS;
}

/* Clear session and show PIN overlay */
function lock() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_TS);
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("pin").value = "";
  document.getElementById("pin").focus();
}

/* Store session timestamp and hide overlay */
function unlock() {
  localStorage.setItem(AUTH_KEY, "1");
  localStorage.setItem(AUTH_TS, String(Date.now()));
  document.getElementById("overlay").classList.add("hidden");
}

/* Hash typed PIN and compare to hash.txt */
async function checkPin() {
  const pin = document.getElementById("pin").value;
  const err = document.getElementById("pin-error");
  const expected = (await fetch("hash.txt").then(r => r.text())).trim();
  if (sha1(pin).slice(0, 10) === expected) {
    err.hidden = true;
    unlock();
  } else {
    err.hidden = false;
    document.getElementById("pin").value = "";
    document.getElementById("pin").focus();
  }
}

/* Close Start and open the link in a new tab */
function openApp(name, url) {
  if (!url) return;
  document.getElementById("start-menu").hidden = true;
  window.open(url, "_blank");
}

/* Build a desktop or taskbar icon from a CSV row */
function makeIcon(item, withLabel) {
  const a = document.createElement("a");
  a.className = withLabel ? "icon" : "";
  a.href = item.url || "#";
  a.title = item.name;
  const img = document.createElement("img");
  img.src = favicon(item.url, item.icon);
  img.alt = "";
  a.appendChild(img);
  if (withLabel) {
    const s = document.createElement("span");
    s.textContent = item.name;
    a.appendChild(s);
  }
  a.addEventListener("click", e => {
    e.preventDefault();
    if (item.url) openApp(item.name, item.url);
  });
  return a;
}

/* Draw Desktop group (skip Dustbin) and Taskbar pins */
function renderDesktop(rows) {
  const box = document.getElementById("desktop-icons");
  box.innerHTML = "";
  rows.filter(r => r.group === "Desktop" && r.name && r.name !== "Dustbin").forEach(r => box.appendChild(makeIcon(r, true)));
  const tb = document.getElementById("taskbar-icons");
  tb.innerHTML = "";
  rows.filter(r => r.group === "Taskbar" && r.name).forEach(r => tb.appendChild(makeIcon(r, false)));
}

/* Set body background from wallpaper.csv and save choice */
function applyWallpaper(type, value) {
  if (type === "image" && value) {
    document.body.style.backgroundImage = "url('" + value.replace(/'/g, "") + "')";
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
  } else {
    document.body.style.backgroundImage = "none";
    if (value) document.body.style.backgroundColor = value;
  }
  localStorage.setItem("webdesk_wall", JSON.stringify({ type, value }));
}

/* Start → Wallpaper list: CSS swatch + name (no <img>) */
function renderWallpapers(list) {
  const box = document.getElementById("start-apps");
  box.innerHTML = "";
  list.forEach((w, i) => {
    const row = document.createElement("div");
    row.className = "wall-item";
    const sw = document.createElement("div");
    sw.className = "wall-swatch";
    if (w.type === "image") sw.style.backgroundImage = "url(\"" + w.value.replace(/"/g, "") + "\")";
    else sw.style.backgroundColor = w.value;
    const lab = document.createElement("span");
    lab.textContent = w.name || w.value;
    row.appendChild(sw);
    row.appendChild(lab);
    row.addEventListener("click", () => applyWallpaper(w.type, w.value));
    box.appendChild(row);
  });
}

/* Two-pane Start: app groups from apps.csv + Wallpaper */
function renderStart(rows, walls) {
  const groups = [];
  rows.forEach(r => { if (r.group && !groups.includes(r.group)) groups.push(r.group); });
  groups.push("Wallpaper");
  const gbox = document.getElementById("start-groups");
  const abox = document.getElementById("start-apps");
  gbox.innerHTML = "";
  function show(group) {
    [...gbox.children].forEach(b => b.classList.toggle("active", b.dataset.g === group));
    abox.innerHTML = "";
    if (group === "Wallpaper") {
      renderWallpapers(walls);
      return;
    }
    rows.filter(r => r.group === group && r.name).forEach(r => {
      const a = document.createElement("a");
      a.className = "start-app";
      a.href = r.url || "#";
      a.innerHTML = `<img src="${favicon(r.url, r.icon)}" alt=""><span>${r.name}</span>`;
      a.addEventListener("click", e => { e.preventDefault(); if (r.url) openApp(r.name, r.url); });
      abox.appendChild(a);
    });
  }
  groups.forEach((g, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = g;
    b.dataset.g = g;
    b.addEventListener("click", () => show(g));
    gbox.appendChild(b);
    if (i === 0) show(g);
  });
}

/* Analog hands + tray date and full weekday */
function tickClock() {
  const now = new Date();
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const s = now.getSeconds();
  document.querySelector("#analog-clock .hour").style.transform = `rotate(${h * 30 + m * 0.5}deg)`;
  document.querySelector("#analog-clock .minute").style.transform = `rotate(${m * 6}deg)`;
  document.querySelector("#analog-clock .second").style.transform = `rotate(${s * 6}deg)`;
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const wk = now.toLocaleDateString("en-GB", { weekday: "long" });
  document.getElementById("tray-clock").textContent = `${dd}-${mm}-${now.getFullYear()}`;
  document.getElementById("tray-week").textContent = wk;
}

/* Toggle light/dark on html+body; save; update tray label */
function applyTheme(theme) {
  document.documentElement.classList.toggle("light", theme === "light");
  document.body.classList.toggle("light", theme === "light");
  document.body.classList.toggle("dark", theme !== "light");
  const ico = document.querySelector("#theme-btn .theme-ico");
  const lbl = document.querySelector("#theme-btn .theme-lbl");
  if (ico) ico.textContent = theme === "light" ? "☀" : "☾";
  if (lbl) lbl.textContent = theme === "light" ? "Light" : "Dark";
  document.getElementById("theme-btn").title = theme === "light" ? "Light" : "Dark";
  localStorage.setItem("webdesk_theme", theme);
}

/* UI events: PIN, lock, theme, Start, unused window, search */
document.getElementById("show-pin").addEventListener("change", e => {
  document.getElementById("pin").type = e.target.checked ? "text" : "password";
});
document.getElementById("unlock").addEventListener("click", checkPin);
document.getElementById("pin").addEventListener("keydown", e => { if (e.key === "Enter") checkPin(); });
document.getElementById("pin").addEventListener("input", e => {
  if (e.target.value.length === PIN_LEN) checkPin();
});
document.getElementById("lock-btn").addEventListener("click", lock);
document.getElementById("theme-btn").addEventListener("click", () => {
  applyTheme(document.body.classList.contains("light") ? "dark" : "light");
});
applyTheme(
  localStorage.getItem("webdesk_theme") ||
  (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
);
document.getElementById("start-btn").addEventListener("click", () => {
  const m = document.getElementById("start-menu");
  m.hidden = !m.hidden;
});
/* Map search-type dropdown to a Google URL */
function searchUrl(q, type) {
  const e = encodeURIComponent(q);
  const map = {
    web: "https://www.google.com/search?q=" + e,
    images: "https://www.google.com/search?tbm=isch&q=" + e,
    video: "https://www.google.com/search?tbm=vid&q=" + e,
    news: "https://www.google.com/search?tbm=nws&q=" + e,
    shop: "https://www.google.com/search?tbm=shop&q=" + e,
    maps: "https://www.google.com/maps/search/" + e,
    flights: "https://www.google.com/travel/flights?q=" + e,
    finance: "https://www.google.com/finance/?q=" + e
  };
  return map[type] || map.web;
}
document.getElementById("search").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.value.trim()) {
    const type = document.getElementById("search-type").value;
    openApp("Search", searchUrl(e.target.value.trim(), type));
  }
});
document.addEventListener("click", e => {
  const menu = document.getElementById("start-menu");
  const btn = document.getElementById("start-btn");
  if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) menu.hidden = true;
});

/* Load CSVs, render UI, apply saved or first wallpaper */
Promise.all([
  fetch("desktop_icons.csv").then(r => r.text()),
  fetch("apps.csv").then(r => r.text()),
  fetch("wallpaper.csv").then(r => r.text())
]).then(([desk, apps, wall]) => {
  renderDesktop(parseCsv(desk));
  const walls = wall.trim().split(/\r?\n/).slice(1).map(line => {
    const [type, name, value] = line.split(",").map(s => (s || "").trim());
    return { type: (type || "").toLowerCase(), name, value };
  }).filter(w => w.value);
  renderStart(parseCsv(apps), walls);
  try {
    const saved = JSON.parse(localStorage.getItem("webdesk_wall") || "null");
    if (saved && saved.value) applyWallpaper(saved.type, saved.value);
    else if (walls[0]) applyWallpaper(walls[0].type, walls[0].value);
  } catch (e) {
    if (walls[0]) applyWallpaper(walls[0].type, walls[0].value);
  }
});

/* Start clock and show lock if session missing/expired */
tickClock();
setInterval(tickClock, 1000);
if (isAuthed()) document.getElementById("overlay").classList.add("hidden");
else document.getElementById("pin").focus();
