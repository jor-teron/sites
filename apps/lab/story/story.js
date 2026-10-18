/*
  File: story.js
  Project: AI Story
  Description: App entry. Wires UI, history and model together.
               Flow: open DB -> show history -> enable input -> load the
               chosen model lazily (Lite by default, ~1 MB).
*/
import { openDB, saveMessage, loadHistory, clearHistory } from "./story_db.js";
import { MODELS, loadModel, generate, stop } from "./story_model.js";
import * as ui from "./story_ui.js";

const prefs = ui.loadPrefs();
let readyKey = null;    // model key loaded in the worker
let busy = false;

/** Load the current model, updating status. Returns true when ready. */
async function ensureModel() {
  const key = prefs.model, label = MODELS[key].label;
  if (readyKey === key) return true;
  ui.setStatus(`${label} · loading…`);
  try {
    await loadModel(key, (pct) => ui.setStatus(`${label} · ${pct}%`));
    readyKey = key;
    ui.setStatus(`${label} · ready`);
    return true;
  } catch (e) {
    if (e.message !== "superseded") { console.error(e); ui.setStatus(`${label} · failed (offline?)`); }
    return false;
  }
}

async function onSend(e) {
  e.preventDefault();
  if (busy) { stop(); readyKey = null; return; }              // send button doubles as Stop
  const prompt = ui.el.input.value.trim();
  if (!prompt) return;
  busy = true; ui.setBusy(true);
  ui.el.input.value = "";
  ui.addMessage("user", prompt); saveMessage("user", prompt);
  const card = ui.addMessage("bot", "");
  const body = document.createTextNode(prompt);
  const cursor = document.createElement("span"); cursor.className = "cursor";
  card.append(body, cursor);
  try {
    if (!(await ensureModel())) throw new Error("model not loaded");
    const label = MODELS[prefs.model].label;
    const t0 = performance.now(); let n = 0;
    const res = await generate(prompt, prefs, (chunk) => {
      body.appendData(chunk); n++;
      ui.scrollDown();
      const sec = (performance.now() - t0) / 1000;
      if (sec > 0.3) ui.setStatus(`${label} · ${(n / sec).toFixed(1)} tok/s`);
    });
    cursor.remove();
    saveMessage("bot", body.data);
    ui.setStatus(res.stopped ? `${label} · stopped` : `${label} · ${res.tps.toFixed(1)} tok/s`);
    if (res.stopped) ensureModel();
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
