/*
  File: story_ui.js
  Project: Story
  Description: DOM helpers: story feed cards, status line, settings sheet,
               saved preferences (localStorage).
*/
const $ = (id) => document.getElementById(id);
export const el = {
  chat: $("chat"), empty: $("empty"), input: $("user-input"), send: $("send-btn"),
  form: $("composer"), status: $("status"), sheet: $("sheet"),
  settingsBtn: $("settings-btn"), closeBtn: $("close-btn"), seg: $("model-seg"),
  len: $("len"), lenVal: $("len-val"), temp: $("temp"), tempVal: $("temp-val"),
  clear: $("clear-btn"), announce: $("announce"), card: document.querySelector(".sheet-card"), modelBusy: $("model-busy"),
};

const PREF_KEY = "story-prefs";
export function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch {}
  const num = (v, d, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  return {
    model: typeof p.model === "string" ? p.model : "lite",   // validated against MODELS in story.js
    maxTokens: Math.round(num(p.maxTokens, 320, 240, 600)),
    temperature: num(p.temperature, 0.8, 0.3, 1.2),
  };
}
export function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {} }

export function setStatus(t) { el.status.textContent = t; }

/** Add a message card; returns the element (for streaming updates). */
export function addMessage(role, text) {
  el.empty.hidden = true;
  const d = document.createElement("div");
  d.className = `msg ${role}`;
  d.textContent = text;
  el.chat.appendChild(d);
  scrollDown();
  return d;
}
export function scrollDown() { el.chat.scrollTop = el.chat.scrollHeight; }
export function clearFeed() { el.chat.querySelectorAll(".msg").forEach((m) => m.remove()); el.empty.hidden = false; }

export function setBusy(b) {
  el.form.classList.toggle("busy", b);
  el.send.textContent = b ? "■" : "➤";
  el.send.setAttribute("aria-label", b ? "Stop" : "Write");
}

export function markModel(key) {
  el.seg.querySelectorAll("button").forEach((b) => {
    const on = b.dataset.model === key;
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
  });
}
/** Disable model buttons while a story is being written. */
export function setModelLock(locked) {
  el.seg.querySelectorAll("button").forEach((b) => { b.disabled = locked; });
  el.modelBusy.hidden = !locked;
}
/** Announce text once via the hidden live region. */
export function announce(t) { el.announce.textContent = ""; setTimeout(() => { el.announce.textContent = t; }, 50); }

// Settings sheet as a modal dialog: focus in on open, trapped, Escape closes, focus back on close.
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";
function onSheetKey(e) {
  if (e.key === "Escape") { e.preventDefault(); showSettings(false); return; }
  if (e.key !== "Tab") return;
  const f = [...el.card.querySelectorAll(FOCUSABLE)];
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === el.card)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
export function showSettings(show) {
  if (show === !el.sheet.hidden) return;
  el.sheet.hidden = !show;
  if (show) {
    document.addEventListener("keydown", onSheetKey);
    el.closeBtn.focus();
  } else {
    document.removeEventListener("keydown", onSheetKey);
    el.settingsBtn.focus();
  }
}
export function showPrefs(p) {
  el.len.value = p.maxTokens; el.lenVal.textContent = `· ${p.maxTokens} tokens`;
  el.temp.value = p.temperature; el.tempVal.textContent = `· ${Number(p.temperature).toFixed(1)}`;
}
