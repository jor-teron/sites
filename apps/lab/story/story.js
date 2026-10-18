/*
  File: story.js
  Project: AI Story
  Description: App entry. Wires UI, history and model together.
               Flow: open DB -> show history -> enable input -> load the
               chosen model lazily (Lite by default, ~1 MB).
*/
import { openDB, saveMessage, loadHistory, clearHistory } from "./story_db.js";
import { MODELS, loadModel, generate } from "./story_model.js";
import * as ui from "./story_ui.js";

const prefs = ui.loadPrefs();
let pipe = null;        // pipeline for prefs.model, null until loaded
let busy = false;

/** Load the current model, updating status. */
async function ensureModel() {
  const key = prefs.model, label = MODELS[key].label;
  if (pipe && pipe.__key === key) return pipe;
  ui.setStatus(`${label} · loading…`);
  try {
    const p = await loadModel(key, (pct) => { if (prefs.model === key) ui.setStatus(`${label} · ${pct}%`); });
    if (prefs.model !== key) return null;   // user switched meanwhile
    p.__key = key; pipe = p;
    ui.setStatus(`${label} · ready`);
    return p;
  } catch (e) {
    console.error(e);
    if (prefs.model === key) ui.setStatus(`${label} · failed (offline?)`);
    return null;
  }
}

async function onSend(e) {
  e.preventDefault();
  const prompt = ui.el.input.value.trim();
  if (!prompt || busy) return;
  busy = true; ui.setBusy(true);
  ui.el.input.value = "";
  ui.addMessage("user", prompt); saveMessage("user", prompt);
  const card = ui.addMessage("bot", "…");
  try {
    const p = await ensureModel();
    if (!p) throw new Error("model not loaded");
    const label = MODELS[prefs.model].label;
    const story = await generate(p, prompt, prefs, (text, tps) => {
      card.textContent = prompt + " " + text;
      ui.scrollDown();
      if (tps) ui.setStatus(`${label} · ${tps.toFixed(1)} tok/s`);
    });
    const full = prompt + " " + story;
    card.textContent = full; saveMessage("bot", full);
  } catch (err) {
    console.error(err);
    card.textContent = "Couldn't write a story. Check your connection for the first download, or try Lite.";
    card.classList.add("err");
  }
  busy = false; ui.setBusy(false);
}

function pickModel(key) {
  if (!MODELS[key] || key === prefs.model) return;
  prefs.model = key; ui.savePrefs(prefs); ui.markModel(key);
  pipe = null;
  if (!busy) ensureModel();
}

async function init() {
  ui.markModel(prefs.model); ui.showPrefs(prefs);
  ui.el.form.addEventListener("submit", onSend);
  ui.el.settingsBtn.addEventListener("click", () => ui.showSettings(true));
  ui.el.closeBtn.addEventListener("click", () => ui.showSettings(false));
  ui.el.sheet.addEventListener("click", (e) => { if (e.target === ui.el.sheet) ui.showSettings(false); });
  ui.el.seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && !busy) pickModel(b.dataset.model); });
  ui.el.len.addEventListener("input", () => { prefs.maxTokens = +ui.el.len.value; ui.showPrefs(prefs); ui.savePrefs(prefs); });
  ui.el.temp.addEventListener("input", () => { prefs.temperature = +ui.el.temp.value; ui.showPrefs(prefs); ui.savePrefs(prefs); });
  ui.el.clear.addEventListener("click", () => { clearHistory(); ui.clearFeed(); });

  await openDB();
  (await loadHistory()).forEach((m) => ui.addMessage(m.role, m.content));
  ensureModel();
}

init();
