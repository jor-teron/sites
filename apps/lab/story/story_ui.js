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
  clear: $("clear-btn"),
};

const PREF_KEY = "story-prefs";
export function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch {}
  return { model: p.model || "lite", maxTokens: Math.max(240, p.maxTokens || 320), temperature: p.temperature || 0.8 };
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
  el.seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.model === key));
}
export function showSettings(show) { el.sheet.hidden = !show; }
export function showPrefs(p) {
  el.len.value = p.maxTokens; el.lenVal.textContent = `· ${p.maxTokens} tokens`;
  el.temp.value = p.temperature; el.tempVal.textContent = `· ${Number(p.temperature).toFixed(1)}`;
}
